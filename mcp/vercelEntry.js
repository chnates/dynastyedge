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

let appPromise = null

async function getApp() {
  if (!appPromise) {
    appPromise = import('./app.js').then(m => m.createApp())
  }
  return appPromise
}

export default async function handler(request) {
  let app
  try {
    app = await getApp()
  } catch (err) {
    // Reset so a transient failure can be retried rather than cached forever.
    appPromise = null
    return new Response(JSON.stringify({
      error: 'server_unavailable',
      // The message, never the stack — a stack on a public endpoint leaks
      // paths and module layout and helps nobody reading it. The message
      // alone distinguishes the two failures that matter: a missing secret
      // versus a module the host could not resolve.
      detail: err?.message ?? String(err),
      code: err?.code ?? null,
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  }
  return app(request)
}
