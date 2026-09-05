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

/**
 * The running build id, formatted for the side drawer's data-status block.
 *
 * The id is an ISO timestamp stamped at build time (see vite.config.js), which
 * is exact and unreadable. What the owner actually needs to answer is "is the
 * phone on the build I just deployed?", and a local date-time answers that at a
 * glance where a raw ISO string does not.
 *
 * Deliberately tolerant: an id that is missing or not a parseable date is NOT
 * an error condition — it is the dev server, or a future build-id scheme. Null
 * in, null out, and the caller renders nothing.
 */
export function formatBuildId(buildId) {
  if (typeof buildId !== 'string' || !buildId) return null
  const d = new Date(buildId)
  if (Number.isNaN(d.getTime())) return buildId.slice(0, 16)
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}
