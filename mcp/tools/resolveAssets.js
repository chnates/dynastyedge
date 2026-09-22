// resolveAssets.js — tool #4: "Which Bijan?"
//
// MCP_DISCOVERY.md §1, the decision this whole tool exists to serve:
//
//   "resolve_assets first, then grade on IDs only — costs a round-trip;
//    makes grading the wrong player structurally impossible."
//
// It is support infrastructure, and it comes BEFORE analyze_trade because
// analyze_trade refuses free text. A name is ambiguous ("Josh Allen" is a QB
// and a linebacker; two Mike Williamses have been rostered in this league's
// lifetime), and an LLM that guesses will guess fluently. The round-trip is
// the price of never grading the wrong player.
//
// It resolves PLAYERS and PICKS. A pick is a tradable asset with a real
// FantasyCalc price, and "my 2027 1st" is exactly the sort of phrase a person
// types into a trade, so refusing to resolve it would push the caller back
// into free text for half of every offer.

import { getTeamName } from '../../src/utils/teamName.js'
import { findPickValue, findExactSlotValue } from '../../src/utils/pickCapital.js'

// Bounded output (§7): a two-letter query would otherwise match hundreds.
export const MAX_CANDIDATES_PER_QUERY = 12
export const MAX_QUERIES = 20
const MIN_QUERY_LENGTH = 2

// Same normalization the app's global search uses: fold case, strip
// punctuation and suffixes so "A.J. Brown", "AJ Brown" and "aj brown" are one
// key. Never used to AUTO-PICK a match — only to find candidates. Exported so
// research_rookies searches the rookie class on exactly the same key.
export function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[.'’-]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// "2027 1st", "2027 first", "2027 1.05", "2026 round 2" → { season, round, slot }
const PICK_RE = /^(20\d{2})\s*(?:(\d)(?:st|nd|rd|th)?\b|round\s*(\d)|(\d)\.(\d{1,2}))/i
const WORD_ROUND = { first: 1, second: 2, third: 3, fourth: 4 }

function parsePickQuery(raw) {
  const q = String(raw).trim().toLowerCase()
  const m = q.match(PICK_RE)
  if (m) {
    const round = Number(m[2] ?? m[3] ?? m[4])
    const slot = m[5] ? Number(m[5]) : null
    if (round >= 1 && round <= 6) return { season: m[1], round, slot }
  }
  const w = q.match(/^(20\d{2})\s*(first|second|third|fourth)\b/)
  if (w) return { season: w[1], round: WORD_ROUND[w[2]], slot: null }
  return null
}

export function buildResolveAnswer(snapshot, { names, includeFreeAgents = true } = {}) {
  const { league, values } = snapshot
  if (!league) throw new Error('League state unavailable')

  const queries = (Array.isArray(names) ? names : [names])
    .filter(n => n != null && String(n).trim() !== '')
    .map(String)

  if (!queries.length) {
    return { ok: false, error: 'Pass at least one name to resolve.', results: [] }
  }
  const truncatedQueries = queries.length > MAX_QUERIES
  const used = queries.slice(0, MAX_QUERIES)

  // Who owns whom, so every candidate can say where it already sits — the
  // fact that decides whether an asset is even tradable in the direction the
  // caller wants.
  const ownerByPlayer = new Map()
  league.allRosters.forEach(r => {
    r.players.forEach(p => ownerByPlayer.set(String(p.sleeperId), r))
  })

  // The searchable universe: every rostered player (so unranked deep stashes
  // and defenses are findable — rule 7 applies to search too), plus, when
  // asked for, every FantasyCalc-priced free agent.
  const universe = []
  league.allRosters.forEach(r => {
    r.players.forEach(p => universe.push({ p, roster: r }))
  })
  if (includeFreeAgents) {
    Object.values(values.playerMap).forEach(p => {
      if (!ownerByPlayer.has(String(p.sleeperId))) universe.push({ p, roster: null })
    })
  }

  const results = used.map(q => resolveOne(q, { universe, league, values }))

  return {
    ok: true,
    asOf: snapshot.asOf,
    league: {
      leagueId: league.leagueId,
      name: league.leagueInfo?.name ?? null,
      season: snapshot.nflState?.season ?? null,
      teams: league.allRosters.length,
    },
    results,
    counts: {
      queries: used.length,
      resolved: results.filter(r => r.match).length,
      ambiguous: results.filter(r => !r.match && r.candidates.length > 1).length,
      unmatched: results.filter(r => !r.match && r.candidates.length === 0).length,
    },
    notes: buildNotes(snapshot, results, truncatedQueries, queries.length),
  }
}

function resolveOne(query, { universe, league, values }) {
  const raw = query.trim()

  // A bare numeric id is already resolved — echo it back with its facts so a
  // caller can round-trip an id it already holds.
  if (/^\d+$/.test(raw)) {
    const hit = universe.find(u => String(u.p.sleeperId) === raw)
    return hit
      ? { query: raw, kind: 'player', match: describePlayer(hit), candidates: [describePlayer(hit)], reason: 'Exact Sleeper id.' }
      : { query: raw, kind: 'player', match: null, candidates: [],
        reason: `No player with Sleeper id ${raw} is rostered in this league or priced by FantasyCalc.` }
  }

  const pick = parsePickQuery(raw)
  if (pick) return resolvePick(raw, pick, league, values)

  if (normalize(raw).length < MIN_QUERY_LENGTH) {
    return { query: raw, kind: 'player', match: null, candidates: [],
      reason: `"${raw}" is too short to search on — give at least ${MIN_QUERY_LENGTH} characters.` }
  }

  const q = normalize(raw)
  const scored = universe
    .map(u => ({ u, key: normalize(u.p.name) }))
    .filter(x => x.key)

  const exact = scored.filter(x => x.key === q)
  // A surname alone ("Bijan", "Chase") is the common case, so a word-boundary
  // match outranks a mid-word substring.
  const startsWord = scored.filter(x => x.key !== q && new RegExp(`\\b${escapeRe(q)}`).test(x.key))
  const contains = scored.filter(x => x.key !== q && !startsWord.includes(x) && x.key.includes(q))

  const tier = exact.length ? exact : startsWord.length ? startsWord : contains
  const candidates = tier
    .map(x => describePlayer(x.u))
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || a.name.localeCompare(b.name))

  const truncated = candidates.length > MAX_CANDIDATES_PER_QUERY
  const shown = candidates.slice(0, MAX_CANDIDATES_PER_QUERY)

  // THE RULE: one candidate resolves; anything else returns the list and no
  // match. It never picks the highest-valued of two — that is precisely the
  // confident wrong answer this tool exists to prevent.
  return {
    query: raw,
    kind: 'player',
    match: candidates.length === 1 ? candidates[0] : null,
    candidates: shown,
    truncated,
    totalCandidates: candidates.length,
    reason: candidates.length === 1
      ? 'Unique match.'
      : candidates.length === 0
        ? `No player matching "${raw}" is rostered in this league or priced by FantasyCalc.`
        : `"${raw}" matches ${candidates.length} players — pass the sleeperId of the one you mean.`,
  }
}

