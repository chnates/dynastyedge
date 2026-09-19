// loader.mjs — Node module-resolution hook for DynastyEdge's extensionless ESM.
//
// src/utils/*.js are pure ESM analysis modules, but they use Vite-style
// extensionless relative imports (`import { x } from './lineupBuild'`). Plain
// `node` refuses those. This hook appends `.js` when the file exists.
//
// This is a deliberate copy of the hook the test suite uses
// (.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/loader.mjs).
// It is copied rather than imported because a runnable server must not depend
// on a file inside a skills directory — MCP_DISCOVERY.md §6 flags exactly that.
// The two are ~15 lines and have no reason to diverge; if one changes, change
// both.
//
// NOT the long-term answer for a DEPLOYED server — see mcp/README.md on
// bundling, which is phase 2.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier) && context.parentURL) {
    const candidate = new URL(specifier + '.js', context.parentURL)
    if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context)
  }
  return nextResolve(specifier, context)
}
