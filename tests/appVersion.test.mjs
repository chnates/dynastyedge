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

import { buildReloadUrl } from '../src/utils/appVersion.js'

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
