// THE briefing ledger policy — what The Edge's briefing would have told the
// owner on a given day, written down so it can be SCORED later against the
// moves that actually paid (open-items §0 #10, research-frontier Item 1).
//
// Pure and fetch-free, so `tests/briefingLedger.test.mjs` can pin it — the
// same split as newsRetention.mjs / sourceHealth.mjs. The script that fetches
// and writes is scripts/record-briefing.mjs.
//
// IT RUNS THE APP'S CODE, NEVER A COPY. Every claim recorded here is
// `computeEdgeSignals`' output and every slot is `buildBriefing`'s, imported
// from src/utils/edgeBriefing.js. This file only turns their objects into a
// stable, priced, null-safe record. A test scans it for the selection rules
// (the market-trend predicates, the pickup recommender, the trajectory model)
// and fails if one appears here: a
// recorder that re-derived the picks would be scoring its own opinion, not
// the app's.
//
// WHAT IS RECORDED: the five briefing items that make a CHECKABLE claim —
//   buy-low · sell-high · pickup · closing-window · underperformer
// — each with the player or team it named, the numbers it rested on, and a
// comparison group (the rest of the eligible pool / every team), because
// "did he go up?" proves nothing without "compared with what?". The scoring
// plan is fixed in docs/analysis/briefing-decision-quality-2026-10.md.
//
// WHAT A SERVER CANNOT SEE: the owner's watchlist, last visit and live playoff
// odds live on the phone. None of them changes WHO an item names — they only
// add cards (watch-mover, fresh-tx, playoff-odds) that can push a later item
// past the 5-card cut. So all five claims are recorded whether or not they
// would make the screen, and `slot` is the position among the items a server
// CAN build (null = not shown even then). We score the advice, not the layout.
//
// NULL, NEVER 0. A value the recorder could not read is null; a day it could
// not read at all is still written, as `status: 'unreadable'` with the reason.
// "The signal was quiet" (`fired: false`) and "we could not tell" are
// different statements, and a 0 would read as a price.

import { computeEdgeSignals, buildBriefing } from '../src/utils/edgeBriefing.js'
import { selectTrackedDraft } from '../src/utils/seasonWindow.js'
import { getTeamName } from '../src/utils/teamName.js'

export const LEDGER_VERSION = 1

// Comparison groups are bounded (true count beside): the eligible buy-low pool
// can run to dozens on a market-wide slide, and the scoring needs a sample of
// the pool, not all of it. 10 keeps a day ≈3–4KB.
export const MAX_CANDIDATES = 10

// The alarm fires when the newest RECORDED day is this many days behind today.
// The workflow is daily, so 2 means one missed run is tolerated (a GitHub cron
// hiccup) and the second is not — the same "persistent gap, never a blip"
// rule as sourceHealth.mjs.
export const MAX_LEDGER_LAG_DAYS = 2

// briefing item id → the ledger's key. Only these five are scored.
export const CHECKABLE_ITEMS = {
  'buy-low': 'buyLow',
  'sell-high': 'sellHigh',
  pickup: 'pickup',
  'closing-window': 'closingWindow',
  underperformer: 'underperformer',
}

export const LEDGER_ABOUT =
  'What The Edge briefing would have named each day, for later scoring ' +
  '(docs/analysis/briefing-decision-quality-2026-10.md). Recorded server-side: ' +
  'the watchlist, last visit and live playoff odds are not visible here, so ' +
  'slot is the position among server-buildable items only. null = could not ' +
  'read, never 0.'

// FantasyCalc never prices anyone at 0, so a non-positive or missing value is
// "no price" — the app's `unranked` players carry value 0 internally.
const priced = v => (Number.isFinite(v) && v > 0 ? Math.round(v) : null)
const num = v => (Number.isFinite(v) ? v : null)
const round = (v, dp) => (Number.isFinite(v) ? Number(v.toFixed(dp)) : null)

