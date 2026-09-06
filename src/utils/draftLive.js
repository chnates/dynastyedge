// The rookie draft's LIVE path, as pure functions.
//
// This logic used to live inline in DraftTracker's useMemos, where nothing
// could reach it: the test suite covers pure utils only (no component or hook
// rendering), so the Tracker's one live moment per year — the on-the-clock
// banner, "N picks until yours", Best Available, the completion recap — had
// never been executed by anything but a real draft. Extracted here so
// tests/draftLive.test.mjs can walk a real past draft pick by pick.
//
// Everything below is a pure function of already-fetched data. Nothing fetches.

import { DRAFT_HIT_VALUE } from './managerAnalysis'

// Where the draft stands right now, given the resolved order and the picks
// made so far. `order` comes from buildDraftOrder (useSleeperDraft) and is
// null when Sleeper knows no slot assignment yet.
export function deriveDraftState({ draft, order, picks = [], myRosterId, fallbackRounds = 4, fallbackTeams = 10 }) {
  const orderKnown = order != null
  const teams = draft?.settings?.teams ?? fallbackTeams
  const totalPicks = order?.length ?? (draft?.settings?.rounds ?? fallbackRounds) * teams

  const sortedPicks = [...picks].sort((a, b) => a.pick_no - b.pick_no)
  const draftedIds = new Set(sortedPicks.map(p => String(p.player_id)))
  const made = sortedPicks.length

  // Sleeper flips `status` to 'complete' itself, but a board that has taken
  // every pick is complete whether or not that flag has landed yet.
  const isComplete = draft?.status === 'complete' || (totalPicks > 0 && made >= totalPicks)
  const isLive = draft?.status === 'drafting' || draft?.status === 'paused'

  // The next pick is simply the order slot after the ones already used.
  const nextPick = !isComplete && orderKnown ? order[made] ?? null : null
  const isOnClock = isLive && nextPick?.rosterId === myRosterId

  const myUpcoming = orderKnown
    ? order.slice(made).filter(p => p.rosterId === myRosterId)
    : []
  // How many OTHER teams pick before me. 0 = I'm on the clock next.
  const picksUntilMine = myUpcoming.length > 0 ? myUpcoming[0].overall - made - 1 : null

  return {
    orderKnown, teams, totalPicks, sortedPicks, draftedIds,
    picksMade: made, isComplete, isLive, nextPick, isOnClock,
    myUpcoming, picksUntilMine,
  }
}

// Best Available, shown only while I'm on the clock: the top undrafted
// prospect overall, then the top one at each position I'm below league
// average in. Ranked by My Board when the user has one, else derived rookie ADP.
export function buildBestAvailable({ isOnClock, prospects = [], draftedIds, boardRankMap, needPositions = [] }) {
  if (!isOnClock) return []
  const drafted = draftedIds ?? new Set()
  const avail = prospects.filter(p => !drafted.has(p.sleeperId))
  const rankOf = boardRankMap
    ? p => boardRankMap[p.sleeperId] ?? 9999
    : p => p.adp ?? 9999
  const sorted = [...avail].sort((a, b) => rankOf(a) - rankOf(b))

  const rows = []
  if (sorted[0]) rows.push({ tag: 'Best overall', player: sorted[0] })
  needPositions.forEach(pos => {
    const top = sorted.find(p =>
      p.position === pos && !rows.some(r => r.player.sleeperId === p.sleeperId)
    )
    if (top) rows.push({ tag: `Top ${pos} · need`, player: top })
  })
  return rows
}

// My pick capital for this draft: order-driven (real slots) when the order is
// known, else the roster's round-level picks. `used` marks picks already spent.
export function buildMyCapital({ order, orderKnown, leaguePicks = [], picksMade = 0, myRosterId }) {
  if (orderKnown && order) {
    return order
      .filter(p => p.rosterId === myRosterId)
      .map(p => ({
        key: p.label,
        label: p.label,
        used: p.overall <= picksMade,
        value: leaguePicks.find(lp =>
          lp.round === p.round && lp.originalOwner === p.originalRosterId
        )?.value ?? 0,
      }))
  }
  return leaguePicks.map(p => ({
    key: `${p.round}-${p.originalOwner}`,
    label: `Rd ${p.round}`,
    used: false,
    value: p.value ?? 0,
  }))
}

