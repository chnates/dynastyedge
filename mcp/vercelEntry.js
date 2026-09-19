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
// A MISSING SECRET THROWS HERE, AT IMPORT. That is deliberate: it surfaces as
// a failed function invocation rather than a server that answers requests
// with no authentication.

import { createApp } from './app.js'

const app = createApp()

export default function handler(request) {
  return app(request)
}
