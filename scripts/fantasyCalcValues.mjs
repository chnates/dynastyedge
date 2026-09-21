// THE FantasyCalc payload reader for the snapshot pipelines: how an entry is
// classified as a player or a pick, and how a pick is priced.
//
// Pure and dependency-free on purpose, so `tests/fantasyCalcValues.test.mjs`
// can pin it. The three snapshot scripts each carried their own copy of the
// classifier and two of them were wrong for months — DO NOT inline this back
// into a fetch script.
//
// It mirrors the app's `useFantasyCalc.js` + `utils/pickCapital.js`, which
// these scripts cannot import (Vite-style extensionless imports don't resolve
// under plain Node in Actions). Keep the two in step deliberately rather than
// letting them drift.

// FantasyCalc names its pick entries "2027 1st", "2027 1st (Mid)" (round
// level) and "2026 Pick 1.09" (exact slot). Only the round-level names carry
// a suffix, so a slot entry never pollutes a round median.
export const ROUND_SUFFIX = ['', '1st', '2nd', '3rd', '4th', '5th']

// Real players carry a NUMERIC Sleeper id. Since 2026-07 FantasyCalc also
// stamps its draft-pick entries with SYNTHETIC non-numeric ids ("FP_2027_1"
// round level, "DP_0_8" slot level) — before that, picks had no id at all.
//
// So classify by id SHAPE, never by mere presence. Measured live 2026-09-21:
// 0 of 418 entries have a falsy `sleeperId`, so an `if (sid)` test puts every
// pick into the player map and leaves `pickEntries` EMPTY — which prices
// every pick at 0. That is exactly what `snapshot-trade-values.mjs` did from
// the day FantasyCalc changed until 2026-09-21.
export function splitFantasyCalcEntries(data) {
  const playerValues = {}
  const pickEntries = []
  for (const entry of data ?? []) {
    const sid = entry?.player?.sleeperId
    if (sid != null && /^\d+$/.test(String(sid))) {
      playerValues[String(sid)] = Math.round(entry.value ?? 0)
    } else if (entry?.player?.name) {
      pickEntries.push({ name: entry.player.name, value: Math.round(entry.value ?? 0) })
    }
  }
  return { playerValues, pickEntries }
}

function median(matches) {
  if (!matches.length) return null
  const sorted = [...matches].sort((a, b) => a.value - b.value)
  return sorted[Math.floor(sorted.length / 2)].value
}

// The pick-pricing ladder, same order the app walks (failure-archaeology §3a):
//   1. the median of THAT SEASON's round entries — the real market price
//   2. the generic round median across every season listed — "a 2nd is a 2nd"
//   3. null — FantasyCalc lists no picks at all for this round
//
// Step 3 returns NULL, never 0. FantasyCalc retires a season's pick entries
// the moment its draft completes, so a miss means "unpriced", and a stored 0
// is indistinguishable from a real price to every consumer downstream — it
// counts into a total and renders as fact. A null is skipped by design.
export function buildPickPricer(pickEntries) {
  const entries = pickEntries ?? []
  return function pickValue(season, round) {
    const suffix = ROUND_SUFFIX[round]
    if (!suffix) return null
    const ofSeason = entries.filter(
      e => e.name.includes(String(season)) && e.name.includes(suffix)
    )
    const exact = median(ofSeason)
    if (exact != null) return exact
    return median(entries.filter(e => e.name.includes(suffix)))
  }
}
