// leagueState.js — THE join. Five raw sources in, the object every analysis
// function in this app eats out.
//
// This lived as a useMemo inside src/hooks/useLeague.js, which meant the one
// shape `analyzeTrade`, `computeEdgeSignals`, `assignWinWindowTiers`,
// `buildRosterTrajectory` and every other util expects could only be produced
// by rendering React. Lifting it here makes it callable from plain Node — the
// test suite, the offline model harness, and the MCP server — and gives it
// tests, which it never had. `useLeague` now calls this inside its memo and
// does nothing else.
//
// Three contracts in here are load-bearing. Each has a test pinning it:
//
//  1. sleeperIds are ALWAYS String(). Sleeper returns them as strings or
//     numbers depending on endpoint; FantasyCalc's playerMap is string-keyed.
//     A numeric-keyed lookup silently misses and the player vanishes.
//  2. A rostered player FantasyCalc does not rank is KEPT — identity from the
//     player DB, value 0, `unranked: true`, rendered as `—` (CLAUDE.md rule 7).
//     He is skipped only when neither source knows him, which self-heals when
//     the player DB lands.
//  3. Picks in the upcoming rookie draft resolve to their exact slot and take
//     FantasyCalc's slot-level price; every other season falls back to the
//     round median. A pick sits at its ORIGINAL owner's slot, not its current
//     owner's.

import {
  resolvePickOwnership,
  findExactSlotValue,
  buildDraftSlots,
  slotForRound,
  computePickCapitalScore,
} from './pickCapital'
import { resolvePickYears } from './seasonWindow'
import { PICK_YEARS } from '../constants'

// Sleeper's empty-starter-slot sentinel.
const EMPTY_SLOT = '0'

function toIdSet(ids) {
  return new Set((ids ?? []).map(id => String(id)).filter(id => id && id !== EMPTY_SLOT))
}

