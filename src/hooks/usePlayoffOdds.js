import { useState, useEffect, useMemo } from 'react'
import { useLeagueContext } from '../context/LeagueContext'
import { loadMatchupWeeks, peekMatchupWeeks, resetMatchupWeeks } from './matchupWeeks'
import { buildPlayoffOutlook } from '../utils/playoffOdds'

// The one new fetch this feature needs: every regular-season week's matchups.
// A single pass gives us BOTH the remaining schedule (who still plays whom) and
// every completed week's actual per-team score. The fetch itself lives in the
// shared matchupWeeks cache (lazy + session-cached) so lineup history reads
// the same weeks without refetching them. A total outage rejects there, so
// the Playoffs page shows ErrorState instead of a fake "preseason".

// The scoring model + 10,000-iteration simulation are the heaviest compute in
// the app (~50–200ms of main-thread work). Four consumers mount this hook (The
// Edge, Trade Analyzer, Trade Partner Finder, the Playoffs page), and a
// per-instance useMemo would re-run the sim on every one of those mounts. So
// the derived results are memoized once at module scope, keyed by the inputs'
// identities — `league` is LeagueContext's memoized object and `perWeek` is the
// module-cached schedule array, so unchanged data always arrives as the same
// references — and navigating between sections reuses one simulation. The sim
// itself stays pure and fixed-seed, so the shared result is exactly what each
// instance would have computed on its own. `myRosterId` deliberately stays out
// of the key: it only selects `myOdds`, a per-instance map lookup.
let derivedCache = null // { league, perWeek, playoffTeams, firstPlayoffWeek, value }

function deriveOdds(league, perWeek, playoffTeams, firstPlayoffWeek) {
  const c = derivedCache
  if (
    c && c.league === league && c.perWeek === perWeek &&
    c.playoffTeams === playoffTeams && c.firstPlayoffWeek === firstPlayoffWeek
  ) {
    return c.value
  }

  // The model itself lives in src/utils/playoffOdds.js (buildPlayoffOutlook),
  // so the MCP server's get_playoff_odds runs exactly this composition under
  // plain Node. What stays here is the memo and nothing else.
  const value = buildPlayoffOutlook({
    allRosters: league.allRosters, perWeek, playoffTeams, firstPlayoffWeek,
  })
  derivedCache = { league, perWeek, playoffTeams, firstPlayoffWeek, value }
  return value
}

export function usePlayoffOdds() {
  const {
    league, leagueInfo, nflState, myRosterId,
    loading: leagueLoading, error: leagueError, retry: leagueRetry,
  } = useLeagueContext()

  const firstPlayoffWeek = leagueInfo?.settings?.playoff_week_start ?? 15
  const playoffTeams = leagueInfo?.settings?.playoff_teams ?? 6
  // leagueInfo and nflState land together (one setData in useSleeper), so once
  // either exists the real season and playoff_week_start are both known.
  const seasonKnown = leagueInfo != null || nflState != null
  const lastRegWeek = Math.max(1, firstPlayoffWeek - 1)

  const [perWeek, setPerWeek] = useState(() => peekMatchupWeeks(lastRegWeek))
  const [schedLoading, setSchedLoading] = useState(perWeek === null)
  const [schedError, setSchedError] = useState(null)
  const [retryTick, setRetryTick] = useState(0)

  useEffect(() => {
    // The default route mounts this hook before the league loads; fetching then
    // would guess the week range from the default playoff_week_start instead of
    // the league's real setting. Wait — schedLoading stays true, so consumers
    // still show their loading state (league data is loading too).
    if (!seasonKnown) return
    let cancelled = false
    setSchedLoading(peekMatchupWeeks(lastRegWeek) == null)
    setSchedError(null)
    loadMatchupWeeks(lastRegWeek)
      .then(weeks => {
        if (cancelled) return
        setPerWeek(weeks)
        setSchedLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setSchedError(err.message)
        setSchedLoading(false)
      })
    return () => { cancelled = true }
  }, [seasonKnown, lastRegWeek, retryTick])

  const derived = useMemo(() => {
    if (!league?.allRosters?.length || !perWeek) return null
    return deriveOdds(league, perWeek, playoffTeams, firstPlayoffWeek)
  }, [league, perWeek, playoffTeams, firstPlayoffWeek])

  // Per-instance: which team is "me" doesn't affect the shared simulation.
  const myOdds = derived ? (derived.oddsByRoster[myRosterId] ?? null) : null

  function retry() {
    resetMatchupWeeks()
    setSchedError(null)
    setRetryTick(t => t + 1)
    leagueRetry()
  }

  return {
    loading: (leagueLoading && !league) || (schedLoading && !perWeek),
    error: schedError ?? ((leagueError && !league) ? leagueError : null),
    retry,
    league,
    myRosterId,
    status: derived?.status ?? null,
    results: derived?.results ?? null,
    oddsByRoster: derived?.oddsByRoster ?? {},
    myOdds,
    model: derived?.model ?? null,
    completedWeeks: derived?.completedWeeks ?? 0,
    remainingWeeks: derived?.remainingWeeks ?? 0,
    remainingGames: derived?.remainingGames ?? 0,
    strengthPreview: derived?.strengthPreview ?? null,
    playoffTeams: derived?.playoffTeams ?? playoffTeams,
    firstPlayoffWeek: derived?.firstPlayoffWeek ?? firstPlayoffWeek,
  }
}
