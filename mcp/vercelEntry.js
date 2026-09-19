// vercelEntry.js — the deployed server's entry point.
//
// This file is the ESBUILD ENTRY, not the deployed file. `npm run build:mcp`
// bundles it plus all of `src/utils` into `api/mcp.js`, which is what Vercel
// actually runs.
//
// WHY A BUNDLE AND NOT THIS FILE DIRECTLY: `src/utils` uses Vite-style
// extensionless relative imports — 482 of them — which plain Node cannot
// resolve. `npm run mcp` solves that for local runs with the
// `--import ./mcp/register.mjs` resolver hook, and MCP_DISCOVERY.md §6 is
// explicit that a deployed service must not depend on a hook. esbuild
// resolves the specifiers at build time, so the deployed artifact has no
// resolution problem to have.
//
// THE APP IS BUILT ONCE, AT MODULE SCOPE, NOT PER REQUEST. createApp()
// derives the signing key and constructs the OAuth routes; doing that inside
// the handler would repeat it on every call. On a warm instance this module
// is evaluated once and the handler is reused, which is also what lets
// http.js's shared limiter and the memory store span requests.
//
// A MISSING SECRET STILL REFUSES TO SERVE, but it SAYS WHY. The first cut let
// the constructor throw at import, which on Vercel surfaces as an opaque
// `FUNCTION_INVOCATION_FAILED` — and with runtime logs unreadable from the
// deploy tooling, that is a dead end for whoever is debugging it. "Fails
// loudly" has to mean *says what is wrong*, not merely *stops*.
//
// So construction is caught and the error is held. The server still answers
// nothing but a refusal — no league data, no tools, no token accepted — it
// just returns a 503 that names the cause instead of a platform stack trace.

// THE IMPORT IS DYNAMIC, AND THAT IS A DIAGNOSTIC DECISION.
//
// A static `import` that fails to resolve kills the module before any code
// here can run, which on Vercel is an opaque FUNCTION_INVOCATION_FAILED —
// and runtime logs are not readable from the deploy tooling, so that is a
// dead end. Importing inside the handler means a resolution failure becomes
// an HTTP response that NAMES the missing module.
//
// This matters because `src/utils` uses Vite-style extensionless relative
// imports. esbuild and Vite resolve those by appending extensions; Node's own
// ESM resolver does not. Whether the host bundles or merely traces decides
// whether this server can run there at all, and the answer should be
// readable, not inferred.
//
// The module is imported ONCE and cached, so a warm instance still pays for
// construction only on its first request.

// ── THE HANDLER ACCEPTS BOTH CALLING CONVENTIONS ──────────────────────────
//
// A host may invoke a Node function either way, and which one you get is not
// something to infer from documentation:
//
//   Web:  handler(Request) -> Response
//   Node: handler(IncomingMessage, ServerResponse)
//
// `mcp/http.js` is Web-standard on purpose — that is what makes the host a
// packaging decision. But handed a Node `IncomingMessage`, `new URL(req.url)`
// throws, because `req.url` is a bare path with no origin. That surfaced as a
// platform 500 with no body, which is indistinguishable from every other
// failure mode and cost a deploy cycle to identify.
//
// Detecting the shape is one property check, so the handler does that instead
// of betting on a runtime. The adapter is the same one the local HTTP probe
// used, so this path is not new code so much as code that moved.

const isNodeResponse = res =>
  !!res && typeof res.setHeader === 'function' && typeof res.end === 'function'

function requestFromNode(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost'
  const url = new URL(req.url, `${proto}://${host}`)
  const hasBody = !['GET', 'HEAD'].includes(req.method)
  return new Promise((resolve, reject) => {
    if (!hasBody) {
      resolve(new Request(url, { method: req.method, headers: req.headers }))
      return
    }
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => resolve(new Request(url, {
      method: req.method, headers: req.headers, body: Buffer.concat(chunks),
    })))
    req.on('error', reject)
  })
}

async function writeToNode(response, res) {
  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))
  const body = Buffer.from(await response.arrayBuffer())
  res.end(body)
}

let appPromise = null

async function getApp() {
  if (!appPromise) {
    appPromise = import('./app.js').then(m => m.createApp())
  }
  return appPromise
}

// The message, never the stack — a stack on a public endpoint leaks paths and
// module layout and helps nobody reading it. The message alone distinguishes
// the failures that matter: a missing secret, a module the host could not
// resolve, and a runtime fault inside a tool.
const failure = (err, status) => new Response(JSON.stringify({
  error: status === 503 ? 'server_unavailable' : 'internal_error',
  detail: err?.message ?? String(err),
  code: err?.code ?? null,
}), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

async function respond(request) {
  let app
  try {
    app = await getApp()
  } catch (err) {
    // Reset so a transient failure can be retried rather than cached forever.
    appPromise = null
    return failure(err, 503)
  }
  try {
    return await app(request)
  } catch (err) {
    // NOTHING reaches the platform's opaque 500 any more. Every failure this
    // function can have now answers with a body that names it.
    return failure(err, 500)
  }
}

export default async function handler(reqOrRequest, maybeRes) {
  if (isNodeResponse(maybeRes)) {
    try {
      const response = await respond(await requestFromNode(reqOrRequest))
      await writeToNode(response, maybeRes)
    } catch (err) {
      maybeRes.statusCode = 500
      maybeRes.setHeader('Content-Type', 'application/json')
      maybeRes.end(JSON.stringify({ error: 'adapter_error', detail: err?.message ?? String(err) }))
    }
    return undefined
  }
  return respond(reqOrRequest)
}
