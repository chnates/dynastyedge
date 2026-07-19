import { useState, useEffect, useMemo } from 'react'
import { useLeagueContext } from '../context/LeagueContext'
import { loadMatchupWeeks, peekMatchupWeeks, resetMatchupWeeks } from './matchupWeeks'
import { buildScoringModel, simulatePlayoffs, buildStrengthPreview, teamStartingStrength } from '../utils/playoffOdds'

// The one new fetch this feature needs: every regular-season week's matchups.
// A single pass gives us BOTH the remaining schedule (who still plays whom) and
// every completed week's actual per-team score. The fetch itself lives in the
// shared matchupWeeks cache (lazy + session-cached) so lineup history reads
// the same weeks without refetching them. A total outage rejects there, so
// the Playoffs page shows ErrorState instead of a fake "preseason".

// Split the fetched weeks into completed scores (real results) and a remaining
// schedule (future pairings). A week counts as complete only when every team in
// it has scored — so a partially-played current week is simulated fresh rather
// than contaminating the model with half a week of points.
function processWeeks(perWeek) {
  const completedScores = {}
  const remainingSchedule = []
  let completedWeeks = 0

  perWeek.forEach(({ week, entries }) => {
    if (!entries.length) return

    const groups = {}
    entries.forEach(e => {
      if (e.matchup_id == null) return
      ;(groups[e.matchup_id] ??= []).push(e)
    })
    const pairs = Object.values(groups).filter(g => g.length === 2)
    if (!pairs.length) return // no schedule posted for this week yet

    const complete = entries.every(e => (e.points ?? 0) > 0)
    if (complete) {
      completedWeeks += 1
      entries.forEach(e => {
        ;(completedScores[e.roster_id] ??= []).push(e.points ?? 0)
      })
    } else {
      remainingSchedule.push({
        week,
        matchups: pairs.map(g => [g[0].roster_id, g[1].roster_id]),
      })
    }
  })

  return { completedScores, remainingSchedule, completedWeeks }
}

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

  const { completedScores, remainingSchedule, completedWeeks } = processWeeks(perWeek)
  // Roster strength is the costliest piece of the model (an optimal-lineup
  // solve per team). Compute it once and feed both the scoring model and the
  // preseason preview, instead of solving every roster twice.
  const strengths = league.allRosters.map(teamStartingStrength)
  const model = buildScoringModel(league.allRosters, completedScores, strengths)
  const remainingGames = remainingSchedule.reduce((s, w) => s + w.matchups.length, 0)

  let status
  if (remainingSchedule.length === 0 && completedWeeks === 0) status = 'preseason'
  else if (remainingSchedule.length === 0) status = 'complete'
  else status = 'active'

  const results = status === 'preseason'
    ? null
    : simulatePlayoffs({ allRosters: league.allRosters, model, remainingSchedule, playoffTeams })

  // Keyed by roster for consumers (Trade Analyzer / Partner Finder / The Edge)
  // that need one team's odds without re-running the sim.
  const oddsByRoster = {}
  ;(results ?? []).forEach(r => { oddsByRoster[r.rosterId] = r })

  const value = {
    status,
    results,
    oddsByRoster,
    model,
    completedWeeks,
    remainingWeeks: remainingSchedule.length,
    remainingGames,
    // Only the preseason page consumes this — don't solve seeding when the
    // real simulation already ran.
    strengthPreview: status === 'preseason'
      ? buildStrengthPreview(league.allRosters, playoffTeams, strengths)
      : null,
    playoffTeams,
    firstPlayoffWeek,
  }
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
