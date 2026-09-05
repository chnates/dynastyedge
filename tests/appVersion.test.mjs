// tests/appVersion.test.mjs — pins the reload-URL contract of
// src/utils/appVersion.js (the pure half of the app-version self-heal).
//
// Behaviors pinned (with their doc source):
//  - CLAUDE.md "App version self-heal": the reload target must differ from the
//    current URL as a REAL URL change, because the failure being worked around
//    is a cached response for the current URL.
//  - CLAUDE.md Navigation: the app is a HashRouter, so the hash IS the route —
//    the cache-busting query must sit BEFORE it, or the query folds into the
//    route string and lands on a route that doesn't exist.
//  - No build id → null, so the caller can fall back instead of navigating
//    somewhere meaningless.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildReloadUrl, formatBuildId } from '../src/utils/appVersion.js'

const LOC = {
  origin: 'https://chnates.github.io',
  pathname: '/dynastyedge/',
  hash: '#/trade/whats-fair',
}

test('the cache-buster goes BEFORE the hash, so the HashRouter route survives', () => {
  const url = buildReloadUrl(LOC, '2026-09-04T03:06:21.467Z')
  assert.equal(
    url,
    'https://chnates.github.io/dynastyedge/?v=2026-09-04T03%3A06%3A21.467Z#/trade/whats-fair',
  )
  // The route is intact and the query is not inside it.
  assert.ok(url.endsWith('#/trade/whats-fair'))
  assert.ok(url.indexOf('?v=') < url.indexOf('#'))
})

test('the reload target is a different URL than the current one (the point of it)', () => {
  const current = `${LOC.origin}${LOC.pathname}${LOC.hash}`
  assert.notEqual(buildReloadUrl(LOC, 'build-2'), current)
  // A different build id yields a different URL, so each deploy busts afresh.
  assert.notEqual(buildReloadUrl(LOC, 'build-2'), buildReloadUrl(LOC, 'build-3'))
})

test('build ids are URL-encoded — an ISO timestamp carries colons', () => {
  const url = buildReloadUrl(LOC, '2026-09-04T03:06:21.467Z')
  assert.ok(url.includes('%3A'), 'colons encoded')
  assert.ok(!url.includes('?v=2026-09-04T03:06'), 'raw colons never emitted')
})

test('no hash (a bare landing) still builds a valid URL', () => {
  assert.equal(
    buildReloadUrl({ ...LOC, hash: '' }, 'b1'),
    'https://chnates.github.io/dynastyedge/?v=b1',
  )
  assert.equal(
    buildReloadUrl({ origin: 'http://x', pathname: '/', hash: undefined }, 'b1'),
    'http://x/?v=b1',
  )
})

test('no build id → null, never a navigation to nowhere', () => {
  assert.equal(buildReloadUrl(LOC, null), null)
  assert.equal(buildReloadUrl(LOC, undefined), null)
  assert.equal(buildReloadUrl(LOC, ''), null)
})

// ── The build stamp ─────────────────────────────────────────────────────────
// The self-heal reloads a stale bundle silently, which is exactly why the build
// needs to be VISIBLE: the failure it exists for leaves no other trace.

test('a build number renders verbatim — that is the whole point of it', () => {
  // The id is normally a first-parent commit count. "Am I on 52?" is
  // answerable against the repo; "am I on Sep 5, 01:25 AM?" is not.
  assert.equal(formatBuildId('52'), '52')
  assert.equal(formatBuildId('1'), '1')
  assert.equal(formatBuildId('1284'), '1284')
  // It must NOT be mistaken for a date and reformatted: '52' parses as a year
  // in some engines, which would render the build as a timestamp.
  assert.ok(!/[A-Za-z]/.test(formatBuildId('52')))
})

test('an ISO build id becomes a readable local date-time', () => {
  // The FALLBACK path: a shallow clone can't produce a count, and a duplicate
  // id would break the self-heal, so those builds get a timestamp instead.
  const out = formatBuildId('2026-09-05T00:12:34.567Z')
  assert.equal(typeof out, 'string')
  assert.ok(out.length > 0 && out.length < 32, `unexpectedly long: ${out}`)
  // The raw ISO string must not leak through — that is the thing being fixed.
  assert.notEqual(out, '2026-09-05T00:12:34.567Z')
  assert.ok(!out.includes('T'), `looks like a raw ISO string: ${out}`)
})

test('a missing or unparseable build id degrades instead of throwing', () => {
  // Null in, null out: the caller renders nothing rather than an empty row.
  assert.equal(formatBuildId(null), null)
  assert.equal(formatBuildId(undefined), null)
  assert.equal(formatBuildId(''), null)
  assert.equal(formatBuildId(42), null)
  // A future build-id scheme that isn't a date is shown truncated, not dropped
  // and not crashed on — an unknown id is still better than no id at all.
  assert.equal(formatBuildId('deadbeefcafe1234567890'), 'deadbeefcafe1234')
})

test('distinct builds produce distinct stamps at minute resolution', () => {
  // The stamp exists to answer "did the phone pick up the deploy I just made?",
  // so two builds a minute apart must not render identically.
  assert.notEqual(
    formatBuildId('2026-09-05T00:12:00.000Z'),
    formatBuildId('2026-09-05T00:13:00.000Z'),
  )
})
