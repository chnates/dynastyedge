#!/usr/bin/env node
// Dev/analysis tool — NOT part of the app or any workflow. Nothing imports it.
//
// Pulls the league's full FAAB waiver-bid corpus by walking the
// previous_league_id chain, and prints the analysis behind
// docs/analysis/faab-bid-corpus-2026-08.md so every number there is
// re-runnable rather than asserted.
//
// The key reason this exists: Sleeper returns FAILED waiver claims WITH their
// bid amounts, so the losing side of the auction is observable — but a failed
// claim is NOT a clean "we were outbid" signal (see the memo). This script
// reconstructs genuine head-to-head auctions by grouping claims on the same
// player in the same week, and drops the ones polluted by the multi-claim
// batch effect.
//
// Usage:
//   node scripts/dev/faab-corpus.mjs            # analysis summary
//   node scripts/dev/faab-corpus.mjs --json     # raw corpus to stdout
//
// Zero dependencies, read-only, public endpoints. Safe to re-run.

const BASE = 'https://api.sleeper.app/v1'
const HEAD_LEAGUE = '1313933520715907072'
const MAX_HOPS = 8

const asJson = process.argv.includes('--json')
const log = (...a) => console.error(...a)

async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return await r.json()
    } catch (err) {
      if (i === tries - 1) throw err
      await new Promise(res => setTimeout(res, 500 * (i + 1)))
    }
  }
}

// ── 1. Walk the renewal chain ────────────────────────────────────────────────
async function buildChain() {
  const chain = []
  let id = HEAD_LEAGUE
  for (let hop = 0; hop < MAX_HOPS && id; hop++) {
    const lg = await get(`${BASE}/league/${id}`)
    chain.push({
      season: lg.season,
      id: lg.league_id,
      // The budget is NOT constant across seasons — it went 100 -> 1000 for
      // 2026. Every bid must be normalized to % of budget before comparison.
      budget: lg.settings?.waiver_budget ?? null,
    })
    id = lg.previous_league_id
  }
  return chain
}

// ── 2. Pull every bid-bearing waiver claim, won or lost ──────────────────────
async function pullSeason(lg) {
  const [users, rosters] = await Promise.all([
    get(`${BASE}/league/${lg.id}/users`),
    get(`${BASE}/league/${lg.id}/rosters`),
  ])
  const ownerByRoster = Object.fromEntries(rosters.map(r => [r.roster_id, r.owner_id]))
  const nameByOwner = Object.fromEntries(
    users.map(u => [u.user_id, u.metadata?.team_name || u.display_name])
  )

  const weeks = await Promise.all(
    Array.from({ length: 18 }, (_, i) => i + 1).map(w =>
      get(`${BASE}/league/${lg.id}/transactions/${w}`)
        .then(t => ({ week: w, txs: t }))
        .catch(() => ({ week: w, txs: [] }))
    )
  )

  const rows = []
  for (const { week, txs } of weeks) {
    for (const tx of txs) {
      if (tx.type !== 'waiver') continue
      const bid = tx.settings?.waiver_bid
      if (bid == null) continue
      const rosterId = tx.roster_ids?.[0]
      const ownerId = ownerByRoster[rosterId]
      rows.push({
        season: lg.season,
        budget: lg.budget,
        week,
        status: tx.status, // 'complete' = won, 'failed' = did not process
        bid,
        pctOfBudget: lg.budget ? (bid / lg.budget) * 100 : null,
        rosterId,
        ownerId,
        ownerName: nameByOwner[ownerId] ?? null,
        playerIds: Object.keys(tx.adds ?? {}),
        created: tx.created ?? null,
      })
    }
  }
  return rows
}

// ── 3. Reconstruct head-to-head auctions ─────────────────────────────────────
// One "auction" = one (season, week, player). Contested = 2+ managers claimed
// the same player in the same waiver run. An auction where a LOSER outbid the
// winner is not a real auction outcome (the loser's claim died to budget or to
// the batch effect), so it is excluded from clearing-price stats.
function buildAuctions(rows) {
  const byPlayerWeek = new Map()
  for (const r of rows) {
    for (const pid of r.playerIds) {
      const key = `${r.season}|${r.week}|${pid}`
      if (!byPlayerWeek.has(key)) byPlayerWeek.set(key, [])
      byPlayerWeek.get(key).push(r)
    }
  }

  const clean = []
  let dropped = 0
  for (const [key, claims] of byPlayerWeek) {
    const winners = claims.filter(c => c.status === 'complete')
    const losers = claims.filter(c => c.status === 'failed')
    if (winners.length !== 1) { dropped++; continue }
    const win = winners[0]
    const topLoser = losers.length ? Math.max(...losers.map(c => c.bid)) : null
    if (topLoser != null && topLoser > win.bid) { dropped++; continue }
    const [season, week, playerId] = key.split('|')
    clean.push({
      season, week: Number(week), playerId,
      winBid: win.bid, winPct: win.pctOfBudget,
      contested: losers.length > 0,
      topLoserBid: topLoser,
      topLoserPct: topLoser != null && win.budget ? (topLoser / win.budget) * 100 : null,
    })
  }
  return { clean, dropped, total: byPlayerWeek.size }
}

