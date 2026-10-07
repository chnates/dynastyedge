// The snapshot pipelines' view of THE FantasyCalc reader.
//
// Since 2026-10-07 (CODE-REVIEW-1 #6) this file holds no rules of its own: the
// player/pick classifier is src/utils/fantasyCalcPayload.js and the round
// median is src/utils/pickCapital.js — the same code the app and the MCP
// server run. It used to be a hand-kept mirror because "Actions cannot import
// src/utils' extensionless imports"; the workflows now run these scripts with
// the repo's resolver hook (`node --import ./scripts/register.mjs`), so the
// copy — the one that archived every pick at 0 for two months
// (failure-archaeology §3d) — is gone.
//
// What stays here is the pipeline-shaped API the snapshot scripts and
// tests/fantasyCalcValues.test.mjs already use. DO NOT inline it back into a
// fetch script.

import { splitFantasyCalcPayload, fantasyCalcValuesUrl } from '../src/utils/fantasyCalcPayload.js'
import { pickRoundMedian } from '../src/utils/pickCapital.js'

// THE FantasyCalc URL (its four parameters must never change) — built from
// src/constants.js, never retyped.
export const FANTASYCALC_VALUES_URL = fantasyCalcValuesUrl()

// { playerValues: { sleeperId → value }, pickEntries: [{ name, value }] }.
// Lenient on purpose: an unreadable payload returns empty, and each script
// decides what an empty read means for its own file (abort, or an all-null
// column in the consensus archive).
export function splitFantasyCalcEntries(data) {
  const { playerMap, pickEntries } = splitFantasyCalcPayload(data, { strict: false })
  const playerValues = {}
  for (const [sid, p] of Object.entries(playerMap)) playerValues[sid] = p.value
  return { playerValues, pickEntries }
}

// The pick-pricing ladder, same order the app walks (failure-archaeology §3a):
//   1. the median of THAT SEASON's round entries — the real market price
//   2. the generic round median across every season listed — "a 2nd is a 2nd"
//   3. null — FantasyCalc lists no picks at all for this round
//
// Step 3 returns NULL, never 0: in a permanent archive a stored 0 is
// indistinguishable from a real price, and a null is skipped by design.
export function buildPickPricer(pickEntries) {
  const entries = pickEntries ?? []
  return function pickValue(season, round) {
    return pickRoundMedian(entries, round, season) ?? pickRoundMedian(entries, round)
  }
}
