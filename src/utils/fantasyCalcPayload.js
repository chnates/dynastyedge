// THE FantasyCalc payload reader — one implementation for the app
// (useFantasyCalc), the MCP server (mcp/snapshot.js) and the Actions
// pipelines (scripts/fantasyCalcValues.mjs → snapshot-*.mjs).
//
// Until 2026-10-07 there were three copies (CODE-REVIEW-1 #6). The pipelines
// kept theirs because "Actions cannot import src/utils' extensionless imports"
// — true once, false since scripts/register.mjs (the repo's resolver hook) —
// and that copy is the one that archived every pick at 0 for two months
// (failure-archaeology §3d) after the app's had been fixed.
//
// Pure: no fetch, no React. tests/fantasyCalcValues.test.mjs pins it.

import { FANTASYCALC_BASE, FANTASYCALC_PARAMS } from '../constants'

// The one URL, built from the four parameters that must never change
// (numQbs=2 Superflex, ppr=0.5, numTeams=10, isDynasty).
export function fantasyCalcValuesUrl(base = FANTASYCALC_BASE, params = FANTASYCALC_PARAMS) {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))
  return `${base}/values/current?${qs}`
}

// Real players carry a NUMERIC Sleeper id. Since 2026-07 FantasyCalc also
// stamps its draft-pick entries with SYNTHETIC non-numeric ids ("FP_2026_1"
// round level, "DP_0_8" slot level) — before that, picks had no id at all.
// Classify by id SHAPE, never by mere presence: a presence test files every
// pick under a key no roster references and prices every pick at 0.
export function isPlayerSleeperId(sid) {
  return sid != null && /^\d+$/.test(String(sid))
}

// { playerMap: { sleeperId → player row }, pickEntries: [{ name, value }] }.
// Strict (the default) throws on a non-array payload or an empty player map —
// a silent shape change would otherwise price every roster at 0, so the app
// shows ErrorState. `strict: false` returns empty instead, for the pipelines,
// whose scripts each decide what an empty read means for their own file.
export function splitFantasyCalcPayload(data, { strict = true } = {}) {
  if (!Array.isArray(data)) {
    if (!strict) return { playerMap: {}, pickEntries: [] }
    throw new Error('FantasyCalc returned unexpected data — player values unavailable')
  }
  const playerMap = {}
  const pickEntries = []
  data.forEach(entry => {
    const sid = entry?.player?.sleeperId
    if (isPlayerSleeperId(sid)) {
      playerMap[String(sid)] = {
        name: entry.player.name,
        position: entry.player.position,
        team: entry.player.maybeTeam || '',
        age: entry.player.maybeAge ?? null,
        value: Math.round(entry.value ?? 0),
        overallRank: entry.overallRank ?? null,
        positionRank: entry.positionRank ?? null,
        trend30Day: entry.trend30Day ?? 0,
        experience: entry.player.experience ?? null,
        sleeperId: String(sid),
      }
    } else if (entry?.player?.name) {
      pickEntries.push({ name: entry.player.name, value: Math.round(entry.value ?? 0) })
    }
  })
  if (strict && Object.keys(playerMap).length === 0) {
    throw new Error('FantasyCalc returned no player values — try again later')
  }
  return { playerMap, pickEntries }
}
