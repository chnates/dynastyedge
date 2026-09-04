// Pure half of the app-version self-heal (see src/hooks/useAppVersion.js for
// why it exists at all).

/**
 * The URL to reload onto when the running bundle is behind the server's.
 *
 * Two things are load-bearing:
 *  - The `?v=` MUST be a real URL change, not a hash change. The whole problem
 *    is a cached response for this URL; a hash-only edit reuses the same cache
 *    entry and the stale HTML comes straight back.
 *  - The query goes BEFORE the hash. The app is a HashRouter, so the hash is
 *    the route — appending after it would fold `?v=…` into the route string
 *    and land the user somewhere that doesn't exist.
 *
 * Returns null when there is no build to reload toward, so callers can fall
 * back rather than navigate somewhere meaningless.
 */
export function buildReloadUrl({ origin, pathname, hash }, buildId) {
  if (!buildId) return null
  return `${origin}${pathname}?v=${encodeURIComponent(buildId)}${hash ?? ''}`
}
