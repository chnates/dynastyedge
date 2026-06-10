import { useEffect, useState } from 'react'
import { SLEEPER_BASE, ESPN_BASE } from '../constants'
import { fetchJSON } from '../utils/fetchJSON'
import { loadPlayerDB } from './usePlayerDB'

// Per-player intelligence: recent fantasy production (Sleeper stats), depth
// chart context (Sleeper player DB), and recent news (unofficial ESPN API).
//
// Everything is lazy + session-cached: nothing fetches at app load. The first
// profile open triggers the shared season/week stat fetches; every player
// after that is free. ESPN is unofficial and may break without notice — all
// news calls degrade silently to an empty list so the UI just hides the
// section.

// ── Session caches ───────────────────────────────────────────────────────────
const seasonStatsPromises = {}   // year → Promise<statsMap>
const posRankPromises     = {}   // year → Promise<{playerId: posRank}>
const weekStatsPromises   = {}   // `${year}-${week}` → Promise<statsMap>
const espnNewsCache       = new Map() // espnId → Promise<newsItem[]>

function loadSeasonStats(year) {
  if (!seasonStatsPromises[year]) {
    seasonStatsPromises[year] = fetchJSON(`${SLEEPER_BASE}/stats/nfl/regular/${year}`, {
      timeoutMs: 30000,
      label: 'Sleeper season stats',
    }).catch(err => { delete seasonStatsPromises[year]; throw err })
  }
  return seasonStatsPromises[year]
}

function loadWeekStats(year, week) {
  const key = `${year}-${week}`
  if (!weekStatsPromises[key]) {
    weekStatsPromises[key] = fetchJSON(`${SLEEPER_BASE}/stats/nfl/regular/${year}/${week}`, {
      timeoutMs: 20000,
      label: 'Sleeper weekly stats',
    }).catch(err => { delete weekStatsPromises[key]; throw err })
  }
  return weekStatsPromises[key]
}

// Positional finish for a season, ranked by half-PPR points
function loadPosRanks(year) {
  if (!posRankPromises[year]) {
    posRankPromises[year] = Promise.all([loadSeasonStats(year), loadPlayerDB()])
      .then(([stats, db]) => {
        const byPos = {}
        Object.entries(stats ?? {}).forEach(([pid, s]) => {
          const pos = db?.[pid]?.position
          if (!pos || !['QB', 'RB', 'WR', 'TE'].includes(pos)) return
          const pts = s?.pts_half_ppr ?? 0
          if (pts <= 0) return
          if (!byPos[pos]) byPos[pos] = []
          byPos[pos].push([pid, pts])
        })
        const ranks = {}
        Object.values(byPos).forEach(list => {
          list.sort((a, b) => b[1] - a[1])
          list.forEach(([pid], i) => { ranks[pid] = i + 1 })
        })
        return ranks
      })
      .catch(err => { delete posRankPromises[year]; throw err })
  }
  return posRankPromises[year]
}

// ── ESPN news (unofficial) ───────────────────────────────────────────────────

function stripHtml(s) {
  return s ? s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : ''
}

export function loadEspnNews(espnId) {
  if (!espnId) return Promise.resolve([])
  if (!espnNewsCache.has(espnId)) {
    espnNewsCache.set(
      espnId,
      fetchJSON(`${ESPN_BASE}/apis/fantasy/v2/games/ffl/news/players?playerId=${espnId}&limit=3`, {
        timeoutMs: 8000,
        label: 'ESPN news',
      })
        .then(data => (data?.feed ?? [])
          .slice(0, 3)
          .map(item => ({
            headline: item.headline ?? '',
            story: stripHtml(item.story ?? ''),
            published: item.published ?? item.lastModified ?? null,
          }))
          .filter(n => n.headline)
        )
        .catch(() => [])
    )
  }
  return espnNewsCache.get(espnId)
}

