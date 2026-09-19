// http.js — the streamable-HTTP transport, as a Web-standard handler.
//
//   (Request) => Promise<Response>
//
// That signature is the point: it is what Vercel Functions, Cloudflare
// Workers, Deno and Bun all take, so the host is a packaging decision rather
// than a code one. The tool implementations are untouched — `createServer()`
// returns the server and the caller picks the transport, which is how
// MCP_DISCOVERY.md §6 specified it and how stdio.js has always used it.
//
// ── THE TRAP: SESSIONS DO NOT SURVIVE SERVERLESS ───────────────────────────
//
// The SDK's streamable transport can run session-ful — it mints a session id,
// remembers the transport that owns it, and expects later requests on that
// session to reach the SAME process. On a serverless host there is no such
// guarantee: request 2 may land on an instance that has never heard of the
// session, and the failure is INTERMITTENT — it works in testing, where one
// warm instance serves everything, and breaks in production under exactly the
// conditions that are hardest to reproduce.
//
// So this runs STATELESS (`sessionIdGenerator: undefined`), with a fresh
// transport per request. It is the same reasoning that moved the cache out of
// module memory in store.js: anything remembered between requests has to live
// somewhere a second instance can see, and a session that is only in RAM is
// exactly what serverless cannot keep.
//
// `enableJsonResponse` follows from that: a stateless request/response cycle
// wants a plain JSON reply, not a long-lived SSE stream that a function
// timeout would cut anyway.

import { WebStandardStreamableHTTPServerTransport }
  from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'

import { createServer } from './server.js'
import { createFetcher } from './limit.js'
import { loadConfig } from './config.js'

// ONE limiter per instance, created at module load rather than per request.
// A warm serverless instance serves many requests; a per-request limiter
// would hand each of them the full concurrency budget, which is precisely
// what mcp/limit.js exists to bound. A cold instance simply gets a fresh one,
// which is correct — it has no in-flight requests to bound.
const sharedFetcher = createFetcher({ concurrency: loadConfig().concurrency })

// A JSON-RPC shaped error, so a client that reaches this endpoint without
// credentials gets a protocol-legible answer rather than an HTML error page.
function rpcError(status, code, message, extraHeaders = {}) {
  return new Response(
    JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }),
    { status, headers: { 'Content-Type': 'application/json', ...extraHeaders } }
  )
}

export const UNAUTHORIZED_CODE = -32001

// Build the handler.
//
//   authenticate  optional async (Request) => ({ ok, authInfo?, reason? })
//                 When omitted the endpoint is OPEN, which is only ever
//                 correct behind a host-level protection (Vercel's
//                 deployment protection) or on localhost.
//   store         optional cache backend shared by snapshot.js and weekly.js
//   resourceMetadataUrl  advertised in WWW-Authenticate on a 401, per the MCP
//                 spec's OAuth discovery (RFC 9728), so a client knows where
//                 to go to authenticate rather than simply failing.
export function createMcpHandler({ authenticate = null, store = null, resourceMetadataUrl = null } = {}) {
  return async function handler(request) {
    if (request.method === 'GET' || request.method === 'HEAD') {
      // A liveness probe that costs nothing upstream. Deliberately reports
      // only that the process is up — never league data, which would be an
      // unauthenticated read of the thing this endpoint protects.
      return new Response(
        JSON.stringify({ ok: true, server: 'dynastyedge-mcp', transport: 'streamable-http' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (request.method !== 'POST') {
      return rpcError(405, -32000, `Method ${request.method} not allowed`)
    }

    let authInfo
    if (authenticate) {
      let result
      try {
        result = await authenticate(request)
      } catch (err) {
        // An authenticator that throws must never read as "authorized".
        return rpcError(500, -32603, `Authentication failed: ${err.message}`)
      }
      if (!result?.ok) {
        const headers = resourceMetadataUrl
          ? { 'WWW-Authenticate': `Bearer resource_metadata="${resourceMetadataUrl}"` }
          : {}
        return rpcError(401, UNAUTHORIZED_CODE, result?.reason || 'Unauthorized', headers)
      }
      authInfo = result.authInfo
    }

    // A fresh server and transport per request — see the header. Cheap:
    // createServer() only registers schemas; the expensive part is the
    // upstream fetch, which the store caches across requests.
    const { server } = createServer({ store, fetcher: sharedFetcher })
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })

    try {
      await server.connect(transport)
      return await transport.handleRequest(request, authInfo ? { authInfo } : undefined)
    } catch (err) {
      return rpcError(500, -32603, `Internal server error: ${err.message}`)
    } finally {
      // Serverless reclaims the instance after the response; closing here
      // keeps a warm instance from accumulating dead transports.
      try { await transport.close() } catch { /* already closed */ }
      try { await server.close() } catch { /* already closed */ }
    }
  }
}
