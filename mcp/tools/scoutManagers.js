// scoutManagers.js — tool #11: "How does this manager trade, and how have I
// done?"
//
// MCP_DISCOVERY.md §5 deferred manager scouting to phase two as "the biggest
// fetch burst". It is Trade › Managers for the chat: a behavioural profile of
// every manager from every season of league history, plus my own report card.
//
// Orchestration only. Every number is `managerAnalysis.buildManagerProfiles`,
// the SAME function useManagerProfiles runs, fed the same three inputs — the
// current league state, the current season's transactions, and the walked
// history — so the phone and the chat cannot disagree about a ledger. The
// "at trade time" line is `managerAnalysis.tradeTimeTotals`, extracted from
// useTradeTimeValues for this tool.
//
// ── THE CONTRACT THIS TOOL EXISTS TO KEEP ───────────────────────────────
//
// "Has never traded" is a real, useful answer about a quiet manager. An outage
// produces the identical shape — an empty ledger. So the tool tracks exactly
// which seasons' transactions it READ, and:
//
//   - a season it could not read is named, and nobody is called a non-trader
//     over it ("no trades in the 3 seasons we could read");
//   - if it could read NO season at all, every trade and FAAB field is NULL and
//     `ledger.available` is false — never 0, never "No trades yet".
//
// Pinned by test from both directions, as partnerActivity's is: a failed feed
// never prints the claim, and a genuinely quiet manager still gets it.
//
// ── UNITS ───────────────────────────────────────────────────────────────
//
// FAAB is in BUDGETS, never dollars (CLAUDE.md Feature 11): this league's
// budget went $100 -> $1000 for 2026 and resets twice a league year, so a
// cross-season dollar total is a number in no unit. `budgetsCommitted` is a
// multiple (1.7 = one and seven-tenths budgets) and over 1 is normal.
//
// Values are HINDSIGHT — today's FantasyCalc prices — and a zero-value asset
// (FAAB, an unpriced player or pick) reports `value: null`, never a raw 0.

import { buildManagerProfiles, tradeTimeTotals } from '../../src/utils/managerAnalysis.js'
import { getTeamName } from '../../src/utils/teamName.js'
import { resolveTeam } from '../teams.js'

export const DEFAULT_TRADE_LIMIT = 10
export const MAX_TRADE_LIMIT = 40
const MAX_DRAFT_PICKS = 15
const MAX_MANAGERS = 32

const round = (x, d = 0) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d)
const iso = ms => (ms ? new Date(ms).toISOString() : null)

function assetRow(a) {
  return {
    type: a.type,
    id: a.type === 'player' ? a.id : (a.type === 'pick' ? a.pickKey : null),
    label: a.label,
    position: a.position ?? null,
    // Zero-value assets are unpriced (or FAAB, which counts 0 by rule) — null,
    // never a raw 0 that reads as "worthless".
    value: a.value > 0 ? a.value : null,
    approx: !!a.approx,
    flipped: !!a.flipped,
  }
}