export function playerRow(p) {
  if (!p) return null
  const unranked = !!p.unranked || priced(p.value) == null
  return {
    sleeperId: p.sleeperId != null ? String(p.sleeperId) : null,
    name: p.name ?? null,
    position: p.position ?? null,
    nflTeam: p.team ?? null,
    age: round(p.age, 1),
    value: unranked ? null : priced(p.value),
    // A trend of 0 is a real reading for a priced player; an unpriced player
    // has no market, so no trend.
    trend30Day: unranked ? null : num(p.trend30Day),
    positionRank: num(p.positionRank),
    unranked,
  }
}

export function teamRow(roster, tiers) {
  if (!roster) return null
  return {
    rosterId: roster.rosterId ?? null,
    // owner_id, not roster id, is what follows a manager across seasons.
    ownerId: roster.owner?.user_id != null ? String(roster.owner.user_id) : null,
    teamName: getTeamName(roster.owner),
    tier: tiers?.[roster.rosterId] ?? null,
    totalValue: priced(roster.totalValue),
    record: roster.hasRecord ? { ...roster.record } : null,
  }
}

const bounded = (list, map) => ({
  count: list.length,
  rows: list.slice(0, MAX_CANDIDATES).map(map),
})

// One day's record. `snapshot` is mcp/snapshot.js's getSnapshot() result —
// the same league assembly every MCP tool reads (buildLeagueState inside).
//   codeVersion  the commit that produced the record (GITHUB_SHA in Actions).
//                A change to the briefing's rules starts a new regime, and the
//                scoring must be able to split the series at it.
export function recordBriefingDay({
  date, snapshot, myRosterId, recordedAt = new Date().toISOString(), codeVersion = null,
}) {
  const asOf = snapshot?.asOf?.sources ?? null
  const league = snapshot?.league ?? null
  if (!league?.myRoster || !snapshot?.values?.playerMap) {
    return unreadableDay({
      date, recordedAt, asOf, codeVersion,
      reason: !league
        ? 'league state could not be assembled'
        : !league.myRoster
          ? `roster ${myRosterId} is not in this league`
          : 'FantasyCalc values unavailable',
    })
  }

  const nflState = snapshot.nflState ?? null
  const signals = computeEdgeSignals({
    league, values: snapshot.values, watchlist: [], nflState, myRosterId,
  })
  if (!signals) {
    return unreadableDay({ date, recordedAt, asOf, codeVersion, reason: 'computeEdgeSignals returned nothing' })
  }

  // The briefing as a server can build it: no watchlist, no last visit, no
  // playoff odds (see the header).
  const items = buildBriefing({
    signals,
    transactions: null,
    lastVisit: null,
    draft: selectTrackedDraft(snapshot.drafts ?? [], league.pickYears?.[0]) ?? null,
    isOffseason: snapshot.isOffseason ?? nflState?.season_type !== 'regular',
    nflState,
    tradeDeadline: league.leagueInfo?.settings?.trade_deadline ?? null,
    myPlayoffPct: null,
  })
  const slots = {}
  items.forEach((item, i) => {
    if (CHECKABLE_ITEMS[item.id]) slots[CHECKABLE_ITEMS[item.id]] = i + 1
  })
  const slot = key => slots[key] ?? null
  const { tiers } = signals

  const ownerOf = p => p?.ownerRoster ?? null

  const buyLow = {
    fired: !!signals.buyLow,
    slot: slot('buyLow'),
    player: playerRow(signals.buyLow),
    owner: teamRow(ownerOf(signals.buyLow), tiers),
    candidates: bounded(signals.buyLowCandidates ?? [], p => ({
      ...playerRow(p), ownerRosterId: ownerOf(p)?.rosterId ?? null,
    })),
  }

  const sellHigh = {
    fired: !!signals.sellHigh,
    slot: slot('sellHigh'),
    player: playerRow(signals.sellHigh),
    candidates: bounded(signals.sellHighCandidates ?? [], playerRow),
  }

  const tp = signals.topPickup
  const pickup = {
    fired: !!tp,
    slot: slot('pickup'),
    player: playerRow(tp?.player),
    reasons: tp ? [...tp.reasons] : [],
    score: tp ? round(tp.score, 3) : null,
    // The same-position runners-up the pickup engine already carries — the
    // pickup claim's comparison group.
    alternatives: (tp?.alternatives ?? []).map(a => ({ ...playerRow(a.player), score: round(a.score, 3) })),
  }

  const trajRow = ({ roster, read }) => ({
    ...teamRow(roster, tiers),
    direction: read?.direction ?? null,
    threeYearChange: round(read?.pct, 4),
    peakSeason: read?.peakSeason ?? null,
    lastSeason: read?.lastSeason ?? null,
  })
  const closingWindow = {
    fired: !!signals.closingWindow,
    slot: slot('closingWindow'),
    team: signals.closingWindow ? trajRow(signals.closingWindow) : null,
    opponents: (signals.opponentTrajectories ?? []).map(trajRow),
  }

  const gapRow = g => ({
    ...teamRow(g.roster, tiers), valueRank: g.valueRank, recordRank: g.recordRank, gap: g.gap,
  })
  const underRoster = signals.underperformer
  const underperformer = {
    fired: !!underRoster,
    slot: slot('underperformer'),
    // No game played yet means the claim cannot be made — distinct from a
    // league where nobody is far enough off.
    gamesPlayed: !!signals.anyRecords,
    team: underRoster
      ? gapRow(signals.rankGaps.find(g => g.roster.rosterId === underRoster.rosterId))
      : null,
    teams: (signals.rankGaps ?? []).map(gapRow),
  }

  return {
    date,
    status: 'recorded',
    recordedAt,
    codeVersion,
    asOf,
    league: {
      season: nflState?.season != null ? String(nflState.season) : null,
      week: num(nflState?.week),
      seasonType: nflState?.season_type ?? null,
    },
    me: {
      rosterId: myRosterId,
      tier: signals.myTier ?? null,
      valueRank: num(signals.valueRank),
      deficits: [...signals.myDeficits],
      surpluses: [...signals.mySurpluses],
    },
    // What the briefing showed, in order, as far as a server can build it.
    briefing: items.map(item => item.id),
    items: { buyLow, sellHigh, pickup, closingWindow, underperformer },
  }
}

