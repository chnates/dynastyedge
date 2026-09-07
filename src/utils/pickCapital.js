const ROUNDS = 4

// `years` is the live pick window (see utils/seasonWindow.js) — never a
// hardcoded season list. A default here would silently outlive its draft:
// once a season's rookie draft completes, FantasyCalc retires that season's
// pick entries, so every pick this function invents for it prices at 0.
export function resolvePickOwnership(tradedPicks, rosters, years) {
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

// ── Resolving a spent pick ───────────────────────────────────────────────────

// The moment a rookie draft completes, FantasyCalc RETIRES that season's pick
// entries (verified live 2026-09-07, three days after this league's 2026 draft:
// all 24 of its pick entries were 2027/2028/2029). So `findPickValue` returns 0
// for a pick that has already been used, and every surface showing a completed
// trade would price a real asset at nothing.
//
// There are two honest answers, in order of preference, and these two helpers
// are the one implementation of each — shared by the manager scouting ledger
// (utils/managerAnalysis.js) and League › Activity so the same traded pick can
// never read differently on two screens.

// 1. THE BEST ANSWER: what the pick actually became.
// "season-round-originalRosterId" → the player drafted at that slot. Built
// straight from the draft's pick list, so it needs no declared round count.
// The slot → roster map comes from `buildDraftSlots` (slot_to_roster_id when
// Sleeper has built the board, else draft_order joined through owner ids) —
// which matters, because `/league/{id}/drafts` NEVER carries
// slot_to_roster_id, so the fallback is the live path for a listed draft.
//
// Keys are stringified throughout: a Sleeper traded_pick's `roster_id` arrives
// as a number and reaches this index through a template literal, so the roster
// segment must be a string on both sides (Rules #8).
export function buildDraftPickIndex(draft, picks, rosters) {
  const idx = {}
  if (!draft || !picks?.length) return idx

  const byRoster = buildDraftSlots(draft, rosters)
  if (!byRoster || !Object.keys(byRoster).length) return idx

  const slotToRoster = {}
  Object.entries(byRoster).forEach(([rid, slot]) => { slotToRoster[slot] = String(rid) })

  picks.forEach(p => {
    if (!p?.player_id || p.draft_slot == null || p.round == null) return
    const originalRoster = slotToRoster[p.draft_slot]
    if (originalRoster == null) return
    idx[`${draft.season}-${p.round}-${originalRoster}`] = {
      playerId: String(p.player_id),
      overall: p.pick_no,
      slotLabel: `${p.round}.${String(p.draft_slot).padStart(2, '0')}`,
    }
  })
  return idx
}

// 2. THE FALLBACK: median value per round across every pick FantasyCalc
// currently lists, season-agnostic. "A 2nd is a 2nd" is a far better estimate
// than 0 for a pick whose draft has passed and whose player can't be resolved.
// Surfaces mark it approximate (≈) rather than passing it off as a market price.
export function buildGenericRoundValues(pickEntries) {
  const byRound = {}
  for (let round = 1; round < ROUND_SUFFIX.length; round++) {
    const suffix = ROUND_SUFFIX[round]
    const matches = (pickEntries ?? [])
      .filter(e => e.name.includes(suffix))
      .sort((a, b) => a.value - b.value)
    byRound[round] = matches.length
      ? matches[Math.floor(matches.length / 2)].value
      : 0
  }
  return byRound
}

// Feature 2's pick-capital weighting: the nearest draft counts 3x, the next
// 2x, the one after 1x. Keyed by DISTANCE from the upcoming draft, never by
// literal year — a `{ '2026': 3, ... }` map silently weights the newly
// surfaced third season at 0 the first time the window rolls forward.
const PICK_YEAR_WEIGHTS = [3, 2, 1]

export function computePickCapitalScore(picks, pickEntries, years) {
  const window = years ?? []
  return picks.reduce((total, pick) => {
    const weight = PICK_YEAR_WEIGHTS[window.indexOf(pick.season)] ?? 0
    return total + weight * findPickValue(pick, pickEntries)
  }, 0)
}
