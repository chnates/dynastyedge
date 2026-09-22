// Pins the news feed's depth metric (scripts/newsCoverage.mjs). The case that
// produced it: raising the player cap let three week-old items in, and
// spanHours (max − min) jumped 54h → 147h while the window's real depth held.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { windowDepthHours } from '../scripts/newsCoverage.mjs'

const NOW = Date.parse('2026-09-22T23:00:00Z')
const at = (hoursAgo, isPlayerNews = true) => ({
  isPlayerNews, published: new Date(NOW - hoursAgo * 36e5).toISOString(),
})

test('a few stragglers cannot set the depth (the 54h → 147h case)', () => {
  const window = Array.from({ length: 97 }, (_, i) => at((i / 96) * 54))
  const items = [...window, at(147), at(146), at(145)]
  const spanHours = 147
  assert.ok(windowDepthHours(items) <= 54, 'depth stays with the window, not the stragglers')
  assert.ok(windowDepthHours(items) < spanHours / 2)
})

test('a genuinely deep window reads deep', () => {
  const items = Array.from({ length: 200 }, (_, i) => at((i / 199) * 168))
  assert.ok(windowDepthHours(items) >= 150)
})

test('only player items count — general items age out on their own clock', () => {
  const items = [at(0), at(10), at(20), at(100, false), at(120, false)]
  assert.equal(windowDepthHours(items), 20)
})

test('measured from the NEWEST player item, not the wall clock', () => {
  const items = [at(30), at(40), at(50)]
  assert.equal(windowDepthHours(items), 20)
})

test('no dated player items is 0, never NaN', () => {
  assert.equal(windowDepthHours([]), 0)
  assert.equal(windowDepthHours([{ isPlayerNews: true, published: 'nope' }]), 0)
  assert.equal(windowDepthHours(undefined), 0)
})
