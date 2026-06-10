const DEFAULT_TIMEOUT_MS = 15000

// Shared fetch wrapper: JSON parsing, HTTP error surfacing, and a hard timeout
// so a hung API can never leave the app on a permanent spinner.
export function fetchJSON(url, { timeoutMs = DEFAULT_TIMEOUT_MS, label = 'Request' } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  return fetch(url, { signal: controller.signal })
    .then(r => {
      if (!r.ok) throw new Error(`${label} ${r.status}: ${url}`)
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