export function unreadableDay({
  date, recordedAt = new Date().toISOString(), asOf = null, codeVersion = null, reason,
}) {
  return {
    date, status: 'unreadable', reason: String(reason), recordedAt, codeVersion, asOf,
    league: null, me: null, briefing: null, items: null,
  }
}

// --- the ledger file --------------------------------------------------------

export function emptyLedger() {
  return { version: LEDGER_VERSION, about: LEDGER_ABOUT, updatedAt: null, days: [] }
}

export function isLedgerShape(doc) {
  return !!doc && typeof doc === 'object' && Array.isArray(doc.days)
}

// Append (or replace same-date) and keep date order. PERMANENT: nothing is
// ever pruned, because a day not kept can never be scored. A same-day re-run
// replaces that day — except that an unreadable re-run never overwrites a
// day already recorded (a later CDN blip must not erase a good read).
export function mergeLedgerDay(ledger, day) {
  const base = isLedgerShape(ledger) ? ledger : emptyLedger()
  const days = base.days.filter(d => d.date !== day.date)
  const existing = base.days.find(d => d.date === day.date)
  days.push(existing?.status === 'recorded' && day.status !== 'recorded' ? existing : day)
  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return { ...base, version: LEDGER_VERSION, about: LEDGER_ABOUT, updatedAt: day.recordedAt, days }
}

// --- the alarm ---------------------------------------------------------------

const dayNumber = iso => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86400000)

// How far the ledger lags `today` (UTC 'YYYY-MM-DD'). An unreadable day counts
// as a gap: it names the gap honestly, but it is still a day nobody can score.
export function assessLedger(ledger, today) {
  const days = isLedgerShape(ledger) ? ledger.days : []
  const recorded = days.filter(d => d.status === 'recorded')
  const newest = recorded.at(-1)?.date ?? null
  const lagDays = newest ? dayNumber(today) - dayNumber(newest) : null
  let unreadableRun = 0
  for (let i = days.length - 1; i >= 0 && days[i].status !== 'recorded'; i--) unreadableRun++
  return {
    days: days.length,
    recorded: recorded.length,
    newestRecorded: newest,
    lagDays,
    unreadableRun,
    stale: newest == null || lagDays >= MAX_LEDGER_LAG_DAYS,
  }
}
