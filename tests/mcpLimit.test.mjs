// tests/mcpLimit.test.mjs — pins the rate discipline in mcp/limit.js.
//
// Why this exists (MCP_DISCOVERY.md §3 + §7): fetchJSON has a timeout and
// NOTHING else — no retry, no backoff, no 429 handling — and there is no
// concurrency limiter anywhere in the codebase. That is fine for one phone
// making ~47 calls on a cold start; it is not fine for a server driven by an
// eager model, where useLeagueHistory's path alone fires ~169 concurrent
// requests against a published guidance of <1,000/min.
//
// The limiter belongs in mcp/, never in fetchJSON — changing fetchJSON would
// change the app's behaviour to fix a server problem.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  createLimiter, createFetcher, DEFAULT_CONCURRENCY, parseRetryAfter, MAX_RETRY_AFTER_MS,
} from '../mcp/limit.js'
import { fetchJSON } from '../src/utils/fetchJSON.js'

const tick = (ms = 5) => new Promise(r => setTimeout(r, ms))

test('the limiter never runs more than `concurrency` jobs at once', async () => {
  const run = createLimiter(3)
  let active = 0, peak = 0, done = 0
  await Promise.all(Array.from({ length: 20 }, () => run(async () => {
    active++; peak = Math.max(peak, active)
    await tick()
    active--; done++
  })))
  assert.equal(done, 20, 'every queued job still runs')
  assert.ok(peak <= 3, `peak concurrency ${peak} exceeded the cap`)
  assert.ok(peak > 1, 'the limiter parallelizes rather than serializing')
})

test('a rejecting job frees its slot — one failure cannot wedge the queue', async () => {
  const run = createLimiter(1)
  await assert.rejects(run(async () => { throw new Error('boom') }), /boom/)
  assert.equal(await run(async () => 'ok'), 'ok', 'the gate reopened')
  assert.equal(run.stats().active, 0)
})

// fetchJSON embeds the status in its message: `${label} ${status}: ${url}`.
function stubFetch(sequence) {
  const calls = []
  globalThis.fetch = async url => {
    calls.push(String(url))
    const next = sequence.shift()
    if (next instanceof Error) throw next
    if (typeof next === 'number') {
      return { ok: false, status: next, json: async () => ({}) }
    }
    // { status, retryAfter } — a failing response carrying real headers.
    if (next && typeof next.status === 'number' && next.status >= 400) {
      const headers = new Headers(next.retryAfter != null ? { 'Retry-After': String(next.retryAfter) } : {})
      return { ok: false, status: next.status, headers, json: async () => ({}) }
    }
    return { ok: true, status: 200, json: async () => next }
  }
  return calls
}

test('a 429 is retried with backoff and can succeed', async () => {
  const realFetch = globalThis.fetch
  try {
    const calls = stubFetch([429, 429, { ok: true }])
    const get = createFetcher({ concurrency: 2 })
    assert.deepEqual(await get('https://x/y', { label: 'Sleeper' }), { ok: true })
    assert.equal(calls.length, 3, 'two retries, then the success')
    assert.equal(get.stats().retries, 2)
  } finally { globalThis.fetch = realFetch }
})

test('retries are bounded — a persistent 429 surfaces rather than looping', async () => {
  const realFetch = globalThis.fetch
  try {
    const calls = stubFetch([429, 429, 429, 429, 429])
    const get = createFetcher()
    await assert.rejects(get('https://x/y', { label: 'Sleeper' }), /429/)
    assert.equal(calls.length, 3, 'MAX_ATTEMPTS, not unbounded')
  } finally { globalThis.fetch = realFetch }
})

test('a 404 is an ANSWER, not a failure — never retried', async () => {
  const realFetch = globalThis.fetch
  try {
    const calls = stubFetch([404, { ok: true }])
    const get = createFetcher()
    await assert.rejects(get('https://x/y', { label: 'Sleeper' }), /404/)
    assert.equal(calls.length, 1, 'retrying a 404 just wastes the rate budget')
  } finally { globalThis.fetch = realFetch }
})

test('a 503 IS retried — transient upstream failure, unlike a 404', async () => {
  const realFetch = globalThis.fetch
  try {
    const calls = stubFetch([503, { ok: true }])
    const get = createFetcher()
    assert.deepEqual(await get('https://x/y', { label: 'Sleeper' }), { ok: true })
    assert.equal(calls.length, 2)
  } finally { globalThis.fetch = realFetch }
})

test('one fetcher shares one budget across callers (stats are cumulative)', async () => {
  const realFetch = globalThis.fetch
  try {
    stubFetch([{ a: 1 }, { b: 2 }, { c: 3 }])
    const get = createFetcher({ concurrency: 2 })
    await Promise.all([get('https://x/1'), get('https://x/2'), get('https://x/3')])
    assert.equal(get.stats().requests, 3)
    assert.equal(get.stats().concurrency, 2)
  } finally { globalThis.fetch = realFetch }
})

test('the default concurrency is well under Sleeper\'s <1000/min guidance', () => {
  assert.ok(DEFAULT_CONCURRENCY > 0 && DEFAULT_CONCURRENCY <= 10)
})

