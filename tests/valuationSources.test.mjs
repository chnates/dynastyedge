// Pins the multi-source valuation readers (scripts/valuationSources.mjs).
//
// Every assertion cites a documented behaviour from CLAUDE.md (the Value
// history pipeline's consensus archive, rule 2's "join on sleeperId, never
// guess", rule 7, rule 8's id normalization) or from build-plan §10, so a
// failure here is either a code regression or doc drift.
//
// The three findings that produced most of these tests were all measured live
// on 2026-09-21 and would each have silently corrupted a PERMANENT archive:
// dynastyprocess's "NA" null sentinel, KTC's ktc_id mis-mapping Frank Gore Jr.
// onto Frank Gore Sr., and a failed source reading as a value rather than as
// an absence.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  parseCSV, crosswalkCell, buildCrosswalk,
  readDynastyProcess, extractKtcPlayers, readKeepTradeCut,
  mergeConsensusColumn, SOURCE_KEYS,
} from '../scripts/valuationSources.mjs'

// --- the crosswalk ---------------------------------------------------------

test('"NA" is a NULL sentinel, not an id — the dynastyprocess CSV trap', () => {
  // dynastyprocess writes from R: a missing id is the literal string "NA" on
  // 6,103 of db_playerids' 12,502 rows. Read as a value it is one valid key
  // that every unmapped player collapses onto.
  assert.equal(crosswalkCell('NA'), null)
  assert.equal(crosswalkCell(''), null)
  assert.equal(crosswalkCell('  '), null)
  assert.equal(crosswalkCell(undefined), null)
  assert.equal(crosswalkCell(' 4983 '), '4983')
})

test('a crosswalk row with no real sleeper_id contributes nothing', () => {
  const cw = buildCrosswalk([
    { sleeper_id: '4983', fantasypros_id: '17261', mfl_id: '13137', ktc_id: '301' },
    { sleeper_id: 'NA', fantasypros_id: '99999', mfl_id: '99999', ktc_id: '999' },
    { sleeper_id: '', fantasypros_id: '88888', mfl_id: '88888', ktc_id: '888' },
  ])
  assert.equal(cw.withSleeperId, 1)
  assert.equal(cw.byFantasyPros.get('17261'), '4983')
  // The two unmapped rows must not be reachable by ANY of the three keys —
  // reaching them means four distinct players share one bogus sleeper id.
  assert.equal(cw.byFantasyPros.get('99999'), undefined)
  assert.equal(cw.byMfl.get('88888'), undefined)
  assert.equal(cw.byKtc.get('999'), undefined)
})

// --- DynastyProcess --------------------------------------------------------

const DP_ROWS = [
  { player: "Ja'Marr Chase", pos: 'WR', value_2qb: '9227', fp_id: '19788', scrape_date: '2026-09-18' },
  { player: 'Josh Allen', pos: 'QB', value_2qb: '8800', fp_id: '16428', scrape_date: '2026-09-18' },
  { player: '2026 Pick 1.01', pos: 'PICK', value_2qb: '5000', fp_id: 'NA', scrape_date: '2026-09-18' },
  { player: 'Deep Stash', pos: 'RB', value_2qb: 'NA', fp_id: '28085', scrape_date: '2026-09-18' },
  { player: 'Unmapped Rookie', pos: 'WR', value_2qb: '400', fp_id: '28152', scrape_date: '2026-09-18' },
]
const DP_CROSSWALK = buildCrosswalk([
  { sleeper_id: '7564', fantasypros_id: '19788', mfl_id: '15266', ktc_id: 'NA' },
  { sleeper_id: '4984', fantasypros_id: '16428', mfl_id: '13589', ktc_id: 'NA' },
  { sleeper_id: '9001', fantasypros_id: '28085', mfl_id: '17001', ktc_id: 'NA' },
])

