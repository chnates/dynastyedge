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
 * The id is normally a BUILD NUMBER (see vite.config.js) — a first-parent
 * commit count that advances by one per merge to main. It renders as-is,
 * because "am I on 52?" is a question the owner can actually answer by
 * comparing against the repo, and a timestamp is not.
 *
 * The ISO-timestamp branch is the FALLBACK path, not the normal one: a shallow
 * clone or a checkout with no git history can't produce a count, and a
 * duplicate id would silently break the self-heal, so those builds fall back to
 * a timestamp instead. Formatting it as a local date-time keeps that state
 * legible rather than dumping a raw ISO string on screen.
 *
 * Deliberately tolerant: a missing id is NOT an error — it's the dev server, or
 * a future scheme. Null in, null out, and the caller renders no row.
 */
export function formatBuildId(buildId) {
  if (typeof buildId !== 'string' || !buildId) return null
  // A build number: digits only. Rendered verbatim.
  if (/^\d+$/.test(buildId)) return buildId
  const d = new Date(buildId)
  if (Number.isNaN(d.getTime())) return buildId.slice(0, 16)
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}
