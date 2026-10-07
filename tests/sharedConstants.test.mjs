// Small shared lists with ONE home each (CODE-REVIEW-1 #16, 2026-10-07):
// the four dynasty positions (src/constants.js POSITIONS), the three
// win-window tiers (src/utils/tierColors.js WIN_WINDOW_TIERS) and the
// value-history window (src/constants.js VALUE_HISTORY_DAYS).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { POSITIONS, VALUE_HISTORY_DAYS } from '../src/constants.js'
import { WIN_WINDOW_TIERS, TIER_TEXT } from '../src/utils/tierColors.js'

test('the shared lists hold their shipped values', () => {
  assert.deepEqual(POSITIONS, ['QB', 'RB', 'WR', 'TE'])
  assert.deepEqual(WIN_WINDOW_TIERS, ['Contending', 'Middle', 'Rebuilding'])
  assert.deepEqual(Object.keys(TIER_TEXT).sort(), [...WIN_WINDOW_TIERS].sort())
  assert.equal(VALUE_HISTORY_DAYS, 90)
})

test('no second copy of the position or tier list, or the 90-day window', () => {
  const root = new URL('..', import.meta.url).pathname
  const files = []
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) { if (name !== 'dev') walk(p) }
      else if (/\.(js|jsx|mjs)$/.test(name)) files.push(p)
    }
  }
  walk(join(root, 'src'))
  walk(join(root, 'mcp'))
  walk(join(root, 'scripts'))
  const copies = []
  for (const f of files) {
    const own = f.endsWith('src/constants.js') || f.endsWith('utils/tierColors.js')
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (line.trim().startsWith('//') || own) return
      // Deliberately separate (freeAgents.js says why): "has a FantasyCalc
      // price" is a different set that happens to coincide today.
      if (/VALUED_POSITIONS\s*=/.test(line)) return
      if (/\[\s*'QB',\s*'RB',\s*'WR',\s*'TE'\s*\]/.test(line) ||
          /\[\s*'Contending',\s*'Middle',\s*'Rebuilding'\s*\]/.test(line) ||
          /MAX_DAYS\s*=\s*90\b/.test(line)) {
        copies.push(`${f.slice(root.length)}:${i + 1}`)
      }
    })
  }
  assert.deepEqual(copies, [], 'import POSITIONS / WIN_WINDOW_TIERS / VALUE_HISTORY_DAYS')
})
