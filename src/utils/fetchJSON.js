const DEFAULT_TIMEOUT_MS = 15000

// Shared fetch wrapper: JSON parsing, HTTP error surfacing, and a hard timeout
// so a hung API can never leave the app on a permanent spinner. No retry, no
// backoff — rate discipline is the MCP server's problem and lives in
// mcp/limit.js, which wraps this.
export function fetchJSON(url, { timeoutMs = DEFAULT_TIMEOUT_MS, label = 'Request' } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  return fetch(url, { signal: controller.signal })
    .then(r => {
      if (!r.ok) {
        // Message unchanged — the app reads nothing else off this error. The
        // two properties are additive and app-neutral: they exist so the MCP
        // server's limiter (mcp/limit.js) can honour a 429's Retry-After
        // without fetchJSON itself ever retrying.
        const err = new Error(`${label} ${r.status}: ${url}`)
        err.status = r.status
        err.retryAfter = r.headers?.get?.('retry-after') ?? null
        throw err
      }
      return r.json()
    })
    .catch(err => {
      if (err.name === 'AbortError') {
        throw new Error(`${label} timed out — check your connection and retry`)
      }
      throw err
    })
    .finally(() => clearTimeout(timer))
}
