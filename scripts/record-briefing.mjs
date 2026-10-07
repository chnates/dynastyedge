#!/usr/bin/env node
// Records, once a day, what The Edge's briefing would tell the owner — the
// substrate for scoring the briefing against the moves that actually paid
// (open-items §0 #10; the plan is docs/analysis/briefing-decision-quality-2026-10.md).
//
// A day not recorded can never be scored, so recording ships before scoring.
//
// THE APP NEVER FETCHES THE OUTPUT. `briefing-ledger.json` is a permanent file
// on the values-history branch, like values-consensus.json: no request, no
// constant, no bundle weight on the phone.
//
// The league is assembled by mcp/snapshot.js's getSnapshot — the same
// buildLeagueState join every MCP tool reads — and the claims are the app's own
// computeEdgeSignals / buildBriefing (scripts/briefingLedger.mjs). Nothing here
// decides who to name.
//
// Runs in .github/workflows/values-history.yml under continue-on-error; the
// publish step carries the previous ledger forward from the branch on any miss,
// and scripts/check-briefing-ledger.mjs fails the run AFTER publish when the
// ledger has stopped growing.

import { writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { getSnapshot } from '../mcp/snapshot.js'
import { LEAGUE_ID, MY_ROSTER_ID } from '../src/constants.js'
import {
  recordBriefingDay, unreadableDay, mergeLedgerDay, emptyLedger, isLedgerShape,
} from './briefingLedger.mjs'

const LEDGER_URL =
  'https://raw.githubusercontent.com/chnates/dynastyedge/values-history/briefing-ledger.json'

const leagueId = process.env.DYNASTYEDGE_LEAGUE_ID || LEAGUE_ID
const myRosterId = Number(process.env.DYNASTYEDGE_ROSTER_ID || MY_ROSTER_ID)
const date = new Date().toISOString().slice(0, 10)   // 'YYYY-MM-DD' (UTC)
const codeVersion = process.env.GITHUB_SHA || null

// --- the existing ledger ----------------------------------------------------
// 404 = first run, start fresh. Anything else is FATAL: the workflow
// force-pushes whatever this writes, so starting fresh after a transient CDN
// error would replace a permanent record with one day. Same contract as
// snapshot-consensus.mjs. (The publish step also refuses to drop the file.)
let ledger = emptyLedger()
try {
  const res = await fetch(`${LEDGER_URL}?t=${Date.now()}`, { signal: AbortSignal.timeout(30000) })
  if (res.status === 404) {
    console.log('No existing briefing ledger — starting fresh')
  } else if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  } else {
    const prev = await res.json()
    if (!isLedgerShape(prev)) {
      console.error('Existing briefing ledger has an unexpected shape — aborting rather than replacing it')
      process.exit(1)
    }
    ledger = prev
    console.log(`Loaded existing ledger: ${ledger.days.length} day(s)`)
  }
} catch (err) {
  console.error(`Could not load the existing ledger (${err.message}) — aborting to avoid data loss`)
  process.exit(1)
}

// --- today's record ---------------------------------------------------------
// A failed assembly is still WRITTEN, as an unreadable day with its reason:
// "we could not read the league today" is a fact about the record, and a
// silent hole would look exactly like a day that was never attempted.
let day
try {
  const snapshot = await getSnapshot({ leagueId, myRosterId })
  day = recordBriefingDay({ date, snapshot, myRosterId, codeVersion })
} catch (err) {
  console.error(`  snapshot FAILED — ${err.message}`)
  day = unreadableDay({ date, codeVersion, reason: `snapshot failed: ${err.message}` })
}

const next = mergeLedgerDay(ledger, day)
const json = JSON.stringify(next)
writeFileSync('briefing-ledger.json', json)

if (day.status === 'recorded') {
  const { items } = day
  const name = row => row?.name ?? row?.teamName ?? '—'
  const line = (label, it, subject, pool) =>
    `  ${label.padEnd(15)} ${it.fired ? name(subject) : '(quiet)'}` +
    `${it.slot ? ` · slot ${it.slot}` : it.fired ? ' · past the 5-card cut' : ''}${pool ? ` · ${pool}` : ''}`
  console.log(`${date} · week ${day.league.week} ${day.league.seasonType} · roster ${myRosterId} (${day.me.tier})`)
  console.log(line('buy-low', items.buyLow, items.buyLow.player, `${items.buyLow.candidates.count} eligible`))
  console.log(line('sell-high', items.sellHigh, items.sellHigh.player, `${items.sellHigh.candidates.count} eligible`))
  console.log(line('pickup', items.pickup, items.pickup.player, `${items.pickup.alternatives.length} alternative(s)`))
  console.log(line('closing-window', items.closingWindow, items.closingWindow.team, null))
  console.log(line('underperformer', items.underperformer, items.underperformer.team,
    items.underperformer.gamesPlayed ? null : 'no games played'))
} else {
  console.log(`${date} · UNREADABLE — ${day.reason}`)
}

const raw = Buffer.byteLength(json)
const wire = gzipSync(json).length
console.log(
  `Wrote briefing-ledger.json: ${next.days.length} day(s) — ` +
  `${(raw / 1024).toFixed(1)}KB raw / ${(wire / 1024).toFixed(1)}KB wire`
)
