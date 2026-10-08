// The Playoffs page tells the owner how the odds have actually done in this
// league ("How accurate is it?"). Those figures have ONE home —
// ODDS_TRACK_RECORD in src/utils/playoffOdds.js — and they are MEASURED, never
// typed: CLAUDE.md Feature 14 and open-items §0 standing rule 8 ("every new
// number in the app must be traceable to a committed, re-runnable script").
// This test re-derives them from the frozen 2023–25 inputs through the same
// replay the analysis used (scripts/dev/oddsReplay.mjs), so a hand-edit — or a
// model change that moves them — fails here until the constant is regenerated.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { ODDS_TRACK_RECORD } from '../src/utils/playoffOdds.js'
import { PRIMARY_WINDOW, replaySeasons, standingsAgree, trackRecord } from '../scripts/dev/oddsReplay.mjs'

const data = JSON.parse(gunzipSync(readFileSync(new URL('../docs/analysis/data/odds-calibration-2026-10.json.gz', import.meta.url))).toString())

test('the replay\'s truth is sound: every bracket field matches the rebuilt standings', () => {
  for (const s of data.seasons) assert.equal(standingsAgree(s).agree, true, `season ${s.season}`)
})

test('ODDS_TRACK_RECORD equals what the frozen replay measures (regenerate, never hand-edit)', () => {
  const preds = replaySeasons(data.seasons, { cutoffs: PRIMARY_WINDOW })
  assert.deepEqual(trackRecord(preds), ODDS_TRACK_RECORD)
})

test('the Playoffs page reads the constant and types none of its figures', () => {
  const page = readFileSync(new URL('../src/components/league/PlayoffOdds.jsx', import.meta.url), 'utf8')
  assert.match(page, /ODDS_TRACK_RECORD/)
  for (const v of Object.values(ODDS_TRACK_RECORD)) {
    if (typeof v !== 'number') continue
    assert.doesNotMatch(page, new RegExp(`[^\\d.]${v}%`), `${v}% is typed into PlayoffOdds.jsx — read ODDS_TRACK_RECORD`)
  }
})
