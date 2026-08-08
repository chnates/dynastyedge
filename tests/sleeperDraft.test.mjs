// tests/sleeperDraft.test.mjs — pins the draft fetch contract
// (src/hooks/useSleeperDraft.js) with a mocked fetch, in the style of
// tests/matchupWeeks.test.mjs.
//
// The behavior that matters most here was a live bug found on 2026-08-08:
// `/league/{id}/drafts` OMITS `slot_to_roster_id`, and the hook only ever read
// that list endpoint. buildDraftOrder therefore returned null for every draft,
// silently disabling the on-the-clock banner, "N picks until yours", Best
// Available, and slot-accurate pick capital — the whole reason the Tracker
// exists on draft day. The fix merges the single-draft endpoint over the
// listed object; this file makes sure it stays merged.
//
// Behaviors pinned (with their doc source):
//  - CLAUDE.md Feature 10 "Refresh model": Board and Tracker share ONE
//    session-cached fetch; refresh() refetches on demand.
//  - Best-effort sub-fetches: a draft with no picks yet returns [], and a
//    failing picks / traded_picks / single-draft call must not sink the load.
//  - The rookie draft is selected by season (PICK_YEARS[0]) and never an
//    auction.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { loadDraft, resetDraftCache, buildDraftOrder, DRAFT_SEASON } from '../src/hooks/useSleeperDraft.js'

const SLOTS = { 1: 6, 2: 4 }
let calls = []
let fail = () => false
let noDrafts = false

// Minimal stand-ins for the four endpoints the hook touches.
function payloadFor(url) {
  if (url.includes('/drafts')) {
    if (noDrafts) return []
    return [
      // An auction in the same season must be skipped, not picked up.
      { draft_id: 'auction', season: DRAFT_SEASON, type: 'auction', status: 'pre_draft' },
      // A prior season's rookie draft must be skipped too.
      { draft_id: 'old', season: '1999', type: 'linear', status: 'complete' },
      // The listed object — note NO slot_to_roster_id, exactly like the live API.
      {
        draft_id: 'D1', season: DRAFT_SEASON, type: 'linear', status: 'pre_draft',
        settings: { rounds: 1, teams: 2 },
        draft_order: { ownerA: 1, ownerB: 2 },
      },
    ]
  }
  if (url.endsWith('/picks')) return [{ pick_no: 1, round: 1, roster_id: 6, player_id: '99' }]
  if (url.endsWith('/traded_picks')) return [{ round: 1, season: DRAFT_SEASON, roster_id: 4, owner_id: 6 }]
  return { draft_id: 'D1', season: DRAFT_SEASON, type: 'linear', status: 'drafting', slot_to_roster_id: SLOTS }
}

globalThis.fetch = async url => {
  const u = String(url)
  calls.push(u)
  if (fail(u)) return { ok: false, status: 500, json: async () => ({}) }
  return { ok: true, json: async () => payloadFor(u) }
}

const reset = () => { resetDraftCache(); calls = []; fail = () => false; noDrafts = false }

test('the single-draft endpoint is fetched and merged over the listed object', async () => {
  reset()
  const data = await loadDraft()

  assert.ok(calls.some(u => /\/draft\/D1$/.test(u)),
    'must fetch /draft/{id} — the list endpoint has no slot_to_roster_id')
  assert.deepEqual(data.draft.slot_to_roster_id, SLOTS)
  assert.equal(data.draft.status, 'drafting', 'the fresher single-draft status wins')
  assert.equal(data.draft.draft_id, 'D1')
  // Fields only the list endpoint carries survive the merge.
  assert.deepEqual(data.draft.settings, { rounds: 1, teams: 2 })
  assert.deepEqual(data.draft.draft_order, { ownerA: 1, ownerB: 2 })

  // The payoff: the order now resolves instead of being null.
  const order = buildDraftOrder(data.draft, data.tradedPicks, [])
  assert.ok(order, 'the live path is only reachable when the order resolves')
  assert.equal(order.length, 2)
  assert.equal(order[1].rosterId, 6, 'in-draft trade applied: slot 2 now belongs to roster 6')
  assert.equal(order[1].originalRosterId, 4)
})

test('picks and traded picks come back alongside the draft', async () => {
  reset()
  const data = await loadDraft()
  assert.equal(data.picks.length, 1)
  assert.equal(data.tradedPicks.length, 1)
})

test('one fetch per session; refresh(true) refetches', async () => {
  reset()
  await loadDraft()
  const first = calls.length
  assert.equal(first, 4, 'drafts + draft + picks + traded_picks')

  await loadDraft()
  await loadDraft()
  assert.equal(calls.length, first, 'Board and Tracker share the cached fetch')

  await loadDraft(true)
  assert.equal(calls.length, first * 2, 'forced refresh goes back to the network')
})

test('concurrent mounts share the in-flight fetch', async () => {
  reset()
  const [a, b] = await Promise.all([loadDraft(), loadDraft()])
  assert.equal(calls.length, 4, 'no duplicate request storm when both views mount together')
  assert.equal(a, b)
})

test('best-effort: a failing single-draft call falls back to the listed object', async () => {
  reset()
  fail = u => /\/draft\/D1$/.test(u)
  const data = await loadDraft()
  assert.equal(data.draft.draft_id, 'D1', 'load still succeeds')
  assert.equal(data.draft.status, 'pre_draft', 'listed status retained')
  assert.equal(data.draft.slot_to_roster_id, undefined)
  // draft_order still resolves the board, so the live path degrades but survives.
  const rosters = [{ owner_id: 'ownerA', roster_id: 6 }, { owner_id: 'ownerB', roster_id: 4 }]
  assert.ok(buildDraftOrder(data.draft, [], rosters), 'draft_order fallback keeps the board')
})

test('best-effort: failing picks / traded_picks degrade to empty, never reject', async () => {
  reset()
  fail = u => u.endsWith('/picks') || u.endsWith('/traded_picks')
  const data = await loadDraft()
  assert.deepEqual(data.picks, [])
  assert.deepEqual(data.tradedPicks, [])
  assert.ok(data.draft, 'the draft itself still loads')
})

test('no rookie draft for this season yields an empty, non-throwing shape', async () => {
  reset()
  noDrafts = true
  const data = await loadDraft()
  assert.deepEqual(data, { draft: null, picks: [], tradedPicks: [] })
  assert.ok(!calls.some(u => /\/draft\/[^/]+$/.test(u)), 'no follow-up fetches without a draft')
})

test('the drafts list itself failing rejects — the Tracker shows its sync error', async () => {
  reset()
  fail = u => u.includes('/drafts')
  await assert.rejects(() => loadDraft())
})
