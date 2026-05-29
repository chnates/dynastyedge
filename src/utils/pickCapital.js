const ROUNDS = 4
const YEARS = ['2026', '2027', '2028']

export function resolvePickOwnership(tradedPicks, rosters, years = YEARS) {
  // Initialize: each team owns all their own picks for each year/round
  // Key: "season-round-originalRosterId" → currentOwnerId
  const ownership = {}

  rosters.forEach(r => {
    years.forEach(year => {
      for (let round = 1; round <= ROUNDS; round++) {
        ownership[`${year}-${round}-${r.roster_id}`] = r.roster_id
      }
    })
  })

  // Apply traded picks — Sleeper returns current state (one entry per pick)
  tradedPicks.forEach(tp => {
    if (!years.includes(tp.season)) return
    ownership[`${tp.season}-${tp.round}-${tp.roster_id}`] = tp.owner_id
  })

  // Build result: roster_id → picks they currently own
  const result = {}
  rosters.forEach(r => { result[r.roster_id] = [] })

  Object.entries(ownership).forEach(([key, currentOwner]) => {
    const [season, roundStr, originalOwnerStr] = key.split('-')
    const entry = {
      season,
      round: parseInt(roundStr, 10),
      originalOwner: parseInt(originalOwnerStr, 10),
      currentOwner,
    }
    if (!result[currentOwner]) result[currentOwner] = []
    result[currentOwner].push(entry)
  })

  // Sort each team's picks by season then round
  Object.values(result).forEach(picks =>
    picks.sort((a, b) =>
      a.season !== b.season
        ? a.season.localeCompare(b.season)
        : a.round - b.round
    )
  )

  return result
}

const ROUND_SUFFIX = ['', '1st', '2nd', '3rd', '4th', '5th']

export function findPickValue(pick, pickEntries) {
  const suffix = ROUND_SUFFIX[pick.round]
  if (!suffix) return 0

  const matches = pickEntries.filter(
    e => e.name.includes(pick.season) && e.name.includes(suffix)
  )
  if (!matches.length) return 0

  matches.sort((a, b) => a.value - b.value)
  return matches[Math.floor(matches.length / 2)]?.value ?? 0
}
