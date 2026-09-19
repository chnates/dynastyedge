// api/mcp.js — the Vercel function. COMMITTED, deliberately.
//
// Vercel detects functions from the SOURCE tree, not from build output. A
// generated `api/mcp.js` with `api/` gitignored produced a deployment that
// served the static placeholder and 404'd every real route — confirmed live,
// `x-vercel-error: NOT_FOUND`. So this file exists in git, and it is kept to
// three lines so there is nothing here to drift.
//
// Vercel's own bundler resolves the extensionless relative imports `src/utils`
// uses, the same way esbuild and Vite do. `npm run build:mcp` is the check on
// that assumption — it bundles the identical entry and boots it under plain
// Node with no resolver hook — and the escape hatch if it ever stops being
// true: commit that bundle here instead.

export { default } from '../mcp/vercelEntry.js'
