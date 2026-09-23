// researchRookies.js — tool #10: "Which rookies become something, and which
// should I take?"
//
// MCP_DISCOVERY.md §5 deferred rookie research to phase two. Draft › Research
// answers the question a dynasty VALUE cannot — value prices consensus, not
// opportunity — and until now the server could only quote the value.
//
// Orchestration only. The board is `rookieResearch.buildRookieBoard`, the
// SAME composition Draft › Research and the profile drawer read through
// useRookieResearch (extracted from that hook for this tool, equivalence
// proved on live data). So the phone and the chat rank the class identically.
//
// ── ONE SCORE, NO SECOND AXIS ───────────────────────────────────────────
//
// The score returned is `dynastyOpportunityScore` — the back-tested year-1
// opportunity core (30% depth / 70% NFL draft capital, rho +0.664) with its
// small, measured youth tilt (CLAUDE.md Feature 19). Age at the draft and the
// combine drills ride along under `context` and are labelled as context:
// athleticism was a measured null, and a separate long-term score was tested
// twice and rejected. This tool does not reintroduce the axis the app removed.
//
// ── RULE 7, APPLIED TO A MODEL ──────────────────────────────────────────
//
// A rookie the feed carries no entry for gets `score: null`, never 0 —
// absence may be a feed gap, and a 0 would read as "no opportunity", which is
// a claim about a player made on no evidence. The same for `fit`. A rookie
// FantasyCalc does not price is `value: null` + `unranked: true`.
//
// ── CLASS B ─────────────────────────────────────────────────────────────
//
// rookie-intel.json is Actions-published (the second static feed this server
// reads). When it cannot be read the tool still answers `ok: true`, with
// `available: false`, every score null, and the board in dynasty-value order —
// exactly the degraded state Draft › Research renders. It is never an error
// and never an empty board: the rookie class comes from the player DB, not
// the feed, so "no rookies" would be false.

import { buildRookieBoard, topTargets, splitDivergence } from '../../src/utils/rookieResearch.js'
import { buildRookieMap } from '../../src/utils/rookieAdp.js'
import { getTeamName } from '../../src/utils/teamName.js'
import { resolveTeam } from '../teams.js'
import { normalize } from './resolveAssets.js'

export const DEFAULT_LIMIT = 12
export const MAX_LIMIT = 40
// Draft › Research's own shortlist depth and divergence caps, so this tool
// never returns more than the page shows.
const TARGETS = 4
const DIVERGENCE_LIMIT = 6
const DIVERGENCE_MIN_GAP = 5

const POSITIONS = ['QB', 'RB', 'WR', 'TE']
const SORTS = ['fit', 'score', 'value']

const pct = x => (x == null ? null : Math.round(x * 100))
const round3 = x => (x == null ? null : Math.round(x * 1000) / 1000)

function ownerIndex(league) {
  const byPlayer = new Map()
  league.allRosters.forEach(r => r.players.forEach(p => byPlayer.set(String(p.sleeperId), r)))
  return byPlayer
}

