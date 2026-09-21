#!/usr/bin/env node
// Permanent DAILY archive of ALL THREE valuation sources — the one thing in
// build-plan §10 whose cost is paid every day it is not done.
//
// WHY this exists: FantasyCalc is the app's only valuation source, so every
// trade verdict, roster total, trajectory curve, pick price and market-mover
// traces to one provider's opinion. Two more are obtainable free and join by
// ID. But the question worth asking of three sources — WHEN THEY DISAGREE,
// WHICH ONE MOVES TOWARD THE OTHERS? (§10 4d) — needs history, and history
// cannot be recomputed in hindsight. So the archive ships before any UI does.
//
// The app NEVER fetches this file. It costs the phone nothing (no request, no
// bundle weight) and is read only by offline analysis, like values-archive.json.
//
// Best-effort PER SOURCE, which is the whole degradation contract here: a
// source that cannot be read contributes an all-null column with asOf: null,
// and the other two publish normally. "We did not observe" and "the source
// priced nobody" are different statements and neither is ever a 0.
//
// Runs in .github/workflows/values-history.yml under continue-on-error, and
// the publish step carries the previous archive forward from the branch on any
// miss — so a bad run leaves yesterday's file in place rather than erasing it.

import { writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import {
  splitFantasyCalcEntries, parseCSV, buildCrosswalk,
  readDynastyProcess, extractKtcPlayers, readKeepTradeCut,
  mergeConsensusColumn, SOURCE_KEYS,
} from './valuationSources.mjs'

const FANTASYCALC_URL =
  'https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=10&ppr=0.5'
const CROSSWALK_URL =
  'https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv'
const DYNASTYPROCESS_URL =
  'https://raw.githubusercontent.com/dynastyprocess/data/master/files/values-players.csv'
const KEEPTRADECUT_URL = 'https://keeptradecut.com/dynasty-rankings'
const ARCHIVE_URL =
  'https://raw.githubusercontent.com/chnates/dynastyedge/values-history/values-consensus.json'

const MAX_PLAYERS = 500        // per source, by its own value — a safety bound,
                               // not a policy (largest source lists ~485 today)
const INACTIVE_COLUMNS = 120   // drop a row once EVERY source has been null for
                               // it this many days — bounds the player dimension

// Some CDNs reject the default Node fetch UA — present as a browser
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'

async function get(url, accept) {
  const res = await fetch(url, {
    headers: { Accept: accept, 'User-Agent': UA },
    signal: AbortSignal.timeout(45000),
  })
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} from ${url}`)
    err.status = res.status
    throw err
  }
  return accept === 'application/json' ? res.json() : res.text()
}

// Every source read is wrapped: a throw becomes null, which becomes an
// all-null column. Nothing a provider does can fail this run.
async function attempt(label, fn) {
  try {
    return await fn()
  } catch (err) {
    console.error(`  ${label}: FAILED — ${err.message}`)
    return null
  }
}

// --- the crosswalk ---------------------------------------------------------
// Not a source, but the join for two of the three. Without it DynastyProcess
// and KeepTradeCut are unreachable (we never name-match), so they both go
// all-null — FantasyCalc, which carries a native sleeperId, is unaffected.
const crosswalk = await attempt('crosswalk', async () => {
  const rows = parseCSV(await get(CROSSWALK_URL, 'text/csv'))
  const built = buildCrosswalk(rows)
  console.log(
    `  crosswalk: ${built.rows} rows, ${built.withSleeperId} with a real sleeper_id ` +
    `(fp ${built.byFantasyPros.size} · mfl ${built.byMfl.size} · ktc ${built.byKtc.size})`
  )
  return built
})

// --- FantasyCalc — the incumbent, native Sleeper ids, no crosswalk needed ---
const fantasycalc = await attempt('fantasycalc', async () => {
  const data = await get(FANTASYCALC_URL, 'application/json')
  if (!Array.isArray(data) || !data.length) throw new Error('empty payload')
  const { playerValues, pickEntries } = splitFantasyCalcEntries(data)
  if (!Object.keys(playerValues).length) throw new Error('no players classified')
  console.log(`  fantasycalc: ${data.length} entries -> ${Object.keys(playerValues).length} players, ${pickEntries.length} picks`)
  return { values: playerValues, asOf: null }
})

// --- DynastyProcess — expert consensus, the lone non-market source ---------
const dynastyprocess = await attempt('dynastyprocess', async () => {
  if (!crosswalk) throw new Error('no crosswalk')
  const read = readDynastyProcess(parseCSV(await get(DYNASTYPROCESS_URL, 'text/csv')), crosswalk)
  if (!read.joined) throw new Error('nothing joined')
  console.log(`  dynastyprocess: ${read.total} players -> ${read.joined} joined, ${read.unjoined} unjoined, ${read.unpriced} unpriced (scrape_date ${read.asOf})`)
  return { values: read.values, asOf: read.asOf }
})

// --- KeepTradeCut — crowd votes; a PAGE, so the most fragile of the three ---
const keeptradecut = await attempt('keeptradecut', async () => {
  if (!crosswalk) throw new Error('no crosswalk')
  const entries = extractKtcPlayers(await get(KEEPTRADECUT_URL, 'text/html'))
  if (!entries) throw new Error('could not extract the ktc-players JSON island — page shape changed')
  const read = readKeepTradeCut(entries, crosswalk)
  if (!read.joined) throw new Error('nothing joined')
  console.log(`  keeptradecut: ${entries.length} entries (${read.total} players + ${read.picks} picks) -> ${read.joined} joined via mfl ${read.viaMfl} / ktc ${read.viaKtc}, ${read.unjoined} unjoined`)
  return { values: read.values, asOf: null }
})

const readings = { fantasycalc, dynastyprocess, keeptradecut }
const live = SOURCE_KEYS.filter(k => readings[k])
if (!live.length) {
  console.error('All three sources failed — keeping the previous archive untouched')
  process.exit(1)
}

// --- the existing archive --------------------------------------------------
// 404 = first run (file missing), start fresh. Any other failure is FATAL:
// the workflow force-pushes whatever this script writes, so appending to an
// empty archive after a transient CDN error would replace years of permanent
// history with a one-day file. Same contract as snapshot-values-archive.mjs.
let archive = { dates: [], sources: {} }
try {
  const prev = await get(ARCHIVE_URL, 'application/json')
  // ONLY a 404 starts fresh. A 200 carrying the wrong shape is not an empty
  // archive — it is an archive we failed to understand, and starting fresh on
  // it would force-push a one-day file over permanent history that cannot be
  // reconstructed. Abort and let the branch keep what it has.
  if (!Array.isArray(prev?.dates) || !prev?.sources) {
    console.error('Existing archive has an unexpected shape — aborting rather than replacing it')
    process.exit(1)
  }
  archive = prev
  console.log(`Loaded existing archive: ${archive.dates.length} days`)
} catch (err) {
  if (err.status === 404) console.log('No existing archive — starting fresh')
  else {
    console.error(`Could not load existing archive (${err.message}) — aborting to avoid data loss`)
    process.exit(1)
  }
}

const date = new Date().toISOString().slice(0, 10)   // 'YYYY-MM-DD' (UTC)
const next = mergeConsensusColumn({
  archive, date, readings,
  maxPlayers: MAX_PLAYERS, inactiveColumns: INACTIVE_COLUMNS,
})

const json = JSON.stringify(next)
writeFileSync('values-consensus.json', json)

// Size the file by its WIRE bytes, not its raw bytes — raw.githubusercontent
// serves it gzipped, and pricing a feed off its raw size over-stated the news
// cap by ~4x. This file is never fetched by the app, but the number is what
// says whether the daily cadence stays affordable.
const raw = Buffer.byteLength(json)
const wire = gzipSync(json).length
const tracked = Object.keys(next.sources.fantasycalc.players).length
console.log(
  `Wrote values-consensus.json: ${next.dates.length} days, ${tracked} players, ` +
  `sources live ${live.join('+')} of ${SOURCE_KEYS.length} — ` +
  `${(raw / 1024).toFixed(0)}KB raw / ${(wire / 1024).toFixed(0)}KB wire ` +
  `(${(wire / Math.max(1, next.dates.length) / 1024).toFixed(1)}KB per day)`
)
