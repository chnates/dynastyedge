// valueHistory.js — pure constants for the daily value-snapshot feed.
//
// Lives in utils, not hooks, for the same reason as teamName.js: importing
// this threshold from `../hooks/useValueHistory` pulled React into
// `edgeBriefing.js`'s graph, which is the analysis layer the MCP server and
// the offline model harness import under plain Node.
//
// `useValueHistory.js` re-exports it, so nothing else changed.

// Minimum snapshots before a sparkline is worth drawing. With fewer, the
// "graph" is just a straight segment (the pipeline adds one point per day
// from the day it shipped) — hide it until it has real shape. Shared by
// `getSeries` and by `buildTeamValueSeries` on The Edge, so the per-player
// line and the team line appear on the same day.
export const MIN_SPARKLINE_POINTS = 4

// ── The per-player series rule ──────────────────────────────────────────────
//
// `getValueSeries` is the body of useValueHistory's `getSeries`, lifted out of
// the hook (2026-09-25) so the MCP server's value-history tool answers by the
// same rule the phone's sparklines draw by. The hook now calls it; equivalence
// to the pre-extraction closure was proved on the live feed (every tracked
// player, absent ids, numeric ids, no history), not inspected.
//
// Series for one player, nulls (missing days) removed. Null until
// MIN_SPARKLINE_POINTS snapshots exist — with fewer, the "graph" is a straight
// segment that reads as broken, not as a flat market.
export function getValueSeries(history, sleeperId) {
  const raw = history?.players?.[String(sleeperId)]
  if (!raw) return null
  const points = raw.filter(v => v != null)
  return points.length >= MIN_SPARKLINE_POINTS ? points : null
}

// The same series with each point's date. Same filter and same threshold, so
// `getDatedValueSeries(h, id)?.map(p => p.value)` equals `getValueSeries(h, id)`
// by construction (pinned by test) — the dates are the only addition.
export function getDatedValueSeries(history, sleeperId) {
  const raw = history?.players?.[String(sleeperId)]
  if (!raw || !Array.isArray(history?.dates)) return null
  const points = []
  raw.forEach((v, i) => { if (v != null) points.push({ date: history.dates[i] ?? null, value: v }) })
  return points.length >= MIN_SPARKLINE_POINTS ? points : null
}

// "Tracked with too few points" and "not tracked at all" are different
// answers: the first will draw in a few days, the second means the player sits
// outside the feed's top-500 window (or the feed has never seen him).
export function valueHistoryCoverage(history, sleeperId) {
  const raw = history?.players?.[String(sleeperId)]
  if (!Array.isArray(raw)) return { tracked: false, points: 0 }
  return { tracked: true, points: raw.filter(v => v != null).length }
}

// The trailing `days` columns of a history file, same shape. A window of N
// dates is N snapshots, which are N calendar days only when no day was missed;
// the dates themselves are the truth, and a consumer should quote them.
export function sliceValueHistory(history, days) {
  if (!history?.dates || !Number.isFinite(days) || days >= history.dates.length) return history
  const from = Math.max(0, history.dates.length - Math.max(1, Math.floor(days)))
  const players = {}
  Object.entries(history.players ?? {}).forEach(([id, row]) => {
    if (Array.isArray(row)) players[id] = row.slice(from)
  })
  return { ...history, dates: history.dates.slice(from), players }
}

// First → last, high, low over a dated series. Null for anything under the
// sparkline threshold, for the same reason getValueSeries is: a two-point
// "change" is a claim the data cannot support yet. `changePct` is null when
// the series starts at 0 rather than dividing by it.
export function summarizeValueSeries(points) {
  if (!Array.isArray(points) || points.length < MIN_SPARKLINE_POINTS) return null
  const first = points[0]
  const last = points[points.length - 1]
  let high = first
  let low = first
  points.forEach(p => {
    if (p.value > high.value) high = p
    if (p.value < low.value) low = p
  })
  const change = last.value - first.value
  return {
    first, last, high, low,
    change,
    changePct: first.value ? Math.round((change / first.value) * 1000) / 10 : null,
    points: points.length,
  }
}