function rookieRow(r, owners, myRosterId) {
  const owner = owners.get(r.sleeperId) ?? null
  const priced = r.value != null && r.value > 0
  return {
    sleeperId: r.sleeperId,
    name: r.name,
    position: r.position ?? null,
    nflTeam: r.team || null,
    // Rule 7: an unpriced rookie is null + unranked, never 0.
    value: priced ? r.value : null,
    unranked: !priced,
    positionRank: priced ? (r.positionRank ?? null) : null,
    rookieAdp: r.adp ?? null,
    // THE score, 0-100 as the app shows it. Null without a feed entry.
    score: pct(r.score),
    scoreTier: r.tier ?? null,
    ageTilted: !!r.ageTilted,
    reasons: (r.reasons ?? []).map(x => x.text),
    depth: {
      rank: r.rank ?? null,
      read: r.depthText ?? null,
      campMove: r.move ?? null,
    },
    nflDraft: r.pick != null ? { round: r.round ?? null, pick: r.pick } : null,
    undrafted: !r.noData && r.pick == null,
    noFeedEntry: !!r.noData,
    // Within-position ranks; divergence > 0 = the model likes him more than
    // the market among rookies at his position.
    marketRank: r.marketRank ?? null,
    modelRank: r.modelRank ?? null,
    divergence: r.divergence ?? null,
    fit: round3(r.fit),
    fitReasons: r.fitReasons ?? [],
    fitsNeed: !!r.fitsNeed,
    ownerRosterId: owner?.rosterId ?? null,
    ownerTeam: owner ? getTeamName(owner.owner) : null,
    isYours: owner != null && owner.rosterId === myRosterId,
    isFreeAgent: owner == null,
    // DISPLAY ONLY. None of these reaches `score` or `fit` — CLAUDE.md
    // Feature 19 records the measured nulls. Age is the one exception, and it
    // is already inside `score` via the tilt; it is repeated here as a fact.
    context: {
      ageAtDraft: r.ageAtDraft ?? null,
      heightIn: r.height ?? null,
      weightLb: r.weight ?? null,
      forty: r.forty ?? null,
      vertical: r.vert ?? null,
      broadJump: r.broad ?? null,
    },
  }
}

function sortRows(rows, sort) {
  const byValue = (a, b) => (b.value ?? 0) - (a.value ?? 0)
  if (sort === 'value') return [...rows].sort(byValue)
  const key = sort === 'score' ? 'score' : 'fit'
  // Unscored rookies sort below every scored one, in value order — the app's
  // own tiebreak, and what keeps the board useful in the degraded state.
  return [...rows].sort((a, b) => {
    const av = a[key]; const bv = b[key]
    if (av == null && bv == null) return byValue(a, b)
    if (av == null) return 1
    if (bv == null) return -1
    return bv - av || byValue(a, b)
  })
}

function findRookie(rows, query) {
  const raw = String(query).trim()
  if (/^\d+$/.test(raw)) {
    const hit = rows.find(r => r.sleeperId === raw)
    return hit ? { match: hit } : { match: null, candidates: [] }
  }
  const q = normalize(raw)
  if (q.length < 2) return { match: null, candidates: [] }
  const keyed = rows.map(r => ({ r, key: normalize(r.name) }))
  const exact = keyed.filter(x => x.key === q)
  if (exact.length === 1) return { match: exact[0].r }
  const pool = exact.length > 1 ? exact : keyed.filter(x =>
    x.key.split(' ').some(w => w === q) || x.key.includes(q))
  if (pool.length === 1) return { match: pool[0].r }
  return { match: null, candidates: pool.map(x => x.r) }
}

