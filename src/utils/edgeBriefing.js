import {
  computeLeagueAverages,
  getPositionalDeltas,
  assignWinWindowTiers,
} from './rosterAnalysis'
import { getTeamName } from '../hooks/useLeague'
import { getDeadlineVerdict } from './playoffOdds'
import { buildAgeCurves, buildRosterTrajectory, getTrajectoryRead } from './dynastyTrajectory'
import { recommendFreeAgents } from './recommendations'
import { MIN_SPARKLINE_POINTS } from '../hooks/useValueHistory'
import { POSITIONS, MY_ROSTER_ID } from '../constants'

// The Edge's assistant-GM logic: turn everything the app already caches into
// a small set of prioritized, actionable briefing items. Pure functions —
// all data arrives resolved, nothing here fetches.

const TREND_THRESHOLD = 50
const MIN_TARGET_VALUE = 1000
const MAX_BRIEFING_ITEMS = 5

// Same shape as MarketMovers' TrendChip math: % vs the value 30 days ago.
export function trendPct(trend, value) {
  const baseline = (value ?? 0) - trend
  return baseline > 0 ? Math.round((trend / baseline) * 100) : null
}

// ── Derived market / league signals ─────────────────────────────────────────

export function computeEdgeSignals({ league, values, watchlist, nflState }) {
  if (!league?.myRoster || !values?.playerMap) return null

  const { allRosters, myRoster } = league

  const tiers = assignWinWindowTiers(allRosters)
  const leagueAverages = computeLeagueAverages(allRosters)
  const myDeltas = getPositionalDeltas(myRoster, leagueAverages)
  const myDeficits = POSITIONS.filter(pos => (myDeltas[pos] ?? 0) < 0)
  const mySurpluses = POSITIONS.filter(pos => (myDeltas[pos] ?? 0) > 0)

  const byValue = [...allRosters].sort((a, b) => b.totalValue - a.totalValue)
  const valueRank = byValue.findIndex(r => r.rosterId === MY_ROSTER_ID) + 1

  const ownerByPlayer = {}
  allRosters.forEach(r => {
    r.players.forEach(p => { ownerByPlayer[p.sleeperId] = r })
  })

  // Best buy-low window: falling player at one of my deficit positions,
  // not mine. A rebuilding owner makes it prime.
  const buyLow = Object.values(values.playerMap)
    .filter(p =>
      p.trend30Day < -TREND_THRESHOLD &&
      p.value >= MIN_TARGET_VALUE &&
      myDeficits.includes(p.position) &&
      ownerByPlayer[p.sleeperId]?.rosterId !== MY_ROSTER_ID
    )
    .map(p => ({
      ...p,
      ownerRoster: ownerByPlayer[p.sleeperId] ?? null,
      ownerTier: ownerByPlayer[p.sleeperId] ? tiers[ownerByPlayer[p.sleeperId].rosterId] : null,
    }))
    .sort((a, b) => a.trend30Day - b.trend30Day)[0] ?? null

  // Best sell-high: my biggest riser at a surplus position.
  const sellHigh = myRoster.players
    .filter(p =>
      p.trend30Day > TREND_THRESHOLD &&
      p.value >= MIN_TARGET_VALUE &&
      mySurpluses.includes(p.position)
    )
    .sort((a, b) => b.trend30Day - a.trend30Day)[0] ?? null

  // Market radar rows: watchlist movers first, then my roster's movers.
  const watchSet = new Set(watchlist.map(String))
  const myIds = new Set(myRoster.players.map(p => p.sleeperId))
  const watchMovers = Object.values(values.playerMap)
    .filter(p => watchSet.has(String(p.sleeperId)) && p.trend30Day !== 0)
    .sort((a, b) => Math.abs(b.trend30Day) - Math.abs(a.trend30Day))
  const myMovers = myRoster.players
    .filter(p => Math.abs(p.trend30Day ?? 0) > TREND_THRESHOLD && !p.unranked)
    .sort((a, b) => Math.abs(b.trend30Day) - Math.abs(a.trend30Day))

  const radar = []
  const radarSeen = new Set()
  ;[...watchMovers, ...myMovers].forEach(p => {
    const id = String(p.sleeperId)
    if (radarSeen.has(id)) return
    radarSeen.add(id)
    radar.push({
      ...p,
      ownerRoster: ownerByPlayer[id] ?? null,
      isWatched: watchSet.has(id),
      isMine: myIds.has(id),
    })
  })

  // Biggest underperformer: roster-value rank far ahead of record rank —
  // a frustrated owner is a buy window. Same ≥4-place gap as League Overview.
  const anyRecords = allRosters.some(
    r => (r.record?.wins ?? 0) + (r.record?.losses ?? 0) + (r.record?.ties ?? 0) > 0
  )
  let underperformer = null
  if (anyRecords) {
    const byRecord = [...allRosters].sort((a, b) => {
      const winDiff = (b.record?.wins ?? 0) - (a.record?.wins ?? 0)
      return winDiff !== 0 ? winDiff : (b.pointsFor ?? 0) - (a.pointsFor ?? 0)
    })
    const recordRank = {}
    byRecord.forEach((r, i) => { recordRank[r.rosterId] = i })
    let biggestGap = 3
    byValue.forEach((r, valueIdx) => {
      const gap = recordRank[r.rosterId] - valueIdx
      if (r.rosterId !== MY_ROSTER_ID && gap > biggestGap) {
        biggestGap = gap
        underperformer = r
      }
    })
  }

  // Closing-window opponent: a strong-now team whose projected value is sliding
  // (Dynasty Trajectory model) — motivated to move win-now talent before it
  // depreciates. Pick the most valuable such team, since they have the most to
  // pry loose. Zero extra fetch — reuses the cached FantasyCalc pool.
  let closingWindow = null
  if (values?.playerMap) {
    const { curves, generic } = buildAgeCurves(values.playerMap)
    const season = Number(nflState?.season) || new Date().getFullYear()
    const declining = allRosters
      .filter(r => r.rosterId !== MY_ROSTER_ID)
      .map(r => ({ roster: r, read: getTrajectoryRead(buildRosterTrajectory(r, season, curves, generic)) }))
      .filter(x => x.read?.direction === 'declining')
      .sort((a, b) => b.roster.totalValue - a.roster.totalValue)
    closingWindow = declining[0] ?? null
  }

  // Best free-agent pickup: the top recommendation that actually moves my
  // roster (fills a need / upgrades depth / rising), from the same engine the
  // Free Agents tab uses. Zero extra fetch — the FA pool is the cached pool
  // minus rostered players.
  const rosteredIds = new Set()
  allRosters.forEach(r => r.players.forEach(p => rosteredIds.add(String(p.sleeperId))))
  const freeAgents = Object.values(values.playerMap).filter(p =>
    !rosteredIds.has(String(p.sleeperId)) &&
    POSITIONS.includes(p.position) &&
    (p.value ?? 0) > 0
  )
  const topPickup = recommendFreeAgents(freeAgents, myRoster, allRosters, { limit: 1 })[0] ?? null

  const playerValue = myRoster.players.reduce((s, p) => s + (p.value ?? 0), 0)
  const teamTrend = Math.round(
    myRoster.players.reduce((s, p) => s + (p.trend30Day ?? 0), 0)
  )

  const tierCounts = { Contending: 0, Middle: 0, Rebuilding: 0 }
  Object.values(tiers).forEach(t => { tierCounts[t] = (tierCounts[t] ?? 0) + 1 })

  return {
    tiers,
    myTier: tiers[MY_ROSTER_ID] ?? 'Middle',
    tierCounts,
    valueRank,
    myDeficits,
    mySurpluses,
    buyLow,
    sellHigh,
    topPickup,
    radar,
    underperformer,
    closingWindow,
    anyRecords,
    teamTrend,
    playerValue,
  }
}

