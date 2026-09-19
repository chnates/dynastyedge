// store.js — where a cached entry lives, and the ONE definition of "is it
// fresh, and what do we do when the refresh fails?"
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────────
//
// snapshot.js and weekly.js each kept their own module-level Maps and their
// own verbatim copy of `loadSource`. That is exactly right for a long-lived
// stdio process — measured on the live league, a cached snapshot resolves in
// 1ms against a 658ms cold assembly — and exactly wrong for the serverless
// HTTP deployment, which has no warm process to hold a Map.
//
// So the backend becomes a parameter. stdio keeps memory; HTTP gets an
// external store. The freshness POLICY is shared by both, in one place,
// because two copies of the stale-fallback contract is the drift that
// prerequisite C removed from src/.
//
// ── THE TRAP: A STORE-LEVEL TTL WOULD SILENTLY BREAK PROVENANCE ────────────
//
// `loadSource` reads the cached entry EVEN WHEN IT IS EXPIRED. That is not an
// accident — it is what makes snapshot.js's decision 2 work ("on an upstream
// failure, serve the cache and label its age"). An entry that has aged past
// the TTL is still a perfectly good answer as long as the response says how
// old it is.
//
// If the store expires entries at the TTL, that path loses its fallback: a
// Sleeper outage at minute 16 throws a cold "I don't know" where today it
// returns a usable 20-minute-old answer stamped `stale: true`. So:
//
//   FRESHNESS IS DECIDED HERE, from `fetchedAt`, NEVER by the store.
//   A store-level expiry is GARBAGE COLLECTION ONLY and is set far longer
//   than any TTL the caller will pass.
//
// ── THE OTHER TRAP: SIZE ───────────────────────────────────────────────────
//
// Measured against the live league 2026-09-19: the whole snapshot serialises
// to 1.37 MB, of which the trimmed player DB is 1.20 MB. Raw, that is at or
// over the per-value limit of a typical hosted KV. Gzipped it is 208 KB and
// 180 KB respectively, and node:zlib is built in — so entries are compressed
// going out and inflated coming back. No dependency, fewer bytes on the wire,
// and the size question stops being a question.
//
// ── BEST-EFFORT, ALWAYS ────────────────────────────────────────────────────
//
// A store failure must never fail an answer. A failed read is a cache miss
// (we refetch); a failed write is dropped (the answer was already correct).
// The server degrades to "slower", never to "broken".

import zlib from 'node:zlib'
import { promisify } from 'node:util'

const gzip = promisify(zlib.gzip)
const gunzip = promisify(zlib.gunzip)

// Long enough that it can never bind before a caller's TTL does — this is
// eviction so a store does not grow forever, not freshness.
export const STORE_GC_SECONDS = 7 * 24 * 60 * 60

// ── the interface ──────────────────────────────────────────────────────────
//
//   get(key)        -> Promise<{ data, fetchedAt } | null>
//   set(key, entry) -> Promise<void>
//   clear()         -> Promise<void>
//
// `fetchedAt` is a number (epoch ms) and MUST round-trip. It is the
// provenance the whole design rests on: it becomes `asOf.sources[*].fetchedAt`
// and feeds `oldestSourceAt`. A store that loses it breaks the single most
// important rule in this server.

export function memoryStore() {
  const map = new Map()
  return {
    kind: 'memory',
    async get(key) {
      return map.get(key) ?? null
    },
    async set(key, entry) {
      map.set(key, { data: entry.data, fetchedAt: entry.fetchedAt })
    },
    async clear() {
      map.clear()
    },
  }
}

// Serialise an entry for an external store. Exported so a test can prove the
// round trip preserves `fetchedAt` exactly, without a network.
export async function encodeEntry(entry) {
  const json = JSON.stringify({ data: entry.data, fetchedAt: entry.fetchedAt })
  const buf = await gzip(Buffer.from(json, 'utf8'))
  return buf.toString('base64')
}

