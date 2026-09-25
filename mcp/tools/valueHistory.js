// valueHistory.js — tool #13: "How has his value moved?"
//
// The fourth and last of the Actions-published static feeds the server reads
// (values-history.json, the rolling 90-day daily snapshot behind every
// sparkline in the app). Orchestration only: the series rule is
// `getValueSeries` / `getDatedValueSeries` (lifted out of useValueHistory's
// hook for this tool, equivalence proved on the live feed), the team line is
// The Edge's own `buildTeamValueSeries`, and the first→last/high/low summary
// is `summarizeValueSeries` — all in src/utils, so the phone and the chat draw
// the same line.
//
// ── ITS OWN TOOL, NOT A FIELD ON get_roster / get_player_news ─────────────
//
// Decided on cost and on question. Folding a series into get_roster would put
// an ~82KB wire fetch (260KB raw) behind every "what's on my team?" that never
// asked about the past, and 26 per-player 90-point series would blow its ~9KB
// bounded answer several times over. get_player_news answers "what happened",
// this answers "what did the market do about it" — a reader asks them
// separately, and a model that wants both calls both.
//
// ── "NOT ENOUGH HISTORY YET" IS AN ANSWER, NEVER A FLAT LINE ──────────────
//
// Under MIN_SPARKLINE_POINTS snapshots there is no series and no summary —
// `series: null`, the point count, and a sentence saying so. Never a flat line
// and never a 0: a flat line claims the market held, a 0 claims it collapsed,
// and both are claims about the world where the truth is a gap in our data.
// "Tracked with too few points" and "not tracked at all" are kept distinct.
//
// ── CLASS B ────────────────────────────────────────────────────────────────
//
// An unreadable feed answers `ok: true`, `available: false` with the player's
// (or team's) current value from the snapshot and a note — never an error and
// never "his value has not moved".

import { getTeamName } from '../../src/utils/teamName.js'
import { buildTeamValueSeries } from '../../src/utils/edgeBriefing.js'
import {
  MIN_SPARKLINE_POINTS, getDatedValueSeries, valueHistoryCoverage, sliceValueHistory, summarizeValueSeries,
} from '../../src/utils/valueHistory.js'
import { resolveTeam } from '../teams.js'
import { buildResolveAnswer } from './resolveAssets.js'

export const DEFAULT_MOVERS = 5
export const MAX_MOVERS = 15
export const MIN_DAYS = MIN_SPARKLINE_POINTS
export const MAX_DAYS = 90