// ── Briefing items ───────────────────────────────────────────────────────────
// Each item: { id, icon, tone, title, body, action }
//   action: { type: 'route', to, state? } | { type: 'player', player }
//   tone:   'accent' | 'success' | 'warning'

export function buildBriefing({
  signals, transactions, lastVisit, draft,
  isOffseason, nflState, tradeDeadline, myPlayoffPct = null,
}) {
  if (!signals) return []
  const items = []

  // Tone for The Edge's constrained palette (accent / success / warning).
  const ODDS_BRIEFING_TONE = { Buyer: 'success', 'On the bubble': 'warning', Seller: 'warning' }

  // 1. Live rookie draft — nothing outranks being on the clock.
  const draftStatus = draft?.status ?? null
  if (draftStatus === 'drafting' || draftStatus === 'paused') {
    items.push({
      id: 'draft-live',
      icon: 'draft',
      tone: 'warning',
      title: draftStatus === 'paused' ? 'Rookie draft is paused' : 'Rookie draft is LIVE',
      body: 'Open the tracker for the live pick feed and best-available board.',
      action: { type: 'route', to: '/draft/tracker' },
    })
  }

  // 2. Trade deadline urgency (in-season, ≤2 weeks out).
  if (!isOffseason && tradeDeadline && nflState?.week != null) {
    const weeksLeft = tradeDeadline - nflState.week
    if (weeksLeft >= 0 && weeksLeft <= 2) {
      items.push({
        id: 'deadline',
        icon: 'deadline',
        tone: 'warning',
        title: weeksLeft === 0
          ? 'Trade deadline is THIS WEEK'
          : `Trade deadline in ${weeksLeft} week${weeksLeft === 1 ? '' : 's'}`,
        body: 'Last call to fix roster gaps before the market closes.',
        action: { type: 'route', to: '/trade' },
      })
    }
  }

  // 2b. Playoff odds standing (in-season, once the sim has real odds). A
  //     buyer/seller call sourced from the same engine as League › Playoffs.
  if (myPlayoffPct != null) {
    const dv = getDeadlineVerdict(myPlayoffPct, signals.myTier)
    items.push({
      id: 'playoff-odds',
      icon: 'playoffs',
      tone: ODDS_BRIEFING_TONE[dv.stance] ?? 'accent',
      title: `Playoff odds: ${Math.round(myPlayoffPct * 100)}% · ${dv.stance}`,
      body: dv.text,
      action: { type: 'route', to: '/league/playoffs' },
    })
  }

  // 3. Upcoming rookie draft exists in Sleeper — prep window.
  if (draftStatus === 'pre_draft') {
    items.push({
      id: 'draft-prep',
      icon: 'draft',
      tone: 'accent',
      title: `${draft.season} rookie draft is on the books`,
      body: 'Review your board and pick strategy before the clock starts.',
      action: { type: 'route', to: '/draft/board' },
    })
  }

  // 4. League moves since the last visit.
  if (lastVisit && transactions?.length) {
    const fresh = transactions.filter(tx => (tx.status_updated ?? 0) > lastVisit)
    const freshTrades = fresh.filter(tx => tx.type === 'trade').length
    if (fresh.length > 0) {
      const tradePart = freshTrades > 0
        ? `${freshTrades} trade${freshTrades === 1 ? '' : 's'}`
        : null
      items.push({
        id: 'fresh-tx',
        icon: 'activity',
        tone: 'accent',
        title: `${fresh.length} move${fresh.length === 1 ? '' : 's'} since your last visit`,
        body: tradePart
          ? `Including ${tradePart} — see who's buying and who's selling.`
          : 'Waiver and free-agent churn around the league.',
        action: { type: 'route', to: '/league/activity' },
      })
    }
  }

  // 5. Best buy-low window.
  if (signals.buyLow) {
    const p = signals.buyLow
    const pct = trendPct(p.trend30Day, p.value)
    const rebuilding = p.ownerTier === 'Rebuilding'
    items.push({
      id: 'buy-low',
      icon: 'buy',
      tone: 'success',
      title: `Buy-low window: ${p.name}`,
      body: `Down ${Math.abs(Math.round(p.trend30Day))}${pct != null ? ` (${pct}%)` : ''} in 30 days and fills your ${p.position} gap` +
        (rebuilding ? ' — rebuilding owner, prime target.' : '.'),
      action: p.ownerRoster
        ? {
            type: 'route',
            to: '/trade/analyze',
            state: { opponentRosterId: p.ownerRoster.rosterId, whatsFairTarget: p },
          }
        : { type: 'player', player: p },
    })
  }

  // 6. Best sell-high candidate.
  if (signals.sellHigh) {
    const p = signals.sellHigh
    const pct = trendPct(p.trend30Day, p.value)
    items.push({
      id: 'sell-high',
      icon: 'sell',
      tone: 'success',
      title: `Sell-high candidate: ${p.name}`,
      body: `Up +${Math.round(p.trend30Day)}${pct != null ? ` (+${pct}%)` : ''} at a position of surplus — shop them while the market's hot.`,
      action: {
        type: 'route',
        to: '/trade/analyze',
        state: { preloadGivePlayer: p },
      },
    })
  }

  // 6b. Best free-agent pickup — a move you can make without a trade partner.
  if (signals.topPickup) {
    const { player, reasons } = signals.topPickup
    items.push({
      id: 'pickup',
      icon: 'pickup',
      tone: 'success',
      title: `Free-agent target: ${player.name}`,
      body: `${reasons.slice(0, 2).join(' · ')}. Available on the wire now.`,
      action: { type: 'route', to: '/roster/free-agents' },
    })
  }

  // 7. Biggest watchlist mover.
  const watchMover = signals.radar.find(
    p => p.isWatched && Math.abs(p.trend30Day ?? 0) > TREND_THRESHOLD
  )
  if (watchMover) {
    const rising = watchMover.trend30Day > 0
    const pct = trendPct(watchMover.trend30Day, watchMover.value)
    items.push({
      id: 'watch-mover',
      icon: 'watch',
      tone: 'accent',
      title: `Watchlist: ${watchMover.name} is ${rising ? 'rising' : 'falling'}`,
      body: `${rising ? '+' : ''}${Math.round(watchMover.trend30Day)}${pct != null ? ` (${pct > 0 ? '+' : ''}${pct}%)` : ''} over the last 30 days.`,
      action: { type: 'player', player: watchMover },
    })
  }

  // 8. Frustrated-owner watch: talent rank far ahead of record rank.
  if (signals.underperformer) {
    const r = signals.underperformer
    items.push({
      id: 'underperformer',
      icon: 'team',
      tone: 'accent',
      title: `${getTeamName(r.owner)} is underperforming`,
      body: `Their record trails their roster talent (${r.record.wins}-${r.record.losses}) — a frustrated owner is a buy window.`,
      action: { type: 'route', to: `/roster/teams/${r.rosterId}` },
    })
  }

  // 9. Closing-window opponent: a strong-now team whose multi-year value is
  //    sliding — likely to move win-now talent. Deep-links to their trajectory.
  if (signals.closingWindow) {
    const { roster, read } = signals.closingWindow
    items.push({
      id: 'closing-window',
      icon: 'trajectory',
      tone: 'accent',
      title: `${getTeamName(roster.owner)}'s window is closing`,
      body: `Their projected value peaks now and slides through ${read.lastSeason} — they may move win-now talent for picks or youth. Good time to call.`,
      action: { type: 'route', to: `/roster/trajectory/${roster.rosterId}` },
    })
  }

  return items.slice(0, MAX_BRIEFING_ITEMS)
}

