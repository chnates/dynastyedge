// Two definitions of "even", on purpose, each with ONE home in
// src/utils/fairBand.js (CODE-REVIEW-1 #5, owner decision 2026-10-07):
//   • buildFairBand — the Analyzer's: is what I give within ±5% of what I get?
//   • hindsightResult / hindsightGapIsMeaningful — the scouting ledger's W-L-E
//     and League › Activity's "bigger haul": ±5% of the LARGER side, the same
//     answer from both seats.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildFairBand, HINDSIGHT_EDGE_PCT, hindsightResult, hindsightGapIsMeaningful,
} from '../src/utils/fairBand.js'

test('the hindsight rule: ±5% of the larger side', () => {
  assert.equal(HINDSIGHT_EDGE_PCT, 0.05)
  assert.equal(hindsightResult(100, 100), 'even')
  assert.equal(hindsightResult(105, 100), 'even')      // 5/105 = 4.8%
  assert.equal(hindsightResult(106, 100), 'win')       // 6/106 = 5.7%
  assert.equal(hindsightResult(100, 106), 'loss')
  assert.equal(hindsightResult(0, 0), 'even')
})

// The property the ledger needs, and the reason the owner kept the rules apart.
test('hindsight is symmetric: one side wins exactly when the other loses', () => {
  for (const [a, b] of [[100, 105.2], [100, 94.9], [1000, 1060], [50, 50], [0, 10]]) {
    const ra = hindsightResult(a, b), rb = hindsightResult(b, a)
    const mirror = { win: 'loss', loss: 'win', even: 'even' }
    assert.equal(rb, mirror[ra], `${a} vs ${b}`)
  }
})

test('the fair band applied to both seats is NOT symmetric — why it is not the ledger rule', () => {
  // A gets 100 for 105.2; B gets 105.2 for 100.
  const a = buildFairBand(105.2, 100)    // A's seat: gives 105.2, gets 100
  const b = buildFairBand(100, 105.2)    // B's seat: gives 100, gets 105.2
  assert.equal(a.inside, false)          // A overpaid
  assert.equal(b.inside, true)           // B calls it fair — no mirror "win"
})

test('Activity\'s bigger-haul flag is the same rule over the totals', () => {
  assert.equal(hindsightGapIsMeaningful([1000, 1060]), true)
  assert.equal(hindsightGapIsMeaningful([1000, 1040]), false)
  assert.equal(hindsightGapIsMeaningful([1000, 0]), false)   // zero sides ignored
  assert.equal(hindsightGapIsMeaningful([1000]), false)
  for (const [x, y] of [[1000, 1060], [1000, 1040], [500, 527]]) {
    assert.equal(hindsightGapIsMeaningful([x, y]), hindsightResult(x, y) !== 'even')
  }
})

test('no second copy of the hindsight edge in src/ or mcp/', () => {
  const root = new URL('..', import.meta.url).pathname
  const files = []
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(js|jsx|mjs)$/.test(name)) files.push(p)
    }
  }
  walk(join(root, 'src'))
  walk(join(root, 'mcp'))
  const copies = []
  for (const f of files) {
    if (f.endsWith('utils/fairBand.js')) continue
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (line.trim().startsWith('//')) return
      if (/\bTRADE_EDGE\s*=|\/\s*(size|maxTotal|max)\s*>\s*0?\.05\b/.test(line)) copies.push(`${f.slice(root.length)}:${i + 1}`)
    })
  }
  assert.deepEqual(copies, [], 'import from src/utils/fairBand.js instead')
})
