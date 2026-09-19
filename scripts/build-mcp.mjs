// build-mcp.mjs — bundle the MCP server into the single file Vercel deploys.
//
//   node scripts/build-mcp.mjs        (= npm run build:mcp)
//
// esbuild is already present via Vite, so this adds no dependency. It exists
// because `src/utils` uses Vite-style extensionless imports that plain Node
// rejects; the app builds at all only because Vite resolves them, and a
// deployed server gets the same treatment rather than shipping a resolver
// hook (MCP_DISCOVERY.md §6).
//
// The output is GENERATED, never committed — `api/` is gitignored. Committing
// a 1.4MB artifact would mean reviewing a diff nobody reads and a file that
// can silently drift from its source.

import { build } from 'esbuild'
import { stat, mkdir, writeFile } from 'node:fs/promises'

const OUT = 'api/mcp.js'
const STATIC_DIR = 'public-mcp'

const result = await build({
  entryPoints: ['mcp/vercelEntry.js'],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'esm',
  // Vercel runs this project on Node 24; 22 is the floor the repo's CI uses,
  // and targeting the lower of the two keeps the artifact valid on both.
  target: 'node22',
  // Bundle everything, including the SDK. A serverless function has no
  // node_modules unless the platform installs one, and one self-contained
  // file is the shape with the fewest ways to go wrong.
  packages: 'bundle',
  minify: false,   // a stack trace from production should name real functions
  sourcemap: false,
  logLevel: 'info',
  metafile: true,
})

const { size } = await stat(OUT)
const inputs = Object.keys(result.metafile.inputs).length
console.log(`\n${OUT}: ${(size / 1024 / 1024).toFixed(2)} MB from ${inputs} modules`)

// An explicit, EMPTY static root. Without `outputDirectory` Vercel can fall
// back to treating the repo root as the static output, which would publish
// source files. vercel.json rewrites every path to the function so nothing
// static is ever reached anyway — this is the second lock on that door, and
// it costs one file.
await mkdir(STATIC_DIR, { recursive: true })
await writeFile(`${STATIC_DIR}/index.html`,
  '<!doctype html><title>DynastyEdge MCP</title>' +
  '<p>This is an MCP endpoint, not a website. See /.well-known/oauth-protected-resource.\n')
console.log(`${STATIC_DIR}/: empty static root (every path rewrites to the function)`)

if (result.warnings.length) {
  console.log(`\n${result.warnings.length} warning(s):`)
  for (const w of result.warnings) console.log(`  ${w.text}`)
}