export function buildValueHistoryAnswer(snapshot, feed, {
  player, team, days, limit = DEFAULT_MOVERS, defaultRosterId, myRosterId,
} = {}) {
  const { league } = snapshot
  if (!league) throw new Error('League state unavailable')

  const cap = Math.min(Math.max(1, Number(limit) || DEFAULT_MOVERS), MAX_MOVERS)
  const wantDays = days == null ? null : Math.min(Math.max(MIN_DAYS, Math.floor(Number(days)) || MAX_DAYS), MAX_DAYS)
  const history = feed?.available ? sliceValueHistory(feed.data, wantDays ?? Infinity) : null
  const window = history
    ? {
        requestedDays: wantDays,
        from: history.dates[0] ?? null,
        to: history.dates[history.dates.length - 1] ?? null,
        snapshots: history.dates.length,
      }
    : null

  const base = {
    ok: true,
    asOf: snapshot.asOf,
    available: !!feed?.available,
    feed: feed?.available ? { updatedAt: feed.updatedAt ?? null, ageHours: feed.ageHours ?? null } : null,
    window,
  }

  // ── One named player ────────────────────────────────────────────────────
  if (player) {
    const resolved = buildResolveAnswer(snapshot, { names: [player], includeFreeAgents: true })
    const first = resolved.results?.[0]
    if (!first?.match) {
      return {
        ...base,
        ok: false,
        error: first?.candidates?.length
          ? `"${player}" matches more than one player. Name which one you mean — this tool will not guess ` +
            'between two players and draw the wrong man\'s line.'
          : `No player matching "${player}" is in this league's universe.`,
        playerCandidates: (first?.candidates ?? []).map(c => ({
          sleeperId: c.sleeperId ?? c.id ?? null,
          name: c.name ?? null,
          position: c.position ?? null,
          nflTeam: c.nflTeam ?? null,
          ownerTeam: c.ownerTeam ?? null,
        })),
      }
    }
    const m = first.match
    if (m.kind === 'pick') {
      return {
        ...base, ok: false,
        error: 'The value-history feed tracks players, not draft picks. Name a player instead.',
      }
    }
    const id = String(m.sleeperId)
    const series = history ? getDatedValueSeries(history, id) : null
    const coverage = history ? valueHistoryCoverage(history, id) : { tracked: false, points: 0 }
    const status = !history ? 'unavailable'
      : series ? 'ok'
      : coverage.tracked ? 'not-enough-history'
      : 'untracked'
    return {
      ...base,
      scope: 'player',
      player: {
        sleeperId: id,
        name: m.name,
        position: m.position ?? null,
        nflTeam: m.nflTeam ?? null,
        // Rule 7: unpriced is null, never 0.
        currentValue: m.unranked ? null : (m.value ?? null),
        unranked: !!m.unranked,
        trend30Day: m.unranked ? null : (m.trend30Day ?? null),
        ownerTeam: m.ownerTeam ?? null,
        isYours: m.ownerRosterId != null && myRosterId != null && m.ownerRosterId === myRosterId,
      },
      history: {
        status,
        points: coverage.points,
        series,
        summary: summarizeValueSeries(series),
      },
      notes: playerNotes({ feed, status, coverage, name: m.name, unranked: !!m.unranked }),
    }
  }

  // ── A whole roster ──────────────────────────────────────────────────────
  const resolvedTeam = resolveTeam(league, team, defaultRosterId)
  if (resolvedTeam.error) {
    return { ...base, ok: false, error: resolvedTeam.error, candidates: resolvedTeam.candidates ?? [] }
  }
  const roster = resolvedTeam.roster
  const teamInfo = {
    rosterId: roster.rosterId,
    teamName: getTeamName(roster.owner),
    isYou: myRosterId != null && roster.rosterId === myRosterId,
  }

  const players = roster.players ?? []
  let withSeries = 0
  let tooFew = 0
  let untracked = 0
  const moverRows = []
  if (history) {
    players.forEach(p => {
      const s = getDatedValueSeries(history, p.sleeperId)
      if (!s) {
        if (valueHistoryCoverage(history, p.sleeperId).tracked) tooFew++
        else untracked++
        return
      }
      withSeries++
      const summary = summarizeValueSeries(s)
      moverRows.push({
        sleeperId: String(p.sleeperId),
        name: p.name ?? null,
        position: p.position ?? null,
        from: summary.first,
        to: summary.last,
        change: summary.change,
        changePct: summary.changePct,
      })
    })
  }
  const risersAll = moverRows.filter(r => r.change > 0).sort((a, b) => b.change - a.change)
  const fallersAll = moverRows.filter(r => r.change < 0).sort((a, b) => a.change - b.change)

  const sums = history ? buildTeamValueSeries(history, roster) : null
  const teamSeries = sums ? sums.map((value, i) => ({ date: history.dates[i] ?? null, value })) : null

  return {
    ...base,
    scope: 'team',
    team: teamInfo,
    teamHistory: {
      status: !history ? 'unavailable' : teamSeries ? 'ok' : 'not-enough-history',
      series: teamSeries,
      summary: summarizeValueSeries(teamSeries),
    },
    risers: risersAll.slice(0, cap),
    fallers: fallersAll.slice(0, cap),
    counts: {
      rostered: players.length,
      withSeries,
      tooFewPoints: tooFew,
      untracked,
      risers: risersAll.length,
      fallers: fallersAll.length,
      returnedPerDirection: cap,
    },
    notes: teamNotes({
      feed, hasSeries: !!teamSeries, tooFew, untracked, cap,
      truncated: risersAll.length > cap || fallersAll.length > cap,
    }),
  }
}

function feedNotes(feed) {
  if (feed?.available) return []
  return [
    `The value-history feed could not be read (${feed?.error ?? 'unknown error'}). This is a gap in OUR ` +
    'data, not a statement that nothing moved — the current FantasyCalc value above is live.',
  ]
}

function playerNotes({ feed, status, coverage, name, unranked }) {
  const notes = feedNotes(feed)
  if (status === 'not-enough-history') {
    notes.push(
      `${name} has ${coverage.points} daily snapshot(s) in this window — fewer than the ${MIN_SPARKLINE_POINTS} ` +
      'the app needs before it draws a line. Not enough history yet: this is NOT a flat line and NOT a zero.'
    )
  }
  if (status === 'untracked') {
    notes.push(
      `${name} has no row in the value-history feed. It tracks the top 500 players by current value ` +
      '(a player keeps his row until it is all-null), so an unranked or deep player is simply not recorded — ' +
      'no history is known, which is different from a value that did not move.'
    )
  }
  if (unranked) notes.push(`${name} is unranked by FantasyCalc today, so there is no current value (null, never 0).`)
  if (status === 'ok') {
    notes.push(
      'One point per UTC day from the values-history pipeline; missing days are skipped, not filled. The ' +
      'current value comes from the live FantasyCalc snapshot and can differ from the last point by up to a day.'
    )
  }
  return notes
}