export function buildScoutAnswer(snapshot, { history, transactions, tradeValues } = {}, {
  team, limit = DEFAULT_TRADE_LIMIT, defaultRosterId, myRosterId,
} = {}) {
  const { league, values } = snapshot
  if (!league) throw new Error('League state unavailable')

  let scoped = null
  if (team != null && team !== '') {
    const resolved = resolveTeam(league, team, defaultRosterId)
    if (!resolved.roster) return { ok: false, error: resolved.error, candidates: resolved.candidates ?? [] }
    scoped = resolved.roster
  }

  const currentSeason = String(league.leagueInfo?.season ?? snapshot.nflState?.season ?? '')
  const currentRead = !!transactions?.available
  const historyRead = !!history?.available
  const pastRead = historyRead ? (history.ledgerSeasons ?? []) : []
  const seasonsRead = [...(currentRead ? [currentSeason] : []), ...pastRead]
  const seasonsMissing = [
    ...(currentRead ? [] : [currentSeason]),
    ...(historyRead ? (history.failedSeasons ?? []) : ['every past season']),
  ]
  const ledgerAvailable = seasonsRead.length > 0
  const ledgerComplete = ledgerAvailable && seasonsMissing.length === 0

  const myOwnerId = league.allRosters.find(r => r.rosterId === myRosterId)?.owner?.user_id ?? null
  const analysis = buildManagerProfiles({
    history: historyRead ? history.history : { currentSeason, currentDrafts: [], pastSeasons: [] },
    currentLeague: {
      season: currentSeason,
      faabBudget: league.leagueInfo?.settings?.waiver_budget,
      allRosters: league.allRosters,
      transactions: currentRead ? transactions.transactions : [],
    },
    playerMap: values.playerMap,
    pickEntries: values.pickEntries,
    playerDB: snapshot.playerDB,
    myOwnerId,
  })

  const nameOf = ownerId => {
    const r = league.allRosters.find(x => x.owner?.user_id === ownerId)
    if (r) return getTeamName(r.owner)
    const u = analysis.userById?.[ownerId]
    return u ? getTeamName(u) : 'a former manager'
  }

  // The activity label the app prints is built for a complete ledger. Over a
  // partial or absent one, "No trades yet" is a claim we cannot make.
  const activityOf = p => {
    if (!ledgerAvailable) return null
    if (p.tradeCount === 0 && !ledgerComplete) {
      return `No trades in the ${seasonsRead.length} season${seasonsRead.length === 1 ? '' : 's'} we could read`
    }
    return p.activity
  }

  const archive = tradeValues?.available ? tradeValues.data : null
  const tradeRow = t => {
    const then = archive ? tradeTimeTotals(archive, t) : null
    return {
      txId: t.txId,
      season: t.season,
      week: t.week ?? null,
      date: iso(t.date),
      result: t.result,
      gotValue: t.gotValue,
      gaveValue: t.gaveValue,
      net: t.net,
      partners: t.partnerOwnerIds.map(nameOf),
      got: t.got.map(assetRow),
      gave: t.gave.map(assetRow),
      atTradeTime: then ? { got: then.gotThen, gave: then.gaveThen } : null,
    }
  }

  const summary = p => ({
    rosterId: p.rosterId,
    teamName: getTeamName(p.user),
    handle: p.user?.display_name || p.user?.username || null,
    isYou: p.isMe,
    seasonsActive: p.seasonsActive,
    record: p.record,
    activity: activityOf(p),
    trades: ledgerAvailable ? {
      count: p.tradeCount, wins: p.tradeWins, losses: p.tradeLosses, evens: p.tradeEvens,
      thisSeason: currentRead ? p.tradesThisSeason : null,
      netValue: p.netValue,
    } : null,
    tendencies: ledgerAvailable ? p.tendencies : [],
    faab: ledgerAvailable ? {
      budgetsCommitted: round(p.faab.budgetsCommitted, 2),
      claims: p.faab.claims,
      avgBidPct: round(p.faab.avgBidPct, 1),
      valuePerBudget: p.faab.valuePerBudget,
      faMoves: p.faab.faMoves,
    } : null,
    draft: historyRead ? {
      count: p.draft.count, hits: p.draft.hits, avgDelta: p.draft.avgDelta,
    } : null,
    vsMe: p.vsMe && ledgerAvailable ? { trades: p.vsMe.trades, myNet: p.vsMe.myNet } : null,
  })

  const profiles = analysis.profiles.slice(0, MAX_MANAGERS)
  const me = analysis.my
  const cap = Math.min(Math.max(1, Number(limit) || DEFAULT_TRADE_LIMIT), MAX_TRADE_LIMIT)

  const answer = {
    ok: true,
    asOf: snapshot.asOf,
    league: {
      leagueId: league.leagueId ?? null,
      name: league.leagueInfo?.name ?? null,
      season: currentSeason || null,
      teams: league.allRosters.length,
    },
    ledger: {
      available: ledgerAvailable,
      complete: ledgerComplete,
      seasonsRead,
      seasonsMissing,
      tradeTimeArchive: !!archive,
    },
    you: me ? {
      ...summary(me),
      strengths: ledgerAvailable ? analysis.insights.strengths : [],
      // buildMyInsights writes "You haven't completed a trade yet" off an empty
      // ledger. Over seasons we could not read that is the very claim this
      // tool must not make, so it is dropped rather than reworded.
      workOn: ledgerAvailable
        ? analysis.insights.workOn.filter(w => ledgerComplete || !/haven't completed a trade/.test(w))
        : [],
    } : null,
    // Sorted by trade activity, as Trade › Managers sorts its cards.
    managers: [...profiles]
      .sort((a, b) => b.tradeCount - a.tradeCount || b.netValue - a.netValue)
      .map(summary),
  }

  if (scoped) {
    const p = analysis.profiles.find(x => x.rosterId === scoped.rosterId)
    if (!p) {
      return { ...answer, ok: false, error: `${getTeamName(scoped.owner)} has no owner to profile.` }
    }
    const trades = ledgerAvailable ? p.trades.slice(0, cap).map(tradeRow) : []
    const withThen = trades.filter(t => t.atTradeTime).length
    answer.manager = {
      ...summary(p),
      tendencyDetail: ledgerAvailable ? {
        picksGot: p.tendencyDetail.picksGot,
        picksGave: p.tendencyDetail.picksGave,
        avgAgeGot: round(p.tendencyDetail.ageGot, 1),
        avgAgeGave: round(p.tendencyDetail.ageGave, 1),
        playersGotByPosition: p.tendencyDetail.posGot,
      } : null,
      biggestWin: ledgerAvailable && p.biggestWin ? tradeRow(p.biggestWin) : null,
      biggestLoss: ledgerAvailable && p.biggestLoss ? tradeRow(p.biggestLoss) : null,
      draftPicks: historyRead ? p.draft.picks.slice(0, MAX_DRAFT_PICKS).map(d => ({
        season: d.season,
        slotLabel: d.slotLabel,
        overall: d.overall,
        player: d.player.label,
        position: d.player.position ?? null,
        value: d.player.value > 0 ? d.player.value : null,
        slotsBeaten: d.delta,
        hit: d.hit,
      })) : [],
      tradeLedger: trades,
    }
    answer.counts = {
      trades: ledgerAvailable ? p.tradeCount : null,
      returned: trades.length,
      truncated: ledgerAvailable && p.tradeCount > trades.length,
      withTradeTimeValues: withThen,
      draftPicks: historyRead ? p.draft.count : null,
    }
  }

  answer.notes = buildNotes({ answer, history, transactions, tradeValues })
  return answer
}

function buildNotes({ answer, history, transactions, tradeValues }) {
  const notes = []
  const { ledger } = answer
  if (!ledger.available) {
    notes.push(
      'No season\'s transactions could be loaded, so every trade and FAAB field is null — this says NOTHING ' +
      'about whether anyone has traded. It is a gap in our data, not a fact about a manager.'
    )
  } else if (!ledger.complete) {
    notes.push(
      `Transactions from ${ledger.seasonsMissing.join(', ')} could not be loaded, so trade and FAAB totals cover ` +
      `${ledger.seasonsRead.join(', ')} only. Nobody is described as a non-trader over seasons we did not read.`
    )
  }
  ;(history?.notes ?? []).forEach(n => { if (!notes.includes(n)) notes.push(n) })
  ;(transactions?.notes ?? []).forEach(n => notes.push(n))
  notes.push(
    'Trades are graded in HINDSIGHT at today\'s FantasyCalc prices ("did it age well?"), win/loss beyond ±5% of ' +
    'the trade\'s size. A traded pick whose draft has happened is valued as the player it became; one that ' +
    'cannot be resolved is priced at its round median and marked approx. FAAB and unpriced assets count 0 and ' +
    'report value null.'
  )
  notes.push(
    'FAAB is counted in BUDGETS, never dollars: this league\'s budget went $100 → $1000 for 2026 and resets twice ' +
    'a league year, so budgetsCommitted above 1 is normal over several seasons. avgBidPct is the average single ' +
    'bid as a percent of its own season\'s budget.'
  )
  notes.push(
    'Tendencies describe the RECORD, not what a manager will accept: modelling trade behaviour was tested on ' +
    'this league\'s full 95-trade corpus and disconfirmed.'
  )
  if (answer.manager) {
    if (answer.counts.truncated) {
      notes.push(`Showing the ${answer.counts.returned} most recent of ${answer.counts.trades} trades; raise limit (max ${MAX_TRADE_LIMIT}) for more.`)
    }
    if (!tradeValues?.available) {
      notes.push(`The trade-time value archive could not be read (${tradeValues?.error ?? 'not loaded'}), so no "at trade time" line is shown.`)
    } else {
      notes.push(
        `${answer.counts.withTradeTimeValues} of ${answer.counts.returned} trades shown carry an "at trade time" ` +
        'total. The archive began 2026-06 and records a trade only when EVERY asset on it was priced that day ' +
        '(an unpriceable pick is archived as null, never 0), so a missing line is expected, not an error.'
      )
    }
  }
  return notes
}

// ── text ─────────────────────────────────────────────────────────────────

const signed = n => `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n)).toLocaleString()}`

function summaryLine(m) {
  const t = m.trades
  const trades = t ? `${t.count} trades (${t.wins}W-${t.losses}L-${t.evens}E, ${signed(t.netValue)})` : 'trades unknown'
  const faab = m.faab ? `FAAB ${m.faab.budgetsCommitted}× budgets` : 'FAAB unknown'
  const tend = m.tendencies.length ? ` · ${m.tendencies.join(', ')}` : ''
  return `${m.teamName}${m.isYou ? ' (you)' : ''}: ${m.activity ?? 'activity unknown'} · ${trades} · ${faab}${tend}`
}

export function renderScoutText(a) {
  if (!a.ok) {
    const c = a.candidates?.length ? `\nTeams: ${a.candidates.map(x => x.teamName).join('; ')}` : ''
    return `${a.error}${c}`
  }
  const out = []
  out.push(`Manager scouting — seasons read: ${a.ledger.seasonsRead.join(', ') || 'none'}` +
    (a.ledger.seasonsMissing.length ? ` (missing: ${a.ledger.seasonsMissing.join(', ')})` : ''))
  if (a.manager) {
    const m = a.manager
    out.push(summaryLine(m))
    if (m.vsMe) out.push(`Vs you: ${m.vsMe.trades} trades, your net ${signed(m.vsMe.myNet)}.`)
    if (m.draft) out.push(`Rookie drafting: ${m.draft.hits} of ${m.draft.count} picks now worth 1,000+, avg ${m.draft.avgDelta >= 0 ? '+' : ''}${m.draft.avgDelta} slots vs value rank.`)
    m.tradeLedger.forEach(t => {
      const then = t.atTradeTime ? ` · at trade time ${t.atTradeTime.got.toLocaleString()} ⇄ ${t.atTradeTime.gave.toLocaleString()}` : ''
      out.push(`  ${t.season} wk${t.week ?? '?'} ${t.result.toUpperCase()} ${signed(t.net)} with ${t.partners.join(', ')}: ` +
        `got ${t.got.map(x => x.label).join(', ') || '—'} / gave ${t.gave.map(x => x.label).join(', ') || '—'}${then}`)
    })
  } else {
    if (a.you) {
      out.push(summaryLine(a.you))
      a.you.strengths.forEach(s => out.push(`  + ${s}`))
      a.you.workOn.forEach(s => out.push(`  − ${s}`))
    }
    a.managers.filter(m => !m.isYou).forEach(m => out.push(`  ${summaryLine(m)}`))
  }
  a.notes.forEach(n => out.push(`Note: ${n}`))
  return out.join('\n')
}