export function relativeTime(iso) {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 60) return `${Math.max(mins, 1)}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 14) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ── Production helpers ───────────────────────────────────────────────────────

export const TOUCH_LABEL = { QB: 'att', RB: 'tch', WR: 'tgt', TE: 'tgt' }

function touchesFor(position, s) {
  if (!s) return null
  if (position === 'QB') return s.pass_att ?? null
  if (position === 'RB') return (s.rush_att ?? 0) + (s.rec_tgt ?? 0)
  return s.rec_tgt ?? null
}

async function buildSeasonSummary(year, sleeperId) {
  const [stats, ranks] = await Promise.all([loadSeasonStats(year), loadPosRanks(year)])
  const s = stats?.[sleeperId]
  const pts = s?.pts_half_ppr
  if (pts == null || pts <= 0) return null
  const gp = s.gp ?? s.gms_active ?? null
  return {
    year,
    pts: Math.round(pts * 10) / 10,
    gp,
    ppg: gp ? Math.round((pts / gp) * 10) / 10 : null,
    posRank: ranks[sleeperId] ?? null,
  }
}

async function buildRecentGames(year, currentWeek, sleeperId, position) {
  const weeks = []
  for (let w = currentWeek - 1; w >= 1 && weeks.length < 3; w--) weeks.push(w)
  const results = await Promise.all(
    weeks.map(w =>
      loadWeekStats(year, w)
        .then(m => ({ week: w, s: m?.[sleeperId] ?? null }))
        .catch(() => ({ week: w, s: null }))
    )
  )
  return results.map(({ week, s }) => ({
    week,
    pts: s?.pts_half_ppr != null ? Math.round(s.pts_half_ppr * 10) / 10 : null,
    touches: touchesFor(position, s),
  }))
}

// ── Combined intel fetch ─────────────────────────────────────────────────────

export async function getPlayerIntel(sleeperId, nflState) {
  const db = await loadPlayerDB().catch(() => null)
  const meta = db?.[sleeperId] ?? {}
  const position = meta.position ?? null

  const inSeason  = nflState?.season_type === 'regular'
  const seasonNum = Number(nflState?.season) || new Date().getFullYear()
  // Offseason → last completed season; in-season/post → current season to date
  const statsYear = (inSeason || nflState?.season_type === 'post') ? seasonNum : seasonNum - 1
  const week      = Number(nflState?.week) || 0

  const [seasonSummary, recentGames, news] = await Promise.all([
    buildSeasonSummary(statsYear, sleeperId).catch(() => null),
    inSeason && week > 1
      ? buildRecentGames(seasonNum, week, sleeperId, position).catch(() => [])
      : Promise.resolve([]),
    loadEspnNews(meta.espn_id),
  ])

  return {
    position,
    seasonSummary,                 // { year, pts, gp, ppg, posRank } | null
    recentGames,                   // [{ week, pts, touches }] — in-season only
    news,                          // [{ headline, story, published }]
    depthChart: meta.depth_chart_position
      ? { slot: meta.depth_chart_position, order: meta.depth_chart_order ?? null }
      : null,
    newsUpdated: meta.news_updated ?? null,
  }
}

const EMPTY_INTEL = {
  loading: true, position: null, seasonSummary: null,
  recentGames: [], news: [], depthChart: null, newsUpdated: null,
}

export function usePlayerIntel(sleeperId, nflState) {
  const [intel, setIntel] = useState(EMPTY_INTEL)

  useEffect(() => {
    if (!sleeperId) {
      setIntel({ ...EMPTY_INTEL, loading: false })
      return
    }
    let cancelled = false
    setIntel(EMPTY_INTEL)
    getPlayerIntel(sleeperId, nflState)
      .then(result => { if (!cancelled) setIntel({ ...result, loading: false }) })
      .catch(() => { if (!cancelled) setIntel({ ...EMPTY_INTEL, loading: false }) })
    return () => { cancelled = true }
  }, [sleeperId, nflState])

  return intel
}
