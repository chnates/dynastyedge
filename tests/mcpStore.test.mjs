// tests/mcpStore.test.mjs — pins mcp/store.js, the cache backend boundary.
//
// Behaviors pinned (with their source):
//  - CLAUDE.md, The MCP Server / "Caching and freshness": on an upstream
//    failure, SERVE THE CACHE AND LABEL ITS AGE; a cold failure with nothing
//    cached still throws, because that is a real "I don't know".
//  - MCP_DISCOVERY.md §7 and CLAUDE.md non-negotiable 1: `fetchedAt` is the
//    provenance the whole design rests on. It must round-trip through any
//    store byte-for-byte — it becomes asOf.sources[*].fetchedAt and feeds
//    oldestSourceAt.
//  - CLAUDE.md, "wrong for phase 2's serverless deployment, which has no warm
//    process and wants external KV": the backend is a parameter; the
//    freshness POLICY is shared, in one place.
//  - mcp/store.js's header: a store-level expiry is garbage collection only.
//    If the store evicts at the TTL, the stale-fallback path loses its
//    fallback — the trap this file exists to pin.
//  - The repo's best-effort discipline: a store failure degrades an answer to
//    "slower", never to "broken".

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  memoryStore, restKvStore, encodeEntry, decodeEntry, loadSource, STORE_GC_SECONDS,
} from '../mcp/store.js'

const TTL = 60 * 1000

// A load function that records its calls, so "was the cache used?" is a fact
// rather than an inference.
function countingLoad(value, { fail = false } = {}) {
  const fn = async () => {
    fn.calls++
    if (fail) throw new Error('upstream exploded')
    return value
  }
  fn.calls = 0
  return fn
}

test('memoryStore round-trips an entry and its fetchedAt', async () => {
  const store = memoryStore()
  assert.equal(await store.get('missing'), null)
  await store.set('k', { data: { a: 1 }, fetchedAt: 1234567890 })
  assert.deepEqual(await store.get('k'), { data: { a: 1 }, fetchedAt: 1234567890 })
  await store.clear()
  assert.equal(await store.get('k'), null, 'clear() empties the store')
})

test('encode/decode preserves fetchedAt EXACTLY — it is the provenance', async () => {
  const entry = { data: { deep: { nested: [1, 2, 3] } }, fetchedAt: 1789850264750 }
  const decoded = await decodeEntry(await encodeEntry(entry))
  assert.equal(decoded.fetchedAt, 1789850264750,
    'a store that rounds or drops fetchedAt breaks asOf.oldestSourceAt')
  assert.deepEqual(decoded.data, entry.data)
})

test('encoding compresses a player-DB-shaped payload well under the raw size', async () => {
  // Shaped like trimPlayerDB's output, which measured 1.20 MB raw / 180 KB
  // gzipped against the live league. Raw is at or over a typical hosted KV's
  // per-value limit; compressed it is not a question.
  const players = {}
  for (let i = 0; i < 12000; i++) {
    players[String(i)] = {
      name: `Player Number${i}`, position: 'WR', team: 'ATL',
      age: 25, years_exp: 3, injury_status: null,
    }
  }
  const raw = JSON.stringify({ data: players, fetchedAt: Date.now() }).length
  const encoded = (await encodeEntry({ data: players, fetchedAt: Date.now() })).length
  assert.ok(encoded < raw / 4, `expected >4x compression, got ${raw} -> ${encoded}`)
  const decoded = await decodeEntry(await encodeEntry({ data: players, fetchedAt: 7 }))
  assert.equal(Object.keys(decoded.data).length, 12000, 'nothing is lost in the round trip')
})

test('decodeEntry rejects junk rather than inventing an entry', async () => {
  assert.equal(await decodeEntry(null), null)
  assert.equal(await decodeEntry(''), null)
  // An entry with no numeric fetchedAt has no provenance, so it is not an entry.
  const noStamp = await encodeEntry({ data: { a: 1 }, fetchedAt: undefined })
  assert.equal(await decodeEntry(noStamp), null)
})

test('loadSource serves a FRESH cache without calling the loader', async () => {
  const store = memoryStore()
  await store.set('k', { data: 'cached', fetchedAt: Date.now() })
  const load = countingLoad('fresh')
  const out = await loadSource(store, 'k', TTL, load)
  assert.equal(out.data, 'cached')
  assert.equal(out.stale, false)
  assert.equal(load.calls, 0, 'a fresh cache must not hit the network')
})

test('loadSource refetches when expired and WRITES THE RESULT BACK', async () => {
  const store = memoryStore()
  await store.set('k', { data: 'old', fetchedAt: Date.now() - TTL * 2 })
  const load = countingLoad('new')
  const out = await loadSource(store, 'k', TTL, load)
  assert.equal(out.data, 'new')
  assert.equal(out.stale, false)
  assert.equal(load.calls, 1)
  const persisted = await store.get('k')
  assert.equal(persisted.data, 'new', 'the refreshed value is cached for the next call')
})

