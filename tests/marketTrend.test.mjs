// The market-trend rules have ONE home (src/utils/marketTrend.js, 2026-10-07).
// CLAUDE.md rule 11: trend30Day > 50 ↑ · < -50 ↓ · between →. Before this file
// the ±50 lived in ten places and the buy-low / sell-high rule in three.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  TREND_THRESHOLD, MIN_TARGET_VALUE, trendDirection, isRising, isFalling, isMoving,
  trendPct, isBuyLowCandidate, isSellHighCandidate, trendTag,
} from '../src/utils/marketTrend.js'

test('the shipped thresholds: ±50 points, buy/sell targets worth 1000+', () => {
  assert.equal(TREND_THRESHOLD, 50)
  assert.equal(MIN_TARGET_VALUE, 1000)
})

test('exactly ±50 is flat; the move must clear it; a missing trend is flat', () => {
  assert.equal(trendDirection(51), 'up')
  assert.equal(trendDirection(50), 'flat')
  assert.equal(trendDirection(-50), 'flat')
  assert.equal(trendDirection(-51), 'down')
  for (const t of [null, undefined, NaN, 0]) assert.equal(trendDirection(t), 'flat')
  assert.ok(isRising(60) && !isRising(-60) && isFalling(-60) && isMoving(-60) && !isMoving(10))
})

test('the predicates reproduce the literal expressions they replaced', () => {
  const grid = [-1000, -51, -50.5, -50, -49.9, 0, 49.9, 50, 50.5, 51, 1000, null, undefined]
  for (const t of grid) {
    assert.equal(isRising(t), t > 50, `rising ${t}`)
    assert.equal(isFalling(t), t < -50, `falling ${t}`)
    assert.equal(isMoving(t), Math.abs(t ?? 0) > 50, `moving ${t}`)
    assert.equal(trendTag(t), t > 50 ? ` ↑${t}` : t < -50 ? ` ↓${t}` : '', `tag ${t}`)
  }
})

test('trendPct is % against the value 30 days ago, null without a positive baseline', () => {
  assert.equal(trendPct(120, 920), 15)   // 800 → 920
  assert.equal(trendPct(-200, 800), -20) // 1000 → 800
  assert.equal(trendPct(100, 100), null) // baseline 0
  assert.equal(trendPct(100, null), null)
})

test('buy low: falling, worth 1000+, at my deficit, not mine — free agents count', () => {
  const p = { trend30Day: -80, value: 1500, position: 'WR' }
  const ctx = { deficits: ['WR'], ownerRosterId: 3, myRosterId: 6 }
  assert.ok(isBuyLowCandidate(p, ctx))
  assert.ok(isBuyLowCandidate(p, { ...ctx, ownerRosterId: undefined }), 'free agent')
  assert.ok(!isBuyLowCandidate(p, { ...ctx, ownerRosterId: 6 }), 'already mine')
  assert.ok(!isBuyLowCandidate({ ...p, value: 999 }, ctx), 'too cheap')
  assert.ok(!isBuyLowCandidate({ ...p, trend30Day: -50 }, ctx), 'not a move')
  assert.ok(!isBuyLowCandidate(p, { ...ctx, deficits: ['RB'] }), 'not a need')
})

test('sell high: rising, worth 1000+, at a surplus position', () => {
  const p = { trend30Day: 80, value: 1000, position: 'QB' }
  assert.ok(isSellHighCandidate(p, { surpluses: ['QB'] }))
  assert.ok(!isSellHighCandidate(p, { surpluses: ['RB'] }))
  assert.ok(!isSellHighCandidate({ ...p, trend30Day: 50 }, { surpluses: ['QB'] }))
  assert.ok(!isSellHighCandidate({ ...p, value: undefined }, { surpluses: ['QB'] }))
})

// The guard that keeps it one home: no file outside marketTrend.js may write
// the trend threshold out again. A new surface imports it.
test('no second copy of the trend threshold anywhere in src/ or mcp/', () => {
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
    if (f.endsWith('marketTrend.js')) continue
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/trend\w*(\)|\s)*[<>]=?\s*-?50\b/i.test(line) || /\bTREND_THRESHOLD\s*=/.test(line)) {
        copies.push(`${f.slice(root.length)}:${i + 1}`)
      }
    })
  }
  assert.deepEqual(copies, [], 'import from src/utils/marketTrend.js instead')
})
