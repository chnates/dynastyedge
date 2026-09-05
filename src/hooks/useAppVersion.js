import { useCallback, useEffect, useState } from 'react'
import { fetchJSON } from '../utils/fetchJSON'
import { buildReloadUrl } from '../utils/appVersion'

// ─────────────────────────────────────────────────────────────────────────────
// "Am I running the build the server has?"
//
// WHY THIS EXISTS: on iOS, a home-screen (standalone) web app keeps its own
// WebKit cache, and GitHub Pages serves index.html with a fixed
// `cache-control: max-age=600` that Pages gives no way to change. A cold launch
// can therefore boot CACHED HTML, which references the OLD hashed asset chunks
// — and nothing in the running app ever notices. Reloading doesn't help: the
// reload requests the same URL and gets the same cached entry. Before this, the
// only reliable fix was deleting and re-adding the home-screen app.
//
// So the running bundle carries its own build id (`__BUILD_ID__`, compiled in
// by Vite) and asks the server what the current one is. A mismatch means the
// HTML on screen is stale.
//
// This is the standard PWA update check WITHOUT a service worker — deliberately.
// A service worker would also solve it, but its failure mode is strictly worse:
// a bad SW can pin the app to a stale build permanently, with no delete-and-
// re-add escape hatch left. This mechanism can only ever fail *open* (a failed
// check just means no update is offered).
// ─────────────────────────────────────────────────────────────────────────────

// Marks which build id we already auto-reloaded toward, so a reload that fails
// to land on the new build can never loop. Session-scoped: a genuinely new
// launch gets a fresh attempt.
const RELOAD_KEY = 'dynastyedge_version_reload'

const CHECK_TIMEOUT_MS = 8000

// A unique query per check, rather than `cache: 'no-store'`: the whole problem
// is caches that don't honor what they're told, and a URL nothing has ever seen
// cannot be served from any of them — browser, CDN, or an intermediary proxy.
function versionUrl() {
  return `${import.meta.env.BASE_URL}version.json?t=${Date.now()}`
}

// The build this bundle was compiled from. Vite's `define` replaces the
// identifier at build time; the fallback keeps `npm run dev` working, where
// no version.json is emitted at all.
const CURRENT_BUILD_ID = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : null

export async function fetchServerBuildId() {
  const data = await fetchJSON(versionUrl(), {
    timeoutMs: CHECK_TIMEOUT_MS,
    label: 'Version check',
  })
  return typeof data?.buildId === 'string' ? data.buildId : null
}

function readReloadMark() {
  try { return sessionStorage.getItem(RELOAD_KEY) } catch { return null }
}

function writeReloadMark(buildId) {
  try { sessionStorage.setItem(RELOAD_KEY, buildId) } catch { /* private mode */ }
}

// Reload onto a URL the cache has never seen (see buildReloadUrl for why that
// shape). `replace` keeps the stale entry out of history. Returns false when it
// declines to act.
export function reloadToBuild(buildId) {
  const url = buildReloadUrl(window.location, buildId)
  if (!url) return false
  window.location.replace(url)
  return true
}

/**
 * Cold start reloads silently — nothing is in flight to lose. Afterwards the
 * check runs on focus and only REPORTS (`updateAvailable`), because yanking the
 * page out from under a half-built trade is worse than a stale render.
 */
export function useAppVersion() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  // What the last check actually established, so the drawer can say whether the
  // build stamp has been CONFIRMED current rather than just displaying an id.
  // 'unknown' covers the dev server (no version.json is emitted) and any failed
  // check — both are states where we must not claim the app is up to date.
  const [versionState, setVersionState] = useState('unknown')

  const check = useCallback(async ({ autoReload }) => {
    // Dev has no version.json, and a bundle with no compiled id can't compare.
    if (!CURRENT_BUILD_ID) return
    let serverBuildId = null
    try {
      serverBuildId = await fetchServerBuildId()
    } catch {
      setVersionState('unknown')
      return  // best-effort: never surface a version check as an error
    }
    if (!serverBuildId || serverBuildId === CURRENT_BUILD_ID) {
      setVersionState(serverBuildId ? 'current' : 'unknown')
      return
    }
    setVersionState('stale')

    // Already tried reloading toward this exact build and we're STILL on the
    // old one — the reload didn't take. Never loop; fall back to offering it.
    if (autoReload && readReloadMark() !== serverBuildId) {
      writeReloadMark(serverBuildId)
      if (reloadToBuild(serverBuildId)) return
    }
    setUpdateAvailable(true)
  }, [])

  // Cold start.
  useEffect(() => { check({ autoReload: true }) }, [check])

  // Later launches from the app switcher land here rather than on a cold start,
  // so re-check on focus — reusing the same visibilitychange + focus pair the
  // rest of the app uses for its stale-data refetches.
  useEffect(() => {
    function onFocus() {
      if (document.visibilityState !== 'visible') return
      check({ autoReload: false })
    }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('focus', onFocus)
    }
  }, [check])

  // The manual escape hatch behind the drawer's "Update available" row. It
  // bypasses the loop guard on purpose: the user asked for it explicitly.
  const applyUpdate = useCallback(async () => {
    let serverBuildId = null
    try { serverBuildId = await fetchServerBuildId() } catch { /* fall through */ }
    if (!reloadToBuild(serverBuildId)) window.location.reload()
  }, [])

  return { updateAvailable, applyUpdate, buildId: CURRENT_BUILD_ID, versionState }
}
