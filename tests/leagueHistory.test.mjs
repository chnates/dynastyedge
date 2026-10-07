// The league-history walk has ONE home: src/utils/leagueHistory.js, shared by
// the app's useLeagueHistory and the MCP server's mcp/history.js
// (CODE-REVIEW-1 #3, 2026-10-07). Its contract: "never traded" is not "we
// could not read". Until then the app turned a failed season into "nobody
// traded", a failed drafts list into "never drafted", and a failed chain hop
// into a younger league.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  MAX_SEASONS_BACK, playedWeeks, walkLeagueChain, fetchDraftsWithPicks,
  fetchSeasonLedger, ledgerCoverage, noTradesLabel,
} from '../src/utils/leagueHistory.js'
import { buildMyInsights } from '../src/utils/managerAnalysis.js'

const B = 'https://x'
// A fake fetcher: a URL → value map; a function value throws or computes.
const fakeGet = routes => async url => {
  const path = url.slice(B.length)
  if (!(path in routes)) throw new Error(`404 ${path}`)
  const v = routes[path]
  if (v instanceof Error) throw v
  return typeof v === 'function' ? v() : v
}

test('the chain walks to its natural end and reports no break', async () => {
  const get = fakeGet({
    '/league/L25': { league_id: 'L25', season: '2025', previous_league_id: 'L24' },
    '/league/L24': { league_id: 'L24', season: '2024', previous_league_id: '0' },
  })
  const r = await walkLeagueChain(get, { season: '2026', previous_league_id: 'L25' }, { base: B })
  assert.deepEqual(r.pastLeagues.map(l => l.season), ['2025', '2024'])
  assert.equal(r.chainBroken, null)
})

test('a failed hop is NAMED, never a silent end of history', async () => {
  const get = fakeGet({
    '/league/L25': { league_id: 'L25', season: '2025', previous_league_id: 'L24' },
    '/league/L24': new Error('HTTP 503'),
  })
  const r = await walkLeagueChain(get, { season: '2026', previous_league_id: 'L25' }, { base: B })
  assert.deepEqual(r.pastLeagues.map(l => l.season), ['2025'])
  assert.equal(r.chainBroken.afterSeason, '2025')
  assert.equal(r.chainBroken.leagueId, 'L24')
  assert.match(r.chainBroken.error, /503/)
})

test('the cap stops the walk without calling it broken', async () => {
  let n = 0
  const get = async () => ({ league_id: `L${n}`, season: String(2025 - n), previous_league_id: `L${++n}` })
  const r = await walkLeagueChain(get, { season: '2026', previous_league_id: 'L0' }, { base: B })
  assert.equal(r.pastLeagues.length, MAX_SEASONS_BACK)
  assert.equal(r.chainBroken, null)
})

test('drafts: the LIST error propagates; a per-draft picks error is []', async () => {
  await assert.rejects(fetchDraftsWithPicks(fakeGet({}), 'L1', { base: B }))
  const get = fakeGet({ '/league/L1/drafts': [{ draft_id: 'd1' }, { draft_id: 'd2' }], '/draft/d1/picks': [{ pick_no: 1 }] })
  const d = await fetchDraftsWithPicks(get, 'L1', { base: B })
  assert.equal(d[0].picks.length, 1)
  assert.deepEqual(d[1].picks, [])
})

test('a season ledger: all buckets failing THROWS; one failing is a partial season', async () => {
  const info = { league_id: 'L', season: '2024', settings: { last_scored_leg: 3 } }
  assert.equal(playedWeeks(info), 3)
  assert.equal(playedWeeks({}), 18)
  await assert.rejects(fetchSeasonLedger(fakeGet({ '/league/L/users': [] }), info, { base: B }), /2024/)

  const get = fakeGet({
    '/league/L/users': [{ user_id: 'u' }],
    '/league/L/transactions/1': [{ status: 'complete', type: 'trade', status_updated: 1 }, { status: 'failed' }],
    '/league/L/transactions/3': [],
  })
  const l = await fetchSeasonLedger(get, info, { base: B })
  assert.deepEqual(l.failedWeeks, [2])
  assert.equal(l.transactions.length, 1)
  assert.equal(l.transactions[0].week, 1)
})

test('coverage: complete only when every season was read', () => {
  const full = ledgerCoverage({ currentSeason: '2026', ledgerSeasons: ['2025', '2024'] })
  assert.equal(full.complete, true)
  assert.deepEqual(full.seasonsRead, ['2026', '2025', '2024'])
  assert.equal(noTradesLabel(full), 'No trades yet')

  const gap = ledgerCoverage({ currentSeason: '2026', ledgerSeasons: ['2025'], failedSeasons: ['2024'] })
  assert.equal(gap.complete, false)
  assert.deepEqual(gap.seasonsMissing, ['2024'])
  assert.equal(noTradesLabel(gap), 'No trades in the 2 seasons we could read')

  const broken = ledgerCoverage({
    currentSeason: '2026', ledgerSeasons: ['2025'], chainBroken: { afterSeason: '2025' },
  })
  assert.equal(broken.complete, false)
  assert.deepEqual(broken.seasonsMissing, ['any season before 2025'])

  const none = ledgerCoverage({ currentSeason: '2026', currentRead: false, historyRead: false })
  assert.equal(none.available, false)
  assert.deepEqual(none.seasonsMissing, ['2026', 'every past season'])
  assert.equal(noTradesLabel(null), 'No trades yet')   // no coverage passed = read everything
})

test('"You haven\'t completed a trade" is only said over a complete read', () => {
  const me = {
    ownerId: 'me', tradeCount: 0, netValue: 0, trades: [],
    faab: { budgetsCommitted: 0, valuePerBudget: null }, draft: { count: 0 },
  }
  const said = w => w.workOn.some(x => /haven't completed a trade/.test(x))
  assert.equal(said(buildMyInsights([me], me)), true)
  assert.equal(said(buildMyInsights([me], me, ledgerCoverage({ currentSeason: '2026' }))), true)
  assert.equal(said(buildMyInsights([me], me, ledgerCoverage({ currentSeason: '2026', failedSeasons: ['2025'] }))), false)
})

// The guard: nothing else in src/ or mcp/ walks the chain itself.
test('no second history walk in src/ or mcp/', () => {
  const root = new URL('..', import.meta.url).pathname
  const files = []
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(js|jsx|mjs)$/.test(name)) files.push(p)
    }
  }
  walk(join(root, 'src'))
  walk(join(root, 'mcp'))
  const copies = []
  for (const f of files) {
    if (f.endsWith('utils/leagueHistory.js')) continue
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (line.trim().startsWith('//')) return
      if (/\.previous_league_id\b/.test(line) || /\b(MAX_SEASONS_BACK|TX_WEEKS|LEDGER_MAX_WEEK)\s*=\s*\d/.test(line)) {
        copies.push(`${f.slice(root.length)}:${i + 1}`)
      }
    })
  }
  assert.deepEqual(copies, [], 'use src/utils/leagueHistory.js instead')
})