test('DynastyProcess joins on fp_id and never on a name', () => {
  const read = readDynastyProcess(DP_ROWS, DP_CROSSWALK)
  assert.equal(read.values['7564'], 9227)
  assert.equal(read.values['4984'], 8800)
  assert.equal(read.asOf, '2026-09-18')
  // 'Unmapped Rookie' has a real value and a real fp_id the crosswalk doesn't
  // carry. It is DROPPED, not name-matched — 9 of 494 were in exactly this
  // state live, all deep rookies, and a name match is what rule 2 forbids.
  assert.equal(read.unjoined, 1)
  assert.ok(!Object.values(read.values).includes(400))
})

test('a PICK row is not a player', () => {
  const read = readDynastyProcess(DP_ROWS, DP_CROSSWALK)
  assert.equal(read.total, 4)                      // 5 rows less the PICK
  assert.ok(!Object.values(read.values).includes(5000))
})

test('an unpriceable DynastyProcess row is ABSENT, never 0', () => {
  // rule 7 / §10's hard rule: a null is skipped by every consumer; a 0 counts
  // into a total and renders as fact. 'Deep Stash' joins fine but carries
  // value_2qb "NA".
  const read = readDynastyProcess(DP_ROWS, DP_CROSSWALK)
  assert.equal(read.unpriced, 1)
  assert.equal(read.values['9001'], undefined)
  assert.ok(!Object.values(read.values).includes(0))
})

// --- KeepTradeCut ----------------------------------------------------------

const ktcEntry = (playerName, playerID, mflid, position, value) => ({
  playerName, playerID, mflid, position,
  superflexValues: { value, rank: 1, tep: { value: value + 500 }, tepp: { value: value + 900 } },
})

// Frank Gore Jr. is the live collision: the crosswalk's ktc_id row points at
// Sleeper 232 (Frank Gore SR., 17 years exp, no team) where mfl_id correctly
// gives 11573 (BUF, 2 years exp).
const KTC_CROSSWALK = buildCrosswalk([
  { sleeper_id: '1415', fantasypros_id: 'NA', mfl_id: '16162', ktc_id: '1415' },
  { sleeper_id: '232', fantasypros_id: 'NA', mfl_id: '9012', ktc_id: '232' },
  { sleeper_id: '11573', fantasypros_id: 'NA', mfl_id: '11573', ktc_id: 'NA' },
])

test('KeepTradeCut joins on mfl_id FIRST — the Frank Gore Jr. collision', () => {
  const read = readKeepTradeCut(
    [ktcEntry('Frank Gore Jr.', 232, '11573', 'RB', 3000)],
    KTC_CROSSWALK
  )
  // mfl_id wins: the younger Gore, not the retired one. Joining on ktc_id
  // would archive a rookie's rising value against a player who left the league.
  assert.equal(read.values['11573'], 3000)
  assert.equal(read.values['232'], undefined)
  assert.equal(read.viaMfl, 1)
  assert.equal(read.viaKtc, 0)
})

test('ktc_id remains a fallback for an entry shipping no mflid', () => {
  const read = readKeepTradeCut(
    [ktcEntry('No Mfl', 1415, null, 'RB', 2200)],
    KTC_CROSSWALK
  )
  assert.equal(read.values['1415'], 2200)
  assert.equal(read.viaKtc, 1)
})

test('an "RDP" entry is a draft pick, not a player', () => {
  const read = readKeepTradeCut(
    [ktcEntry('2027 Early 1st', 900, '900', 'RDP', 6937),
     ktcEntry('Jahmyr Gibbs', 1415, '16162', 'RB', 9999)],
    KTC_CROSSWALK
  )
  assert.equal(read.picks, 1)
  assert.equal(read.total, 1)
  assert.ok(!Object.values(read.values).includes(6937))
})

test('KeepTradeCut reads superflexValues.value, never the TE-premium siblings', () => {
  // tep/tepp/teppp are the same board under a DIFFERENT scoring format. This
  // league is not TE-premium, so reading one would be a different question
  // wearing the same field name.
  const read = readKeepTradeCut([ktcEntry('Jahmyr Gibbs', 1415, '16162', 'RB', 9999)], KTC_CROSSWALK)
  assert.equal(read.values['1415'], 9999)
})

