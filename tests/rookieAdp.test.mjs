// buildRookieProspects — the rookie→FantasyCalc join every Draft surface reads
// (Board, Tracker, Pick Trades, Research) and the MCP server's research_rookies.
//
// ROOKIE-1 (2026-09-25): the join is BY SLEEPER ID ONLY. A lower-cased
// full-name fallback used to hand an unpriced rookie his namesake's
// FantasyCalc entry. It was dropped, not position-guarded — see the comment on
// buildRookieProspects for the live measurement behind that choice.
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRookieMap, buildRookieProspects } from '../src/utils/rookieAdp.js'

const playerDB = {
  904: { name: 'Jaylen Smith', position: 'WR', team: 'SEA', age: 22, years_exp: 0 },
  905: { name: 'Jaylen Smith', position: 'RB', team: 'LAR', age: 21, years_exp: 0 },
  910: { name: 'Chris Brown', position: 'RB', team: 'NYJ', age: 22, years_exp: 0 },
  911: { name: 'Carter Hale', position: 'QB', team: 'CHI', age: 23, years_exp: 0 },
  // A veteran who shares the rookie 910's name AND position — the collision a
  // position guard would not have caught.
  50: { name: 'Chris Brown', position: 'RB', team: 'DAL', age: 29, years_exp: 6 },
}

const playerMap = {
  904: { sleeperId: '904', name: 'Jaylen Smith', position: 'WR', value: 1200, overallRank: 150, positionRank: 60 },
  911: { sleeperId: '911', name: 'Carter Hale', position: 'QB', value: 2400, overallRank: 90, positionRank: 30 },
  50: { sleeperId: '50', name: 'Chris Brown', position: 'RB', value: 3100, overallRank: 70, positionRank: 22 },
}

const byId = rows => Object.fromEntries(rows.map(r => [r.sleeperId, r]))

test('the two Jaylen Smiths: the unpriced RB never takes the priced WR\'s entry', () => {
  const rows = byId(buildRookieProspects(buildRookieMap(playerDB), playerMap))
  assert.equal(rows['904'].position, 'WR')
  assert.equal(rows['904'].value, 1200)
  assert.equal(rows['905'].position, 'RB', 'the RB is still the RB')
  assert.equal(rows['905'].value, 0, 'unpriced, not his namesake\'s 1,200')
  assert.equal(rows['905'].overallRank, undefined)
  assert.equal(rows['905'].adpOnly, true)
  assert.equal(rows['905'].adp, null, 'no rank, so no derived ADP — sorts to the bottom as —')
})

test('a same-name, same-POSITION veteran is not borrowed either — the case a guard would miss', () => {
  const rows = byId(buildRookieProspects(buildRookieMap(playerDB), playerMap))
  assert.equal(rows['910'].value, 0)
  assert.equal(rows['910'].team, 'NYJ', 'his own team, not the veteran\'s DAL')
  assert.equal(rows['50'], undefined, 'the veteran is not in the rookie class at all')
})

test('rookies are never dropped, and ADP ranks only the priced ones, 1..N by overall rank', () => {
  const rows = buildRookieProspects(buildRookieMap(playerDB), playerMap)
  assert.equal(rows.length, 4)
  const r = byId(rows)
  assert.equal(r['911'].adp, 1)
  assert.equal(r['904'].adp, 2)
})

test('no FantasyCalc yet: every rookie still renders, unpriced; no rookie map is an empty board', () => {
  const rows = buildRookieProspects(buildRookieMap(playerDB), null)
  assert.equal(rows.length, 4)
  assert.ok(rows.every(p => p.adpOnly === true && p.value === 0 && p.adp === null))
  assert.deepEqual(buildRookieProspects(null, playerMap), [])
})
