import { selectOptimalStarters } from './lineupBuild'

// Best-possible points from a week's roster given actual scored points.
// Delegates to the shared metric-agnostic slot-fill (lineupBuild.js) — here the
// metric is weekly points; the Trade Analyzer feeds it dynasty value instead.
export function computeOptimalPoints(playerIds, pointsMap, getPosition) {
  const items = (playerIds ?? [])
    .map(id => ({ key: id, position: getPosition(id), metric: pointsMap?.[id] ?? 0 }))
    .filter(it => it.position)
  return selectOptimalStarters(items).total
}
