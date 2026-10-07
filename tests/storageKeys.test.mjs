// Every storage key has ONE home: src/storageKeys.js (CLAUDE.md rule 20;
// CODE-REVIEW-1 #12, 2026-10-07). A key written as a string in two files is a
// rename waiting to break one of them silently.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  STORAGE_KEYS, draftTrackerKey, ROSTER_SCOPED_LOCAL, ROSTER_SCOPED_SESSION,
} from '../src/storageKeys.js'

test('every key carries the dynastyedge_ prefix and is unique', () => {
  const values = Object.values(STORAGE_KEYS)
  for (const k of values) assert.match(k, /^dynastyedge_[a-z0-9_]+$/)
  assert.equal(new Set(values).size, values.length)
  assert.equal(draftTrackerKey('2027'), 'dynastyedge_draft_tracker_2027')
})

test('the stored names are unchanged (a rename would orphan the phone\'s saved state)', () => {
  assert.equal(STORAGE_KEYS.identity, 'dynastyedge_identity_v1')
  assert.equal(STORAGE_KEYS.theme, 'dynastyedge_theme')
  assert.equal(STORAGE_KEYS.watchlist, 'dynastyedge_watchlist_v1')
  assert.equal(STORAGE_KEYS.leagueTier, 'dynastyedge_league_tier')
})

test('the roster-scoped wipe list is drawn from the registry', () => {
  const all = new Set(Object.values(STORAGE_KEYS))
  for (const k of [...ROSTER_SCOPED_LOCAL, ...ROSTER_SCOPED_SESSION]) assert.ok(all.has(k), k)
  assert.deepEqual(ROSTER_SCOPED_LOCAL, ['dynastyedge_action_dismissals'])
  assert.deepEqual(ROSTER_SCOPED_SESSION, ['dynastyedge_trade_draft', 'dynastyedge_targets_team'])
})

test('no dynastyedge_ key literal anywhere else in src/', () => {
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
  const copies = []
  for (const f of files) {
    if (f.endsWith('src/storageKeys.js')) continue
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (line.trim().startsWith('//')) return
      if (/['"`]dynastyedge_/.test(line)) copies.push(`${f.slice(root.length)}:${i + 1}`)
    })
  }
  assert.deepEqual(copies, [], 'import from src/storageKeys.js instead')
})
