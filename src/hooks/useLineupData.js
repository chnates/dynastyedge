import { useState, useEffect, useCallback } from 'react'
import { SLEEPER_BASE, SLEEPER_ROOT } from '../constants'
import { fetchJSON } from '../utils/fetchJSON'
import { loadPlayerDB } from './usePlayerDB'

// Teams with a game this week — everyone else is on bye. Sleeper's schedule
// payload uses `home`/`away` (NOT `home_team`/`away_team`).
function parseByeTeams(schedule, currentWeek) {
  const games = Array.isArray(schedule)
    ? schedule.filter(g => g.week === currentWeek)
    : []
  const playing = new Set()
  games.forEach(g => {
    if (g.home) playing.add(g.home)
    if (g.away) playing.add(g.away)
  })
  return { playing, schedule: Array.isArray(schedule) ? schedule : [] }
}

export function useLineupData() {
  const [nflState, setNflState] = useState(null)
  const [projMap, setProjMap] = useState(null)
  const [playerStatuses, setPlayerStatuses] = useState(null)
  const [schedule, setSchedule] = useState([])
  const [playingTeams, setPlayingTeams] = useState(new Set())
  const [defStatsRaw, setDefStatsRaw] = useState(null)
  const [statsWeek, setStatsWeek] = useState(null)
  const [isOffseason, setIsOffseason] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const state = await fetchJSON(`${SLEEPER_BASE}/state/nfl`, { label: 'Sleeper' })
      setNflState(state)

      if (state.season_type !== 'regular') {
        setIsOffseason(true)
        setLoading(false)
        return
      }

      setIsOffseason(false)
      const { week, season } = state
      const prevWeek = Math.max(1, week - 1)

      // The schedule and last week's stats are BEST-EFFORT: they drive bye
      // detection and matchup quality, which degrade to "no bye info" and
      // "Neutral". Letting either reject would blank the whole Optimizer
      // behind an ErrorState — projections and injury statuses are what the
      // lineup actually needs. (The schedule lives off /v1; see SLEEPER_ROOT.)
      const [projData, scheduleData, statsData, statuses] = await Promise.all([
        fetchJSON(`${SLEEPER_BASE}/projections/nfl/regular/${season}/${week}`, { label: 'Sleeper' }),
        fetchJSON(`${SLEEPER_ROOT}/schedule/nfl/regular/${season}`, { label: 'Sleeper schedule' })
          .catch(() => []),
        prevWeek > 0
          ? fetchJSON(`${SLEEPER_BASE}/stats/nfl/regular/${season}/${prevWeek}`, { label: 'Sleeper' })
            .catch(() => ({}))
          : Promise.resolve({}),
        loadPlayerDB(),
      ])

      setProjMap(projData)
      setDefStatsRaw(statsData)
      setPlayerStatuses(statuses)
      // The stats week (prevWeek) is what defense rankings are computed from —
      // consumers need it to pair those stats with the right week's opponents.
      setStatsWeek(prevWeek)

      const { playing, schedule: parsed } = parseByeTeams(scheduleData, week)
      setSchedule(parsed)
      setPlayingTeams(playing)

      setLoading(false)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  return {
    isOffseason,
    nflState,
    projMap,
    playerStatuses,
    schedule,
    playingTeams,
    defStatsRaw,
    statsWeek,
    loading,
    error,
    retry: fetchData,
  }
}
