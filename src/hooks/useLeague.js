import { useMemo, useCallback } from 'react'
import { useSleeper } from './useSleeper'
import { useFantasyCalc } from './useFantasyCalc'
import { usePlayerDB } from './usePlayerDB'
import { buildLeagueState } from '../utils/leagueState'
import { resolvePickYears } from '../utils/seasonWindow'
import { PICK_YEARS } from '../constants'
import { useIdentity } from './useIdentity'
import { getTeamName } from '../utils/teamName'

// Moved to src/utils/teamName.js so the analysis layer stays React-free.
// Re-exported here because 22 components import it from this module.
export { getTeamName }

export function useLeague() {
  // The logged-in roster is now runtime state, not a constant — "me" is
  // whichever team the user signed in as.
  const { rosterId: myRosterId } = useIdentity()
  const { data: sleeperData, loading: sleeperLoading, error: sleeperError, retry: sleeperRetry, fetchedAt: sleeperFetchedAt } = useSleeper()
  const { values: fcValues, loading: fcLoading, error: fcError, retry: fcRetry, fetchedAt: fcFetchedAt } = useFantasyCalc()
  // Player DB resolves names for rostered players FantasyCalc doesn't rank
  // (deep stashes, some rookies, DEFs). It loads in the background — league
  // data renders without it, and unranked players appear once it arrives.
  const { playerDB } = usePlayerDB()

  const loading = sleeperLoading || fcLoading
  const error = sleeperError || fcError

  // The live pick window. Derived from Sleeper alone, so it resolves without
  // waiting on (or failing with) FantasyCalc — same discipline as signInRosters.
  const pickYears = useMemo(
    () => resolvePickYears(sleeperData?.nflState, sleeperData?.drafts, PICK_YEARS),
    [sleeperData]
  )

  const league = useMemo(
    () => buildLeagueState({ sleeperData, fcValues, playerDB, myRosterId, pickYears }),
    [sleeperData, fcValues, playerDB, myRosterId, pickYears]
  )

  // A Sleeper-only roster list for sign-in. Identity selection must never
  // depend on FantasyCalc — a values-API outage shouldn't lock the user out of
  // their own app. Derives straight from the rosters+users responses, so it's
  // available the moment Sleeper resolves, even while/if FantasyCalc fails.
  const signInRosters = useMemo(() => {
    if (!sleeperData) return null
    const { rosters, users } = sleeperData
    const userById = {}
    users.forEach(u => { userById[u.user_id] = u })
    return rosters.map(r => {
      const s = r.settings ?? {}
      const wins = s.wins ?? 0
      const losses = s.losses ?? 0
      const ties = s.ties ?? 0
      return {
        rosterId: r.roster_id,
        owner: userById[r.owner_id] ?? null,
        record: { wins, losses, ties },
        hasRecord: wins + losses + ties > 0,
      }
    })
  }, [sleeperData])

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

  // rosterId → { sleeperId: pointsScoredThisWeek }, straight off the same
  // matchups payload `matchups` above is built from — no extra request.
  //
  // It is derived SEPARATELY rather than folded into `matchups` because that
  // memo deliberately keeps only what a MatchupCard renders and drops every
  // unpaired entry. The Lineup Optimizer needs the opposite: per-player live
  // scores, for every roster, paired or not. A player whose game has kicked
  // off can no longer be moved, so his slot must be priced at what he actually
  // scored rather than at a projection that can no longer come true.
  const weeklyPlayerPoints = useMemo(() => {
    if (!sleeperData?.matchups) return null
    const byRoster = {}
    sleeperData.matchups.forEach(m => {
      if (m?.roster_id == null) return
      byRoster[m.roster_id] = m.players_points ?? {}
    })
    return byRoster
  }, [sleeperData])

  const retry = useCallback(() => {
    sleeperRetry()
    fcRetry()
  }, [sleeperRetry, fcRetry])

  // This object is the LeagueContext value — every consumer in the app reads
  // it. Returning a fresh literal each render would change the provider value's
  // identity on every App render and cascade re-renders through every consumer,
  // so memoize it on its actual inputs.
  return useMemo(() => ({
    league, nflState, matchups, weeklyPlayerPoints, isOffseason, leagueInfo, tradeDeadline,
    myRosterId, pickYears,
    loading, error, retry, sleeperFetchedAt, fcFetchedAt, values: fcValues,
    // Per-source refresher for the drawer's granular Refresh coordinator —
    // resolves true/false on completion so it can tick ✓/✗ per source.
    // (sleeperRetry is already exposed just below for sign-in.)
    fcRetry,
    // Sleeper-scoped sign-in inputs (independent of FantasyCalc).
    signInRosters, sleeperLoading, sleeperError, sleeperRetry,
  }), [
    league, nflState, matchups, weeklyPlayerPoints, isOffseason, leagueInfo, tradeDeadline,
    myRosterId, pickYears, loading, error, retry, sleeperFetchedAt, fcFetchedAt, fcValues,
    signInRosters, sleeperLoading, sleeperError, sleeperRetry, fcRetry,
  ])
}
