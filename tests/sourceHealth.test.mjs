// Pins the multi-source alarm (scripts/sourceHealth.mjs).
//
// The behaviour worth pinning is the RESTRAINT as much as the firing: an alarm
// that cries at a one-run blip is an alarm you learn to ignore, which would
// leave the pipelines exactly as silent as they were before it existed.
//
// Context: ESPN RSS was contributing 0 items to the live news feed on
// 2026-09-21 while returning 25 items to anyone who asked from elsewhere, and
// nothing surfaced it. CLAUDE.md records the same shape once before
// (FantasyPros, dead across all three endpoints, "had been contributing
// nothing", found by a hand probe months later).

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DARK_AFTER, assessArchiveSources, trackSourceMisses, darkFeedSources, formatAlarm,
} from '../scripts/sourceHealth.mjs'

const archive = (cov) => ({
  dates: Array.from({ length: Math.max(...Object.values(cov).map(c => c.length)) },
    (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`),
  sources: Object.fromEntries(Object.entries(cov).map(([k, coverage]) => [k, { coverage }])),
})
const find = (a, k) => assessArchiveSources(a).find(f => f.key === k)

// --- the archive (values-consensus.json) ------------------------------------

test('a source read every day never alarms', () => {
  const a = archive({ keeptradecut: [460, 460, 460, 460, 460] })
  assert.equal(find(a, 'keeptradecut').dark, false)
  assert.equal(find(a, 'keeptradecut').misses, 0)
})

test('a source dark for the full window ALARMS', () => {
  const a = archive({ keeptradecut: [460, 460, null, null, null] })
  const f = find(a, 'keeptradecut')
  assert.equal(f.misses, 3)
  assert.equal(f.dark, true)
  assert.equal(f.everSeen, true)   // "it worked, now it doesn't" — a regression
})

test('a ONE-DAY blip does NOT alarm — the restraint is the point', () => {
  // A CDN hiccup must not page anyone, or the alarm stops meaning anything.
  const a = archive({ keeptradecut: [460, 460, null, 460, 460] })
  assert.equal(find(a, 'keeptradecut').dark, false)
})

test('a gap one short of the window does not alarm', () => {
  const a = archive({ keeptradecut: [460, 460, 460, null, null] })
  const f = find(a, 'keeptradecut')
  assert.equal(f.misses, DARK_AFTER.archive - 1)
  assert.equal(f.dark, false)
})

test('recovery clears the count — the run is CONSECUTIVE, not cumulative', () => {
  const a = archive({ keeptradecut: [null, null, null, null, 460] })
  assert.equal(find(a, 'keeptradecut').misses, 0)
  assert.equal(find(a, 'keeptradecut').dark, false)
})

test('a fresh archive never alarms before it has a window of history', () => {
  // Day one has two sources legitimately unread; alarming there would fire on
  // every new archive and teach the reader to ignore it immediately.
  const a = archive({ fantasycalc: [395], dynastyprocess: [null], keeptradecut: [null] })
  assert.deepEqual(assessArchiveSources(a).filter(f => f.dark), [])
})

test('a source that has NEVER been read alarms, and is flagged as never seen', () => {
  const a = archive({ keeptradecut: [null, null, null, null] })
  const f = find(a, 'keeptradecut')
  assert.equal(f.dark, true)
  assert.equal(f.everSeen, false)
})

test('a short coverage array reads as UNREAD, never as read', () => {
  // Defensive alignment: absence of a number is not evidence of a number.
  const a = { dates: ['a', 'b', 'c', 'd'], sources: { keeptradecut: { coverage: [460] } } }
  assert.equal(find(a, 'keeptradecut').misses, 3)
})

test('one dark source never implicates the healthy ones', () => {
  const a = archive({
    fantasycalc: [395, 395, 395, 395],
    dynastyprocess: [485, 485, 485, 485],
    keeptradecut: [null, null, null, null],
  })
  assert.deepEqual(assessArchiveSources(a).filter(f => f.dark).map(f => f.key), ['keeptradecut'])
})

// --- the feed (news.json) ---------------------------------------------------

test('the feed counter increments on 0 and RESETS on any item', () => {
  let m = {}
  for (let i = 0; i < 5; i++) m = trackSourceMisses(m, { 'ESPN RSS': 0, PFF: 25 })
  assert.equal(m['ESPN RSS'], 5)
  assert.equal(m.PFF, 0)
  m = trackSourceMisses(m, { 'ESPN RSS': 12, PFF: 25 })
  assert.equal(m['ESPN RSS'], 0)
})

test('the feed alarms only past its own threshold, which is NOT the archive\'s', () => {
  // news.yml is delivered ~5.5–7.4 runs/day and values-history.yml once, so one
  // shared number would mean two very different amounts of silence.
  assert.ok(DARK_AFTER.feed > DARK_AFTER.archive)
  let m = {}
  for (let i = 0; i < DARK_AFTER.feed - 1; i++) m = trackSourceMisses(m, { 'ESPN RSS': 0 })
  assert.deepEqual(darkFeedSources(m), [])
  m = trackSourceMisses(m, { 'ESPN RSS': 0 })
  assert.deepEqual(darkFeedSources(m), [{ key: 'ESPN RSS', misses: DARK_AFTER.feed }])
})

test('a source absent from this run\'s counts is not silently forgotten', () => {
  // Only sources the run actually reported are carried; a removed source drops
  // out rather than alarming forever.
  const m = trackSourceMisses({ 'Old Source': 99, PFF: 0 }, { PFF: 25 })
  assert.deepEqual(Object.keys(m), ['PFF'])
})

test('no counter yet means no alarm', () => {
  assert.deepEqual(darkFeedSources(undefined), [])
  assert.deepEqual(darkFeedSources({}), [])
})

// --- the message ------------------------------------------------------------

test('a quiet pipeline produces NO message at all', () => {
  assert.equal(formatAlarm({ pipeline: 'x', findings: [], unit: 'day', fixHint: 'h' }), null)
})

test('the message names the source, the duration, and how to fix it', () => {
  const msg = formatAlarm({
    pipeline: 'values-consensus.json',
    findings: [{ key: 'keeptradecut', misses: 4, everSeen: true }],
    unit: 'day',
    fixHint: 'check extractKtcPlayers',
  })
  assert.match(msg, /keeptradecut/)
  assert.match(msg, /4 consecutive days/)
  assert.match(msg, /check extractKtcPlayers/)
  // Removing a genuinely dead source must be stated, or the alarm becomes
  // permanent noise that means something other than what it says.
  assert.match(msg, /remove it/i)
})

test('a never-seen source says so, because it is a different problem', () => {
  const msg = formatAlarm({
    pipeline: 'p', findings: [{ key: 'ktc', misses: 3, everSeen: false }],
    unit: 'day', fixHint: 'h',
  })
  assert.match(msg, /NEVER been read/)
})