function resolvePick(raw, { season, round, slot }, league, values) {
  // Which rosters own a pick answering this description. The asset a trade
  // needs is a specific team's pick, so an unqualified "2027 1st" is
  // ambiguous by ten and says so.
  const owners = []
  league.allRosters.forEach(r => {
    r.picks.forEach(pk => {
      if (String(pk.season) !== String(season) || pk.round !== round) return
      if (slot != null && pk.slot !== slot) return
      owners.push({ roster: r, pick: pk })
    })
  })

  const candidates = owners.map(({ roster, pick }) => ({
    kind: 'pick',
    type: 'pick',
    // EXACTLY the id TradeAnalyzer.jsx:38 builds, so an id resolved here
    // round-trips into analyze_trade and dedupes against the app's own assets.
    id: `${pick.season}-${pick.round}-${pick.originalOwner}`,
    season: String(pick.season),
    round: pick.round,
    slot: pick.slot ?? null,
    slotLabel: pick.slotLabel ?? null,
    name: pick.slotLabel ? `${pick.season} ${pick.slotLabel}` : `${pick.season} round ${pick.round}`,
    value: pick.value || null,
    pricing: pick.slotLabel ? 'exact-slot' : 'round-median',
    ownerRosterId: roster.rosterId,
    ownerTeam: getTeamName(roster.owner),
    originalOwnerRosterId: pick.originalOwner,
    originalOwnerTeam: pick.originalOwner === roster.rosterId ? null : getTeamName(league.userMap[pick.originalOwner]),
  }))
    .sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99) || a.ownerRosterId - b.ownerRosterId)

  // The market price of such a pick, even when nobody in this league holds
  // one — useful context, never a substitute for a real owned asset.
  // findExactSlotValue already falls back to the round median internally, so
  // one call covers both the slot-known and slot-unknown cases.
  const marketValue = slot != null
    ? findExactSlotValue({ season, round, slot }, values.pickEntries)
    : findPickValue({ season, round }, values.pickEntries)

  return {
    query: raw,
    kind: 'pick',
    parsed: { season: String(season), round, slot },
    marketValue: marketValue || null,
    match: candidates.length === 1 ? candidates[0] : null,
    candidates: candidates.slice(0, MAX_CANDIDATES_PER_QUERY),
    truncated: candidates.length > MAX_CANDIDATES_PER_QUERY,
    totalCandidates: candidates.length,
    reason: candidates.length === 1
      ? 'Unique match.'
      : candidates.length === 0
        ? `No team in this league owns a ${season} round ${round}${slot != null ? ` pick at slot ${slot}` : ''} pick. ` +
          'It may already have been spent, or the season may be outside the tradable three-year window.'
        : `${candidates.length} teams own a ${season} round ${round} pick — say whose, or pass the exact slot.`,
  }
}