export function buildRookieResearchAnswer(snapshot, intelFeed, {
  team, position, player, sort = 'fit', limit = DEFAULT_LIMIT, defaultRosterId, myRosterId,
} = {}) {
  const { league } = snapshot
  if (!league) throw new Error('League state unavailable')

  if (position != null && !POSITIONS.includes(String(position).toUpperCase())) {
    return {
      ok: false,
      error: `Rookie research covers ${POSITIONS.join(' / ')}. A defense is never a rookie and this ` +
        'league rosters no kicker.',
    }
  }
  const pos = position ? String(position).toUpperCase() : null
  const order = SORTS.includes(sort) ? sort : 'fit'

  const resolved = resolveTeam(league, team, defaultRosterId)
  if (!resolved.roster) {
    return { ok: false, error: resolved.error, candidates: resolved.candidates ?? [] }
  }
  const fitRoster = resolved.roster

  if (!snapshot.playerDB) {
    // The class is defined by the player DB, not by FantasyCalc and not by the
    // feed. Without it there is no honest list to return at all.
    return {
      ok: false,
      error: 'The Sleeper player DB did not load, and the rookie class is read from it — so there is ' +
        'no rookie list to rank. Retry with refresh: true.',
      asOf: snapshot.asOf,
    }
  }

  const available = !!intelFeed?.available
  const board = buildRookieBoard({
    rookieMap: buildRookieMap(snapshot.playerDB),
    playerMap: snapshot.values?.playerMap,
    intel: available ? intelFeed.data : null,
    // Roster fit is read for the requested team — the same fit the app reads
    // for "me", computed from that team's seat.
    league: { ...league, myRoster: fitRoster },
  })

  const owners = ownerIndex(league)
  const rows = board.rows.map(r => rookieRow(r, owners, myRosterId))
  const rowById = new Map(rows.map(r => [r.sleeperId, r]))
  const cap = Math.min(Math.max(1, Number(limit) || DEFAULT_LIMIT), MAX_LIMIT)

  const base = {
    ok: true,
    asOf: snapshot.asOf,
    available,
    feed: available
      ? { updatedAt: intelFeed.updatedAt, ageHours: intelFeed.ageHours, season: intelFeed.data?.season ?? null }
      : null,
    team: {
      rosterId: fitRoster.rosterId,
      teamName: getTeamName(fitRoster.owner),
      isYou: fitRoster.rosterId === myRosterId,
      deficits: [...board.deficits].sort(),
      winWindow: board.tier,
    },
  }

  const scored = rows.filter(r => r.score != null).length
  const counts = {
    rookieClass: rows.length,
    scored,
    noFeedEntry: rows.filter(r => r.noFeedEntry).length,
  }

  // ── One named rookie ────────────────────────────────────────────────────
  if (player) {
    const found = findRookie(board.rows, player)
    if (!found.match) {
      return {
        ...base,
        ok: false,
        error: found.candidates?.length
          ? `"${player}" matches ${found.candidates.length} rookies. Name which one — this tool will not ` +
            'guess between two players.'
          : `No rookie matching "${player}" in this year's class. Veterans are not on the rookie board.`,
        rookieCandidates: (found.candidates ?? []).slice(0, 12).map(r => ({
          sleeperId: r.sleeperId, name: r.name, position: r.position ?? null, nflTeam: r.team || null,
        })),
      }
    }
    return {
      ...base,
      scope: 'player',
      rookie: rowById.get(found.match.sleeperId),
      counts,
      notes: buildNotes({ available, intelFeed, scoped: 'player', row: rowById.get(found.match.sleeperId), base }),
    }
  }

  // ── The board ───────────────────────────────────────────────────────────
  const inPos = pos ? rows.filter(r => r.position === pos) : rows
  const sorted = sortRows(inPos, order)
  const returned = sorted.slice(0, cap)
  // Shortlist + divergence: the app's own helpers, over the position filter.
  const inPosIds = new Set(inPos.map(r => r.sleeperId))
  const boardInPos = board.rows.filter(r => inPosIds.has(r.sleeperId))
  const targets = topTargets(boardInPos, { limit: TARGETS }).map(r => rowById.get(r.sleeperId))
  const div = splitDivergence(boardInPos, { minGap: DIVERGENCE_MIN_GAP, limit: DIVERGENCE_LIMIT })

  return {
    ...base,
    scope: 'board',
    filter: { position: pos, sort: order },
    counts: { ...counts, matchingFilter: inPos.length, returned: returned.length, truncated: inPos.length > returned.length },
    targets,
    undervalued: div.undervalued.map(r => rowById.get(r.sleeperId)),
    overvalued: div.overvalued.map(r => rowById.get(r.sleeperId)),
    board: returned,
    notes: buildNotes({ available, intelFeed, scoped: 'board', inPos, returned, order, base }),
  }
}

