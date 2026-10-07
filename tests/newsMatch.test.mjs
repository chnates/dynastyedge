// The news matcher has ONE home: src/utils/newsMatch.js (CODE-REVIEW-1 #10,
// 2026-10-07) — the drawer, The Edge's Headlines and the News section all
// called their own copy. CLAUDE.md: "playerIds is the join, not athleteIds".
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  normalizeName, headlineName, buildNewsIndex, resolveItemPlayer, feedItemView,
} from '../src/utils/newsMatch.js'

const lamb = { sleeperId: '6786', name: 'CeeDee Lamb' }
const moore = { sleeperId: '4983', name: 'DJ Moore' }          // the WR, not the CB
const st = { sleeperId: '9999', name: 'Amon-Ra St. Brown' }
const index = buildNewsIndex([moore, lamb, st], { 6786: { espn_id: 4241389 } })

test('order: the feed\'s playerIds first, beating roster order and the headline', () => {
  const item = { headline: 'DJ Moore and CeeDee Lamb lead the way', playerIds: ['6786', '4983'] }
  assert.equal(resolveItemPlayer(item, index), lamb)
})

test('then ESPN athleteIds, then the longest full name in the headline', () => {
  assert.equal(resolveItemPlayer({ headline: 'x', athleteIds: [4241389] }, index), lamb)
  assert.equal(resolveItemPlayer({ headline: 'Amon-Ra St. Brown sets a record' }, index), st)
  assert.equal(normalizeName("Amon-Ra St. Brown"), 'amonra st brown')
})

test('short names never match a headline; unknowns resolve to null', () => {
  assert.equal(headlineName('DJ Moore'), 'dj moore')
  assert.equal(headlineName('Bo'), null)
  assert.equal(resolveItemPlayer({ headline: 'Nobody here' }, index), null)
  assert.equal(resolveItemPlayer(null, index), null)
})

test('feedItemView carries both id arrays (the article sheet reads the longer)', () => {
  assert.deepEqual(feedItemView({ headline: 'h', playerIds: ['1'] }), {
    headline: 'h', story: '', published: null, source: null, link: null, athleteIds: [], playerIds: ['1'],
  })
})

test('no second news matcher or name normaliser in src/ or the feed script', () => {
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
  files.push(join(root, 'scripts', 'fetch-news.mjs'))
  const copies = []
  for (const f of files) {
    if (f.endsWith('utils/newsMatch.js')) continue
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (line.trim().startsWith('//')) return
      if (/playerIds\?\.includes\(|function normalizeName\b/.test(line)) copies.push(`${f.slice(root.length)}:${i + 1}`)
    })
  }
  assert.deepEqual(copies, [], 'use src/utils/newsMatch.js')
})
