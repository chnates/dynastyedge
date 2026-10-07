// faabBid.js — THE FAAB bid recommender (OPEN-3). Pure; one definition shared
// by League › Free Agents and the MCP server's recommend_free_agents, so the
// phone and the chat can never quote different bids for the same player.
//
// Research and rule spec: docs/analysis/faab-bid-corpus-2026-08.md (§5, §6,
// §9, §10). Re-run the corpus with `node scripts/dev/faab-corpus.mjs`.
//
// ── WHAT IT DOES, AND WHAT IT DELIBERATELY DOES NOT ────────────────────────
//
// It does NOT predict whether a claim will be contested. That was tested: on
// 2023–25 the contest rate barely moves with dynasty value (27% for unpriced
// players, ~40–44% from 600 up), so any "nobody will bid on him" call would
// be a coin flip dressed as a prediction. Instead the rule asks the question
// it CAN answer from roster facts — how much does winning THIS player matter
// to MY roster? — and buys that much protection off the measured ladder:
//
//   must-win   fills a need AND starts in my best lineup     23% of budget
//   default    starts, or fills a need AND beats my depth    16%
//   value play beats my depth, or sits at a need — not both   11%
//   floor      anything else worth claiming (a riser)        ~0.2%
//
// The ladder is the memo's §6 Part B (2023–25 contested clearing prices:
// p50 11%, ~p65 16%, p80 23%). The floor is what this league ACTUALLY pays
// when nobody else bids (owner decision 2026-10-07): the 2026 in-season
// uncontested median is $2 on $1000, and 0.2% with a $1 minimum also lands on
// $1 at the old $100 scale — the 2023–25 uncontested median. The spec's 1%
// ($10) floor was dropped: it paid 5× the going rate for nothing.
//
// ── THREE RULES ABOUT MONEY ─────────────────────────────────────────────────
//
// 1. The budget is READ, never assumed. `waiver_budget` went $100 → $1000 for
//    2026; a missing setting returns no bid rather than guessing either.
// 2. The ladder is priced against the FULL budget and then capped at what is
//    left. The clearing prices were measured as a share of the budget, so
//    "16% of what you have left" would underbid the market exactly when the
//    period is nearly spent — the moment you most need to win.
// 3. The budget RESETS TWICE A LEAGUE YEAR and `waiver_budget_used` is the
//    current period only (CLAUDE.md League Context), so `remaining` is the
//    current period's — never reconciled against a transaction-log total.
//
// Rule 7 applies: an unpriced player and a defense get `bid: null`, never a
// fabricated number. A defense is never a general pickup.

import { buildPickupContext } from './recommendations'
import { buildValueLineup } from './lineupBuild'
import { POSITIONS } from '../constants'

// % of the period's FULL budget, by intent (memo §6 Part B).
export const FAAB_LADDER_PCT = { 'must-win': 23, default: 16, value: 11 }

// The uncontested floor: 0.2% of budget, never under $1 (and never under the
// league's own `waiver_bid_min`).
export const FAAB_FLOOR_PCT = 0.2
export const FAAB_FLOOR_MIN = 1

// Stated wherever a bid is shown. The 2026 count is a snapshot — re-measure
// with `faab-corpus.mjs` and update it rather than letting it drift.
export const FAAB_CALIBRATION =
  'Calibrated on 2023–25 at $100; n = 3 contested auctions on $1000'

// Part D of the spec, and free to surface: Sleeper processes a manager's
// claims as one ordered batch and fails the rest once roster spots or budget
// run out — 81% of 2023–25 failed claims sat in a run where the same manager
// also won. Order matters as much as the bid.
export const FAAB_BATCH_WARNING =
  'Order your claims: Sleeper fails the rest of your batch once roster spots or budget run out, ' +
  'so a high bid low in the queue can die without ever being outbid.'

const TIER_LABEL = {
  'must-win': 'Must-win',
  default: 'Default',
  value: 'Value play',
  floor: 'Floor',
}

// What each tier bought on the 2023–25 contested corpus (memo §5/§6). Stated
// as history, not as a forecast — n is small and the scale changed.
const TIER_WINS = {
  'must-win': 'won ~85–90% of contested 2023–25 auctions',
  default: 'won ~83% of contested 2023–25 auctions',
  value: 'won ~50% of contested 2023–25 auctions',
  floor: 'wins only if nobody else bids — about 6 in 10 claims at this value went uncontested in 2023–25',
}

