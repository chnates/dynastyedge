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

// ── one defense, and only one ─────────────────────────────────────────────
// CLAUDE.md Feature 1 / Feature 4: you start exactly one defense a week and
// there is no dynasty reason to hold a second, so a defense is only ever
// surfaced against the DEF slot or the DEF filter. `buildWaiverOptions` is
// slot-scoped by construction — this pins that a skill slot can never return
// one, which is what would turn the waiver list into "add some defenses".

test('a skill slot never returns a defense, however it is projected', () => {
  // LV projects 7.66 here — ahead of the unranked RB. If DEF leaked into a
  // FLEX list it would outrank real players and read as a recommendation.
  const rows = buildWaiverOptions({
    projMap, rosteredIds, fcPlayerMap, playerDB, eligible: ['RB', 'WR', 'TE'],
  })
  assert.ok(!rows.some(r => r.position === 'DEF'), 'FLEX slot is skill-only')
  const sflx = buildWaiverOptions({
    projMap, rosteredIds, fcPlayerMap, playerDB, eligible: ['QB', 'RB', 'WR', 'TE'],
  })
  assert.ok(!sflx.some(r => r.position === 'DEF'), 'Superflex is skill-only too')
})

test('the DEF slot returns ONLY defenses — never a skill player', () => {
  const rows = buildWaiverOptions({
    projMap, rosteredIds, fcPlayerMap, playerDB, eligible: ['DEF'],
  })
  assert.ok(rows.length > 0)
  assert.ok(rows.every(r => r.position === 'DEF'))
})

// ── the DYNASTY free-agent pool (shared by League › Free Agents and The Edge) ──
//
// Behaviors pinned (with their doc source):
//  - CLAUDE.md League Context: "Exactly one defense is ever rostered … The app
//    must therefore never suggest adding a defense as a pickup: defenses appear
//    only against the DEF slot … never in a general free-agent pool, never in
//    recommendFreeAgents."
//  - CLAUDE.md Rule #8: ids normalize to String() before any Set lookup.
//  - CLAUDE.md Rule #7: an unranked player shows `—`, never a fabricated 0.

import {
  buildFreeAgentPool, buildAvailableDefenses, buildRosteredIdSet, VALUED_POSITIONS,
} from '../src/utils/freeAgents.js'

const FA_MAP = {
  '1': { sleeperId: '1', name: 'Rostered WR', position: 'WR', value: 4000 },
  '2': { sleeperId: '2', name: 'Free WR', position: 'WR', value: 900 },
  '3': { sleeperId: '3', name: 'Free QB', position: 'QB', value: 1500 },
  '4': { sleeperId: '4', name: 'Zero Value', position: 'TE', value: 0 },
  '5': { sleeperId: '5', name: 'Null Value', position: 'RB', value: null },
  '6': { sleeperId: '6', name: 'Some Defense', position: 'DEF', value: 300 },
}
const FA_DB = {
  '6': { name: 'Some Defense', position: 'DEF', team: 'ATL' },
  '7': { name: 'Free Defense', position: 'DEF', team: 'SF' },
  '8': { name: 'Rostered Defense', position: 'DEF', team: 'KC' },
  '9': { name: 'Teamless Defense', position: 'DEF', team: null },
}
// Roster ids given as NUMBERS on purpose — the pool must still exclude them.
const FA_ROSTERS = [{ players: [{ sleeperId: 1 }, { sleeperId: 8 }] }]

test('the general free-agent pool can never contain a defense (League Context)', () => {
  const pool = buildFreeAgentPool({ fcPlayerMap: FA_MAP, allRosters: FA_ROSTERS })
  assert.equal(pool.filter(p => p.position === 'DEF').length, 0,
    'a valued DEF row must still be refused — the rule is not "FantasyCalc ranks none"')
  assert.ok(!VALUED_POSITIONS.includes('DEF'))
})

test('the pool excludes rostered, zero- and null-valued players (rule 8)', () => {
  const ids = buildFreeAgentPool({ fcPlayerMap: FA_MAP, allRosters: FA_ROSTERS })
    .map(p => p.sleeperId).sort()
  assert.deepEqual(ids, ['2', '3'],
    'numeric rostered id 1 excluded; 4 and 5 carry no value; 6 is a defense')
})

test('an explicit rosteredIds set is honoured over allRosters', () => {
  const pool = buildFreeAgentPool({ fcPlayerMap: FA_MAP, rosteredIds: new Set(['2']) })
  assert.deepEqual(pool.map(p => p.sleeperId).sort(), ['1', '3'],
    'allRosters is ignored entirely — 1 is free here and 2 is not')
})

test('the pool degrades to empty without FantasyCalc, never throwing', () => {
  assert.deepEqual(buildFreeAgentPool(), [])
  assert.deepEqual(buildFreeAgentPool({ fcPlayerMap: null, allRosters: FA_ROSTERS }), [])
})

test('buildRosteredIdSet normalizes every id to a string (rule 8)', () => {
  const owned = buildRosteredIdSet(FA_ROSTERS)
  assert.ok(owned.has('1') && owned.has('8'))
  assert.ok([...owned].every(id => typeof id === 'string'))
  assert.equal(buildRosteredIdSet(null).size, 0)
})

test('defenses are reachable only by their own named call, and show no value (rule 7)', () => {
  const defs = buildAvailableDefenses({ playerDB: FA_DB, allRosters: FA_ROSTERS })
  assert.deepEqual(defs.map(d => d.sleeperId).sort(), ['6', '7'],
    'rostered 8 excluded (numeric id), teamless 9 excluded')
  assert.ok(defs.every(d => d.value === null), '`—`, never a fabricated 0')
  assert.ok(defs.every(d => typeof d.sleeperId === 'string'))
  assert.deepEqual(buildAvailableDefenses(), [], 'no player DB ⇒ empty, never an error')
})
