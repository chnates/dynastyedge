// leagueResults.js — tool #12: "Who won our league in 2023?"
//
// MCP_DISCOVERY.md §5 recorded this as the one question the server could not
// answer: past records and points-for were always in hand, but the champion
// lives only in `/league/{id}/winners_bracket`, which nothing had called.
//
// ── WHY ITS OWN TOOL, NOT A FIELD ON scout_managers ──────────────────────
//
// Different question (the league's history, not how one manager trades) and a
// different cost: it reads the NARROW history walk plus a bracket and a users
// call per season — ~21 requests cold, most of them usually cached — where
// scout_managers pays the wide walk's 68. Folding it in would charge every
// "who won?" for a trade ledger it never reads.
//
// Orchestration only: every placement comes from
// `leagueResults.buildSeasonResult` (src/utils), so an app screen showing past
// champions would read the same rule.
//
// ── DEGRADATION ───────────────────────────────────────────────────────────
//
// A season whose bracket could not be read is reported `status: 'unavailable'`
// with NO champion and named in the notes — never "no champion", which would
// be a claim about the league. The current season's bracket is empty until the
// playoffs are played: `in-progress`, never "nobody won".

import { buildSeasonResult, countTitles } from '../../src/utils/leagueResults.js'
import { getTeamName } from '../../src/utils/teamName.js'

// A league's seasons are capped by the history walk (MAX_SEASONS_BACK + the
// current one); standings are one row per team. Both are small by
// construction, but the rule is the rule — cap and disclose.
const MAX_STANDINGS = 32

