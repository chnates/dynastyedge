// tests/mcpHttp.test.mjs — pins mcp/http.js, the streamable-HTTP transport.
//
// Behaviors pinned (with their source):
//  - MCP_DISCOVERY.md §6: "Two entry points — stdio for desktop and local
//    iteration, streamable HTTP for the hosted deployment. Tool
//    implementations are identical; only transport differs." So this file
//    tests the transport and the gate in front of it, never the tools.
//  - mcp/http.js's header: the transport runs STATELESS because a serverless
//    host cannot guarantee that request 2 reaches the instance holding
//    request 1's session — a failure that works warm and breaks cold.
//  - CLAUDE.md, "What the server can never do" + MCP_DISCOVERY.md §7: an
//    authenticator that throws must never read as authorized.
//  - The MCP spec's OAuth discovery (RFC 9728): a 401 advertises where to
//    authenticate rather than simply failing.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createMcpHandler, UNAUTHORIZED_CODE } from '../mcp/http.js'

const RESOURCE_META = 'https://example.test/.well-known/oauth-protected-resource'

const rpc = (method, params) => JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })

const post = (body = rpc('tools/list'), headers = {}) =>
  new Request('http://server.test/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...headers,
    },
    body,
  })

test('GET is a liveness probe that leaks no league data', async () => {
  const res = await createMcpHandler({})(new Request('http://server.test/'))
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.ok, true)
  assert.equal(body.transport, 'streamable-http')
  // It must answer "the process is up" and nothing more. An unauthenticated
  // read of roster data would defeat the gate this endpoint exists behind.
  const text = JSON.stringify(body)
  assert.ok(!/roster|player|value|league/i.test(text), `health leaked: ${text}`)
})

test('a method that is neither GET nor POST is refused', async () => {
  const res = await createMcpHandler({})(
    new Request('http://server.test/', { method: 'DELETE' })
  )
  assert.equal(res.status, 405)
  const body = await res.json()
  assert.equal(body.jsonrpc, '2.0', 'the refusal is JSON-RPC shaped, not an HTML error page')
})

test('a failing authenticator returns 401 and ADVERTISES where to authenticate', async () => {
  const handler = createMcpHandler({
    authenticate: async () => ({ ok: false, reason: 'Token expired' }),
    resourceMetadataUrl: RESOURCE_META,
  })
  const res = await handler(post())
  assert.equal(res.status, 401)
  assert.equal(
    res.headers.get('WWW-Authenticate'),
    `Bearer resource_metadata="${RESOURCE_META}"`,
    'RFC 9728 discovery — a client must be told where to go, not merely refused'
  )
  const body = await res.json()
  assert.equal(body.error.code, UNAUTHORIZED_CODE)
  assert.match(body.error.message, /Token expired/, 'the reason reaches the caller')
})

test('an authenticator that THROWS is never treated as authorized', async () => {
  const handler = createMcpHandler({
    authenticate: async () => { throw new Error('identity provider down') },
  })
  const res = await handler(post())
  assert.equal(res.status, 500, 'a broken gate is closed, never open')
  assert.notEqual(res.status, 200)
  const body = await res.json()
  assert.match(body.error.message, /identity provider down/)
})

test('an authenticator returning a falsy/!ok shape is refused, not waved through', async () => {
  for (const result of [null, undefined, {}, { ok: false }, { authInfo: {} }]) {
    const res = await createMcpHandler({ authenticate: async () => result })(post())
    assert.equal(res.status, 401, `a result of ${JSON.stringify(result)} must not authorize`)
  }
})

test('every POST is authenticated — the gate is not initialize-only', async () => {
  let calls = 0
  const handler = createMcpHandler({
    authenticate: async () => { calls++; return { ok: false, reason: 'no' } },
  })
  await handler(post(rpc('initialize')))
  await handler(post(rpc('tools/list')))
  await handler(post(rpc('tools/call', { name: 'get_roster', arguments: {} })))
  assert.equal(calls, 3, 'a session cannot be established once and then trusted')
})

test('with no authenticator the endpoint is OPEN — the documented local/protected case', async () => {
  const res = await createMcpHandler({})(post(rpc('tools/list')))
  assert.equal(res.status, 200,
    'omitting authenticate is only correct behind host-level protection or on localhost')
})

test('tools/list answers over the transport with every tool stdio has', async () => {
  const res = await createMcpHandler({})(post(rpc('tools/list')))
  const body = await res.json()
  const names = body.result.tools.map(t => t.name).sort()
  assert.deepEqual(names, [
    'analyze_trade', 'find_sell_high', 'find_trade_targets', 'get_player_news',
    'get_playoff_odds', 'get_roster', 'lineup_advice', 'recommend_free_agents',
    'research_rookies', 'resolve_assets', 'scout_managers',
  ], 'the HTTP transport exposes the SAME tools as stdio — only transport differs, ' +
     'so a tool added to createServer must appear here without being forked')
})

test('the transport is STATELESS — no session id is minted', async () => {
  const res = await createMcpHandler({})(post(rpc('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'test', version: '0' },
  })))
  assert.equal(res.headers.get('mcp-session-id'), null,
    'a session held in RAM is exactly what a serverless host cannot keep across requests')
})

test('an authorized request carries authInfo through to the server', async () => {
  const handler = createMcpHandler({
    authenticate: async () => ({
      ok: true,
      authInfo: { token: 't', clientId: 'c', scopes: ['mcp'] },
    }),
  })
  const res = await handler(post(rpc('tools/list')))
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.result.tools.length, 11)
})
