// tests/transactions.test.mjs — pins the transaction feed's degradation
// contract (src/hooks/useTransactions.js loadTransactions) with a mocked fetch.
//
// Behaviors pinned (with their doc source):
//  - CLAUDE.md Data Sources / Feature 6: all 18 weekly buckets fetched in
//    parallel; a failed bucket contributes nothing (per-week catch), filtered
//    to status === 'complete', newest first.
//  - F7 fix: when EVERY bucket fails the load rejects, so League › Activity
//    shows ErrorState instead of an empty feed masquerading as "no moves" —
//    and the rejection is not cached, so retry refetches.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { loadTransactions } from '../src/hooks/useTransactions.js'

const calls = []
let failing = () => false // (week) => should this bucket's fetch fail?

globalThis.fetch = async url => {
  const week = Number(String(url).split('/').pop())
  calls.push(week)
  if (failing(week)) return { ok: false, status: 500, json: async () => ({}) }
  return {
    ok: true,
    json: async () => [
      { transaction_id: `t${week}`, status: 'complete', type: 'trade', status_updated: week },
      { transaction_id: `p${week}`, status: 'pending', type: 'trade', status_updated: week },
    ],
  }
}

test('all 18 buckets failing rejects — League › Activity shows ErrorState (F7)', async () => {
  calls.length = 0
  failing = () => true
  await assert.rejects(() => loadTransactions(), /Could not load league activity/)
  assert.equal(calls.length, 18)
})

test('after a total outage, retry refetches and resolves (rejection is not cached)', async () => {
  failing = w => w === 7 // one bad bucket degrades silently, per-week catch preserved
  calls.length = 0
  const all = await loadTransactions()
  assert.equal(calls.length, 18)
  // 17 good buckets × 1 complete tx each; pending txs and the failed bucket
  // contribute nothing.
  assert.equal(all.length, 17)
  assert.ok(all.every(tx => tx.status === 'complete'))
  assert.ok(!all.some(tx => tx.week === 7))
  // Newest first by status_updated.
  assert.equal(all[0].week, 18)

  // The successful result IS cached — a plain re-load fetches nothing new.
  calls.length = 0
  const cached = await loadTransactions()
  assert.equal(cached, all)
  assert.equal(calls.length, 0)
})