export function buildResultsAnswer(snapshot, results, { season } = {}) {
  const { league } = snapshot
  if (!league) throw new Error('League state unavailable')

  const currentSeason = String(league.leagueInfo?.season ?? snapshot.nflState?.season ?? '')

  // A title won under an old team name is credited to the manager who still
  // holds the roster — owner_id is the only identity that survives a season.
  const currentByOwner = new Map(
    league.allRosters.filter(r => r.owner?.user_id).map(r => [r.owner.user_id, r])
  )
  const nameForOwner = ownerId => {
    const r = currentByOwner.get(ownerId)
    return r ? getTeamName(r.owner) : null
  }

  // The current season from the snapshot the server already holds, in the
  // raw shape buildSeasonResult reads.
  const currentRosters = league.allRosters.map(r => ({
    roster_id: r.rosterId,
    owner_id: r.owner?.user_id ?? null,
    settings: {
      wins: r.record?.wins ?? 0, losses: r.record?.losses ?? 0, ties: r.record?.ties ?? 0,
      fpts: r.pointsFor ?? 0, fpts_decimal: 0,
    },
  }))
  const currentUsers = league.allRosters.map(r => r.owner).filter(Boolean)

  const seasons = []
  if (currentSeason) {
    const bracket = results?.current?.bracket ?? null
    seasons.push({
      ...buildSeasonResult({
        season: currentSeason, bracket, rosters: currentRosters, users: currentUsers, nameForOwner,
      }),
      ...(bracket == null ? { status: 'unavailable' } : {}),
    })
  }
  for (const s of results?.seasons ?? []) {
    if (!s.bracket) {
      seasons.push({
        season: s.season, status: 'unavailable', champion: null, runnerUp: null, third: null,
        fourth: null, fifth: null, sixth: null, metadataAgrees: null, standings: [],
      })
      continue
    }
    seasons.push(buildSeasonResult({
      season: s.season,
      bracket: s.bracket,
      rosters: s.rosters,
      users: s.users,
      metadataWinner: s.leagueInfo?.metadata?.latest_league_winner_roster_id ?? null,
      nameForOwner,
    }))
  }

  const shaped = seasons.map(r => ({
    ...r,
    standings: r.standings.slice(0, MAX_STANDINGS),
  }))

  const titles = countTitles(shaped.filter(r => r.status === 'complete')).map(t => ({
    ownerId: t.ownerId,
    teamName: nameForOwner(t.ownerId)
      ?? shaped.find(r => r.champion?.ownerId === t.ownerId)?.champion?.teamName
      ?? 'a former manager',
    stillInLeague: currentByOwner.has(t.ownerId),
    titles: t.titles,
    seasons: t.seasons,
  }))

  const base = {
    ok: true,
    asOf: snapshot.asOf,
    available: !!results?.available,
    league: {
      leagueId: league.leagueId ?? null,
      name: league.leagueInfo?.name ?? null,
      season: currentSeason || null,
      teams: league.allRosters.length,
    },
  }

  const notes = []
  if (!results?.available) {
    notes.push(
      'This league\'s past seasons could not be loaded, so past champions are unknown. That is a gap in our ' +
      'data — it is not a claim that any season went without a winner.'
    )
  }
  const unavailable = shaped.filter(r => r.status === 'unavailable').map(r => r.season)
  if (unavailable.length) {
    notes.push(
      `The ${unavailable.join(', ')} bracket${unavailable.length > 1 ? 's' : ''} could not be read, so ` +
      `${unavailable.length > 1 ? 'those seasons carry' : 'that season carries'} no champion here — unknown, ` +
      'not "nobody won". Retry with refresh: true.'
    )
  }
  const live = shaped.find(r => r.season === currentSeason && r.status === 'in-progress')
  if (live) {
    notes.push(
      `${currentSeason} is in progress: its bracket exists but no playoff game has been decided, so there is no ` +
      `champion yet. Playoffs start in week ${league.leagueInfo?.settings?.playoff_week_start ?? '?'}.`
    )
  }
  shaped.filter(r => r.metadataAgrees === false).forEach(r => notes.push(
    `${r.season}: the bracket and the league's own "latest winner" field disagree. The bracket is reported; ` +
    'treat this season as worth confirming in Sleeper.'
  ))
  notes.push(
    'Champions are read from Sleeper\'s playoff bracket (the championship game\'s winner). Team names are the ' +
    'ones used that season where Sleeper still has them; titles are credited by manager, so a renamed team ' +
    'keeps its titles.'
  )

  if (season != null && season !== '') {
    const want = String(season).trim()
    const hit = shaped.find(r => r.season === want)
    if (!hit) {
      return {
        ...base,
        ok: false,
        error: `No ${want} season in this league's history. Seasons available: ${shaped.map(r => r.season).join(', ') || 'none'}.`,
        seasonsAvailable: shaped.map(r => r.season),
      }
    }
    return { ...base, seasons: [hit], titles, counts: { seasons: shaped.length, returned: 1 }, notes }
  }

  return { ...base, seasons: shaped, titles, counts: { seasons: shaped.length, returned: shaped.length }, notes }
}

// ── text ─────────────────────────────────────────────────────────────────

const who = p => (p ? p.teamName : '—')

export function renderResultsText(a) {
  if (!a.ok) return a.error
  const out = []
  for (const r of a.seasons) {
    if (r.status === 'complete') {
      out.push(`${r.season}: champion ${who(r.champion)}, runner-up ${who(r.runnerUp)}, third ${who(r.third)}.`)
      const top = r.standings[0]
      if (top) out.push(`  Best regular season: ${top.teamName} ${top.wins}-${top.losses}${top.ties ? `-${top.ties}` : ''}, ${top.pointsFor} PF.`)
    } else if (r.status === 'in-progress') {
      out.push(`${r.season}: in progress — no champion yet.`)
    } else if (r.status === 'no-bracket') {
      out.push(`${r.season}: Sleeper has no playoff bracket for this season.`)
    } else {
      out.push(`${r.season}: bracket could not be read — champion unknown.`)
    }
  }
  if (a.titles?.length) {
    out.push(`Titles: ${a.titles.map(t => `${t.teamName} ${t.titles} (${t.seasons.join(', ')})`).join('; ')}.`)
  }
  a.notes.forEach(n => out.push(`Note: ${n}`))
  return out.join('\n')
}
