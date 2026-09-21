// THE multi-source valuation readers for the snapshot pipelines: how a
// DynastyProcess row and a KeepTradeCut page entry become a Sleeper-keyed
// value, and how a day's readings merge into the permanent archive.
//
// Pure and dependency-free on purpose, so `tests/valuationSources.test.mjs`
// can pin it. It sits BESIDE `fantasyCalcValues.mjs` (whose reader it imports
// rather than re-implements) for the reason recorded in PIPE-1: a payload
// reader copied per script is a reader that gets fixed in some copies and not
// others, and the trade archive wrote every pick as 0 for two months because
// of it. DO NOT inline any of this back into a fetch script.
//
// The join is ID-BASED END TO END and never by name. DynastyProcess publishes
// `files/db_playerids.csv`, a universal crosswalk; every source here resolves
// through it to a Sleeper id or is dropped.

export { splitFantasyCalcEntries, buildPickPricer } from './fantasyCalcValues.mjs'

// --- CSV -------------------------------------------------------------------

// Minimal RFC-4180-ish reader: quoted fields with doubled-quote escapes, no
// embedded newlines (neither dynastyprocess file has any). Returns row objects.
export function parseCSV(text) {
  const lines = String(text ?? '').split('\n').filter(l => l.trim() !== '')
  if (!lines.length) return []
  const splitRow = line => {
    const out = []
    let cur = '', quoted = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') {
        if (quoted && line[i + 1] === '"') { cur += '"'; i++ } else quoted = !quoted
      } else if (c === ',' && !quoted) { out.push(cur); cur = '' } else cur += c
    }
    out.push(cur)
    return out
  }
  const header = splitRow(lines[0]).map(h => h.replace(/\r$/, '').trim())
  return lines.slice(1).map(line => {
    const cells = splitRow(line)
    const row = {}
    header.forEach((h, i) => { row[h] = (cells[i] ?? '').replace(/\r$/, '') })
    return row
  })
}

// dynastyprocess writes its CSVs from R, so a MISSING id is the literal string
// "NA", not an empty cell. Measured live 2026-09-21: 6,103 of db_playerids'
// 12,502 rows carry "NA" in `sleeper_id`. Read naively that is a single valid
// key onto which every unmapped player collapses — four distinct players
// landed on it in the first probe. Treat it as null, always.
export function crosswalkCell(value) {
  const s = String(value ?? '').trim()
  return s !== '' && s !== 'NA' ? s : null
}

// --- the crosswalk ---------------------------------------------------------

// Build the id → Sleeper-id indices. Only rows carrying a real sleeper_id can
// contribute; the rest are unreachable by definition.
export function buildCrosswalk(rows) {
  const byFantasyPros = new Map()
  const byMfl = new Map()
  const byKtc = new Map()
  let withSleeperId = 0
  for (const row of rows ?? []) {
    const sleeperId = crosswalkCell(row?.sleeper_id)
    if (!sleeperId) continue
    withSleeperId++
    const fp = crosswalkCell(row?.fantasypros_id)
    const mfl = crosswalkCell(row?.mfl_id)
    const ktc = crosswalkCell(row?.ktc_id)
    if (fp && !byFantasyPros.has(fp)) byFantasyPros.set(fp, sleeperId)
    if (mfl && !byMfl.has(mfl)) byMfl.set(mfl, sleeperId)
    if (ktc && !byKtc.has(ktc)) byKtc.set(ktc, sleeperId)
  }
  return { byFantasyPros, byMfl, byKtc, rows: (rows ?? []).length, withSleeperId }
}

// --- DynastyProcess --------------------------------------------------------

// `values-players.csv`: FantasyPros expert consensus, `value_2qb` = Superflex.
// Joined on `fp_id` → `fantasypros_id`. Rows with pos "PICK" are the pick
// board and belong to a different question; they are not players.
export function readDynastyProcess(rows, crosswalk) {
  const values = {}
  let total = 0, unjoined = 0, unpriced = 0, asOf = null
  for (const row of rows ?? []) {
    if (row?.pos === 'PICK') continue
    total++
    if (!asOf) asOf = crosswalkCell(row?.scrape_date)
    const sleeperId = crosswalk?.byFantasyPros?.get(crosswalkCell(row?.fp_id) ?? '')
    if (!sleeperId) { unjoined++; continue }
    const value = Number(row?.value_2qb)
    // An unpriceable asset is NULL, never 0 — a null is skipped by every
    // consumer, a 0 counts into a total and renders as fact.
    if (!Number.isFinite(value)) { unpriced++; continue }
    values[sleeperId] = Math.round(value)
  }
  return { values, total, joined: Object.keys(values).length, unjoined, unpriced, asOf }
}

// --- KeepTradeCut ----------------------------------------------------------

// KTC is a PAGE, not an API, and its shape has already changed once: the
// `var playersArray = [ ... ]` inline literal §10 probed on 2026-09-04 is gone,
// replaced on 2026-09-21 by a typed JSON island the page itself parses —
//   <script type="application/json" id="ktc-players">[...]</script>
//   var playersArray = JSON.parse(document.getElementById('ktc-players').textContent)
// That is a strictly more stable contract than a JS literal, but it is still a
// page. Every failure here returns null so the caller can publish the other
// two sources; it must never throw the run.
export function extractKtcPlayers(html) {
  const match = String(html ?? '').match(
    /<script[^>]*\bid=["']ktc-players["'][^>]*>([\s\S]*?)<\/script>/i
  )
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1])
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