function describePlayer({ p, roster }) {
  return {
    kind: 'player',
    type: 'player',
    sleeperId: String(p.sleeperId),
    name: p.name,
    position: p.position,
    nflTeam: p.team || null,
    age: p.age ?? null,
    // Rule 7: unpriced is null with a flag, never 0.
    value: p.unranked ? null : (p.value ?? null),
    unranked: !!p.unranked,
    overallRank: p.overallRank ?? null,
    positionRank: p.positionRank ?? null,
    trend30Day: p.trend30Day ?? 0,
    ownerRosterId: roster?.rosterId ?? null,
    ownerTeam: roster ? getTeamName(roster.owner) : null,
    isFreeAgent: !roster,
  }
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function buildNotes(snapshot, results, truncatedQueries, total) {
  const notes = []
  if (snapshot.asOf.stale) {
    notes.push('At least one source failed to refresh, so this is cached data — see asOf.sources.')
  }
  if (truncatedQueries) {
    notes.push(`Only the first ${MAX_QUERIES} of ${total} names were resolved.`)
  }
  const ambiguous = results.filter(r => !r.match && r.candidates.length > 1)
  if (ambiguous.length) {
    notes.push(
      `${ambiguous.length} name(s) matched more than one asset and were NOT resolved. ` +
      'Pick one from `candidates` and pass its sleeperId (or pick id) — this tool never guesses between matches, ' +
      'because grading the wrong player is the error the resolve step exists to make impossible.'
    )
  }
  if (!snapshot.counts.playerDBEntries) {
    notes.push(
      'Sleeper\'s player DB did not load, so rostered players FantasyCalc does not rank are not searchable right now.'
    )
  }
  notes.push('Pass the resolved ids to analyze_trade — it accepts ids only, never names.')
  return notes
}

const num = n => (n == null ? '—' : n.toLocaleString('en-US'))

export function renderResolveText(a) {
  if (!a.ok) return a.error
  const L = []
  L.push(`Resolved ${a.counts.resolved} of ${a.counts.queries} — ${a.counts.ambiguous} ambiguous, ${a.counts.unmatched} unmatched`)
  L.push(`As of ${a.asOf.oldestSourceAt ?? 'unknown'}${a.asOf.stale ? ' — STALE' : ''}`)
  L.push('')
  a.results.forEach(r => {
    L.push(`"${r.query}" — ${r.reason}`)
    const rows = r.match ? [r.match] : r.candidates
    rows.forEach(c => {
      if (c.kind === 'pick') {
        L.push(`  ${c.id}  ${c.name} — ${num(c.value)}${c.pricing === 'round-median' ? ' ≈' : ''} · owned by ${c.ownerTeam}`)
      } else {
        const own = c.isFreeAgent ? 'FREE AGENT' : c.ownerTeam
        L.push(`  ${c.sleeperId.padEnd(8)} ${c.name} (${c.position}${c.nflTeam ? ` · ${c.nflTeam}` : ''}) — ${num(c.value)}${c.unranked ? ' [unranked]' : ''} · ${own}`)
      }
    })
    if (r.truncated) L.push(`  … ${r.totalCandidates - r.candidates.length} more not shown`)
    L.push('')
  })
  a.notes.forEach(n => L.push(`Note: ${n}`))
  return L.join('\n').trimEnd()
}
