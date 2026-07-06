// bundle-report.mjs — OFFLINE. Builds the app (`npm run build`) and reports
// dist/assets sizes (raw + gzip) as a sorted table with totals, so bundle
// claims are numbers, not eyeballs. Run it BEFORE and AFTER any change you
// suspect affects bundle size and compare.
//
// USAGE:
//   node /home/user/dynastyedge/.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/bundle-report.mjs
//   node ...bundle-report.mjs --skip-build     # just re-measure existing dist/
//
// Baseline as of 2026-07-05: main index-*.js chunk ~377 KB raw / ~117 KB gzip
// (re-verify with a fresh run; see SKILL.md for the current table).
// No new deps: uses child_process + fs + zlib only.
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const DIST = path.join(REPO_ROOT, 'dist')
const kb = n => (n / 1024).toFixed(1).padStart(8) + ' KB'

if (!process.argv.includes('--skip-build')) {
  if (!existsSync(path.join(REPO_ROOT, 'node_modules'))) {
    console.error('node_modules missing — run `npm ci` in ' + REPO_ROOT + ' first.')
    process.exit(1)
  }
  console.log('Running `npm run build` (vite)…')
  try {
    execSync('npm run build', { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000 })
  } catch (err) {
    console.error('BUILD FAILED:')
    console.error(String(err.stderr ?? err.stdout ?? err.message).slice(-3000))
    process.exit(1)
  }
}

if (!existsSync(DIST)) {
  console.error('dist/ not found — build did not produce output (or --skip-build with no prior build).')
  process.exit(1)
}

// Collect every file under dist/ (assets/ holds the hashed JS/CSS chunks).
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? walk(p) : [p]
  })
}
const files = walk(DIST).map(p => {
  const raw = statSync(p).size
  const compressible = /\.(js|css|html|svg|json|webmanifest)$/.test(p)
  return {
    rel: path.relative(DIST, p),
    raw,
    gzip: compressible ? gzipSync(readFileSync(p)).length : null,
  }
}).sort((a, b) => b.raw - a.raw)

console.log('\n=== dist/ size report (sorted by raw size) ===')
console.log('raw'.padStart(11) + 'gzip'.padStart(12) + '  file')
let totRaw = 0, totGzip = 0
for (const f of files) {
  totRaw += f.raw
  totGzip += f.gzip ?? f.raw
  console.log(kb(f.raw) + (f.gzip != null ? kb(f.gzip) : '        n/a') + '  ' + f.rel)
}
console.log('-'.repeat(60))
console.log(kb(totRaw) + kb(totGzip) + '  TOTAL (gzip col counts binaries at raw size)')

const main = files.find(f => /^assets\/index-.*\.js$/.test(f.rel))
if (main) {
  console.log(`\nMain chunk: ${main.rel} — ${(main.raw / 1024).toFixed(0)} KB raw / ${(main.gzip / 1024).toFixed(0)} KB gzip`)
  console.log('Baseline (2026-07-05): ~377 KB raw / ~117 KB gzip. A jump of >10% after')
  console.log('your change means you added weight — find it before shipping.')
}
