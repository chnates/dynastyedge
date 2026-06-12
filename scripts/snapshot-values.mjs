#!/usr/bin/env node
// Snapshots FantasyCalc dynasty values once a day and appends them to a
// rolling per-player time series. Runs in GitHub Actions
// (.github/workflows/values-history.yml); the app reads the published file
// from the values-history branch via raw.githubusercontent.com and renders
// sparklines wherever at least two snapshots exist.
//
// Format is columnar to keep the file small on mobile:
//   { updatedAt, dates: ['YYYY-MM-DD', ...], players: { sleeperId: [v|null, ...] } }
// Each player's array is aligned to `dates`. One column per UTC day —
// re-runs on the same day replace that day's column (idempotent).

import { writeFileSync } from 'node:fs'

const VALUES_URL =
  'https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=10&ppr=0.5'
const HISTORY_URL =
  'https://raw.githubusercontent.com/chnates/dynastyedge/values-history/values-history.json'

const MAX_DAYS = 90      // rolling window
const MAX_PLAYERS = 500  // top players by current value — keeps the file mobile-sized

// Some CDNs reject the default Node fetch UA — present as a browser
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'

async function getJSON(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`)
  return res.json()
}

// Today's values — a failure here is fatal (nothing to snapshot)
const data = await getJSON(VALUES_URL)
if (!Array.isArray(data) || data.length === 0) {
  console.error('FantasyCalc returned no data — keeping previous history')
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

// Existing history — best-effort (first run, or branch missing, starts fresh)
let history = { dates: [], players: {} }
try {
  const prev = await getJSON(HISTORY_URL)
  if (Array.isArray(prev?.dates) && prev?.players) history = prev
  console.log(`Loaded existing history: ${history.dates.length} days, ${Object.keys(history.players).length} players`)
} catch (err) {
  console.log(`No existing history (${err.message}) — starting fresh`)
}

const today = new Date().toISOString().slice(0, 10)

// Drop today's column if it already exists (replace on re-run), then trim window
let dates = history.dates.filter(d => d !== today)
const keptIdx = history.dates
  .map((d, i) => (d !== today ? i : -1))
  .filter(i => i !== -1)
const trimStart = Math.max(0, dates.length - (MAX_DAYS - 1))
dates = dates.slice(trimStart)
const window = keptIdx.slice(trimStart)

const players = {}
const ids = new Set([...Object.keys(history.players), ...topIds])
ids.forEach(sid => {
  const prevSeries = history.players[sid] ?? []
  const series = window.map(i => prevSeries[i] ?? null)
  series.push(todayValues[sid] ?? null)
  // Drop players that fell out of the window entirely
  if (series.some(v => v != null)) players[sid] = series
})
dates.push(today)

writeFileSync(
  'values-history.json',
  JSON.stringify({ updatedAt: new Date().toISOString(), dates, players })
)
console.log(`Wrote values-history.json: ${dates.length} days, ${Object.keys(players).length} players`)
