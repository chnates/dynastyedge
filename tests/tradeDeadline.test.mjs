// The trade-deadline arithmetic has ONE home (src/utils/tradeDeadline.js,
// 2026-10-07). The deadline WEEK is the league setting `trade_deadline`; the
// "weeks left" and "soon = within 2 weeks" rules were written out by The
// Edge's briefing item AND the Trade banner, and the MCP league calendar
// (open-items §0 #9) would have been a third copy.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { DEADLINE_SOON_WEEKS, readTradeDeadline, isDeadlineWindow } from '../src/utils/tradeDeadline.js'
import { buildBriefing } from '../src/utils/edgeBriefing.js'

const at = (week, tradeDeadline = 13, isOffseason = false) =>
  readTradeDeadline({ tradeDeadline, nflState: { week }, isOffseason })

test('the shipped window: urgent from 2 weeks out', () => {
  assert.equal(DEADLINE_SOON_WEEKS, 2)
})

test('status at every week of a Week-13 deadline', () => {
  assert.deepEqual(at(5), { week: 13, weeksLeft: 8, status: 'upcoming' })
  assert.equal(at(10).status, 'upcoming')
  assert.equal(at(11).status, 'soon')
  assert.equal(at(12).status, 'soon')
  assert.deepEqual(at(13), { week: 13, weeksLeft: 0, status: 'this-week' })
  assert.deepEqual(at(14), { week: 13, weeksLeft: -1, status: 'passed' })
})

test('nothing to say: offseason, no deadline, no current week', () => {
  assert.equal(at(5, 13, true), null)
  assert.equal(at(5, null), null)
  assert.equal(at(5, 0), null)
  assert.equal(at(null), null)
  assert.equal(readTradeDeadline({ tradeDeadline: 13, nflState: null, isOffseason: false }), null)
})

// Equivalence with the two expressions this replaced, over a grid that covers
// every boundary (before, at and after the window, the deadline week, after).
test('reproduces the old Edge rule and the old banner rule exactly', () => {
  for (let week = 1; week <= 18; week++) {
    const d = at(week)
    const left = 13 - week
    assert.equal(isDeadlineWindow(d), left >= 0 && left <= 2, `edge window, week ${week}`)
    assert.equal(d.status === 'passed', left < 0, `banner passed, week ${week}`)
    assert.equal(d.status !== 'passed' && isDeadlineWindow(d), left >= 0 && left <= 2, `banner urgent, week ${week}`)
  }
})

test("The Edge's deadline item fires in exactly the window", () => {
  const signals = { radar: [] }
  const ids = week => buildBriefing({
    signals, transactions: [], lastVisit: null, draft: null,
    isOffseason: false, nflState: { week }, tradeDeadline: 13,
  }).map(i => i.id)
  assert.ok(!ids(10).includes('deadline'))
  assert.ok(ids(11).includes('deadline'))
  assert.ok(ids(13).includes('deadline'))
  assert.ok(!ids(14).includes('deadline'))
})

// The guard: nothing outside tradeDeadline.js subtracts the week from the
// deadline again.
test('no second copy of the deadline arithmetic in src/ or mcp/', () => {
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
    if (f.endsWith('tradeDeadline.js')) continue
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/trade_?deadline\w*\s*-\s*[\w.?]*week/i.test(line)) copies.push(`${f.slice(root.length)}:${i + 1}`)
    })
  }
  assert.deepEqual(copies, [], 'import readTradeDeadline from src/utils/tradeDeadline.js instead')
})