// ── Assistant-GM greeting line ───────────────────────────────────────────────

export function buildGmLine({ briefingCount, newsCount, freshTxCount, isOffseason }) {
  const bits = []
  if (briefingCount > 0) {
    bits.push(`${briefingCount} item${briefingCount === 1 ? '' : 's'} on your desk`)
  }
  if (newsCount > 0) {
    bits.push(`${newsCount} headline${newsCount === 1 ? '' : 's'} on your players`)
  }
  if (freshTxCount > 0) {
    bits.push(`${freshTxCount} new league move${freshTxCount === 1 ? '' : 's'}`)
  }
  if (bits.length === 0) {
    return isOffseason
      ? 'Quiet offseason morning — nothing urgent. Your move, GM.'
      : 'All quiet — the market is calm and your roster is set. Your move, GM.'
  }
  return `${bits.join(' · ')}.`
}

// ── My-team value sparkline from the daily snapshot history ─────────────────
// Best-effort, decoration only: carry each player's last known value across
// missing days so the team line stays smooth; players with no history row
// simply don't contribute. Null when there's nothing drawable.

export function buildTeamValueSeries(history, roster) {
  if (!history?.dates || history.dates.length < MIN_SPARKLINE_POINTS || !roster) return null
  const rows = roster.players
    .map(p => history.players?.[String(p.sleeperId)])
    .filter(Array.isArray)
  if (rows.length === 0) return null

  const n = history.dates.length
  const sums = new Array(n).fill(0)
  rows.forEach(row => {
    const firstKnown = row.find(v => v != null) ?? 0
    let last = firstKnown
    for (let i = 0; i < n; i++) {
      if (row[i] != null) last = row[i]
      sums[i] += last
    }
  })
  return sums
}
