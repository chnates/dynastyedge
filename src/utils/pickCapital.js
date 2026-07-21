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

// Exact per-slot pick price. FantasyCalc lists slot picks as "2026 Pick 1.09"
// (literal "Pick", zero-padded 2-digit slot) once a draft season's order is
// known. Falls back to the round median (findPickValue) when the slot is
// unknown or FantasyCalc carries no slot entry for it (e.g. future seasons,
// whose order isn't set — only round-level "2027 1st" exists).
export function findExactSlotValue({ season, round, slot }, pickEntries) {
  if (slot != null) {
    const name = `${season} Pick ${round}.${String(slot).padStart(2, '0')}`
    const entry = pickEntries.find(e => e.name === name)
    if (entry) return entry.value
  }
  return findPickValue({ season, round }, pickEntries)
}

// A pick's draft slot within its round, honoring snake vs. linear order.
// `position` is the original owner's first-round draft position (1..teams).
export function slotForRound(position, round, type, teams) {
  if (position == null) return null
  return type === 'snake' && round % 2 === 0 ? teams + 1 - position : position
}

// Map each roster to its first-round draft position for a rookie draft.
// Prefers `slot_to_roster_id` (authoritative once Sleeper builds the board);
// falls back to `draft_order` (user_id → position, set in `pre_draft`) resolved
// through each roster's owner_id — so exact slots are known a month before the
// draft. Returns null when neither is available.
export function buildDraftSlots(draft, rosters) {
  if (!draft) return null

  const slotToRoster = draft.slot_to_roster_id
  if (slotToRoster && Object.keys(slotToRoster).length) {
    const byRoster = {}
    Object.entries(slotToRoster).forEach(([slot, rid]) => {
      byRoster[rid] = Number(slot)
    })
    return byRoster
  }

  const order = draft.draft_order // user_id → position
  if (order && rosters?.length) {
    const ownerToRoster = {}
    rosters.forEach(r => { ownerToRoster[r.owner_id] = r.roster_id })
    const byRoster = {}
    Object.entries(order).forEach(([userId, position]) => {
      const rid = ownerToRoster[userId]
      if (rid != null) byRoster[rid] = Number(position)
    })
    return Object.keys(byRoster).length ? byRoster : null
  }

  return null
}

const PICK_YEAR_WEIGHTS = { '2026': 3, '2027': 2, '2028': 1 }

export function computePickCapitalScore(picks, pickEntries) {
  return picks.reduce((total, pick) => {
    const weight = PICK_YEAR_WEIGHTS[pick.season] ?? 0
    return total + weight * findPickValue(pick, pickEntries)
  }, 0)
}