test('the ktc-players JSON island is extracted — the CURRENT page shape', () => {
  // Shipped 2026-09-21, replacing the `var playersArray = [...]` literal §10
  // probed on 2026-09-04.
  const html = `<html><body>
    <script type="application/json" id="ktc-players">[{"playerName":"Jahmyr Gibbs","playerID":1415}]</script>
    <script>var playersArray = JSON.parse(document.getElementById('ktc-players').textContent);</script>
  </body></html>`
  const entries = extractKtcPlayers(html)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].playerName, 'Jahmyr Gibbs')
})

test('a changed or broken KTC page returns NULL rather than throwing', () => {
  // KTC is a page, not an API, and its shape has already changed once. Every
  // failure mode must degrade to "publish the other two", never fail the run.
  assert.equal(extractKtcPlayers('<html><body>redesigned</body></html>'), null)
  assert.equal(
    extractKtcPlayers('<script type="application/json" id="ktc-players">{not json</script>'),
    null
  )
  // The OLD shape, kept as an executable regression statement: if KTC ever
  // reverts to the inline literal, this returns null and the source hides —
  // it does not silently parse something else.
  assert.equal(extractKtcPlayers('<script>var playersArray = [{"playerName":"X"}];</script>'), null)
  assert.equal(extractKtcPlayers(''), null)
  assert.equal(extractKtcPlayers(null), null)
})

// --- the archive merge -----------------------------------------------------

const reading = (values, asOf = null) => ({ values, asOf })
const ALL_THREE = {
  fantasycalc: reading({ '1': 100, '2': 200 }),
  dynastyprocess: reading({ '1': 90, '2': 210 }, '2026-09-18'),
  keeptradecut: reading({ '1': 110, '2': 205 }),
}

test('a column is appended per date, aligned across every source', () => {
  let a = mergeConsensusColumn({ archive: { dates: [], sources: {} }, date: '2026-09-21', readings: ALL_THREE })
  a = mergeConsensusColumn({ archive: a, date: '2026-09-22', readings: ALL_THREE })
  assert.deepEqual(a.dates, ['2026-09-21', '2026-09-22'])
  for (const key of SOURCE_KEYS) {
    assert.equal(a.sources[key].players['1'].length, 2)
    assert.equal(a.sources[key].asOf.length, 2)
    assert.equal(a.sources[key].coverage.length, 2)
  }
  assert.deepEqual(a.sources.dynastyprocess.asOf, ['2026-09-18', '2026-09-18'])
})

test('a same-day re-run REPLACES its column rather than appending a second', () => {
  let a = mergeConsensusColumn({ archive: { dates: [], sources: {} }, date: '2026-09-21', readings: ALL_THREE })
  a = mergeConsensusColumn({
    archive: a, date: '2026-09-21',
    readings: { ...ALL_THREE, fantasycalc: reading({ '1': 150, '2': 250 }) },
  })
  assert.deepEqual(a.dates, ['2026-09-21'])
  assert.deepEqual(a.sources.fantasycalc.players['1'], [150])
})

test('a FAILED source is all-null with asOf null — never 0, and it erases nothing', () => {
  // The degradation contract. "We did not observe" and "the source priced
  // nobody" are different statements; a 0 would be read by 4d as a genuine
  // collapse in value.
  let a = mergeConsensusColumn({ archive: { dates: [], sources: {} }, date: '2026-09-21', readings: ALL_THREE })
  a = mergeConsensusColumn({
    archive: a, date: '2026-09-22',
    readings: { ...ALL_THREE, keeptradecut: null },
  })
  assert.deepEqual(a.sources.keeptradecut.players['1'], [110, null])
  assert.deepEqual(a.sources.keeptradecut.asOf, [null, null])
  assert.deepEqual(a.sources.keeptradecut.coverage, [2, null])
  // The other two are untouched, which is the half that matters.
  assert.deepEqual(a.sources.fantasycalc.players['1'], [100, 100])
  assert.deepEqual(a.sources.dynastyprocess.players['2'], [210, 210])
})

