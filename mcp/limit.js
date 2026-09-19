// limit.js — the rate discipline the app does not have.
//
// WHY THIS LIVES HERE AND NOT IN fetchJSON.js: fetchJSON is 21 lines and does
// exactly one thing — an AbortController timeout. It has no retry, no backoff
// and no 429 handling, and in the app that is fine: one phone makes ~47 calls
// on a cold start, spread across a human's attention span. A server driven by
// an eager model is a different traffic shape, and `useLeagueHistory`'s path
// alone fires ~169 concurrent requests. Sleeper's published guidance is under
// 1,000 calls/minute.
//
// Putting this in fetchJSON would change the app's behaviour to fix a server
// problem. So the app keeps its 21-line wrapper and the server wraps that.
//
// KNOWN LIMIT, stated rather than hidden: fetchJSON throws an Error whose
// message embeds the status (`${label} ${status}: ${url}`) and discards the
// Response, so a 429's `Retry-After` header is unreachable from here without
// changing fetchJSON. We therefore back off on a fixed exponential schedule
// with jitter rather than honouring the server's own advice. Good enough for
// one user; revisit if fetchJSON ever surfaces the response.

import { fetchJSON } from '../src/utils/fetchJSON.js'

export const DEFAULT_CONCURRENCY = 6
const MAX_ATTEMPTS = 3
const BASE_BACKOFF_MS = 500

// Statuses worth retrying: rate limiting and transient upstream failures.
// A 404 is an answer, not a failure, and must never be retried.
const RETRYABLE = /\b(408|425|429|500|502|503|504)\b/

const sleep = ms => new Promise(r => setTimeout(r, ms))

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
export function createFetcher({ concurrency = DEFAULT_CONCURRENCY, limiter } = {}) {
  const run = limiter ?? createLimiter(concurrency)
  let requests = 0
  let retries = 0

  async function get(url, opts = {}) {
    return run(async () => {
      for (let attempt = 1; ; attempt++) {
        try {
          requests++
          return await fetchJSON(url, opts)
        } catch (err) {
          const retryable = RETRYABLE.test(err.message)
          if (!retryable || attempt >= MAX_ATTEMPTS) throw err
          retries++
          // Full jitter: with several requests failing at once, a fixed delay
          // would send them all back in the same instant.
          const ceiling = BASE_BACKOFF_MS * 2 ** (attempt - 1)
          await sleep(Math.random() * ceiling)
        }
      }
    })
  }

  get.stats = () => ({ requests, retries, ...run.stats() })
  return get
}
