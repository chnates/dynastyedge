#!/usr/bin/env node
// Permanent MONTHLY archive of FantasyCalc dynasty values — the long-memory
// companion to the 90-day rolling values-history.json. Runs in the same daily
// GitHub Actions workflow (.github/workflows/values-history.yml), best-effort
// (continue-on-error): a failure here must never disturb the primary rolling
// snapshot, and the publish step carries the previous archive forward from the
// branch on any miss, so accumulated history can't be erased.
//
// WHY this exists: the trajectory model projects value over multiple SEASONS,
// but values-history.json prunes past 90 days, so there is no data to back-test
// a 1–3 year projection against. This file keeps one column per calendar month
// forever, so the first real 1-year trajectory back-test becomes possible ~a
// year after it ships, and the full 3-year horizon a few years out. See
// docs/analysis/trajectory-calibration-2026-07.md.
//
// The app NEVER fetches this file — it is read only by offline analysis. So it
// costs the phone nothing (no extra request, no bundle weight); it only lives
// on the values-history branch for the harness to read.
//
// Format mirrors values-history.json but keyed by month, and is NEVER pruned by
// time (only inactive players age out):
//   { updatedAt, months: ['YYYY-MM', ...], players: { sleeperId: [v|null, ...] } }
// Each player's array is aligned to `months`. One column per UTC calendar month
// — re-runs within the same month replace that month's column (idempotent), so
// the archived value for a month is that month's latest daily snapshot.

import { writeFileSync } from 'node:fs'

const VALUES_URL =
  'https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=10&ppr=0.5'
const ARCHIVE_URL =
  'https://raw.githubusercontent.com/chnates/dynastyedge/values-history/values-archive.json'

const MAX_PLAYERS = 500       // top players by current value tracked each month
const INACTIVE_MONTHS = 24    // drop a row once it's been all-null this many months
                              // (out of the top 500 for 2 years — no longer useful
                              // to a forward-looking back-test), which bounds the
                              // player dimension so the file can't grow unbounded.

// Some CDNs reject the default Node fetch UA — present as a browser
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

// Today's values — a failure here is fatal for this script only (nothing to
// archive); the workflow's continue-on-error keeps the primary snapshot safe.
const data = await getJSON(VALUES_URL)
if (!Array.isArray(data) || data.length === 0) {
  console.error('FantasyCalc returned no data — keeping previous archive')
  process.exit(1)
}

const todayValues = {}
data.forEach(entry => {
  const sid = entry.player?.sleeperId
  if (sid) todayValues[String(sid)] = Math.round(entry.value ?? 0)
})

const topIds = new Set(
  Object.entries(todayValues)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_PLAYERS)
    .map(([sid]) => sid)
)

// Existing archive. 404 = first run (file missing), start fresh. Any other
// failure is fatal: the workflow force-pushes whatever this script writes, so
// proceeding after a transient error could replace the accumulated archive with
// a one-month file. (The publish step ALSO guards this by recovering the old
// archive from the branch when this script produces nothing.)
let archive = { months: [], players: {} }
try {
  const prev = await getJSON(ARCHIVE_URL)
  if (Array.isArray(prev?.months) && prev?.players) archive = prev
  console.log(`Loaded existing archive: ${archive.months.length} months, ${Object.keys(archive.players).length} players`)
} catch (err) {
  if (err.status === 404) {
    console.log('No existing archive — starting fresh')
  } else {
    console.error(`Could not load existing archive (${err.message}) — aborting to avoid data loss`)
    process.exit(1)
  }
}

const month = new Date().toISOString().slice(0, 7)   // 'YYYY-MM' (UTC)

// Replace the current month's column if it already exists (idempotent within a
// month → the archived value is the month's latest daily snapshot), else append.
// Columns are NEVER pruned by time — the whole point is permanent memory.
const existingIdx = archive.months.indexOf(month)
let months, keptCols
if (existingIdx === -1) {
  months = [...archive.months]
  keptCols = archive.months.map((_, i) => i)   // keep every prior column
  months.push(month)
} else {
  months = archive.months.slice(0, existingIdx + 1)      // keep up to & incl. this month
  keptCols = archive.months.slice(0, existingIdx).map((_, i) => i) // all columns before it
}

const players = {}
const ids = new Set([...Object.keys(archive.players), ...topIds])
ids.forEach(sid => {
  const prevSeries = archive.players[sid] ?? []
  const series = keptCols.map(i => prevSeries[i] ?? null)
  series.push(todayValues[sid] ?? null)
  // Bound the player dimension: drop rows that have been all-null for the last
  // INACTIVE_MONTHS columns (long gone from the top 500). Their older values
  // stay archived only while they're still within that trailing window.
  const tail = series.slice(-INACTIVE_MONTHS)
  if (tail.some(v => v != null)) players[sid] = series
})

writeFileSync(
  'values-archive.json',
  JSON.stringify({ updatedAt: new Date().toISOString(), months, players })
)
console.log(`Wrote values-archive.json: ${months.length} months, ${Object.keys(players).length} players`)