// A team's value-over-expected inside this band is noise rather than a grade:
// on the 0-10000 dynasty scale a hundred points is smaller than a single
// FantasyCalc tick on one mid-round rookie.
export const VOE_NEUTRAL = 100

// Post-draft recap: per-team draft grades, plus the biggest steals and
// reaches measured as pick slot vs the player's derived rookie ADP.
// delta > 0 = fell past his ADP (a steal); delta < 0 = taken early (a reach).
//
// RAW VALUE DRAFTED IS NOT A STANDING. A team holding 8 picks out-drafts a
// team holding 3 by picking more often, so the old total ranked volume and
// called it skill. The grade is VALUE OVER EXPECTED: value drafted minus what
// that team's pick SLOTS were owed.
//
// The expected curve comes from the class itself — sort every drafted player
// by value descending, and the k-th best value becomes the expected return of
// the k-th pick of the board. Three properties nothing external has:
//
//   1. Sum(expected) == Sum(actual) by construction, so VOE sums to EXACTLY
//      zero league-wide. It is purely "who beat the field with the slots they
//      held", and pick count cancels out.
//   2. It needs no FantasyCalc pick entries, which do not survive the draft.
//      Verified against the live feed 2026-09-06: all 24 pick entries on the
//      board covered 2027-2029 — a season's picks are retired the moment its
//      draft completes, so a recap opened the day after would have had nothing
//      to price slots against.
//   3. No level bias. Pricing slots off a LATER season's picks (the only ones
//      that exist post-draft) prices them a year further out, i.e. cheap, which
//      re-introduces the exact "more picks = better draft" artifact this fixes.
//
// Secondary columns are deliberately weaker measures kept alongside, not
// instead of, the grade: value per pick (biased toward whoever picked least)
// and hit count (immune to one stud inflating a total).
export function buildRecap({ isComplete, sortedPicks = [], resolvePick, adpById = {} }) {
  if (!isComplete) return null
  const totals = {}
  const entries = sortedPicks.map(pick => {
    const player = resolvePick(pick)
    const adp = adpById[String(pick.player_id)] ?? null
    const delta = adp != null ? pick.pick_no - adp : null
    const value = player.value ?? 0
    if (!totals[pick.roster_id]) {
      totals[pick.roster_id] = { rosterId: pick.roster_id, total: 0, count: 0, hits: 0, expected: 0 }
    }
    const team = totals[pick.roster_id]
    team.total += value
    team.count += 1
    if (value >= DRAFT_HIT_VALUE) team.hits += 1
    return { pick, player, delta }
  })

  // Pair the i-th pick of the BOARD with the i-th best value in the class.
  // Indexed through pick_no rather than array position so the pairing holds
  // even if a caller hands us picks out of order.
  const curve = entries.map(e => e.player.value ?? 0).sort((a, b) => b - a)
  entries
    .map((e, i) => i)
    .sort((a, b) => entries[a].pick.pick_no - entries[b].pick.pick_no)
    .forEach((entryIdx, boardIdx) => {
      totals[entries[entryIdx].pick.roster_id].expected += curve[boardIdx]
    })

  // With no priced player anywhere, every expectation is 0 and a "+0" grade
  // would be fabricated confidence. Report no grade instead (rule 7).
  const graded = curve.some(v => v > 0)
  const teamTotals = Object.values(totals).map(t => ({
    ...t,
    expected: graded ? t.expected : null,
    voe: graded ? t.total - t.expected : null,
    perPick: t.count > 0 ? t.total / t.count : 0,
  }))
  teamTotals.sort((a, b) => (graded ? b.voe - a.voe : b.total - a.total))

  const withDelta = entries.filter(e => e.delta != null)
  return {
    entries,
    graded,
    teamTotals,
    steals: [...withDelta].sort((a, b) => b.delta - a.delta).filter(e => e.delta >= 2).slice(0, 3),
    reaches: [...withDelta].sort((a, b) => a.delta - b.delta).filter(e => e.delta <= -2).slice(0, 3),
  }
}
