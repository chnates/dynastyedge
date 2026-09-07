// tests/seasonWindow.test.mjs — pins src/utils/seasonWindow.js, the thing that
// tells the app a rookie draft has happened.
//
// Why this file exists: until 2026-09 the pick window was the hand-maintained
// constant PICK_YEARS. The failure it produced is specific and silent — the
// moment a season's rookie draft completes, FantasyCalc RETIRES that season's
// pick entries (verified live 2026-09-07: 24 pick entries, all 2027/2028/2029),
// so every pick the app kept generating for the spent season priced at 0 and
// cluttered the Trade Analyzer, while the newly tradable third season was
// invisible everywhere.
//
// Behaviors pinned (with their doc source):
//  - CLAUDE.md Constants File: the three-season pick window is the upcoming
//    rookie draft plus the two after it, derived from live data.
//  - CLAUDE.md Feature 10 (Draft Tracker): the Tracker follows the upcoming
//    draft while one exists — that is its entire purpose on draft day.
//  - CLAUDE.md Rules #7 discipline: degrade to the caller's seed rather than
//    returning an empty window; every pick surface is built from it.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  rookieDrafts,
  upcomingDraftSeason,
  resolvePickYears,
  selectTrackedDraft,
} from '../src/utils/seasonWindow.js'

const SEED = ['2026', '2027', '2028']
const state = season => ({ season, season_type: 'regular' })

test('upcomingDraftSeason: the current season stays current until its draft completes', () => {
  // No draft created yet — nothing has been held, so 2026 picks are still live.
  assert.equal(upcomingDraftSeason(state('2026'), []), '2026')

  // Created but not run: pre_draft / drafting / paused all keep it current,
  // which is what makes the Tracker work on draft day itself.
  for (const status of ['pre_draft', 'drafting', 'paused']) {
    assert.equal(
      upcomingDraftSeason(state('2026'), [{ season: '2026', type: 'linear', status }]),
      '2026',
      `${status} must not retire the season's picks`
    )
  }
})

test('upcomingDraftSeason: a completed draft rolls the window to the next season', () => {
  assert.equal(
    upcomingDraftSeason(state('2026'), [{ season: '2026', type: 'linear', status: 'complete' }]),
    '2027'
  )
})

test('upcomingDraftSeason: an AUCTION never counts as the rookie draft', () => {
  // Auctions are startup formats. Treating one as the rookie draft would
  // retire a season of picks that are still very much tradable.
  assert.equal(
    upcomingDraftSeason(state('2026'), [{ season: '2026', type: 'auction', status: 'complete' }]),
    '2026'
  )
})

test('upcomingDraftSeason: a PAST season\'s completed draft does not roll the window', () => {
  // Only *this* season's draft decides. The 2025 draft has been complete for a
  // year and must not push 2026 out.
  assert.equal(
    upcomingDraftSeason(state('2026'), [{ season: '2025', type: 'linear', status: 'complete' }]),
    '2026'
  )
})

test('resolvePickYears: three consecutive seasons, newest first', () => {
  assert.deepEqual(
    resolvePickYears(state('2026'), [{ season: '2026', type: 'linear', status: 'complete' }], SEED),
    ['2027', '2028', '2029']
  )
  assert.deepEqual(resolvePickYears(state('2026'), [], SEED), ['2026', '2027', '2028'])
})

test('resolvePickYears: no NFL state → the caller\'s seed, never an empty window', () => {
  // Every pick surface in the app is built from this array; returning [] would
  // blank pick capital app-wide during the first paint.
  assert.deepEqual(resolvePickYears(null, [], SEED), SEED)
  assert.deepEqual(resolvePickYears({}, [], SEED), SEED)
})

test('selectTrackedDraft: the upcoming draft wins whenever it exists', () => {
  const drafts = [
    { draft_id: 'old', season: '2025', type: 'linear', status: 'complete' },
    { draft_id: 'next', season: '2026', type: 'linear', status: 'pre_draft' },
  ]
  assert.equal(selectTrackedDraft(drafts, '2026').draft_id, 'next')
})

test('selectTrackedDraft: once it completes, its recap stays on screen', () => {
  // The league creates next year's draft months later. Pointing the Tracker at
  // a season Sleeper has never heard of would replace a completed recap with an
  // empty "no draft yet" placeholder for most of a year.
  const drafts = [{ draft_id: 'done', season: '2026', type: 'linear', status: 'complete' }]
  assert.equal(selectTrackedDraft(drafts, '2027').draft_id, 'done')
})

test('selectTrackedDraft: most recent first among completed drafts, auctions excluded', () => {
  const drafts = [
    { draft_id: 'auction', season: '2026', type: 'auction', status: 'complete' },
    { draft_id: 'y25', season: '2025', type: 'linear', status: 'complete' },
    { draft_id: 'y26', season: '2026', type: 'linear', status: 'complete' },
  ]
  assert.equal(selectTrackedDraft(drafts, '2027').draft_id, 'y26')
  assert.equal(selectTrackedDraft([], '2027'), null)
  assert.equal(selectTrackedDraft(null, '2027'), null)
})

test('rookieDrafts: auctions and malformed entries are dropped', () => {
  const list = rookieDrafts([
    null,
    { season: '2026', type: 'auction' },
    { type: 'linear' },              // no season
    { season: '2026', type: 'linear' },
  ])
  assert.equal(list.length, 1)
  assert.equal(list[0].season, '2026')
})
