#!/usr/bin/env node
// Permanently archives asset values for every league trade, captured within
// ~a day of the trade completing. Runs daily alongside snapshot-values.mjs in
// .github/workflows/values-history.yml; the app reads trade-values.json from
// the values-history branch and shows "at trade time" totals in the manager
// scouting ledger. Unlike values-history.json this file never prunes —
// trades are immutable and the per-trade payload is tiny.
//
// Format:
//   { updatedAt, trades: { [transaction_id]: {
//       date: 'YYYY-MM-DD',
//       players: { sleeperId: value },
//       picks:   { 'season-round-originalRosterId': value },
//   } } }
//
// Only trades completed within the last RECENT_DAYS are archived — anything
// older would be recorded at today's prices and mislabeled as trade-time.

import { writeFileSync } from 'node:fs'
import { splitFantasyCalcEntries, buildPickPricer } from './fantasyCalcValues.mjs'

const LEAGUE_ID = '1313933520715907072'
const VALUES_URL =
  'https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=10&ppr=0.5'
const ARCHIVE_URL =
  'https://raw.githubusercontent.com/chnates/dynastyedge/values-history/trade-values.json'
const SLEEPER_BASE = 'https://api.sleeper.app/v1'

const RECENT_DAYS = 8   // > daily cadence, with margin for missed runs
const TX_WEEKS = 18

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'

async function getJSON(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} from ${url}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

// Existing archive. 404 = first run, start fresh. Any other failure is fatal:
// overwriting the branch without the prior archive would silently lose it
// (the workflow's publish step re-fetches the old file as a fallback).
let archive = { trades: {} }
try {
  const prev = await getJSON(ARCHIVE_URL)
  if (prev?.trades && typeof prev.trades === 'object') archive = prev
  console.log(`Loaded existing archive: ${Object.keys(archive.trades).length} trades`)
} catch (err) {
  if (err.status === 404) {
    console.log('No existing archive — starting fresh')
  } else {
    console.error(`Could not load existing archive (${err.message}) — aborting to avoid data loss`)
    process.exit(1)
  }
}

// One-time self-heal for the classification bug above. Between FantasyCalc
// adding synthetic pick ids (2026-07) and the fix (2026-09-21), every pick
// archived as exactly 0. FantasyCalc never prices a pick at 0 and this file
// never overwrites a captured trade, so a stored 0 is the bug's output and
// nothing else — rewrite it to null so the consumer hides the line instead of
// rendering a total that is short by a first-rounder.
//
// It runs through the normal publish path rather than a hand-edit of the
// data branch, and it is idempotent: once the zeros are gone it is a no-op.
// The real trade-time prices are NOT recoverable — that is the whole point of
// a permanent archive — so "unpriced" is the most honest state left.
let healed = 0
for (const trade of Object.values(archive.trades)) {
  for (const [key, value] of Object.entries(trade.picks ?? {})) {
    if (value === 0) {
      trade.picks[key] = null
      healed += 1
    }
  }
}
if (healed) console.log(`Healed ${healed} pick value(s) archived as 0 by the pre-2026-09-21 classifier`)

// Today's FantasyCalc values. Classification and pick pricing live in
// scripts/fantasyCalcValues.mjs — shared with the other two snapshot scripts
// and pinned by tests, because the copy that used to live here classified by
// `if (sid)` and archived every pick at 0 (see that file's comment).
const data = await getJSON(VALUES_URL)
if (!Array.isArray(data) || data.length === 0) {
  console.error('FantasyCalc returned no data — keeping archive unchanged')
  writeFileSync('trade-values.json', JSON.stringify(archive))
  process.exit(0)
}

const { playerValues, pickEntries } = splitFantasyCalcEntries(data)
const pickValue = buildPickPricer(pickEntries)
console.log(`FantasyCalc: ${Object.keys(playerValues).length} players, ${pickEntries.length} pick entries`)
if (!pickEntries.length) {
  // Not fatal, but it is the signature of the 2026-07 classification bug:
  // FantasyCalc always lists picks, so an empty list means we failed to
  // recognise them and every pick below would archive as unpriced.
  console.warn('WARNING: no pick entries recognised — picks will archive as null')
}

// Recent completed trades from the current league
const weeks = Array.from({ length: TX_WEEKS }, (_, i) => i + 1)
const perWeek = await Promise.all(
  weeks.map(w => getJSON(`${SLEEPER_BASE}/league/${LEAGUE_ID}/transactions/${w}`).catch(() => []))
)
const cutoff = Date.now() - RECENT_DAYS * 24 * 3600 * 1000
const recentTrades = perWeek.flat().filter(tx =>
  tx?.type === 'trade' &&
  tx?.status === 'complete' &&
  (tx.status_updated ?? 0) >= cutoff
)

let added = 0
recentTrades.forEach(tx => {
  if (archive.trades[tx.transaction_id]) return   // already captured — never overwrite

  const players = {}
  Object.keys(tx.adds ?? {}).forEach(pid => {
    players[String(pid)] = playerValues[String(pid)] ?? 0
  })
  // A pick FantasyCalc cannot price archives as null, never 0. The consumer
  // (useTradeTimeValues) hides the whole "at trade time" line when any asset
  // is missing, which is right — a 0 would instead count into the total and
  // render as a confident, wrong number. Players keep `?? 0`: rule 7 says an
  // unranked PLAYER contributes 0 to a total, which is a different contract.
  const picks = {}
  ;(tx.draft_picks ?? []).forEach(pk => {
    picks[`${pk.season}-${pk.round}-${pk.roster_id}`] = pickValue(pk.season, pk.round)
  })

  archive.trades[tx.transaction_id] = {
    date: new Date(tx.status_updated ?? Date.now()).toISOString().slice(0, 10),
    players,
    picks,
  }
  added += 1
})

writeFileSync(
  'trade-values.json',
  JSON.stringify({ updatedAt: new Date().toISOString(), trades: archive.trades })
)
console.log(`Wrote trade-values.json: ${Object.keys(archive.trades).length} trades (${added} new)`)
