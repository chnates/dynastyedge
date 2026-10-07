#!/usr/bin/env node
// The briefing ledger's alarm. Runs in Actions AFTER the publish step and FAILS
// the workflow when the ledger has stopped growing — the recorder step is
// continue-on-error, so without this a dead recorder leaves every run green
// while days that can never be scored go unrecorded (the NEWS-6 lesson:
// best-effort had become "fails invisibly").
//
// After publish, never before, so the alarm can never cost data. A MISSING
// FILE IS ITSELF AN ALARM. The policy (assessLedger, MAX_LEDGER_LAG_DAYS) is
// pure in scripts/briefingLedger.mjs and pinned by tests.

import { readFileSync } from 'node:fs'
import { assessLedger, MAX_LEDGER_LAG_DAYS } from './briefingLedger.mjs'

const file = process.argv[2] || 'briefing-ledger.json'
const today = new Date().toISOString().slice(0, 10)
const annotate = msg => console.log(`::error::${msg.split('\n')[0]}`)

let doc
try {
  doc = JSON.parse(readFileSync(file, 'utf8'))
} catch (err) {
  const msg =
    `${file} was not produced by this run (${err.code === 'ENOENT' ? 'no file' : err.message}).\n` +
    'The recorder step is continue-on-error, so the run stayed green while recording nothing.\n' +
    'Any previous ledger is still on the branch, but today was not recorded — and cannot be later.'
  annotate(msg)
  console.error(`\n${msg}`)
  process.exit(1)
}

const a = assessLedger(doc, today)
console.log(
  `  ${a.days} day(s) in the ledger, ${a.recorded} recorded · newest recorded ${a.newestRecorded ?? 'none'}` +
  `${a.lagDays != null ? ` (${a.lagDays} day(s) ago)` : ''}` +
  `${a.unreadableRun ? ` · last ${a.unreadableRun} day(s) unreadable` : ''}`
)

if (a.stale) {
  const msg =
    `The briefing ledger has not recorded a readable day for ${a.lagDays ?? 'any'} day(s) ` +
    `(alarm at ${MAX_LEDGER_LAG_DAYS}).\n` +
    'Each missing day is a briefing that can never be scored. Read the "Record the briefing" ' +
    'step log: an unreadable day names its reason (Sleeper / FantasyCalc unreachable, roster ' +
    'missing); no log line at all means the script died — run it by hand with ' +
    '`node --import ./scripts/register.mjs scripts/record-briefing.mjs`.'
  annotate(msg)
  console.error(`\n${msg}`)
  process.exit(1)
}
console.log('\nBriefing ledger is recording.')
