import { useState, useEffect, useCallback } from 'react'
import { SLEEPER_BASE } from '../constants'

function fetchJSON(url) {
  return fetch(url).then(r => {
    if (!r.ok) throw new Error(`Sleeper ${r.status}: ${url}`)
    return r.json()
  })
}

// Module-level cache — /players/nfl is ~8MB, fetch once per session
let cachedPlayerStatuses = null
let statusFetchPromise = null

function getPlayerStatuses() {
  if (cachedPlayerStatuses) return Promise.resolve(cachedPlayerStatuses)
  if (!statusFetchPromise) {
    statusFetchPromise = fetchJSON(`${SLEEPER_BASE}/players/nfl`)
      .then(data => { cachedPlayerStatuses = data; return data })
      .catch(err => { statusFetchPromise = null; throw err })
  }
  return statusFetchPromise
}

function parseByeTeams(schedule, currentWeek) {
  const games = Array.isArray(schedule)
    ? schedule.filter(g => g.week === currentWeek)
    : []
  const playing = new Set()
  games.forEach(g => {
    if (g.home_team) playing.add(g.home_team)
    if (g.away_team) playing.add(g.away_team)
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
  const [isOffseason, setIsOffseason] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const state = await fetchJSON(`${SLEEPER_BASE}/state/nfl`)
      setNflState(state)

      if (state.season_type !== 'regular') {
        setIsOffseason(true)
        setLoading(false)
        return
      }

      setIsOffseason(false)
      const { week, season } = state
      const prevWeek = Math.max(1, week - 1)

      const [projData, scheduleData, statsData, statuses] = await Promise.all([
        fetchJSON(`${SLEEPER_BASE}/projections/nfl/regular/${season}/${week}`),
        fetchJSON(`${SLEEPER_BASE}/schedule/nfl/regular/${season}`),
        prevWeek > 0
          ? fetchJSON(`${SLEEPER_BASE}/stats/nfl/regular/${season}/${prevWeek}`)
          : Promise.resolve({}),
        getPlayerStatuses(),
      ])

      setProjMap(projData)
      setDefStatsRaw(statsData)
      setPlayerStatuses(statuses)

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
    loading,
    error,
    retry: fetchData,
  }
}