function buildNotes({ available, intelFeed, scoped, row, inPos, returned, order, base }) {
  const notes = []
  if (!available) {
    notes.push(
      `The rookie intel feed could not be read (${intelFeed?.error ?? 'not loaded'}), so every opportunity ` +
      'score and fit is null — NOT zero — and the board is in dynasty-value order, the same state Draft › ' +
      'Research shows. This is a gap in our data, not a verdict on any rookie.'
    )
  } else if (intelFeed.ageHours != null && intelFeed.ageHours > 36) {
    notes.push(`The rookie intel feed was last published ${intelFeed.ageHours}h ago; it normally publishes daily.`)
  }
  notes.push(
    'score is the ONE opportunity score the app ships: 30% NFL depth-chart standing / 70% NFL draft capital ' +
    '(back-tested at Spearman +0.664 vs rookie-season points), tilted 10% toward youth within position. ' +
    'Everything under `context` (age at the draft, height, weight, combine drills) is display only and never ' +
    'moves a score — athleticism was tested and is a measured null.'
  )
  notes.push(
    'marketRank / modelRank / divergence are computed WITHIN POSITION: FantasyCalc already prices Superflex QB ' +
    'scarcity and the shallow TE pool, so a cross-position comparison would measure the two yardsticks rather ' +
    'than disagree about a player.'
  )
  notes.push(
    `fit ranks the class for ${base.team.teamName}: the score blended 55/45 with market price, plus bonuses for a ` +
    'position below league average, a 5+ spot model-over-market gap, and the win window. It is a judgement ' +
    'call layered on the back-tested score, never a change to it.'
  )
  if (scoped === 'board') {
    if (inPos.length > returned.length) {
      notes.push(`Showing the top ${returned.length} of ${inPos.length} by ${order}; raise limit (max ${MAX_LIMIT}) for more.`)
    }
  } else if (row?.noFeedEntry && available) {
    notes.push(`${row.name} has no entry in the rookie intel feed, so he is unscored — absence of feed data is not evidence of no opportunity.`)
  }
  return notes
}

// ── text ─────────────────────────────────────────────────────────────────

function line(r) {
  const val = r.value == null ? '—' : r.value.toLocaleString()
  const score = r.score == null ? 'unscored' : `${r.score}/100 ${r.scoreTier}`
  const cap = r.nflDraft ? `pick ${r.nflDraft.pick}` : (r.noFeedEntry ? 'no feed entry' : 'undrafted')
  const own = r.isYours ? ' · yours' : r.ownerTeam ? ` · ${r.ownerTeam}` : ' · free agent'
  return `${r.name} (${r.position}, ${r.nflTeam ?? 'FA'}) — ${score} · value ${val} · ${cap}` +
    `${r.depth.read ? ` · ${r.depth.read}` : ''}${own}`
}

export function renderRookieResearchText(a) {
  if (!a.ok) {
    const c = a.rookieCandidates?.length ? `\nCandidates: ${a.rookieCandidates.map(r => `${r.name} (${r.position}, ${r.sleeperId})`).join('; ')}` : ''
    const t = a.candidates?.length ? `\nTeams: ${a.candidates.map(x => x.teamName).join('; ')}` : ''
    return `${a.error}${c}${t}`
  }
  const out = []
  out.push(`Rookie research for ${a.team.teamName} — needs: ${a.team.deficits.join(', ') || 'none'}; window: ${a.team.winWindow ?? '—'}.`)
  if (!a.available) out.push('Rookie intel feed unavailable: scores are null, board in dynasty-value order.')
  if (a.scope === 'player') {
    const r = a.rookie
    out.push(line(r))
    if (r.reasons.length) out.push(`Why: ${r.reasons.join('; ')}.`)
    if (r.divergence != null) out.push(`Within ${r.position}s: market #${r.marketRank}, model #${r.modelRank} (${r.divergence >= 0 ? '+' : ''}${r.divergence}).`)
    if (r.fitReasons.length) out.push(`Fit: ${r.fitReasons.join('; ')}.`)
  } else {
    if (a.targets.length) {
      out.push('Targets:')
      a.targets.forEach(r => out.push(`  ${line(r)}${r.fitReasons.length ? ` — ${r.fitReasons.join('; ')}` : ''}`))
    }
    if (a.undervalued.length) out.push(`Model over market: ${a.undervalued.map(r => `${r.name} (+${r.divergence})`).join(', ')}.`)
    if (a.overvalued.length) out.push(`Market over model: ${a.overvalued.map(r => `${r.name} (${r.divergence})`).join(', ')}.`)
    out.push(`Board by ${a.filter.sort}${a.filter.position ? ` (${a.filter.position})` : ''}:`)
    a.board.forEach((r, i) => out.push(`  ${i + 1}. ${line(r)}`))
  }
  a.notes.forEach(n => out.push(`Note: ${n}`))
  return out.join('\n')
}
