// The buyer / seller thresholds have ONE home: BUYER_PCT / SELLER_PCT in
// src/utils/playoffOdds.js, read through getDeadlineVerdict (CODE-REVIEW-1 #2,
// 2026-10-07). CLAUDE.md Feature 3: "getDeadlineVerdict is THE one definition of
// buyer/seller (shared with Playoffs, Partners, The Edge)". Trade Partners and the
// Playoffs colours had typed 0.7 / 0.35 in themselves, so a recalibration — an
// open question, since 6 of 10 teams make the playoffs — would have left them
// behind.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { BUYER_PCT, SELLER_PCT, getDeadlineVerdict } from '../src/utils/playoffOdds.js'

test('the shipped thresholds are unchanged: Buyer ≥ 70%, Seller < 35%', () => {
  assert.equal(BUYER_PCT, 0.7)
  assert.equal(SELLER_PCT, 0.35)
})

test('getDeadlineVerdict reads the constants at both edges', () => {
  assert.equal(getDeadlineVerdict(BUYER_PCT).stance, 'Buyer')
  assert.equal(getDeadlineVerdict(BUYER_PCT - 1e-9).stance, 'On the bubble')
  assert.equal(getDeadlineVerdict(SELLER_PCT).stance, 'On the bubble')
  assert.equal(getDeadlineVerdict(SELLER_PCT - 1e-9).stance, 'Seller')
  // Each stance carries the tone the Playoffs colours now read.
  assert.equal(getDeadlineVerdict(0.9).tone, 'success')
  assert.equal(getDeadlineVerdict(0.5).tone, 'warning')
  assert.equal(getDeadlineVerdict(0.1).tone, 'danger')
})

// The guard: no other file may compare a playoff probability against the
// cut-offs itself. Other 0.7 / 0.35 rules exist (draft hit rate, rookie z) and
// are deliberately not matched — the scan looks for odds-shaped comparisons.
test('no second copy of the buyer/seller cut-offs in src/ or mcp/', () => {
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
  const ODDS = /\b(p|pct|odds|playoffPct|playoff_pct)\b[\w.?]*\s*(>=|<=|<|>)\s*(0?\.70?|0?\.35|70|35)\b/i
  const TEXT = /(>=|≥|<)\s*(70|35)\s*%/
  const copies = []
  for (const f of files) {
    if (f.endsWith('utils/playoffOdds.js')) continue
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (line.trim().startsWith('//')) return
      if (ODDS.test(line) || TEXT.test(line)) copies.push(`${f.slice(root.length)}:${i + 1}`)
    })
  }
  assert.deepEqual(copies, [], 'read BUYER_PCT / SELLER_PCT or call getDeadlineVerdict instead')
})
