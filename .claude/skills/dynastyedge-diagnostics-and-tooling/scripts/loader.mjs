// loader.mjs — Node module-resolution hook for DynastyEdge's extensionless ESM.
//
// WHY: src/utils/*.js are pure ESM analysis modules, but they use Vite-style
// extensionless relative imports (`import { x } from './lineupHistory'`).
// Plain `node` refuses those (ERR_MODULE_NOT_FOUND). This hook appends `.js`
// to any relative, extensionless specifier when the resulting file exists.
//
// USAGE (never import this file directly — register it via reg.mjs):
//   node --import /home/user/dynastyedge/.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/reg.mjs your-script.mjs
//
// Works from any cwd: resolution is relative to context.parentURL (the
// importing module), not the process working directory.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier) && context.parentURL) {
    const candidate = new URL(specifier + '.js', context.parentURL)
    if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context)
  }
  return nextResolve(specifier, context)
}