// Build the league object from raw source payloads.
//
//   sleeperData  { leagueInfo, rosters, users, tradedPicks, drafts }
//   fcValues     { playerMap, pickEntries } — the cached FantasyCalc split
//   playerDB     trimmed /players/nfl map, for players FantasyCalc doesn't rank
//   myRosterId   the signed-in roster (runtime identity, never a constant)
//   leagueId     provenance only — echoed back so a caller holding several
//                leagues can tell which state it is looking at
//   pickYears    optional; derived from sleeperData when omitted. useLeague
//                passes its own memoized array so the reference stays stable.
//
// Returns null when either core source is missing — same gate the hook had.
export function buildLeagueState({
  sleeperData, fcValues, playerDB, myRosterId, leagueId, pickYears,
} = {}) {
  if (!sleeperData || !fcValues) return null

  const { leagueInfo, rosters, users, tradedPicks, drafts } = sleeperData
  const { playerMap, pickEntries } = fcValues

  const years = pickYears ?? resolvePickYears(sleeperData.nflState, drafts, PICK_YEARS)

  // The upcoming rookie draft (years[0]). Its order — in practice always from
  // draft_order, since the `/league/{id}/drafts` list endpoint never returns
  // slot_to_roster_id (only `/draft/{draft_id}` does) — lets us resolve each of
  // that season's picks to its exact slot (1.09) and price it at FantasyCalc's
  // slot-level value instead of the round median. Once that draft is held there
  // is no match here, so its successor's picks correctly fall back to round
  // medians until Sleeper sets its order.
  const draftSeason = years[0]
  const rookieDraft = (drafts ?? []).find(
    d => String(d.season) === draftSeason && d.type !== 'auction'
  ) ?? null
  const draftSlots = buildDraftSlots(rookieDraft, rosters)
  const draftType = rookieDraft?.type ?? 'linear'
  const draftTeams = rookieDraft?.settings?.teams ?? rosters.length

  // user_id → user
  const userById = {}
  users.forEach(u => { userById[u.user_id] = u })

  // roster_id → user
  const userMap = {}
  rosters.forEach(r => { userMap[r.roster_id] = userById[r.owner_id] ?? null })

  const picksByRoster = resolvePickOwnership(tradedPicks, rosters, years)

  const waiverBudget = leagueInfo?.settings?.waiver_budget ?? 100

  function resolveRoster(roster) {
    // Sleeper IDs arrive as strings or numbers depending on endpoint —
    // normalize everything to strings once so set lookups can't miss.
    const starterSet = toIdSet(roster.starters)
    const reserveSet = toIdSet(roster.reserve)
    const taxiSet = toIdSet(roster.taxi)

    const seenIds = new Set()
    const allPlayers = (roster.players ?? []).flatMap(pid => {
      const id = String(pid)
      if (seenIds.has(id)) return []
      seenIds.add(id)

      const fc = playerMap[id]
      const meta = playerDB?.[id]
      // Unranked by FantasyCalc: resolve identity from the Sleeper player DB
      // and show with no market value. Skip only if neither source knows the
      // player (or the DB hasn't loaded yet).
      if (!fc && !(meta?.position)) return []

      const base = fc ?? {
        name: meta.name ?? id,
        position: meta.position,
        team: meta.team,
        age: meta.age,
        value: 0,
        overallRank: null,
        positionRank: null,
        trend30Day: 0,
      }

      return [{
        sleeperId: id,
        name: base.name,
        position: base.position,
        team: base.team,
        age: base.age,
        value: base.value,
        overallRank: base.overallRank,
        positionRank: base.positionRank,
        trend30Day: base.trend30Day,
        unranked: !fc,
        isStarter: starterSet.has(id),
        isTaxi: taxiSet.has(id),
        isIR: reserveSet.has(id),
      }]
    })

    const ownedPicks = (picksByRoster[roster.roster_id] ?? []).map(pk => {
      // A pick sits at its ORIGINAL owner's draft slot. Only the current
      // rookie-draft season has a known order + FantasyCalc slot entries;
      // future seasons fall through to the round median (slot stays null).
      const slot = pk.season === draftSeason
        ? slotForRound(draftSlots?.[pk.originalOwner], pk.round, draftType, draftTeams)
        : null
      return {
        ...pk,
        slot,
        slotLabel: slot != null ? `${pk.round}.${String(slot).padStart(2, '0')}` : null,
        value: findExactSlotValue({ season: pk.season, round: pk.round, slot }, pickEntries),
      }
    })
    const playerValue = allPlayers.reduce((s, p) => s + p.value, 0)
    const pickValue = ownedPicks.reduce((s, pk) => s + pk.value, 0)
    const pickCapitalScore = computePickCapitalScore(ownedPicks, pickEntries, years)

    const startersWithAge = allPlayers.filter(
      p => p.isStarter && !p.isIR && !p.isTaxi && p.age != null && !p.unranked
    )
    const avgStarterAge = startersWithAge.length > 0
      ? startersWithAge.reduce((s, p) => s + p.age, 0) / startersWithAge.length
      : null

    const starterOrder = (roster.starters ?? []).map(id => String(id))

    const settings = roster.settings ?? {}
    const wins = settings.wins ?? 0
    const losses = settings.losses ?? 0
    const ties = settings.ties ?? 0

    return {
      rosterId: roster.roster_id,
      owner: userMap[roster.roster_id],
      players: allPlayers,
      picks: ownedPicks,
      totalValue: playerValue + pickValue,
      faabBudget: waiverBudget,
      faabRemaining: waiverBudget - (settings.waiver_budget_used ?? 0),
      faabSpent: settings.waiver_budget_used ?? 0,
      record: { wins, losses, ties },
      hasRecord: wins + losses + ties > 0,
      pointsFor: (settings.fpts ?? 0) + (settings.fpts_decimal ?? 0) / 100,
      pointsAgainst: (settings.fpts_against ?? 0) + (settings.fpts_against_decimal ?? 0) / 100,
      pickCapitalScore,
      avgStarterAge,
      starterOrder,
    }
  }

  const allRosters = rosters.map(resolveRoster)
  const myRoster = myRosterId != null
    ? allRosters.find(r => r.rosterId === myRosterId) ?? null
    : null

  return {
    allRosters,
    myRoster,
    userMap,
    leagueInfo,
    pickYears: years,
    leagueId: leagueId ?? leagueInfo?.league_id ?? null,
  }
}
