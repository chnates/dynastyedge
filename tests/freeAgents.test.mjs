// tests/freeAgents.test.mjs — pins the waiver-options list
// (src/utils/freeAgents.js), and specifically the DEF blind spot it fixes.
//
// Behaviors pinned (with their doc source):
//  - docs/analysis/optimizer-data-sources-2026-09.md §2: the drawer gated every
//    row on FantasyCalc, which ranks ZERO defenses, so the DEF slot rendered 0
//    rows against 14 available defenses. A shipped defect.
//  - CLAUDE.md Rules #7: a player FantasyCalc doesn't rank is still shown —
//    name/position from the player DB, value `—`, contributing 0.
//  - CLAUDE.md Critical stats note: `TEAM_*` keys are team OFFENSE totals
//    (110–120 pts), not the team defense. Never sweep them in.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildWaiverOptions, isTeamTotalsKey } from '../src/utils/freeAgents.js'

const projMap = {
  '100': { pts_half_ppr: 12.5 },   // WR, FantasyCalc-ranked
  '200': { pts_half_ppr: 4.0 },    // WR, rostered
  '300': { pts_half_ppr: 9.9 },    // RB, unranked by FantasyCalc
  LV:    { pts_half_ppr: 7.66 },   // team DEFENSE — a real fantasy asset
  DAL:   { pts_half_ppr: 6.82 },
  TEAM_LV: { pts_half_ppr: 114.2 }, // team OFFENSE totals — NOT an asset
}
const playerDB = {
  '100': { name: 'Ranked Wideout', position: 'WR', team: 'AAA' },
  '200': { name: 'Owned Wideout',  position: 'WR', team: 'BBB' },
  '300': { name: 'Deep Stash',     position: 'RB', team: 'CCC' },
  LV:    { name: 'Las Vegas Raiders', position: 'DEF', team: 'LV' },
  DAL:   { name: 'Dallas Cowboys',    position: 'DEF', team: 'DAL' },
}
const fcPlayerMap = {
  '100': { name: 'Ranked Wideout', position: 'WR', team: 'AAA', value: 1500 },
}
const rosteredIds = new Set(['200'])

test('the DEF slot returns defenses — FantasyCalc must NOT gate the list', () => {
  const rows = buildWaiverOptions({
    projMap, rosteredIds, fcPlayerMap, playerDB, eligible: ['DEF'],
  })
  assert.deepEqual(rows.map(r => r.sleeperId), ['LV', 'DAL'], 'ranked by projection')
  assert.equal(rows[0].name, 'Las Vegas Raiders', 'name resolved from the player DB')
  assert.equal(rows[0].value, null, 'unranked shows `—`, never 0 (rule 7)')
})

test('TEAM_* keys are team offense totals and never enter the list', () => {
  // Without the guard, TEAM_LV (114 pts) would top every list it touched.
  assert.equal(isTeamTotalsKey('TEAM_LV'), true)
  assert.equal(isTeamTotalsKey('LV'), false)
  const rows = buildWaiverOptions({
    projMap, rosteredIds, fcPlayerMap, playerDB, eligible: ['DEF', 'WR', 'RB'],
  })
  assert.ok(!rows.some(r => r.sleeperId.startsWith('TEAM_')))
  assert.ok(rows.every(r => r.projPts < 20), 'no 110-point row leaked in')
})

test('an unranked skill player is kept, with a null value', () => {
  const rows = buildWaiverOptions({
    projMap, rosteredIds, fcPlayerMap, playerDB, eligible: ['RB', 'WR'],
  })
  const stash = rows.find(r => r.sleeperId === '300')
  assert.ok(stash, 'a rostered-position player FantasyCalc misses is still shown')
  assert.equal(stash.value, null)
  assert.equal(rows.find(r => r.sleeperId === '100').value, 1500)
})

test('rostered players are excluded and rows sort by projection', () => {
  const rows = buildWaiverOptions({
    projMap, rosteredIds, fcPlayerMap, playerDB, eligible: ['WR', 'RB', 'DEF'],
  })
  assert.ok(!rows.some(r => r.sleeperId === '200'), 'owned player is not a free agent')
  const pts = rows.map(r => r.projPts)
  assert.deepEqual(pts, [...pts].sort((a, b) => b - a))
})

test('a player the DB cannot name is dropped rather than shown blank', () => {
  const rows = buildWaiverOptions({
    projMap: { '999': { pts_half_ppr: 30 } },
    rosteredIds: new Set(), fcPlayerMap: {}, playerDB: {}, eligible: ['WR'],
  })
  assert.deepEqual(rows, [])
})