const median = xs => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const pct = (xs, p) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(Math.floor(p * s.length), s.length - 1)]
}

// ── main ─────────────────────────────────────────────────────────────────────
const chain = await buildChain()
log('League chain:', chain.map(c => `${c.season} ($${c.budget})`).join(' <- '))

const all = (await Promise.all(chain.map(pullSeason))).flat()
log(`Bid-bearing waiver claims: ${all.length}`)

if (asJson) {
  console.log(JSON.stringify(all))
  process.exit(0)
}

// Analysis is restricted to COMPLETED seasons on a single budget scale so
// dollar figures are comparable; percentages are the portable unit.
const historical = all.filter(r => r.budget === 100)
const { clean, dropped, total } = buildAuctions(historical)
const contested = clean.filter(a => a.contested)
const uncontested = clean.filter(a => !a.contested)

console.log('\n=== corpus ===')
for (const c of chain) {
  const rows = all.filter(r => r.season === c.season)
  const won = rows.filter(r => r.status === 'complete').length
  console.log(`  ${c.season} (budget $${c.budget}): ${rows.length} claims — ${won} won, ${rows.length - won} failed`)
}

console.log('\n=== "failed" is not "outbid" ===')
const failed = historical.filter(r => r.status === 'failed')
const runs = new Map()
for (const r of historical) {
  const k = `${r.season}|${r.week}|${r.ownerId}`
  if (!runs.has(k)) runs.set(k, [])
  runs.get(k).push(r)
}
const inWinningBatch = failed.filter(r => {
  const batch = runs.get(`${r.season}|${r.week}|${r.ownerId}`) ?? []
  return batch.some(b => b.status === 'complete')
}).length
console.log(`  failed claims: ${failed.length}`)
console.log(`  ...sitting in a waiver run where the SAME manager also won: ${inWinningBatch} (${Math.round(inWinningBatch / failed.length * 100)}%)`)
console.log('  => most failures are batch/roster-capacity casualties, not lost auctions.')

console.log('\n=== reconstructed auctions ===')
console.log(`  player-week auctions: ${total}  (dropped as unclean: ${dropped})`)
console.log(`  clean: ${clean.length} — contested ${contested.length} (${Math.round(contested.length / clean.length * 100)}%), uncontested ${uncontested.length}`)
console.log(`  uncontested median winning bid: ${median(uncontested.map(a => a.winPct))}% of budget`)

console.log('\n=== contested clearing prices (% of budget) ===')
const cp = contested.map(a => a.winPct)
for (const p of [0.5, 0.6, 0.7, 0.75, 0.8, 0.9]) {
  console.log(`  p${Math.round(p * 100)}: ${pct(cp, p).toFixed(0)}%`)
}
console.log('\n=== runner-up bids — the bar a bid must actually clear ===')
const ru = contested.map(a => a.topLoserPct)
for (const p of [0.5, 0.75, 0.8, 0.9]) {
  console.log(`  p${Math.round(p * 100)}: ${pct(ru, p).toFixed(0)}%`)
}

console.log('\n=== held-out backtest: flat %-of-budget rules vs 2025 contested auctions ===')
const test = contested.filter(a => a.season === '2025')
const testMedian = median(test.map(a => a.winPct))
console.log(`  2025 contested n=${test.length}, median actual winning bid ${testMedian}%`)
for (const bid of [5, 8, 10, 12, 15, 16, 20, 25]) {
  const won = test.filter(a => bid > a.topLoserPct).length
  const cheapWins = test.filter(a => bid > a.topLoserPct && bid <= testMedian).length
  console.log(`  bid ${String(bid).padStart(2)}%: wins ${String(Math.round(won / test.length * 100)).padStart(3)}%  of which at <= median cost: ${cheapWins}`)
}
