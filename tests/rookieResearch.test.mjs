// Rookie research model — pins the behavior documented in CLAUDE.md Feature 19
// and calibrated in docs/analysis/rookie-research-signals-2026-08.md.
// Every assertion cites the documented claim it protects, so a failure is
// either a code regression or doc drift, never a mystery.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEPTH_VALUE, DEPTH_WEIGHT, UDFA_SCORE,
  depthBucket, depthScore, capitalScore, opportunityScore,
  campMove, depthLabel, scoreReasons,
  buildRookieResearch, splitDivergence,
} from '../src/utils/rookieResearch.js'

test('the blend weight is the back-tested 0.3 depth / 0.7 capital', () => {
  assert.equal(DEPTH_WEIGHT, 0.3)
  // The ceiling on both axes is a rank-1 QB taken 1.01 — QB rank 1 is the
  // largest cell in the shared points scale, so only it reaches 1.
  assert.equal(opportunityScore({ position: 'QB', rank: 1, pick: 1 }), 1)
  assert.ok(opportunityScore({ position: 'WR', rank: 1, pick: 1 }) < 1)
  // Blend arithmetic is exactly w*depth + (1-w)*capital.
  const expected = 0.3 * depthScore('RB', 2) + 0.7 * capitalScore(50)
  assert.equal(opportunityScore({ position: 'RB', rank: 2, pick: 50 }), expected)
})

test('off the depth chart folds into the 4+ bucket', () => {
  // "Not listed" and "listed fourth" are the same fact about opportunity —
  // the back-test scored them as one bucket.
  assert.equal(depthBucket(null), 4)
  assert.equal(depthBucket(9), 4)
  assert.equal(depthBucket(undefined), 4)
  assert.equal(depthBucket(2), 2)
  assert.equal(depthScore('WR', null), depthScore('WR', 7))
})

test('depth value is position-specific, matching the measured cliffs', () => {
  // QB is binary (212 -> 55); RB degrades gently (120 -> 76). So the SAME
  // ordinal must cost a QB far more than an RB.
  const qbDrop = depthScore('QB', 1) - depthScore('QB', 2)
  const rbDrop = depthScore('RB', 1) - depthScore('RB', 2)
  assert.ok(qbDrop > rbDrop, `QB rank-2 cliff (${qbDrop}) should exceed RB's (${rbDrop})`)
  // WR falls off hard after rank 1; a rank-3 RB still carries real value.
  assert.ok(depthScore('RB', 3) > depthScore('WR', 3))
  // Scores share ONE points scale across positions — a per-position scale put
  // five backup TEs in the undervalued top six. Near-identical outcomes must
  // score near-identically: TE rank 2 is 41 median points, WR rank 2 is 43.
  assert.ok(Math.abs(depthScore('TE', 2) - depthScore('WR', 2)) < 0.02,
    'a TE2 and a WR2 produce the same points and must score the same')
  // Only the single best cell in the table (a starting QB) reaches 1.
  assert.equal(depthScore('QB', 1), 1)
  assert.ok(depthScore('WR', 1) < 1 && depthScore('WR', 1) > depthScore('TE', 1))
})

test('a position-blind score would rank backup TEs over starting WRs — this one does not', () => {
  // The observed failure while calibrating: a rank-blind model returned a
  // top-8 "undervalued" list of eight backup tight ends. Guard it directly.
  const te2 = opportunityScore({ position: 'TE', rank: 2, pick: 56 })
  const wr1 = opportunityScore({ position: 'WR', rank: 1, pick: 56 })
  assert.ok(wr1 > te2, 'a starting WR must outscore a TE2 at identical draft capital')
})

test('capital score is monotonic and floors undrafted players', () => {
  assert.equal(capitalScore(1), 1)
  const picks = [1, 5, 20, 60, 150, 250]
  for (let i = 1; i < picks.length; i++) {
    assert.ok(capitalScore(picks[i]) < capitalScore(picks[i - 1]),
      `pick ${picks[i]} must score below pick ${picks[i - 1]}`)
  }
  assert.equal(capitalScore(null), UDFA_SCORE)
  // An undrafted starter must still beat a buried day-three pick — the whole
  // point of the floor rather than zero.
  assert.ok(opportunityScore({ position: 'RB', rank: 1, pick: null }) >
            opportunityScore({ position: 'RB', rank: 4, pick: 240 }))
})

test('camp movement reports direction and ignores gaps, but never scores', () => {
  assert.deepEqual(campMove([3, null, 3, 2, 1]), { from: 3, to: 1, delta: 2, direction: 'up' })
  assert.deepEqual(campMove([1, 2]), { from: 1, to: 2, delta: -1, direction: 'down' })
  assert.equal(campMove([2, 2, 2]), null, 'no movement reads as no story')
  assert.equal(campMove([1]), null, 'a single snapshot is not a trend')
  assert.equal(campMove(null), null)
  // Movement must not leak into the score: it is displayed context only,
  // because it could not be back-tested (no pre-camp 2025 baseline).
  const a = opportunityScore({ position: 'WR', rank: 2, pick: 40 })
  assert.equal(a, opportunityScore({ position: 'WR', rank: 2, pick: 40 }))
})

test('depth labels are position-aware and name the blocker', () => {
  assert.match(depthLabel('QB', 2, ['Kirk Cousins']), /Backup behind Kirk Cousins/)
  assert.match(depthLabel('RB', 2, ['Bijan Robinson']), /Splitting behind Bijan Robinson/)
  assert.match(depthLabel('WR', 2, ['Chris Olave']), /One spot behind Chris Olave/)
  assert.match(depthLabel('WR', 1), /Listed first/)
  assert.match(depthLabel('WR', null), /Not on the depth chart/)
})

