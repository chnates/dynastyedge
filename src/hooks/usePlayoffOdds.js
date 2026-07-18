import { useState, useEffect, useMemo } from 'react'
import { SLEEPER_BASE, LEAGUE_ID } from '../constants'
import { fetchJSON } from '../utils/fetchJSON'
import { useLeagueContext } from '../context/LeagueContext'
import { buildScoringModel, simulatePlayoffs, buildStrengthPreview, teamStartingStrength } from '../utils/playoffOdds'

// The one new fetch this feature needs: every regular-season week's matchups.
// A single pass gives us BOTH the remaining schedule (who still plays whom) and
// every completed week's actual per-team score. Lazy + session-cached — the
// schedule for a season doesn't change, so one fetch per session is plenty.
let scheduleCache = null // { season, weeks: [{ week, entries }] }
let schedulePromise = null

function loadSchedule(season, firstPlayoffWeek) {
  if (scheduleCache?.season === season) return Promise.resolve(scheduleCache.weeks)
  if (!schedulePromise) {
    const lastRegWeek = Math.max(1, (firstPlayoffWeek ?? 15) - 1)
    const weeks = Array.from({ length: lastRegWeek }, (_, i) => i + 1)
    schedulePromise = Promise.all(
      weeks.map(w =>
        fetchJSON(`${SLEEPER_BASE}/league/${LEAGUE_ID}/matchups/${w}`, { label: 'Sleeper matchups' })
          .catch(() => [])
          .then(entries => ({ week: w, entries: Array.isArray(entries) ? entries : [] }))
      )
    )
      .then(perWeek => {
        scheduleCache = { season, weeks: perWeek }
        schedulePromise = null
        return perWeek
      })
      .catch(err => {
        schedulePromise = null
        throw err
      })
  }
  return schedulePromise
}

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

  const season = leagueInfo?.season ?? nflState?.season ?? 'unknown'
  const firstPlayoffWeek = leagueInfo?.settings?.playoff_week_start ?? 15
  const playoffTeams = leagueInfo?.settings?.playoff_teams ?? 6
  // leagueInfo and nflState land together (one setData in useSleeper), so once
  // either exists the real season and playoff_week_start are both known.
  const seasonKnown = leagueInfo != null || nflState != null

  const [perWeek, setPerWeek] = useState(
    scheduleCache?.season === season ? scheduleCache.weeks : null
  )
  const [schedLoading, setSchedLoading] = useState(perWeek === null)
  const [schedError, setSchedError] = useState(null)
  const [retryTick, setRetryTick] = useState(0)

  useEffect(() => {
    // The default route mounts this hook before the league loads; fetching then
    // would cache 14 weeks under season 'unknown' and refetch them all when the
    // real season arrives. Wait — schedLoading stays true, so consumers still
    // show their loading state (league data is loading too).
    if (!seasonKnown) return
    let cancelled = false
    setSchedLoading(scheduleCache?.season !== season)
    setSchedError(null)
    loadSchedule(season, firstPlayoffWeek)
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
  }, [seasonKnown, season, firstPlayoffWeek, retryTick])

  const derived = useMemo(() => {
    if (!league?.allRosters?.length || !perWeek) return null
    return deriveOdds(league, perWeek, playoffTeams, firstPlayoffWeek)
  }, [league, perWeek, playoffTeams, firstPlayoffWeek])

  // Per-instance: which team is "me" doesn't affect the shared simulation.
  const myOdds = derived ? (derived.oddsByRoster[myRosterId] ?? null) : null

  function retry() {
    scheduleCache = null
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
