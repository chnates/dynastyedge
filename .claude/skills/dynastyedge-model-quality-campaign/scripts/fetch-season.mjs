// fetch-season.mjs — NETWORK-REQUIRED runbook step (Phase 1). Downloads every
// past season of the league (previous_league_id chain) as season files for
// phase1-replay.mjs. This script was written and syntax-checked offline but
// has NOT been run in the authoring sandbox (Sleeper API blocked there —
// proxy 403). Run it from an environment with open egress:
//
//   node .claude/skills/dynastyedge-model-quality-campaign/scripts/fetch-season.mjs /tmp/seasons
//
// Writes /tmp/seasons/season-<YYYY>.json per past season, shape:
//   { season, playoffTeams, rosterIds, weeks: [{ week, matchups, points }] }
// Only fully-completed weeks (every team scored) are included — mirrors the
// completeness rule in src/hooks/usePlayoffOdds.js processWeeks().
//
// Uses plain fetch (Node ≥ 18), no repo imports — safe without the loader.
// Read-only against Sleeper; ~ (1 + 2·seasons + 14·seasons) calls, far under
// the 1,000/min limit.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const LEAGUE_ID = '1313933520715907072' // src/constants.js LEAGUE_ID
const BASE = 'https://api.sleeper.app/v1'
const MAX_SEASONS_BACK = 8 // same cap as useLeagueHistory.js

const outDir = process.argv[2] ?? '/tmp/seasons'
mkdirSync(outDir, { recursive: true })

async function get(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`${res.status} ${path}`)
  return res.json()
}

const current = await get(`/league/${LEAGUE_ID}`)
const chain = []
let prevId = current?.previous_league_id
while (prevId && prevId !== '0' && chain.length < MAX_SEASONS_BACK) {
  const info = await get(`/league/${prevId}`).catch(() => null)
  if (!info) break
  chain.push(info)
  prevId = info.previous_league_id
}
console.log(`past seasons found: ${chain.map(l => l.season).join(', ') || 'NONE'}`)
if (!chain.length) {
  console.log('No previous seasons — the replay corpus is empty until this league renews.')
  process.exit(0)
}

for (const info of chain) {
  const id = info.league_id
  const firstPlayoffWeek = info.settings?.playoff_week_start ?? 15
  const playoffTeams = info.settings?.playoff_teams ?? 6
  const lastRegWeek = Math.max(1, firstPlayoffWeek - 1)

  const rosters = await get(`/league/${id}/rosters`)
  const rosterIds = (rosters ?? []).map(r => r.roster_id)

  const weeks = []
  for (let w = 1; w <= lastRegWeek; w++) {
    const entries = (await get(`/league/${id}/matchups/${w}`).catch(() => [])) ?? []
    if (!entries.length) continue
    const groups = {}
    entries.forEach(e => {
      if (e.matchup_id == null) return
      ;(groups[e.matchup_id] ??= []).push(e)
    })
    const pairs = Object.values(groups).filter(g => g.length === 2)
    if (!pairs.length) continue
    // completeness rule from usePlayoffOdds.processWeeks: every team scored
    if (!entries.every(e => (e.points ?? 0) > 0)) continue
    const points = {}
    entries.forEach(e => { points[e.roster_id] = e.points ?? 0 })
    weeks.push({ week: w, matchups: pairs.map(g => [g[0].roster_id, g[1].roster_id]), points })
  }

  const file = join(outDir, `season-${info.season}.json`)
  writeFileSync(file, JSON.stringify({
    season: String(info.season), leagueId: id, playoffTeams, rosterIds, weeks,
  }, null, 2))
  console.log(`wrote ${file} (${weeks.length} completed weeks, ${rosterIds.length} teams)`)
}
