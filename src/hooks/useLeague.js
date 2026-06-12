import { useMemo } from 'react'
import { useSleeper } from './useSleeper'
import { useFantasyCalc } from './useFantasyCalc'
import { usePlayerDB } from './usePlayerDB'
import { resolvePickOwnership, findPickValue, computePickCapitalScore } from '../utils/pickCapital'
import { MY_ROSTER_ID, PICK_YEARS } from '../constants'

export function useLeague() {
  const { data: sleeperData, loading: sleeperLoading, error: sleeperError, retry: sleeperRetry, fetchedAt: sleeperFetchedAt } = useSleeper()
  const { values: fcValues, loading: fcLoading, error: fcError, retry: fcRetry, fetchedAt: fcFetchedAt } = useFantasyCalc()
  // Player DB resolves names for rostered players FantasyCalc doesn't rank
  // (deep stashes, some rookies, DEFs). It loads in the background — league
  // data renders without it, and unranked players appear once it arrives.
  const { playerDB } = usePlayerDB()

  const loading = sleeperLoading || fcLoading
  const error = sleeperError || fcError

  const league = useMemo(() => {
    if (!sleeperData || !fcValues) return null

    const { leagueInfo, rosters, users, tradedPicks } = sleeperData
    const { playerMap, pickEntries } = fcValues

    // Build user lookup: user_id → user
    const userById = {}
    users.forEach(u => { userById[u.user_id] = u })

    // Build roster → user map
    const userMap = {}
    rosters.forEach(r => {
      userMap[r.roster_id] = userById[r.owner_id] ?? null
    })

    // Resolve pick ownership
    const picksByRoster = resolvePickOwnership(tradedPicks, rosters, PICK_YEARS)

    const waiverBudget = leagueInfo?.settings?.waiver_budget ?? 100

    function resolveRoster(roster) {
      // Sleeper IDs arrive as strings or numbers depending on endpoint —
      // normalize everything to strings once so set lookups can't miss.
      const toIdSet = ids => new Set(
        (ids ?? []).map(id => String(id)).filter(id => id && id !== '0')
      )
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
        // Unranked by FantasyCalc: resolve identity from the Sleeper player
        // DB and show with no market value. Skip only if neither source
        // knows the player (or the DB hasn't loaded yet).
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

      const ownedPicks = (picksByRoster[roster.roster_id] ?? []).map(pk => ({
        ...pk,
        value: findPickValue(pk, pickEntries),
      }))
      const playerValue = allPlayers.reduce((s, p) => s + p.value, 0)
      const pickValue = ownedPicks.reduce((s, pk) => s + pk.value, 0)
      const pickCapitalScore = computePickCapitalScore(ownedPicks, pickEntries)

      const startersWithAge = allPlayers.filter(p => p.isStarter && !p.isIR && !p.isTaxi && p.age != null && !p.unranked)
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
    const myRoster = allRosters.find(r => r.rosterId === MY_ROSTER_ID) ?? null

    return { allRosters, myRoster, userMap, leagueInfo }
  }, [sleeperData, fcValues, playerDB])

  const nflState = sleeperData?.nflState ?? null
  const isOffseason = nflState?.season_type !== 'regular'
  const leagueInfo = sleeperData?.leagueInfo ?? null
  const tradeDeadline = leagueInfo?.settings?.trade_deadline ?? null

  const matchups = useMemo(() => {
    if (!sleeperData?.matchups || !league?.userMap) return null

    const groups = {}
    sleeperData.matchups.forEach(m => {
      if (!groups[m.matchup_id]) groups[m.matchup_id] = []
      groups[m.matchup_id].push(m)
    })

    return Object.values(groups)
      .filter(pair => pair.length === 2)
      .map(pair =>
        pair.map(side => ({
          rosterId: side.roster_id,
          points: side.points ?? 0,
          teamName: getTeamName(league.userMap[side.roster_id]),
          username: league.userMap[side.roster_id]?.username ?? '',
        }))
      )
  }, [sleeperData, league])

  function retry() {
    sleeperRetry()
    fcRetry()
  }

  return {
    league, nflState, matchups, isOffseason, leagueInfo, tradeDeadline,
    loading, error, retry, sleeperFetchedAt, fcFetchedAt, values: fcValues,
  }
}

function toTitleCase(str) {
  return str.replace(/\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}

export function getTeamName(user) {
  const raw = user?.metadata?.team_name || user?.display_name || user?.username || 'Unknown Team'
  return toTitleCase(raw)
}