test('a source appearing for the first time back-fills nulls, not zeros', () => {
  let a = mergeConsensusColumn({
    archive: { dates: [], sources: {} }, date: '2026-09-21',
    readings: { ...ALL_THREE, keeptradecut: null },
  })
  a = mergeConsensusColumn({ archive: a, date: '2026-09-22', readings: ALL_THREE })
  assert.deepEqual(a.sources.keeptradecut.players['1'], [null, 110])
})

test('columns are NEVER pruned by time — the archive is permanent', () => {
  // The rolling values-history.json prunes at 90 days, which is exactly why
  // it cannot answer §10 4d. This file must not inherit that.
  let a = { dates: [], sources: {} }
  for (let d = 0; d < 400; d++) {
    a = mergeConsensusColumn({
      archive: a,
      date: new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10),
      readings: ALL_THREE,
    })
  }
  assert.equal(a.dates.length, 400)
  assert.equal(a.sources.fantasycalc.players['1'][0], 100)
})

test('a row ages out only when EVERY source has gone null for it', () => {
  // Pruning per-source would leave the three players maps holding different
  // id sets, which is the comparison this file exists to make easy.
  const withBoth = {
    fantasycalc: reading({ '1': 100, '2': 200 }),
    dynastyprocess: reading({ '1': 90, '2': 210 }),
    keeptradecut: reading({ '1': 110, '2': 205 }),
  }
  // '2' keeps a DynastyProcess price while FantasyCalc and KTC drop him.
  const onlyDp = {
    fantasycalc: reading({ '1': 100 }),
    dynastyprocess: reading({ '1': 90, '2': 210 }),
    keeptradecut: reading({ '1': 110 }),
  }
  let a = mergeConsensusColumn({ archive: { dates: [], sources: {} }, date: '2026-09-21', readings: withBoth, inactiveColumns: 3 })
  for (let d = 0; d < 5; d++) {
    a = mergeConsensusColumn({
      archive: a, date: `2026-09-2${2 + d}`, readings: onlyDp, inactiveColumns: 3,
    })
  }
  assert.ok(a.sources.fantasycalc.players['2'], 'kept: one source still prices him')
  // Now every source drops him.
  const none = {
    fantasycalc: reading({ '1': 100 }),
    dynastyprocess: reading({ '1': 90 }),
    keeptradecut: reading({ '1': 110 }),
  }
  for (let d = 0; d < 4; d++) {
    a = mergeConsensusColumn({ archive: a, date: `2026-10-0${1 + d}`, readings: none, inactiveColumns: 3 })
  }
  for (const key of SOURCE_KEYS) assert.equal(a.sources[key].players['2'], undefined)
  assert.ok(a.sources.fantasycalc.players['1'])
})

test('each source is capped by its OWN ranking, since the scales differ', () => {
  // Before 4b's normalization there is no common scale, so a cross-source
  // top-N would be meaningless. KTC's floor (465 live) outranks most of
  // FantasyCalc's board on raw magnitude alone.
  const a = mergeConsensusColumn({
    archive: { dates: [], sources: {} }, date: '2026-09-21',
    readings: {
      fantasycalc: reading({ a: 30, b: 20, c: 10 }),
      dynastyprocess: reading({ d: 3000, e: 2000, f: 1000 }),
      keeptradecut: null,
    },
    maxPlayers: 2,
  })
  const tracked = Object.keys(a.sources.fantasycalc.players).sort()
  assert.deepEqual(tracked, ['a', 'b', 'd', 'e'])   // top 2 of each, not top 2 overall
})

// --- CSV -------------------------------------------------------------------

test('quoted CSV fields survive commas and doubled quotes', () => {
  const rows = parseCSV('"player","pos","value_2qb"\n"Smith, Jr.","RB","900"\n"He said ""hi""","WR","10"')
  assert.equal(rows.length, 2)
  assert.equal(rows[0].player, 'Smith, Jr.')
  assert.equal(rows[0].value_2qb, '900')
  assert.equal(rows[1].player, 'He said "hi"')
})
