// The value-history series rule, lifted out of useValueHistory's hook
// (2026-09-25) so the MCP server's get_value_history draws by the phone's rule.
// CLAUDE.md "Value history pipeline": fewer than MIN_SPARKLINE_POINTS points is
// no series at all — a 2-point "graph" reads as broken.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MIN_SPARKLINE_POINTS, getValueSeries, getDatedValueSeries, valueHistoryCoverage,
  sliceValueHistory, summarizeValueSeries,
} from '../src/utils/valueHistory.js'

const H = {
  updatedAt: '2026-09-24T09:41:00Z',
  dates: ['2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23'],
  players: {
    1: [1000, 1100, null, 1300, 1200, 1500],
    2: [null, null, null, 500, 510, 520],
    3: [0, 0, 100, 200, 300, 400],
  },
}

test('the threshold is the app\'s: under MIN_SPARKLINE_POINTS there is no series, never a short line', () => {
  assert.equal(MIN_SPARKLINE_POINTS, 4)
  assert.deepEqual(getValueSeries(H, '1'), [1000, 1100, 1300, 1200, 1500], 'missing days skipped, not filled')
  assert.equal(getValueSeries(H, '2'), null, '3 points is not enough')
  assert.equal(getValueSeries(H, 1)?.length, 5, 'a numeric id is normalised to a string')
  assert.equal(getValueSeries(H, 'nope'), null)
  assert.equal(getValueSeries(null, '1'), null)
})

test('the dated series carries exactly the same values, plus each point\'s date', () => {
  for (const id of ['1', '2', '3', 'nope']) {
    assert.deepEqual(getDatedValueSeries(H, id)?.map(p => p.value) ?? null, getValueSeries(H, id))
  }
  assert.deepEqual(getDatedValueSeries(H, '1')[2], { date: '2026-09-21', value: 1300 }, 'the skipped day keeps its neighbour\'s date honest')
})

test('coverage separates "tracked, too few points" from "not tracked at all"', () => {
  assert.deepEqual(valueHistoryCoverage(H, '2'), { tracked: true, points: 3 })
  assert.deepEqual(valueHistoryCoverage(H, '99'), { tracked: false, points: 0 })
})

test('slicing keeps the trailing N columns in the same shape, and never widens', () => {
  const s = sliceValueHistory(H, 4)
  assert.deepEqual(s.dates, H.dates.slice(-4))
  assert.deepEqual(s.players['1'], [null, 1300, 1200, 1500])
  assert.equal(getValueSeries(s, '1'), null, 'the threshold applies inside the window')
  assert.equal(sliceValueHistory(H, 90), H)
  assert.equal(sliceValueHistory(H, Infinity), H)
})

test('the summary is first→last with high and low; a zero start has no percentage', () => {
  const s = summarizeValueSeries(getDatedValueSeries(H, '1'))
  assert.equal(s.change, 500)
  assert.equal(s.changePct, 50)
  assert.deepEqual(s.high, { date: '2026-09-23', value: 1500 })
  assert.deepEqual(s.low, { date: '2026-09-18', value: 1000 })
  assert.equal(summarizeValueSeries(getDatedValueSeries(H, '3')).changePct, null, 'never divides by zero')
  assert.equal(summarizeValueSeries(null), null)
  assert.equal(summarizeValueSeries([{ date: 'a', value: 1 }]), null, 'no summary under the threshold')
})
