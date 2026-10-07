// loader.mjs — THE Node module-resolution hook for DynastyEdge's extensionless
// ESM (CODE-REVIEW-1 #13, 2026-10-07: it was two byte-identical copies, one in
// mcp/ and one in the diagnostics skill).
//
// src/utils/*.js are pure ESM modules with Vite-style extensionless relative
// imports (`import { x } from './lineupBuild'`). Plain `node` refuses those;
// this hook appends `.js` when that file exists.
//
// Registered by scripts/register.mjs. The test suite (`npm test`), the stdio
// MCP server (`npm run mcp`, via mcp/register.mjs) and the diagnostics skill's
// reg.mjs all point here. It lives in scripts/, not in a skills directory, so a
// runnable server never depends on .claude/.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier) && context.parentURL) {
    const candidate = new URL(specifier + '.js', context.parentURL)
    if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context)
  }
  return nextResolve(specifier, context)
}