function teamNotes({ feed, hasSeries, tooFew, untracked, cap, truncated }) {
  const notes = feedNotes(feed)
  if (feed?.available && !hasSeries) {
    notes.push(
      `Not enough history yet for a team line (the app needs ${MIN_SPARKLINE_POINTS} daily snapshots). ` +
      'Not a flat line and not a zero.'
    )
  }
  if (hasSeries) {
    notes.push(
      'The team line is TODAY\'S roster valued back through the window — exactly the line The Edge draws. ' +
      'A player acquired last week counts across the whole window, so this shows how the current roster\'s ' +
      'value moved, not what the team was worth on each date. Picks are not in the feed and are excluded. ' +
      'A missing day carries a player\'s last known value forward.'
    )
  }
  if (tooFew) notes.push(`${tooFew} rostered player(s) have too few snapshots in this window to count as a mover.`)
  if (untracked) notes.push(`${untracked} rostered player(s) are outside the feed's top-500 window, so no history is known for them.`)
  if (truncated) notes.push(`Showing the top ${cap} risers and fallers; counts carries the full totals.`)
  return notes
}

const fmt = n => (n == null ? '—' : Math.round(n).toLocaleString('en-US'))
const signed = n => (n == null ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`)
const pct = p => (p == null ? '' : ` (${p > 0 ? '+' : ''}${p}%)`)

export function renderValueHistoryText(a) {
  if (!a.ok) {
    const cands = a.playerCandidates ?? a.candidates ?? []
    const list = cands.length
      ? '\n' + cands.map(c => `  ${c.name ?? c.teamName}${c.position ? ` (${c.position}${c.nflTeam ? ` · ${c.nflTeam}` : ''})` : ''}${c.ownerTeam ? ` — ${c.ownerTeam}` : ''}${c.sleeperId ? ` [${c.sleeperId}]` : ''}`).join('\n')
      : ''
    return `${a.error}${list}`
  }
  const L = []
  L.push(a.window
    ? `Value history ${a.window.from} → ${a.window.to} (${a.window.snapshots} daily snapshots${a.feed?.ageHours != null ? `, feed published ${a.feed.ageHours}h ago` : ''})`
    : 'Value history unavailable')
  L.push('')
  if (a.scope === 'player') {
    const p = a.player
    L.push(`${p.name} (${p.position ?? '?'}${p.nflTeam ? ` · ${p.nflTeam}` : ''})${p.isYours ? ' — YOURS' : p.ownerTeam ? ` — ${p.ownerTeam}` : ' — free agent'}`)
    L.push(`  Current value ${fmt(p.currentValue)}${p.trend30Day != null ? ` · 30-day trend ${signed(p.trend30Day)}` : ''}`)
    const s = a.history.summary
    if (s) {
      L.push(`  ${s.first.date} ${fmt(s.first.value)} → ${s.last.date} ${fmt(s.last.value)}: ${signed(s.change)}${pct(s.changePct)}`)
      L.push(`  High ${fmt(s.high.value)} (${s.high.date}) · Low ${fmt(s.low.value)} (${s.low.date}) · ${s.points} points`)
    } else {
      L.push(`  No line: ${a.history.status === 'untracked' ? 'not tracked by the feed' : a.history.status === 'unavailable' ? 'feed unavailable' : `only ${a.history.points} snapshot(s) — not enough history yet`}`)
    }
  } else {
    L.push(`${a.team.teamName}${a.team.isYou ? ' (you)' : ''} — players only, today's roster`)
    const s = a.teamHistory.summary
    if (s) {
      L.push(`  ${s.first.date} ${fmt(s.first.value)} → ${s.last.date} ${fmt(s.last.value)}: ${signed(s.change)}${pct(s.changePct)}`)
      L.push(`  High ${fmt(s.high.value)} (${s.high.date}) · Low ${fmt(s.low.value)} (${s.low.date})`)
    } else {
      L.push('  No team line yet.')
    }
    const row = r => `  ${r.name} (${r.position ?? '?'}) ${fmt(r.from.value)} → ${fmt(r.to.value)}: ${signed(r.change)}${pct(r.changePct)}`
    if (a.risers.length) { L.push(''); L.push(`RISERS (${a.counts.risers})`); a.risers.forEach(r => L.push(row(r))) }
    if (a.fallers.length) { L.push(''); L.push(`FALLERS (${a.counts.fallers})`); a.fallers.forEach(r => L.push(row(r))) }
  }
  L.push('')
  ;(a.notes ?? []).forEach(n => L.push(`Note: ${n}`))
  return L.join('\n').trimEnd()
}
