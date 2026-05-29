import { useMemo } from 'react'
import { useSleeper } from './useSleeper'
import { useFantasyCalc } from './useFantasyCalc'
import { resolvePickOwnership, findPickValue, computePickCapitalScore } from '../utils/pickCapital'
import { MY_ROSTER_ID, PICK_YEARS } from '../constants'

export function useLeague() {
  const { data: sleeperData, loading: sleeperLoading, error: sleeperError, retry: sleeperRetry, fetchedAt: sleeperFetchedAt } = useSleeper()
  const { values: fcValues, loading: fcLoading, error: fcError, retry: fcRetry, fetchedAt: fcFetchedAt } = useFantasyCalc()

  const loading = sleeperLoading || fcLoading
  const error = sleeperError || fcError

  const league = useMemo(() => {
    if (!sleeperData || !fcValues) return null

    const { rosters, users, tradedPicks } = sleeperData
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

    function resolveRoster(roster) {
      const starterSet = new Set(
        (roster.starters ?? []).filter(id => id && id !== '0')
      )
      const reserveSet = new Set(roster.reserve ?? [])
      const taxiSet = new Set(roster.taxi ?? [])

      const allPlayers = (roster.players ?? []).map(pid => {
        const id = String(pid)
        const fc = playerMap[id]
        if (!fc) return null // DEF, unresolved — skip
        return {
          sleeperId: id,
          name: fc.name,
          position: fc.position,
          team: fc.team,
          age: fc.age,
          value: fc.value,
          overallRank: fc.overallRank,
          positionRank: fc.positionRank,
          trend30Day: fc.trend30Day,
          isStarter: starterSet.has(pid) || starterSet.has(id),
          isTaxi: taxiSet.has(pid) || taxiSet.has(id),
          isIR: reserveSet.has(pid) || reserveSet.has(id),
        }
      }).filter(Boolean)

      const ownedPicks = (picksByRoster[roster.roster_id] ?? []).map(pk => ({
        ...pk,
        value: findPickValue(pk, pickEntries),
      }))
      const playerValue = allPlayers.reduce((s, p) => s + p.value, 0)
      const pickValue = ownedPicks.reduce((s, pk) => s + pk.value, 0)
      const pickCapitalScore = computePickCapitalScore(ownedPicks, pickEntries)

      const startersWithAge = allPlayers.filter(p => p.isStarter && !p.isIR && !p.isTaxi && p.age != null)
      const avgStarterAge = startersWithAge.length > 0
        ? startersWithAge.reduce((s, p) => s + p.age, 0) / startersWithAge.length
        : null

      const starterOrder = (roster.starters ?? []).map(id => String(id))

      return {
        rosterId: roster.roster_id,
        owner: userMap[roster.roster_id],
        players: allPlayers,
        picks: ownedPicks,
        totalValue: playerValue + pickValue,
        faabRemaining:
          (roster.settings?.waiver_budget ?? 100) -
          (roster.settings?.waiver_budget_used ?? 0),
        pickCapitalScore,
        avgStarterAge,
        starterOrder,
      }
    }

    const allRosters = rosters.map(resolveRoster)
    const myRoster = allRosters.find(r => r.rosterId === MY_ROSTER_ID) ?? null

    return { allRosters, myRoster, userMap }
  }, [sleeperData, fcValues])

  function retry() {
    sleeperRetry()
    fcRetry()
  }

  return { league, loading, error, retry, sleeperFetchedAt, fcFetchedAt }
}

export function getTeamName(user) {
  return user?.metadata?.team_name || user?.display_name || user?.username || 'Unknown Team'
}