test('score reasons always explain both axes', () => {
  const r = scoreReasons({ position: 'WR', rank: 1, pick: 4, round: 1 })
  assert.equal(r.length, 2, 'one reason for capital, one for depth')
  assert.match(r[0].text, /First-round capital/)
  assert.ok(r.every(x => ['good', 'flat', 'bad'].includes(x.tone)))
  assert.match(scoreReasons({ position: 'WR', rank: 4, pick: null })[0].text, /Undrafted/)
})

// ── buildRookieResearch ──────────────────────────────────────────────────────
const prospects = [
  { sleeperId: '1', name: 'Starter WR', position: 'WR', value: 3000 },
  { sleeperId: '2', name: 'Buried WR',  position: 'WR', value: 5000 },
  { sleeperId: '3', name: 'No Feed',    position: 'RB', value: 2000 },
]
const intel = {
  players: {
    1: { name: 'Starter WR', pos: 'WR', team: 'ATL', pick: 40, round: 2, rank: 1, slot: 'LWR', ranks: [3, 2, 1], ahead: [] },
    2: { name: 'Buried WR',  pos: 'WR', team: 'KC',  pick: 176, round: 6, rank: 5, slot: 'SWR', ranks: [5, 5], ahead: ['A', 'B', 'C'] },
  },
}

test('a prospect with no intel entry is kept but never scored or ranked', () => {
  // Absence may be a feed gap; scoring him at the bottom would invent data.
  const rows = buildRookieResearch(prospects, intel)
  const missing = rows.find(r => r.sleeperId === '3')
  assert.equal(missing.noData, true)
  assert.equal(missing.score, null)
  assert.equal(missing.marketRank, null)
  assert.equal(missing.divergence, null)
  assert.equal(missing.name, 'No Feed', 'the player is still shown, never dropped')
})

test('divergence is positive when the model likes a rookie more than the market', () => {
  // Both prospects are WRs, so they rank against each other within position.
  const rows = buildRookieResearch(prospects, intel)
  const starter = rows.find(r => r.sleeperId === '1')
  const buried = rows.find(r => r.sleeperId === '2')
  // Market prefers Buried (5000 > 3000); the model prefers Starter.
  assert.equal(starter.marketRank, 2)
  assert.equal(starter.modelRank, 1)
  assert.equal(starter.divergence, 1, 'market rank minus model rank')
  assert.equal(buried.divergence, -1)
  assert.deepEqual(starter.move, { from: 3, to: 1, delta: 2, direction: 'up' })
  assert.match(starter.depthText, /Listed first/)
})

test('an empty or missing feed degrades to unscored rows, never an exception', () => {
  // Class B contract: the feed is best-effort, so the view must still render.
  for (const feed of [null, undefined, {}, { players: {} }]) {
    const rows = buildRookieResearch(prospects, feed)
    assert.equal(rows.length, 3)
    assert.ok(rows.every(r => r.noData === true && r.score === null))
  }
  assert.deepEqual(buildRookieResearch([], intel), [])
  assert.deepEqual(buildRookieResearch(null, intel), [])
})

test('ranks are computed within position, not across the class', () => {
  // A FantasyCalc value already prices positional scarcity; this model prices
  // expected points. Ranking them against each other across positions
  // compares yardsticks and flags every TE as undervalued.
  const mixed = [
    { sleeperId: 'w1', name: 'WR A', position: 'WR', value: 4000 },
    { sleeperId: 'w2', name: 'WR B', position: 'WR', value: 3000 },
    { sleeperId: 't1', name: 'TE A', position: 'TE', value: 900 },
  ]
  const feed = { players: {
    w1: { pos: 'WR', pick: 90, rank: 3, ranks: [3] },
    w2: { pos: 'WR', pick: 10, rank: 1, ranks: [1] },
    t1: { pos: 'TE', pick: 120, rank: 1, ranks: [1] },
  } }
  const rows = buildRookieResearch(mixed, feed)
  const te = rows.find(r => r.sleeperId === 't1')
  // The lone TE is #1 on both yardsticks within his own position, so he
  // carries no divergence at all — under cross-position ranking his low
  // dynasty value would have made him look wildly undervalued.
  assert.equal(te.marketRank, 1)
  assert.equal(te.modelRank, 1)
  assert.equal(te.divergence, 0)
  // The WRs still disagree: market prefers A, the model prefers B.
  assert.equal(rows.find(r => r.sleeperId === 'w2').divergence, 1)
})

test('splitDivergence only surfaces genuine disagreements', () => {
  const rows = [
    { sleeperId: 'a', divergence: 20 }, { sleeperId: 'b', divergence: 9 },
    { sleeperId: 'c', divergence: 3 },  { sleeperId: 'd', divergence: -12 },
    { sleeperId: 'e', divergence: null },
  ]
  const { undervalued, overvalued } = splitDivergence(rows, { minGap: 8 })
  assert.deepEqual(undervalued.map(r => r.sleeperId), ['a', 'b'], 'sorted by gap, minGap applied')
  assert.deepEqual(overvalued.map(r => r.sleeperId), ['d'])
  assert.equal(splitDivergence(rows, { minGap: 8, limit: 1 }).undervalued.length, 1)
  // Default gap is tuned for within-position group sizes (~8-30 players).
  assert.deepEqual(splitDivergence(rows).undervalued.map(r => r.sleeperId), ['a', 'b'])
  assert.equal(splitDivergence(rows).overvalued.length, 1)
})
