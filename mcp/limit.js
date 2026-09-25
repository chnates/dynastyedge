// limit.js — the rate discipline the app does not have.
//
// WHY THIS LIVES HERE AND NOT IN fetchJSON.js: fetchJSON is ~30 lines and does
// exactly one thing — an AbortController timeout. It has no retry, no backoff
// and no 429 handling, and in the app that is fine: one phone makes ~47 calls
// on a cold start, spread across a human's attention span. A server driven by
// an eager model is a different traffic shape, and `useLeagueHistory`'s path
// alone fires ~169 concurrent requests. Sleeper's published guidance is under
// 1,000 calls/minute.
//
// Putting this in fetchJSON would change the app's behaviour to fix a server
// problem. So the app keeps its small wrapper and the server wraps that.
//
// RETRY-AFTER IS HONOURED (2026-09-25). This used to be a known limit:
// fetchJSON discarded the Response, so a 429's advice was unreachable and the
// limiter backed off on a fixed schedule. fetchJSON now attaches `status` and
// the raw `retryAfter` header to the Error it already threw — additive, the
// message byte-identical, the app's behaviour unchanged (proved by the full
// suite producing identical results before and after). fetchJSON still does
// NOT retry; that stays here.
//
// The advice is parsed in both forms RFC 9110 allows (delta-seconds and
// HTTP-date), CAPPED, and used in place of the jittered schedule only when it
// parses. Anything unparseable falls back to the schedule exactly as before.

import { fetchJSON } from '../src/utils/fetchJSON.js'

export const DEFAULT_CONCURRENCY = 6
const MAX_ATTEMPTS = 3
const BASE_BACKOFF_MS = 500

// The longest we will wait on a server's advice before one retry. A serverless
// invocation has a wall-clock budget and a model is waiting on the answer:
// with MAX_ATTEMPTS = 3 this bounds the total advised sleep at 8s. An advisory
// longer than the cap is clamped rather than obeyed — the retry may well 429
// again, and MAX_ATTEMPTS then surfaces it as the honest "rate limited" it is,
// instead of holding a request open for an hour because a header said so.
export const MAX_RETRY_AFTER_MS = 4000

// Statuses worth retrying: rate limiting and transient upstream failures.
// A 404 is an answer, not a failure, and must never be retried.
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])
const RETRYABLE = /\b(408|425|429|500|502|503|504)\b/

const realSleep = ms => new Promise(r => setTimeout(r, ms))

// Retry-After → milliseconds, or null when absent/unparseable. Two forms
// (RFC 9110 §10.2.3): delta-seconds ("120") or an HTTP-date. A date in the
// past means "now" (0). Negative or fractional seconds are not the grammar,
// so they fall back to the schedule rather than being guessed at.
export function parseRetryAfter(value, now = Date.now()) {
  if (value == null) return null
  const v = String(value).trim()
  if (v === '') return null
  if (/^\d+$/.test(v)) return Number(v) * 1000
  // An HTTP-date always names a weekday and a month. Without letters, Date.parse
  // happily reads "-5" as the year -5 and "1.5" as January — neither is advice.
  if (!/[A-Za-z]/.test(v)) return null
  const at = Date.parse(v)
  if (Number.isNaN(at)) return null
  return Math.max(0, at - now)
}

function isRetryable(err) {
  // Prefer the status fetchJSON now attaches; the message test remains for an
  // error that did not come through fetchJSON's !ok branch.
  if (typeof err?.status === 'number') return RETRYABLE_STATUS.has(err.status)
  return RETRYABLE.test(err?.message ?? '')
}

// A fixed-size gate. Callers queue; at most `concurrency` run at once.
export function createLimiter(concurrency = DEFAULT_CONCURRENCY) {
  let active = 0
  const queue = []

  const pump = () => {
    if (active >= concurrency || queue.length === 0) return
    active++
    const { job, resolve, reject } = queue.shift()
    // The slot is released BEFORE the caller's promise settles, deliberately.
    // Releasing it in a .finally() chained after resolve() puts the decrement
    // a microtask later than the caller's own continuation, so a caller that
    // awaits a job and then reads stats() sees a slot that is already free
    // still counted as active. Promise.resolve().then(job) also catches a job
    // that throws synchronously, which would otherwise escape past the gate.
    Promise.resolve().then(job).then(
      value => { active--; pump(); resolve(value) },
      err => { active--; pump(); reject(err) },
    )
  }

  const run = job => new Promise((resolve, reject) => {
    queue.push({ job, resolve, reject })
    pump()
  })

  run.stats = () => ({ active, queued: queue.length, concurrency })
  return run
}

// One rate-disciplined fetch: queued behind the limiter, retried with
// exponential backoff + jitter on a retryable status, never on anything else.
//
// `sleep`, `random` and `now` are injectable so the schedule can be pinned by
// test without real waits; production passes none of them.
export function createFetcher({
  concurrency = DEFAULT_CONCURRENCY, limiter, sleep = realSleep, random = Math.random, now = Date.now,
} = {}) {
  const run = limiter ?? createLimiter(concurrency)
  let requests = 0
  let retries = 0
  let advised = 0

  async function get(url, opts = {}) {
    return run(async () => {
      for (let attempt = 1; ; attempt++) {
        try {
          requests++
          return await fetchJSON(url, opts)
        } catch (err) {
          if (!isRetryable(err) || attempt >= MAX_ATTEMPTS) throw err
          retries++
          const advice = parseRetryAfter(err.retryAfter, now())
          if (advice != null) {
            // The server said how long. Honour it, capped.
            advised++
            await sleep(Math.min(advice, MAX_RETRY_AFTER_MS))
          } else {
            // Full jitter: with several requests failing at once, a fixed
            // delay would send them all back in the same instant.
            const ceiling = BASE_BACKOFF_MS * 2 ** (attempt - 1)
            await sleep(random() * ceiling)
          }
        }
      }
    })
  }

  get.stats = () => ({ requests, retries, advised, ...run.stats() })
  return get
}