// `superflexValues.value` is the Superflex number. The sibling `tep` / `tepp` /
// `teppp` trees are TE-premium variants of the same board — this league is not
// TE-premium, so reading one of those would be a different scoring format
// wearing the same field name.
//
// The join key is `mflid`, NOT `ktc_id`, and that is measured rather than
// stylistic (2026-09-21): the crosswalk carries 6,399 mfl→sleeper mappings
// against 434 ktc→sleeper, which joins 464 of KTC's 464 players against 433.
// Where the two disagree — exactly once, Frank Gore Jr. — the ktc_id row is
// the WRONG one, pointing at Sleeper 232 (Frank Gore Sr., 17 years exp, no
// team) where mfl_id correctly gives 11573 (BUF). ktc_id remains as a fallback
// for an entry that ever ships without an mflid; it adds nothing today.
export function readKeepTradeCut(entries, crosswalk) {
  const values = {}
  let total = 0, picks = 0, unjoined = 0, unpriced = 0, viaMfl = 0, viaKtc = 0
  for (const entry of entries ?? []) {
    // "RDP" is a rookie draft pick, not a player.
    if (entry?.position === 'RDP') { picks++; continue }
    total++
    let sleeperId = crosswalk?.byMfl?.get(String(entry?.mflid ?? ''))
    if (sleeperId) viaMfl++
    else {
      sleeperId = crosswalk?.byKtc?.get(String(entry?.playerID ?? ''))
      if (sleeperId) viaKtc++
    }
    if (!sleeperId) { unjoined++; continue }
    const value = entry?.superflexValues?.value
    if (!Number.isFinite(value)) { unpriced++; continue }
    values[sleeperId] = Math.round(value)
  }
  return {
    values, picks, total, joined: Object.keys(values).length,
    unjoined, unpriced, viaMfl, viaKtc,
  }
}

// --- the archive merge policy ----------------------------------------------

export const SOURCE_KEYS = ['fantasycalc', 'dynastyprocess', 'keeptradecut']

// Merge one day's readings into the permanent consensus archive.
//
//   { updatedAt, dates: ['YYYY-MM-DD', ...],
//     sources: { <key>: { asOf: [str|null, ...], coverage: [n|null, ...],
//                         players: { sleeperId: [v|null, ...] } } } }
//
// Every array is aligned to `dates`. Columns are NEVER pruned by time — the
// whole point is a permanent record of who disagreed with whom and when, which
// cannot be recomputed in hindsight (see build-plan §10 4d). The PLAYER
// dimension is what is bounded: a row ages out once every source has been null
// for it across the last `inactiveColumns` days.
//
// `readings[key]` is null when that source could not be read today. That
// column is then all-null with `asOf: null` and `coverage: null` — "we did not
// observe", which is a different statement from "the source priced nobody",
// and neither is ever written as a 0.
export function mergeConsensusColumn({
  archive,
  date,
  readings,
  maxPlayers = 500,
  inactiveColumns = 120,
}) {
  const prevDates = Array.isArray(archive?.dates) ? archive.dates : []
  const prevSources = archive?.sources ?? {}

  // Idempotent within a day: a re-run replaces today's column rather than
  // appending a second one, so the archived value for a date is that date's
  // latest reading.
  const existingIdx = prevDates.indexOf(date)
  const keptCols = (existingIdx === -1 ? prevDates : prevDates.slice(0, existingIdx))
    .map((_, i) => i)
  const dates = [...keptCols.map(i => prevDates[i]), date]

  // Which players to carry. Each source contributes its own top `maxPlayers`
  // by its OWN value, because the three scales are not comparable — ranking
  // within a source is the only ordering that means anything before 4b's
  // normalization exists. The cap is a safety bound, not a policy: today the
  // largest source lists 485.
  const tracked = new Set()
  for (const key of SOURCE_KEYS) {
    for (const sid of Object.keys(prevSources[key]?.players ?? {})) tracked.add(sid)
    const values = readings?.[key]?.values
    if (!values) continue
    Object.entries(values)
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxPlayers)
      .forEach(([sid]) => tracked.add(sid))
  }

  const sources = {}
  for (const key of SOURCE_KEYS) {
    const prev = prevSources[key] ?? {}
    const prevPlayers = prev.players ?? {}
    const reading = readings?.[key] ?? null
    const players = {}
    for (const sid of tracked) {
      const prevSeries = prevPlayers[sid] ?? []
      const series = keptCols.map(i => prevSeries[i] ?? null)
      series.push(reading ? (reading.values[sid] ?? null) : null)
      players[sid] = series
    }
    sources[key] = {
      asOf: [
        ...keptCols.map(i => prev.asOf?.[i] ?? null),
        reading ? (reading.asOf ?? null) : null,
      ],
      coverage: [
        ...keptCols.map(i => prev.coverage?.[i] ?? null),
        reading ? Object.keys(reading.values).length : null,
      ],
      players,
    }
  }

  // Bound the player dimension: drop a row once EVERY source has been null for
  // it across the trailing window. Dropping per-source instead would leave the
  // three `players` maps holding different id sets, which is precisely the
  // comparison this file exists to make easy.
  for (const sid of tracked) {
    const alive = SOURCE_KEYS.some(key =>
      sources[key].players[sid].slice(-inactiveColumns).some(v => v != null)
    )
    if (!alive) for (const key of SOURCE_KEYS) delete sources[key].players[sid]
  }

  return { updatedAt: new Date().toISOString(), dates, sources }
}
