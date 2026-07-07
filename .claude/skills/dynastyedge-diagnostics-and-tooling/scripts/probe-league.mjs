// probe-league.mjs — NETWORK REQUIRED. Sanity-probe the live Sleeper league.
//
// Fetches league settings, rosters, users, and NFL state for the DynastyEdge
// league and prints a sanity table: team count (expect 10), roster sizes,
// whether roster 6 (Nix Cage) is present, season / season_type, and the
// last-scored week. Read-only; ~4 small GET requests, far under Sleeper's
// 1,000/min limit.
//
// USAGE:
//   node /home/user/dynastyedge/.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/probe-league.mjs
//
// No loader hook needed (imports only src/constants.js, which is
// dependency-free). Exits 1 with a clear message when the network is
// unavailable (sandboxes often block api.sleeper.app — proxy 403).
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// League ID 1313933520715907072 = the one DynastyEdge league (10-team
// Superflex Half-PPR dynasty on Sleeper). Constants are read from the repo's
// src/constants.js when reachable; these literals are the fallback.
let SLEEPER_BASE = 'https://api.sleeper.app/v1'
let LEAGUE_ID = '1313933520715907072'
let MY_ROSTER_ID = 6
try {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
  const c = await import(path.join(repoRoot, 'src/constants.js'))
  SLEEPER_BASE = c.SLEEPER_BASE; LEAGUE_ID = c.LEAGUE_ID; MY_ROSTER_ID = c.MY_ROSTER_ID
} catch { /* fall back to literals above */ }

async function getJSON(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`)
  return res.json()
}

let league, rosters, users, state
try {
  ;[league, rosters, users, state] = await Promise.all([
    getJSON(`${SLEEPER_BASE}/league/${LEAGUE_ID}`),
    getJSON(`${SLEEPER_BASE}/league/${LEAGUE_ID}/rosters`),
    getJSON(`${SLEEPER_BASE}/league/${LEAGUE_ID}/users`),
    getJSON(`${SLEEPER_BASE}/state/nfl`),
  ])
} catch (err) {
  console.error('NETWORK FAILURE — could not reach api.sleeper.app.')
  console.error(`  ${err.message}`)
  console.error('This script requires outbound HTTPS to api.sleeper.app.')
  console.error('Sandboxed sessions typically get a proxy 403 here — run it in an')
  console.error('environment with real network access; nothing is wrong with the repo.')
  process.exit(1)
}

const userById = new Map(users.map(u => [u.user_id, u]))
const teamName = r => {
  const u = userById.get(r.owner_id)
  return u?.metadata?.team_name || u?.display_name || `roster ${r.roster_id}`
}

console.log('=== Sleeper league probe ===')
console.log(`League:        ${league.name} (${LEAGUE_ID})`)
console.log(`Season:        ${league.season} · state ${state.season} / season_type=${state.season_type}`)
console.log(`NFL week:      ${state.week} (display_week ${state.display_week}) — last-scored week ≈ ${state.season_type === 'regular' ? Math.max(0, state.week - 1) : 'n/a (not regular season)'}`)
console.log(`Teams:         ${rosters.length} ${rosters.length === 10 ? 'OK (expect 10)' : '*** UNEXPECTED — expect 10 ***'}`)
console.log(`Playoff teams: ${league.settings?.playoff_teams} · playoff_week_start ${league.settings?.playoff_week_start} · trade deadline wk ${league.settings?.trade_deadline}`)
const mine = rosters.find(r => r.roster_id === MY_ROSTER_ID)
console.log(`My roster (6): ${mine ? `present — ${teamName(mine)} · ${mine.settings?.wins}-${mine.settings?.losses}` : '*** MISSING ***'}`)
console.log('')
console.log('rosterId  players  taxi  IR  record   fpts     team')
for (const r of [...rosters].sort((a, b) => a.roster_id - b.roster_id)) {
  const s = r.settings ?? {}
  console.log(
    String(r.roster_id).padEnd(9)
    + String(r.players?.length ?? 0).padEnd(9)
    + String(r.taxi?.length ?? 0).padEnd(6)
    + String(r.reserve?.length ?? 0).padEnd(4)
    + `${s.wins ?? 0}-${s.losses ?? 0}${s.ties ? `-${s.ties}` : ''}`.padEnd(9)
    + String(s.fpts ?? 0).padEnd(9)
    + teamName(r)
  )
}
const sizes = rosters.map(r => r.players?.length ?? 0)
console.log('')
console.log(`Roster sizes: min ${Math.min(...sizes)} / max ${Math.max(...sizes)} (slots: 11 starters + 12 bench; taxi/IR separate)`)
