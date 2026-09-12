// Pins the news feed's retention policy (scripts/newsRetention.mjs).
//
// Every assertion cites a documented behaviour from CLAUDE.md's "Player news
// pipeline" and docs/analysis/news-retention-2026-09.md, so a failure here is
// either a code regression or doc drift.

import test from 'node:test'
import assert from 'node:assert/strict'

import { retainDiverse } from '../scripts/newsRetention.mjs'

// Newest first, as the caller sorts them.
const item = (id, players) => ({ headline: `h${id}`, playerIds: players })
const ids = out => out.map(i => i.headline)

test('keeps the newest N items per player and drops the rest', () => {
  const feed = [
    item(1, ['A']), item(2, ['A']), item(3, ['A']), item(4, ['A']), item(5, ['A']),
  ]
  assert.deepEqual(ids(retainDiverse(feed, 3, 100)), ['h1', 'h2', 'h3'])
})

test('a redundant item about a covered player loses to an OLDER item about an uncovered one', () => {
  // The regression this policy exists to fix: recency-only eviction spent the
  // cap on 3.14 items per player and collapsed the window to ~30 hours.
  const feed = [
    item(1, ['A']), item(2, ['A']), item(3, ['A']),
    item(4, ['A']),          // 4th about A — must be dropped
    item(5, ['B']),          // older, but B is uncovered — must be kept
  ]
  const out = retainDiverse(feed, 3, 4)
  assert.deepEqual(ids(out), ['h1', 'h2', 'h3', 'h5'])
  assert.ok(!ids(out).includes('h4'))
})

test('breadth is never sacrificed: every player present survives', () => {
  // Measured: k of 1..4 all retain the full 97 distinct players of the live
  // window. Breadth is preserved by construction, not by tuning.
  const feed = []
  for (let p = 0; p < 40; p++) for (let n = 0; n < 6; n++) feed.push(item(`${p}-${n}`, [`P${p}`]))
  for (const k of [1, 2, 3, 4]) {
    const out = retainDiverse(feed, k, 1000)
    assert.equal(new Set(out.flatMap(i => i.playerIds)).size, 40, `k=${k} lost a player`)
    assert.equal(out.length, 40 * k)
  }
})

test('a roundup charges quota to every player it names', () => {
  const feed = [item(1, ['A', 'B', 'C']), item(2, ['A']), item(3, ['B'])]
  // perPlayer 1: the roundup fills A, B and C, so both singles are redundant.
  assert.deepEqual(ids(retainDiverse(feed, 1, 100)), ['h1'])
})

test('an item naming a player with room is admitted even when its other players are full', () => {
  // Admission is "ANY player still has room" — otherwise a roundup naming one
  // popular player could never carry a player nobody else covered.
  const feed = [item(1, ['A']), item(2, ['A', 'RARE'])]
  assert.deepEqual(ids(retainDiverse(feed, 1, 100)), ['h1', 'h2'])
})

test('an item resolving to no player rides on recency, never dropped by quota', () => {
  // Player news by ESPN athlete id alone — there is no player to charge.
  const feed = [
    item(1, ['A']), item(2, ['A']), item(3, ['A']), item(4, ['A']),
    { headline: 'espn-only', playerIds: [] },
  ]
  const out = retainDiverse(feed, 2, 100)
  assert.ok(ids(out).includes('espn-only'))
  assert.deepEqual(ids(out), ['h1', 'h2', 'espn-only'])
})

test('a missing playerIds field is treated as naming nobody, not as a crash', () => {
  const out = retainDiverse([{ headline: 'bare' }], 3, 10)
  assert.deepEqual(ids(out), ['bare'])
})

test('the cap is a hard ceiling and order is preserved', () => {
  const feed = Array.from({ length: 50 }, (_, i) => item(i, [`P${i}`]))
  const out = retainDiverse(feed, 3, 10)
  assert.equal(out.length, 10)
  assert.deepEqual(ids(out), ids(feed.slice(0, 10)))
})

test('an empty feed yields an empty window rather than throwing', () => {
  assert.deepEqual(retainDiverse([], 3, 100), [])
})