// ── Retry-After (2026-09-25) ────────────────────────────────────────────────
//
// fetchJSON attaches `status` and the raw `retryAfter` to the Error it already
// threw (message unchanged — the app is untouched); the limiter honours the
// advice, capped, and falls back to the jittered schedule when it can't parse.

// A fetcher whose sleeps are recorded instead of slept.
function recordingFetcher(opts = {}) {
  const slept = []
  const get = createFetcher({ sleep: async ms => { slept.push(ms) }, random: () => 0.5, ...opts })
  return { get, slept }
}

test('fetchJSON: the message is byte-identical, and status + retryAfter ride on the error', async () => {
  const realFetch = globalThis.fetch
  try {
    stubFetch([{ status: 429, retryAfter: '7' }, 404])
    await assert.rejects(fetchJSON('https://x/y', { label: 'Sleeper' }), err => {
      assert.equal(err.message, 'Sleeper 429: https://x/y')
      assert.equal(err.status, 429)
      assert.equal(err.retryAfter, '7')
      return true
    })
    // A response with no headers object at all (every older stub, and some
    // runtimes' error paths) still throws the same message, retryAfter null.
    await assert.rejects(fetchJSON('https://x/z', { label: 'Sleeper' }), err => {
      assert.equal(err.message, 'Sleeper 404: https://x/z')
      assert.equal(err.status, 404)
      assert.equal(err.retryAfter, null)
      return true
    })
  } finally { globalThis.fetch = realFetch }
})

test('parseRetryAfter: delta-seconds, HTTP-date, a past date, and garbage', () => {
  const now = Date.parse('2026-09-25T12:00:00Z')
  assert.equal(parseRetryAfter('3', now), 3000)
  assert.equal(parseRetryAfter('0', now), 0)
  assert.equal(parseRetryAfter('Fri, 25 Sep 2026 12:00:02 GMT', now), 2000)
  assert.equal(parseRetryAfter('Fri, 25 Sep 2026 11:00:00 GMT', now), 0, 'a date in the past means now')
  assert.equal(parseRetryAfter(null, now), null)
  assert.equal(parseRetryAfter('', now), null)
  assert.equal(parseRetryAfter('soon', now), null)
  assert.equal(parseRetryAfter('-5', now), null, 'not the grammar — fall back, never guess')
  assert.equal(parseRetryAfter('1.5', now), null)
})

test('a 429 WITH Retry-After waits what the server said, then succeeds', async () => {
  const realFetch = globalThis.fetch
  try {
    const calls = stubFetch([{ status: 429, retryAfter: '2' }, { ok: true }])
    const { get, slept } = recordingFetcher()
    assert.deepEqual(await get('https://x/y', { label: 'Sleeper' }), { ok: true })
    assert.equal(calls.length, 2)
    assert.deepEqual(slept, [2000])
    assert.equal(get.stats().advised, 1)
  } finally { globalThis.fetch = realFetch }
})

test('a 429 WITHOUT Retry-After keeps the jittered schedule exactly as before', async () => {
  const realFetch = globalThis.fetch
  try {
    stubFetch([{ status: 429 }, 429, { ok: true }])
    const { get, slept } = recordingFetcher()
    assert.deepEqual(await get('https://x/y', { label: 'Sleeper' }), { ok: true })
    assert.deepEqual(slept, [250, 500], 'random 0.5 × 500ms, then × 1000ms')
    assert.equal(get.stats().advised, 0)
  } finally { globalThis.fetch = realFetch }
})

test('the HTTP-date form is honoured against the fetcher\'s clock', async () => {
  const realFetch = globalThis.fetch
  try {
    const now = Date.parse('2026-09-25T12:00:00Z')
    stubFetch([{ status: 503, retryAfter: 'Fri, 25 Sep 2026 12:00:01 GMT' }, { ok: true }])
    const { get, slept } = recordingFetcher({ now: () => now })
    await get('https://x/y', { label: 'Sleeper' })
    assert.deepEqual(slept, [1000])
  } finally { globalThis.fetch = realFetch }
})

test('an absurd Retry-After is CAPPED, and the retry budget still bounds the whole thing', async () => {
  const realFetch = globalThis.fetch
  try {
    const calls = stubFetch([{ status: 429, retryAfter: '86400' }, { status: 429, retryAfter: '86400' }, { status: 429, retryAfter: '86400' }])
    const { get, slept } = recordingFetcher()
    await assert.rejects(get('https://x/y', { label: 'Sleeper' }), /429/)
    assert.equal(calls.length, 3, 'MAX_ATTEMPTS, not a day of waiting')
    assert.deepEqual(slept, [MAX_RETRY_AFTER_MS, MAX_RETRY_AFTER_MS])
    assert.ok(MAX_RETRY_AFTER_MS <= 5000)
  } finally { globalThis.fetch = realFetch }
})

test('a 404 carrying Retry-After is STILL an answer — never retried, never slept on', async () => {
  const realFetch = globalThis.fetch
  try {
    const calls = stubFetch([{ status: 404, retryAfter: '1' }, { ok: true }])
    const { get, slept } = recordingFetcher()
    await assert.rejects(get('https://x/y', { label: 'Sleeper' }), /404/)
    assert.equal(calls.length, 1)
    assert.deepEqual(slept, [])
  } finally { globalThis.fetch = realFetch }
})