export async function decodeEntry(encoded) {
  if (typeof encoded !== 'string' || encoded === '') return null
  const buf = await gunzip(Buffer.from(encoded, 'base64'))
  const parsed = JSON.parse(buf.toString('utf8'))
  if (!parsed || typeof parsed.fetchedAt !== 'number') return null
  return { data: parsed.data, fetchedAt: parsed.fetchedAt }
}

const KV_TIMEOUT_MS = 5000

// A Redis-over-HTTP store, in the generic command form
// (`POST <url>` with body `["GET", key]`) that Upstash and its
// work-alikes serve. The vendor specifics are confined to this function: a
// different KV is a different `command`, not a change anywhere else.
//
// WHY THIS DOES NOT USE fetchJSON: fetchJSON is GET-only with no headers and
// no body, so it structurally cannot issue an authenticated POST. Teaching it
// to would change the app's 21-line wrapper to serve a server's needs, which
// is the exact trade mcp/limit.js already declined to make. The rule that
// wrapper exists to enforce — a hung request must never hang the caller — is
// kept here instead, with the same AbortController discipline.
//
// WHY IT DOES NOT USE THE CONCURRENCY LIMITER: that gate exists to protect
// Sleeper's published rate budget. A cache read competing for one of its six
// slots would queue behind the very API calls the cache exists to avoid.
export function restKvStore({ url, token, timeoutMs = KV_TIMEOUT_MS, onError = null }) {
  if (!url || !token) throw new Error('restKvStore requires both url and token')
  const base = url.replace(/\/+$/, '')

  const command = async args => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(base, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(args),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`KV ${args[0]} ${res.status}`)
      const body = await res.json()
      return body?.result ?? null
    } catch (err) {
      if (err.name === 'AbortError') throw new Error(`KV ${args[0]} timed out`)
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  // A store failure is never an answer failure. Report it if the caller wants
  // to know, then behave as though the cache were simply empty.
  const swallow = (err, op) => {
    if (onError) onError(err, op)
    return null
  }

  return {
    kind: 'rest-kv',
    async get(key) {
      try {
        return await decodeEntry(await command(['GET', key]))
      } catch (err) {
        return swallow(err, 'get')
      }
    },
    async set(key, entry) {
      try {
        const encoded = await encodeEntry(entry)
        // EX is garbage collection, NOT the freshness TTL — see the header.
        await command(['SET', key, encoded, 'EX', String(STORE_GC_SECONDS)])
      } catch (err) {
        swallow(err, 'set')
      }
    },
    async clear() {
      try {
        await command(['FLUSHDB'])
      } catch (err) {
        swallow(err, 'clear')
      }
    },
  }
}

// THE freshness policy, shared by snapshot.js and weekly.js.
//
// Returns { data, fetchedAt, stale, error } — the shape `stampSource` reads.
//
//   fresh cache        -> serve it, stale: false
//   expired, load ok   -> serve the new data, and WRITE IT BACK
//   expired, load fails, cache present -> serve the cache, stale: true + error
//   expired, load fails, no cache      -> THROW. A real "I don't know", and
//                                         inventing an answer there is the
//                                         failure this design guards against.
export async function loadSource(store, key, ttlMs, load) {
  let current = null
  try {
    current = await store.get(key)
  } catch {
    current = null // a broken store is a cache miss, never an error
  }

  if (current && Date.now() - current.fetchedAt < ttlMs) {
    return { ...current, stale: false, error: null }
  }

  try {
    const data = await load()
    const entry = { data, fetchedAt: Date.now() }
    // A failed WRITE must not fail an answer we already have in hand. The
    // best-effort contract lives here, in the policy, not only inside a
    // well-behaved backend — loadSource must survive any store.
    try {
      await store.set(key, entry)
    } catch { /* the answer is correct; it just will not be cached */ }
    return { ...entry, stale: false, error: null }
  } catch (err) {
    if (current) return { ...current, stale: true, error: err.message }
    throw err
  }
}