test('THE CONTRACT: expired + failing upstream + a cache => serve it, labelled stale', async () => {
  const store = memoryStore()
  const stamped = Date.now() - TTL * 3
  await store.set('k', { data: 'old', fetchedAt: stamped })
  const out = await loadSource(store, 'k', TTL, countingLoad(null, { fail: true }))
  assert.equal(out.data, 'old', 'an old answer beats no answer')
  assert.equal(out.stale, true)
  assert.equal(out.fetchedAt, stamped, 'the age reported is the CACHED age, not now')
  assert.match(out.error, /exploded/, 'the reader is told why the number is old')
})

test('THE OTHER HALF: expired + failing upstream + NO cache => throws', async () => {
  const store = memoryStore()
  await assert.rejects(
    () => loadSource(store, 'k', TTL, countingLoad(null, { fail: true })),
    /exploded/,
    'a cold failure is a real "I don\'t know" — inventing an answer there is the failure this design guards against'
  )
})

test('THE TRAP: a store that expires entries at the TTL loses the stale fallback', async () => {
  // This is what a Redis-native `EX = ttl` would produce. Modelled as a store
  // that evicts anything older than the TTL, exactly as the server would.
  const evicting = (() => {
    const map = new Map()
    return {
      kind: 'evicting',
      async get(key) {
        const e = map.get(key)
        if (!e) return null
        if (Date.now() - e.fetchedAt >= TTL) { map.delete(key); return null }
        return e
      },
      async set(key, entry) { map.set(key, entry) },
      async clear() { map.clear() },
    }
  })()
  await evicting.set('k', { data: 'old', fetchedAt: Date.now() - TTL * 3 })

  await assert.rejects(
    () => loadSource(evicting, 'k', TTL, countingLoad(null, { fail: true })),
    /exploded/,
    'the entry was evicted, so there is nothing to fall back on'
  )

  // The same situation against a store that keeps expired entries: an answer.
  const keeping = memoryStore()
  await keeping.set('k', { data: 'old', fetchedAt: Date.now() - TTL * 3 })
  const out = await loadSource(keeping, 'k', TTL, countingLoad(null, { fail: true }))
  assert.equal(out.data, 'old')
  assert.equal(out.stale, true)

  assert.ok(STORE_GC_SECONDS * 1000 > TTL * 100,
    'the store-level expiry must never bind before a caller TTL does')
})

test('a broken store READ degrades to a cache miss, never to an error', async () => {
  const broken = {
    kind: 'broken',
    async get() { throw new Error('KV unreachable') },
    async set() {},
    async clear() {},
  }
  const load = countingLoad('fetched')
  const out = await loadSource(broken, 'k', TTL, load)
  assert.equal(out.data, 'fetched')
  assert.equal(out.stale, false)
  assert.equal(load.calls, 1, 'we simply go to the source')
})

test('a broken store WRITE never fails the answer', async () => {
  const halfBroken = {
    kind: 'half-broken',
    async get() { return null },
    async set() { throw new Error('KV write refused') },
    async clear() {},
  }
  const out = await loadSource(halfBroken, 'k', TTL, countingLoad('fetched'))
  assert.equal(out.data, 'fetched', 'the answer was already correct before the write')
})

test('restKvStore requires its credentials rather than silently no-opping', () => {
  assert.throws(() => restKvStore({ url: '', token: 't' }), /requires both/)
  assert.throws(() => restKvStore({ url: 'https://x', token: '' }), /requires both/)
})

test('restKvStore swallows transport failures and reports them to onError', async () => {
  const seen = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('network down') }
  try {
    const store = restKvStore({
      url: 'https://kv.example', token: 'tok', onError: (e, op) => seen.push(op),
    })
    assert.equal(await store.get('k'), null, 'a failed read is a cache miss')
    await store.set('k', { data: 1, fetchedAt: Date.now() }) // must not throw
    assert.deepEqual(seen, ['get', 'set'], 'the failures are reported, not hidden')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('restKvStore round-trips through a fake transport, fetchedAt intact', async () => {
  const kv = new Map()
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    const [cmd, key, value] = JSON.parse(init.body)
    assert.equal(init.headers.Authorization, 'Bearer tok')
    if (cmd === 'SET') {
      const args = JSON.parse(init.body)
      assert.equal(args[3], 'EX', 'entries carry a garbage-collection expiry')
      assert.equal(Number(args[4]), STORE_GC_SECONDS)
      kv.set(key, value)
      return { ok: true, json: async () => ({ result: 'OK' }) }
    }
    if (cmd === 'GET') return { ok: true, json: async () => ({ result: kv.get(key) ?? null }) }
    throw new Error(`unexpected command ${cmd}`)
  }
  try {
    const store = restKvStore({ url: 'https://kv.example/', token: 'tok' })
    await store.set('snap', { data: { rosters: 10 }, fetchedAt: 1789850264750 })
    const got = await store.get('snap')
    assert.deepEqual(got, { data: { rosters: 10 }, fetchedAt: 1789850264750 })
    assert.equal(await store.get('absent'), null)
  } finally {
    globalThis.fetch = originalFetch
  }
})
