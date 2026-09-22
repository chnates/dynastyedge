#!/usr/bin/env node
// THE alarm. Runs in Actions AFTER the publish step and FAILS THE WORKFLOW when
// a source has gone dark, which is what turns GitHub's own notification into
// the warning — a run log nobody reads is not a warning.
//
// It runs after publish, never before, so the alarm can never cost data: the
// day's file is already on the branch by the time this decides to shout.
//
// Two shapes, one policy (scripts/sourceHealth.mjs):
//   --archive values-consensus.json   columnar; coverage[] aligned to dates[]
//   --feed    news.json               snapshot; carries its own miss counter
//
// A MISSING FILE IS ITSELF AN ALARM. Every snapshot step is
// `continue-on-error`, so a script that died outright leaves the run green and
// writes nothing — silence that looks exactly like success. Absence is the
// loudest signal here, so it is treated as one.

import { readFileSync } from 'node:fs'
import {
  assessArchiveSources, darkFeedSources, formatAlarm, DARK_AFTER,
} from './sourceHealth.mjs'

const args = process.argv.slice(2)
const mode = args[0]
const file = args[1]
if (!['--archive', '--feed'].includes(mode) || !file) {
  console.error('usage: check-source-health.mjs --archive|--feed <file>')
  process.exit(2)
}

// GitHub renders ::error:: in the run summary and the failure notification.
const annotate = msg => console.log(`::error::${msg.split('\n')[0]}`)

let doc
try {
  doc = JSON.parse(readFileSync(file, 'utf8'))
} catch (err) {
  const msg =
    `${file} was not produced by this run (${err.code === 'ENOENT' ? 'no file' : err.message}).\n` +
    'Its snapshot step is continue-on-error, so the run stayed green while writing nothing.\n' +
    'The previous file is still on the branch — no data was lost — but nothing was added today.'
  annotate(msg)
  console.error(`\n${msg}`)
  process.exit(1)
}

let findings = []
let alarm = null

if (mode === '--archive') {
  const assessed = assessArchiveSources(doc)
  findings = assessed.filter(f => f.dark)
  for (const f of assessed) {
    console.log(
      `  ${f.key.padEnd(16)} ${f.misses === 0 ? 'read today' : `${f.misses} consecutive day(s) unread`}` +
      `${f.everSeen ? '' : ' · NEVER read'} · ${f.columns} column(s) of history`
    )
  }
  alarm = formatAlarm({
    pipeline: 'values-consensus.json',
    findings, unit: 'day',
    fixHint:
      'KeepTradeCut is a scraped page and the likeliest to break — check ' +
      'extractKtcPlayers in scripts/valuationSources.mjs against the live page.',
  })
} else {
  const misses = doc?.coverage?.sourceMisses ?? {}
  const counts = doc?.coverage?.sources ?? {}
  findings = darkFeedSources(misses)
  for (const [name, n] of Object.entries(counts)) {
    const m = Number(misses[name]) || 0
    console.log(`  ${name.padEnd(16)} ${n} item(s) this run${m ? ` · ${m} consecutive run(s) empty` : ''}`)
  }
  if (!Object.keys(misses).length) {
    console.log('\n  (no sourceMisses counter yet — it starts accumulating from this run)')
  }
  alarm = formatAlarm({
    pipeline: 'news.json',
    findings, unit: 'run',
    fixHint:
      `Threshold is ${DARK_AFTER.feed} runs (~1.5 days at the measured ~7.4 runs/day). ` +
      'Probe the URL by hand first, then read the run log: a source can be alive ' +
      'everywhere and still hand Actions nothing — ESPN RSS answered the runners with ' +
      'an empty HTTP 202 and was removed. A source unreachable from Actions should go.',
  })
}

if (alarm) {
  annotate(alarm)
  console.error(`\n${alarm}`)
  process.exit(1)
}
console.log('\nAll sources contributing.')
