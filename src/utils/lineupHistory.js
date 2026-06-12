import { ROSTER_SLOTS } from '../constants'

// Best-possible points from a week's roster given actual scored points.
// Fills single-position slots first, then flexes (fewest eligible positions
// first), always taking the highest remaining score — optimal for this
// nested-eligibility slot structure (FLEX ⊂ SFLX).
export function computeOptimalPoints(playerIds, pointsMap, getPosition) {
  const byPos = {}
  ;(playerIds ?? []).forEach(id => {
    const pos = getPosition(id)
    if (!pos) return
    if (!byPos[pos]) byPos[pos] = []
    byPos[pos].push(pointsMap?.[id] ?? 0)
  })
  Object.values(byPos).forEach(arr => arr.sort((a, b) => b - a))

  const slots = [...ROSTER_SLOTS].sort((a, b) => a.eligible.length - b.eligible.length)

  let total = 0
  slots.forEach(slot => {
    let bestPos = null
    slot.eligible.forEach(pos => {
      if (byPos[pos]?.length && (bestPos === null || byPos[pos][0] > byPos[bestPos][0])) {
        bestPos = pos
      }
    })
    if (bestPos) total += byPos[bestPos].shift()
  })
  return total
}
