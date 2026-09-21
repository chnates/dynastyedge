// THE source-health policy for the multi-source pipelines: when has a source
// stopped contributing, and when is that worth waking someone for?
//
// Pure and dependency-free on purpose, so `tests/sourceHealth.test.mjs` can
// pin it, and shared by both pipelines rather than written twice — the same
// reason `newsRetention.mjs` and `fantasyCalcValues.mjs` exist.
//
// WHY THIS EXISTS. Every multi-source pipeline here is best-effort per source,
// which is the right contract — one dead source must never cost the others.
// But "degrades quietly" had quietly become "fails invisibly": the three
// snapshot steps in values-history.yml are `continue-on-error`, so the run is
// GREEN whatever they did, and fetch-news.mjs catches a failed source, logs one
// line into a run log nobody reads, and records a 0.
//
// It is not hypothetical. Measured 2026-09-21: **ESPN RSS had been contributing
// 0 items** to the live news feed, while returning 25 perfectly good items to
// anyone who asked from elsewhere. Nothing surfaced it. CLAUDE.md already
// records the same shape once before — FantasyPros, "the most player-focused
// source in the old list", dead across all three endpoints and "had been
// contributing nothing", found by a hand probe months later.
//
// THE RULE: alarm on a PERSISTENT gap, never on a single miss. A one-run blip
// is a CDN hiccup, and an alarm that cries at hiccups is an alarm you learn to
// ignore — which would leave us exactly where we started. This is the same
// discipline the news feed's `spanHours` keeps: measure the WINDOW, not the
// instant.

// How many CONSECUTIVE runs of silence before a source counts as dark. Both
// numbers mean roughly "a day or more of total silence" — long enough to rule
// out a blip, short enough to catch it before it is forgotten.
export const DARK_AFTER = {
  // values-history.yml runs daily, so 3 misses is 3 days.
  archive: 3,
  // news.yml ASKS for 48 runs/day and GitHub delivers ~7.4 (CLAUDE.md), so 12
  // misses is ~1.5 days. Sized off the measured rate, never off the cron line.
  feed: 12,
}

// --- columnar archive (values-consensus.json) -------------------------------

// The archive diagnoses itself: it already carries `coverage[]` per source,
// aligned to `dates[]`, where a null means "this source was not read that day".
// No extra state file, and no way for the counter to drift from the data.
export function assessArchiveSources(archive, { window = DARK_AFTER.archive } = {}) {
  const dates = Array.isArray(archive?.dates) ? archive.dates : []
  const sources = archive?.sources ?? {}
  return Object.keys(sources).map(key => {
    const coverage = Array.isArray(sources[key]?.coverage) ? sources[key].coverage : []
    // Align defensively: a shorter coverage array means unknown, not read.
    const aligned = dates.map((_, i) => coverage[i] ?? null)
    let misses = 0
    for (let i = aligned.length - 1; i >= 0 && aligned[i] == null; i--) misses++
    const everSeen = aligned.some(v => v != null)
    return {
      key,
      misses,
      everSeen,
      columns: aligned.length,
      // Needs a full window of history before it can fire, so a fresh archive
      // never alarms on the day it starts.
      dark: aligned.length >= window && misses >= window,
    }
  })
}

// --- snapshot feed (news.json) ----------------------------------------------

// A feed that is force-pushed whole each run carries no history of its own, so
// the counter has to be carried forward inside it. `counts` is the run's
// per-source item count; 0 means the source threw or returned nothing.
export function trackSourceMisses(previousMisses, counts) {
  const prev = previousMisses ?? {}
  const next = {}
  for (const [name, n] of Object.entries(counts ?? {})) {
    next[name] = Number(n) > 0 ? 0 : (Number(prev[name]) || 0) + 1
  }
  return next
}

export function darkFeedSources(misses, { window = DARK_AFTER.feed } = {}) {
  return Object.entries(misses ?? {})
    .filter(([, n]) => Number(n) >= window)
    .map(([key, n]) => ({ key, misses: Number(n) }))
    .sort((a, b) => b.misses - a.misses)
}

// --- the message ------------------------------------------------------------

// Written to be actionable from the notification alone, because that is all
// the reader gets: what stopped, how long ago, and the two things that fix it.
// "Remove the source" is stated explicitly — a source that is genuinely gone
// should leave the list, and until it does the alarm is correct to keep firing.
export function formatAlarm({ pipeline, findings, unit, fixHint }) {
  if (!findings.length) return null
  const lines = findings.map(f => {
    const seen = f.everSeen === false ? ' (has NEVER been read)' : ''
    return `  · ${f.key} — no data for ${f.misses} consecutive ${unit}${f.misses === 1 ? '' : 's'}${seen}`
  })
  return [
    `${pipeline}: ${findings.length} source${findings.length === 1 ? '' : 's'} stopped contributing.`,
    ...lines,
    '',
    'This is a persistent gap, not a blip — the threshold is roughly a day of silence.',
    fixHint,
    'If the source is genuinely gone, remove it so the alarm stops meaning something else.',
  ].join('\n')
}
