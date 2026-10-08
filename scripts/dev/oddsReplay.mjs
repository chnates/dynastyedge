// oddsReplay.mjs — THE playoff-odds replay, shared by the analysis script
// (scripts/dev/odds-calibration-backtest.mjs) and the test that pins the app's
// published track record (tests/oddsTrackRecord.test.mjs). Pure: data in,
// predictions out — no fetching, no printing.
//
// Each past season is replayed one cutoff at a time through the app's own
// buildPlayoffOutlook, with every week after the cutoff blanked to "not yet
// played" — exactly what the app sees mid-season. Truth is the real winners
// bracket. Past rosters' dynasty values don't exist, so the roster-strength
// prior is flat (docs/analysis/playoff-odds-calibration-2026-10.md §2).

import { buildPlayoffOutlook, buildScoringModel, simulatePlayoffs, BUYER_PCT, SELLER_PCT } from '../../src/utils/playoffOdds.js'

// Cutoffs k = 2..12 — after Week 2 through after Week 12, the trade-deadline
// window. Pre-registered; the published track record is read over this window.
export const PRIMARY_WINDOW = [2, 12]

// The six teams in a season's real bracket: round 1's four plus round 2's byes.
export function bracketField(bracket) {
  const field = new Set()
  bracket.filter(g => g.r === 1).forEach(g => { field.add(g.t1); field.add(g.t2) })
  bracket.filter(g => g.r === 2).forEach(g => {
    if (Number.isInteger(g.t1)) field.add(g.t1)
    if (Number.isInteger(g.t2)) field.add(g.t2)
  })
  return field
}

function completedWeeks(season) {
  return season.perWeek.filter(w => w.entries.length && w.entries.every(e => (e.points ?? 0) > 0))
}

function pairs(entries) {
  const g = {}
  entries.forEach(e => { if (e.matchup_id != null) (g[e.matchup_id] ??= []).push(e) })
  return Object.values(g).filter(x => x.length === 2)
}

// Standings after the first `cut` completed weeks.
function tally(season, done, cut) {
  const rec = Object.fromEntries(season.rosterIds.map(id => [id, { wins: 0, losses: 0, ties: 0, pf: 0 }]))
  for (const { entries } of done.slice(0, cut)) {
    for (const [a, b] of pairs(entries)) {
      rec[a.roster_id].pf += a.points; rec[b.roster_id].pf += b.points
      if (a.points > b.points) { rec[a.roster_id].wins++; rec[b.roster_id].losses++ }
      else if (b.points > a.points) { rec[b.roster_id].wins++; rec[a.roster_id].losses++ }
      else { rec[a.roster_id].ties++; rec[b.roster_id].ties++ }
    }
  }
  return rec
}

// Does the field rebuilt from matchups (wins, then points-for) match the bracket?
export function standingsAgree(season) {
  const done = completedWeeks(season)
  const fin = tally(season, done, done.length)
  const order = [...season.rosterIds].sort((x, y) => (fin[y].wins - fin[x].wins) || (fin[y].pf - fin[x].pf))
  const rebuilt = order.slice(0, season.playoffTeams)
  const field = bracketField(season.bracket)
  return {
    agree: field.size === season.playoffTeams && rebuilt.every(id => field.has(id)),
    field: [...field].sort((a, b) => a - b),
    rebuilt: [...rebuilt].sort((a, b) => a - b),
    completedWeeks: done.length,
  }
}

// One prediction per team per cutoff: the model's odds, the record-only
// baseline (same sim, every team scoring alike), always-60%, and the truth.
// `cutoffs` limits which k are simulated (the test only needs the window).
export function replaySeasons(seasons, { cutoffs = null } = {}) {
  const preds = []
  for (const s of [...seasons].sort((a, b) => a.season - b.season)) {
    const field = bracketField(s.bracket)
    const done = completedWeeks(s)
    for (let k = 0; k < done.length; k++) {
      if (cutoffs && (k < cutoffs[0] || k > cutoffs[1])) continue
      const rec = tally(s, done, k)
      const allRosters = s.rosterIds.map(id => ({
        rosterId: id, players: [],
        record: { wins: rec[id].wins, losses: rec[id].losses, ties: rec[id].ties },
        pointsFor: rec[id].pf,
      }))
      const perWeek = s.perWeek.map((w, i) => (i < k ? w : {
        week: w.week, entries: w.entries.map(e => ({ ...e, points: 0 })),
      }))
      const out = buildPlayoffOutlook({ allRosters, perWeek, playoffTeams: s.playoffTeams })
      if (out.completedWeeks !== k) throw new Error(`cutoff ${k} read as ${out.completedWeeks} weeks`)
      const flatModel = buildScoringModel(allRosters, {}, allRosters.map(() => 0))
      const remaining = perWeek.slice(k).map(w => ({
        week: w.week, matchups: pairs(w.entries).map(([a, b]) => [a.roster_id, b.roster_id]),
      }))
      const flat = simulatePlayoffs({ allRosters, model: flatModel, remainingSchedule: remaining, playoffTeams: s.playoffTeams })
      const flatBy = Object.fromEntries(flat.map(r => [r.rosterId, r.playoffPct]))
      for (const r of out.results) {
        preds.push({
          season: s.season, k, rosterId: r.rosterId,
          pred: r.playoffPct, recordOnly: flatBy[r.rosterId],
          clim: s.playoffTeams / s.rosterIds.length,
          made: field.has(r.rosterId) ? 1 : 0,
        })
      }
    }
  }
  return preds
}

const share = (preds, test) => {
  const b = preds.filter(test)
  return {
    n: b.length,
    predicted: b.reduce((s, p) => s + p.pred, 0) / b.length,
    made: b.reduce((s, p) => s + p.made, 0) / b.length,
  }
}

// The figures the Playoffs page publishes (ODDS_TRACK_RECORD), read over the
// primary window, rounded to whole percents exactly as the constant stores them.
export function trackRecord(preds) {
  const prim = preds.filter(p => p.k >= PRIMARY_WINDOW[0] && p.k <= PRIMARY_WINDOW[1])
  const r = x => Math.round(100 * x)
  const buyer = share(prim, p => p.pred >= BUYER_PCT)
  const low = share(prim, p => p.pred < 0.2)
  const seller = share(prim, p => p.pred < SELLER_PCT)
  return {
    seasons: [...new Set(prim.map(p => p.season))].sort().join('–').replace(/–.*–/, '–'),
    teamSeasons: new Set(prim.map(p => `${p.season}|${p.rosterId}`)).size,
    buyerPredictedPct: r(buyer.predicted), buyerMadePct: r(buyer.made),
    lowPredictedPct: r(low.predicted), lowMadePct: r(low.made),
    sellerPredictedPct: r(seller.predicted), sellerMadePct: r(seller.made),
  }
}
