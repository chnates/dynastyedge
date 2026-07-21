#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// screenshot-app.mjs — capture the RUNNING DynastyEdge app in a headless browser
//
// Why this exists: verifying a UI change ("does the card look right at 390px?")
// used to mean a human opening the phone. This drives the real app in headless
// Chromium so any session can produce a pixel-accurate 390px screenshot of a
// player profile drawer or any route — cheaply, without burning turns
// re-deriving the sandbox gotchas below.
//
// ── The two gotchas this script already solves (do NOT rediscover them) ───────
//
// 1. THE APP IS LOCAL, NOT PUBLIC. There is no public URL that serves your
//    feature branch. The live site (chnates.github.io/dynastyedge) only ever
//    serves `main`, so it can't show unmerged work. To screenshot a branch you
//    must run `npm run dev` and point this script at localhost. "Just browse to
//    the address" screenshots the app shell fine — but see gotcha 2 for why the
//    DATA wouldn't load.
//
// 2. CHROMIUM CAN'T REACH THE APIs THROUGH THE SANDBOX PROXY. Outbound HTTPS in
//    this environment goes through a TLS-intercepting agent proxy. `curl` trusts
//    its CA and works; headless Chromium resets the connection (ERR_CONNECTION_
//    RESET) on the Sleeper / FantasyCalc / GitHub-raw calls the app makes. So
//    the app shell renders but every panel spins forever. Fix: we DON'T give the
//    browser a proxy. Instead we intercept every external request in Playwright
//    and fulfill it by shelling out to `curl` (which the proxy is happy with),
//    piping the bytes back into the page. Local dev-server requests pass through
//    untouched. This is the whole reason the script looks the way it does.
//
// We also seed a logged-in identity in localStorage so the login gate is
// skipped (identity = my owner_id + roster 6, from src/constants.js).
//
// ── Setup (one-time per session) ──────────────────────────────────────────────
//   npm run dev &                                  # start the app (port 5173)
//   mkdir -p /tmp/pw && ( cd /tmp/pw && npm i playwright-core )
//   # playwright-core is NOT a project dependency on purpose (see CLAUDE.md's
//   # dependency rules) — it lives in a throwaway temp dir. The Chromium binary
//   # is already on the box at /opt/pw-browsers, so no browser download happens.
//
// ── Usage ─────────────────────────────────────────────────────────────────────
//   node scripts/dev/screenshot-app.mjs --player "Rashid Shaheed"
//   node scripts/dev/screenshot-app.mjs --route /league --full
//   node scripts/dev/screenshot-app.mjs --player "Bijan Robinson" --out /tmp/b.png --theme light
//
// Flags: --player NAME | --route PATH | --out PATH | --width N | --height N
//        --theme dark|light | --full | --url BASE | --wait MS
// ─────────────────────────────────────────────────────────────────────────────

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// ── args ──────────────────────────────────────────────────────────────────────
function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return def
  const v = process.argv[i + 1]
  return v && !v.startsWith('--') ? v : true
}
const player = arg('player')
const route  = arg('route')
const width  = Number(arg('width', 390))
const height = Number(arg('height', 1600))
const theme  = arg('theme', 'dark')
const full   = Boolean(arg('full', false))
const base   = arg('url', 'http://localhost:5173/dynastyedge/')
const settle = Number(arg('wait', 2500))
let out      = arg('out')
if (!out) {
  const dir = join(REPO, '.screenshots')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  out = join(dir, `${player ? player.replace(/\s+/g, '-').toLowerCase() : (route || 'app').replace(/\W+/g, '-')}.png`)
}
out = isAbsolute(out) ? out : join(process.cwd(), out)

// ── resolve playwright-core (throwaway temp install, not a project dep) ─────────
async function loadChromium() {
  try { return (await import('playwright-core')).chromium } catch { /* fall through */ }
  const dir = process.env.PLAYWRIGHT_CORE_DIR || '/tmp/pw'
  const req = createRequire(join(dir, 'noop.js'))
  return req('playwright-core').chromium
}

// ── locate the pre-installed Chromium (version dir changes over time) ───────────
function findChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM && existsSync(process.env.PLAYWRIGHT_CHROMIUM)) {
    return process.env.PLAYWRIGHT_CHROMIUM
  }
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'
  const dirs = readdirSync(root).filter(d => /^chromium-\d+$/.test(d)).sort()
  for (const d of dirs.reverse()) {
    const exe = join(root, d, 'chrome-linux', 'chrome')
    if (existsSync(exe)) return exe
  }
  throw new Error(`No Chromium found under ${root} — set PLAYWRIGHT_CHROMIUM`)
}

const chromium = await loadChromium()
const browser = await chromium.launch({ executablePath: findChromium(), headless: true })
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 })

// Skip the login gate: seed identity (owner_id + roster 6 — see src/constants.js)
// and force the requested theme before any app script runs.
await ctx.addInitScript(([t]) => {
  // This callback is serialized and runs in the browser — localStorage is a
  // browser global, not a Node one (scripts/ lints under the Node env).
  /* eslint-disable no-undef */
  localStorage.setItem('dynastyedge_identity_v1', JSON.stringify({ userId: '965787707299430400', rosterId: 6 }))
  localStorage.setItem('dynastyedge_theme', t)
  /* eslint-enable no-undef */
}, [theme === 'light' ? 'light' : 'dark'])

// Fulfill every EXTERNAL request via curl (proxy-safe); pass localhost through.
const TMP = tmpdir()
await ctx.route('**/*', async r => {
  const req = r.request()
  const url = req.url()
  if (url.includes('localhost') || url.includes('127.0.0.1')) return r.continue()
  if (req.method() !== 'GET') {
    return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: '' })
  }
  const tmp = join(TMP, `de_body_${randomUUID()}.bin`)
  try {
    const ct = execFileSync('curl', ['-sS', '--max-time', '90', '-o', tmp, '-w', '%{content_type}', url],
      { encoding: 'utf8', maxBuffer: 1e8 })
    await r.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': ct || 'application/json' },
      body: readFileSync(tmp),
    })
  } catch {
    await r.abort()
  }
})

const page = await ctx.newPage()
page.on('console', m => { if (m.type() === 'error') console.log('PAGE ERR:', m.text().slice(0, 160)) })

const target = route ? new URL(route.replace(/^\//, ''), base).href : base
await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 })

// The app shell's search icon only appears once league data has loaded.
await page.getByLabel('Search players').waitFor({ state: 'visible', timeout: 60000 })
console.log('app loaded')

let shotTarget = page
if (player) {
  await page.getByLabel('Search players').click()
  const input = page.getByPlaceholder('Search players & features…')
  await input.waitFor({ state: 'visible', timeout: 15000 })
  await input.fill(player)
  const row = page.getByText(new RegExp(player, 'i')).first()
  await row.waitFor({ state: 'visible', timeout: 20000 })
  await row.click()
  const dialog = page.locator('[role="dialog"]').last()
  await dialog.waitFor({ state: 'visible', timeout: 30000 })
  if (!full) shotTarget = dialog
  console.log('profile drawer open for', player)
}

await page.waitForTimeout(settle)
await shotTarget.screenshot({ path: out, ...(full && shotTarget === page ? { fullPage: true } : {}) })
console.log('saved', out)
await browser.close()