// Part C — contested prices firm through the season and collapse once the
// playoffs start (memo §5: wk1–4 7%, wk5–14 12–15%, wk15+ ~1%).
export function faabSeasonMultiplier(week, isRegularSeason) {
  if (!isRegularSeason) return 1
  const w = Number(week)
  if (!Number.isFinite(w) || w < 1) return 1
  if (w <= 4) return 0.8
  if (w <= 14) return 1
  return 0.3
}

// The CURRENT period's budget, read from league + roster settings. Returns
// null when the league does not say what its budget is — absence of a budget
// is not evidence of a scale.
export function readFaabPeriod(leagueInfo, roster) {
  const budget = Number(leagueInfo?.settings?.waiver_budget)
  if (!Number.isFinite(budget) || budget <= 0 || !roster) return null
  const spent = Math.max(0, Number(roster.faabSpent) || 0)
  const bidMin = Math.max(0, Number(leagueInfo?.settings?.waiver_bid_min) || 0)
  return { budget, spent, remaining: Math.max(0, budget - spent), bidMin }
}

export function faabFloor(period) {
  return Math.max(FAAB_FLOOR_MIN, Math.round(period.budget * FAAB_FLOOR_PCT / 100), period.bidMin ?? 0)
}

function unavailable(reason, text) {
  return { bid: null, tier: null, label: null, pctOfBudget: null, unavailable: reason, reasons: [text] }
}

// recommendFaabBid(player, myRoster, allRosters, { period, week, isRegularSeason, ctx })
//   player      a free agent: { sleeperId, position, value }
//   period      readFaabPeriod(...) — the CURRENT budget period
//   ctx         optional buildPickupContext(...), so a caller in a loop pays once
export function recommendFaabBid(player, myRoster, allRosters, {
  period, week = null, isRegularSeason = false, ctx = null,
} = {}) {
  if (!player) return unavailable('no-player', 'No player.')
  if (player.position === 'DEF') {
    return unavailable('defense', 'A defense is never a general pickup — you roster exactly one.')
  }
  if (!POSITIONS.includes(player.position) || !(player.value > 0)) {
    return unavailable('unpriced', 'Unpriced by FantasyCalc, so there is no honest bid to suggest.')
  }
  if (!period || !myRoster) {
    return unavailable('budget-unknown', 'The league does not report its FAAB budget, so no bid is suggested.')
  }

  const { myDeltas, replacement } = ctx ?? buildPickupContext(myRoster, allRosters)
  const pos = player.position
  const fillsNeed = (myDeltas[pos] ?? 0) < 0
  const isUpgrade = (player.value ?? 0) > (replacement[pos] ?? 0)
  const starts = buildValueLineup([...myRoster.players, player]).starterIds.has(String(player.sleeperId))

  const tier = fillsNeed && starts ? 'must-win'
    : starts || (fillsNeed && isUpgrade) ? 'default'
      : isUpgrade || fillsNeed ? 'value'
        : 'floor'

  const reasons = []
  if (tier === 'must-win') reasons.push(`Fills your ${pos} need and would start in your best lineup`)
  else if (tier === 'default') reasons.push(starts ? `Would start in your best lineup at ${pos}` : `Fills your ${pos} need and beats your depth`)
  else if (tier === 'value') reasons.push(isUpgrade ? `Upgrades your ${pos} depth, but would not start` : `At a ${pos} need, but no better than your depth`)
  else reasons.push('Worth a claim, not worth a fight')

  const floor = faabFloor(period)
  let basePct = null
  let multiplier = 1
  let target = floor
  if (tier !== 'floor') {
    basePct = FAAB_LADDER_PCT[tier]
    multiplier = faabSeasonMultiplier(week, isRegularSeason)
    target = Math.max(floor, Math.round(period.budget * basePct * multiplier / 100))
    if (multiplier < 1) {
      reasons.push(multiplier === 0.3
        ? 'Scaled to 0.3× — prices collapse once the playoffs start'
        : 'Scaled to 0.8× — contested prices run cheaper in weeks 1–4')
    }
  }

  const capped = target > period.remaining
  const bid = capped ? period.remaining : target
  if (capped) reasons.push(`Capped at the $${period.remaining} you have left this period`)

  return {
    bid,
    tier,
    label: TIER_LABEL[tier],
    pctOfBudget: Math.round(bid / period.budget * 1000) / 10,
    basePct,
    multiplier,
    capped,
    expectedWin: TIER_WINS[tier],
    fillsNeed,
    isUpgrade,
    startsForMe: starts,
    unavailable: null,
    reasons,
  }
}
