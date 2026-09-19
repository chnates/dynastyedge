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

import { createLimiter, createFetcher, DEFAULT_CONCURRENCY } from '../mcp/limit.js'

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
