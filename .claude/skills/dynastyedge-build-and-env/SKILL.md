---
name: dynastyedge-build-and-env
description: >
  DynastyEdge local environment, build system, and asset pipeline. Load when:
  setting up the repo from scratch (clone, Node version, npm ci, dev/build/preview);
  a build fails or behaves differently from CI; styles are missing or wrong in a
  production build (Tailwind content-scan trap); app icons / favicons / logo assets
  need regenerating or look wrong on iOS; fonts render as fallbacks; or you are
  deciding whether to add / update an npm dependency. Covers vite.config.js,
  tailwind.config.js, postcss.config.js, package.json, index.html, scripts/generate-icons.mjs.
---

# DynastyEdge — Build & Environment Runbook

Ground truth verified by executing the commands in this repo on **2026-07-05**.
DynastyEdge is a React 19 + Vite 6 + Tailwind CSS 3 + React Router 7 SPA,
statically hosted on GitHub Pages. There is **no backend, no test suite, no
linter, no typechecker** — `npm run build` succeeding is the only automated
gate, so treat a green build as necessary but nowhere near sufficient.

## When NOT to use this skill

- **Deploying, operating the GitHub Actions pipelines (deploy / news /
  values-history), branch strategy, or "is main shippable" questions** →
  `dynastyedge-run-and-operate`.
- **Whether a change is allowed / how to land it** → `dynastyedge-change-control`.
- **Runtime bugs, API/data issues** → `dynastyedge-debugging-playbook` /
  `dynastyedge-data-contracts`.
This skill is only about making the repo build and render correctly on a
local machine and keeping its assets/dependencies sane.

## 1. From-scratch setup

```bash
git clone https://github.com/chnates/dynastyedge.git
cd dynastyedge
npm ci          # NOT npm install — respects package-lock.json exactly
npm run dev     # Vite dev server → http://localhost:5173/dynastyedge/
npm run build   # production build → dist/
npm run preview # serves dist/ → http://localhost:4173/dynastyedge/
```

**Node version** (as of 2026-07-05):

| Where | Version | Evidence |
|---|---|---|
| All 3 GitHub Actions workflows | **Node 20** (pinned) | `node-version: 20` in `.github/workflows/{deploy,news,values-history}.yml` |
| `package.json` engines | **none declared** | no `engines` field |
| Verified working here | Node 22.22.2 / npm 10.9.7 | `npm ci` + `npm run build` + `npm run preview` all green |

`package-lock.json` is `lockfileVersion: 3` (needs npm ≥ 7; written by npm 9+).
Use Node 20 if you want CI parity; Node 22 is known-good. **Always `npm ci`,
never `npm install`**, unless you are deliberately changing a dependency —
`npm install` can rewrite the lockfile as a side effect, and lockfile churn is
a red flag in review.

**Verified build output** (2026-07-05, Node 22, cold `npm ci` ≈ 5 s warm-cache,
build ≈ 3.5 s):

```
dist/
├── index.html                      # asset URLs rewritten to /dynastyedge/assets/...
├── assets/
│   ├── index-<hash>.js             # main bundle ~377 kB (117 kB gzip)
│   ├── index-<hash>.css            # one compiled Tailwind sheet ~43 kB
│   └── <Route>-<hash>.js × ~30     # per-route lazy chunks (DraftBoard, TradeAnalyzer, …)
└── (everything from public/ copied verbatim: manifest.webmanifest, favicon.ico,
     apple-touch-icon.png, icon-192/512.png, logo.svg, rankings.json,
     FantasyPros_2026_Rookies_OP_Rankings.csv)
```

The build **succeeds fully offline / behind a restrictive proxy** — verified in
a sandbox where external HTTPS is proxied. Nothing network-dependent happens at
build time; fonts and all data load at runtime (see §6).

## 2. Vite specifics

`vite.config.js` is 7 lines — React plugin only, plus one load-bearing line:

```js
export default defineConfig({
  plugins: [react()],
  base: '/dynastyedge/',   // must match the GitHub repo name exactly
})
```

- **`base: '/dynastyedge/'` is non-negotiable.** GitHub Pages serves the site
  at `https://chnates.github.io/dynastyedge/`; every asset URL in
  `dist/index.html` is prefixed `/dynastyedge/assets/...`. Change or remove
  `base` and the deployed app is a blank page with 404s on every asset.
- **Local consequence:** dev and preview both serve under the base path.
  Verified: `http://localhost:4173/dynastyedge/` → 200; bare
  `http://localhost:4173/` → **302 redirect** to `/dynastyedge/`. If a page
  "won't load" locally, check you included the `/dynastyedge/` path first.
- **Runtime asset fetches must use `import.meta.env.BASE_URL`** — the only two
  call sites are in `src/components/draft/DraftBoard.jsx` (fetching
  `rankings.json` and the FantasyPros CSV from `public/`). Follow that pattern
  for any new `public/` asset; a hardcoded `/rankings.json` works in neither
  dev nor prod.
- **No env vars, no secrets, no `.env` files anywhere** (verified by grep:
  the only `import.meta.env` usage is the built-in `BASE_URL` above). If you
  find yourself wanting a secret, stop — this is a static site on Pages; there
  is nowhere safe to put one. The Sleeper and FantasyCalc APIs are keyless.

## 3. Tailwind specifics (and THE trap)

Tailwind **v3.4.x** (locked 3.4.19 as of 2026-07-05) via PostCSS
(`postcss.config.js`: `tailwindcss` + `autoprefixer`, nothing else).

`tailwind.config.js` facts (verified):

- `content: ['./index.html', './src/**/*.{js,jsx}']` — **no safelist**.
- `darkMode: 'class'` — the `dark` class lives on `<html>`; `index.html` ships
  `<html class="dark">` and `src/hooks/useTheme.js` toggles
  `document.documentElement.classList` + `localStorage` `dynastyedge_theme`.
- Theme tokens are **CSS variables holding space-separated RGB channels** in
  `src/index.css` (`:root` = light, `.dark` = dark overrides: `--bg-primary`,
  `--bg-card`, `--accent`, `--pos-qb` … `--pos-def`, etc.), mapped in the
  config as `'bg-card': 'rgb(var(--bg-card) / <alpha-value>)'`. This is why
  opacity modifiers like `bg-accent/10` and `bg-pos-qb/15` work, and why one
  utility class (`bg-bg-card`) renders correctly in both themes with zero
  duplicate classes. Custom fonts: `font-display` (Barlow Condensed),
  `font-body` (IBM Plex Sans), `font-mono` (IBM Plex Mono).

### THE TRAP: class strings must stay literal

Tailwind v3 generates CSS by **regex-scanning the source files in `content`
for complete class-name strings**. It never executes your JS. Therefore:

```js
// BROKEN — Tailwind never sees "text-pos-qb", class silently missing:
const cls = `text-pos-${position.toLowerCase()}`

// CORRECT — full literal strings in a lookup map:
import { POS_TEXT } from '../utils/positionColors'
const cls = POS_TEXT[position]   // 'text-pos-qb' | 'text-pos-rb' | ...
```

This is precisely why `src/utils/positionColors.js` (`POS_TEXT`, `POS_BG`,
`POS_CHIP_ACTIVE`, `POS_TAG`, `POS_BAR`) and `src/utils/roundColors.js`
(`ROUND_CLASSES` etc.) are **lookup maps of full literal class strings** — the
comment at the top of `positionColors.js` says so explicitly ("Class strings
must stay literal so the Tailwind content scan picks them up"). The design
system primitives in `src/components/ui/` keep their variant class strings
literal for the same reason. Extend the maps; never interpolate.

**Symptom & diagnosis of a missed class:**

- Symptom: an element renders unstyled (no color / no background) while
  everything around it is fine — no console error, nothing "fails".
- In Tailwind v3 dev and build use the **same** content scan, so a truly
  interpolated class is missing in `npm run dev` too — *but* it can appear to
  work in dev (or even prod) by accident if the same class string happens to
  exist as a literal somewhere else in a scanned file; delete that other usage
  later and styles "mysteriously" vanish. (Confidence: the same-scan behavior
  is standard v3 JIT; the exact dev-server caching nuances weren't separately
  tested here.)
- Definitive check — is the class in the compiled sheet?

  ```bash
  npm run build
  grep -c 'text-pos-qb' dist/assets/index-*.css   # ≥1 → generated; 0 → scan missed it
  ```

- Fix: make the string literal (add it to the appropriate map in
  `positionColors.js` / `roundColors.js` / the ui primitive). Do **not** add a
  `safelist` to tailwind.config.js — the repo deliberately has none; a
  safelist hides the disease.

## 4. Dependency policy

**Owner's law: no new npm dependencies without genuine need.** Every current
dependency and its justification (verified against `package.json` 2026-07-05):

| Package | Type | Why it exists |
|---|---|---|
| `react`, `react-dom` (^19) | dep | the framework |
| `react-router-dom` (^7) | dep | side-drawer navigation, route map + redirects |
| `@dnd-kit/core` / `sortable` / `utilities` | dep | Draft Board "My Board" drag-to-reorder (Feature 10) |
| `lucide-react` (1.17.0) | dep | the app's entire icon set |
| `vite`, `@vitejs/plugin-react` | devDep | build tool |
| `tailwindcss` (3.4.x), `postcss`, `autoprefixer` | devDep | styling pipeline |
| `sharp` (0.34.x) | devDep | icon rasterization in `scripts/generate-icons.mjs` (never bundled) |
| `png-to-ico` | devDep | `favicon.ico` packaging in the same script |

That is the complete list. **What to do instead of adding a dep:** write the
small utility yourself. The canonical precedent is `src/components/ui/cn.js` —
a 3-line className joiner whose own comment says "never pull in a heavier dep"
(i.e. the repo hand-rolled `cn()` rather than importing `classnames`/`clsx`).
Same spirit: date formatting, tiny stat math, and SVG charts (Sparkline,
Trajectory chart, Roster Analysis lanes) are all hand-rolled inline SVG, not
chart libraries. If you genuinely believe a dependency clears the bar, that's
a change-control question — load `dynastyedge-change-control` and make the
case explicitly; never slip one into an unrelated diff. After any approved
lockfile change, teammates must re-run `npm ci` (see traps, §7).

## 5. Icon / asset generation

**Current script: `scripts/generate-icons.mjs`** (run `node scripts/generate-icons.mjs`
from repo root; uses `sharp` + `png-to-ico` devDeps). It renders the Crown
Crest mark (three ascending rounded bars + jewel dots + circlet, brand
gradient `#4F7FFF → #A78BFA`) and writes into `public/`:

| File | Notes |
|---|---|
| `apple-touch-icon.png` (180px) | **full-bleed gradient, no border, no pre-rounded corners** — iOS applies its own mask; baked rounding/borders clip badly |
| `icon-192.png`, `icon-512.png` | PWA manifest icons (also full-bleed) |
| `favicon-32x32.png`, `favicon-16x16.png`, `favicon.ico` | rounded-square variant for browser tabs |
| `logo.svg` | rounded gradient square |

**When to re-run:** any change to the crown geometry or gradient. The geometry
is intentionally duplicated in `src/components/shared/DynastyEdgeLogo.jsx`
(the in-app drawer lockup) — change one, change both, then re-run the script.

**Cache-busting:** `index.html` links icons with `?v=N` (currently `?v=2` as
of 2026-07-05). Bump N whenever regenerated icons ship, or Safari keeps
showing the old icon. iOS home-screen icon/meta changes only take effect after
the user removes and re-adds the home-screen app.

**`scripts/generate-favicons.js` is LEGACY — do not run it.** It draws an
obsolete pre-crown logo (a dark "De" wordmark tile), overwrites
`favicon*.png` / `apple-touch-icon.png` with the wrong art, and generates
neither `icon-192/512.png` nor `logo.svg`. Nothing in the repo references it
(verified by grep). `generate-icons.mjs` is the one that matches CLAUDE.md
and the shipped assets. Safe to treat as dead code.

**Doc-vs-code note (as of 2026-07-05):** CLAUDE.md's rule 16 says there is no
`apple-mobile-web-app-status-bar-style` meta, but `index.html` *does* ship one
(`black-translucent`, with a comment explaining the transparent-status-bar
design). The code + its comment are ground truth here; flag the CLAUDE.md
staleness per `dynastyedge-change-control` rather than "fixing" index.html to
match the doc.

## 6. Fonts

Google Fonts load **at runtime** from `index.html` (one `<link>` stylesheet:
Barlow Condensed 600/700/800, IBM Plex Mono 400/500, IBM Plex Sans
400/500/600, plus two `preconnect`s). Verified consequences:

- **Builds never touch the network for fonts** — `npm run build` is green
  offline (verified in this proxied sandbox).
- On an offline/blocked machine, `npm run dev` works but text renders in the
  fallback stacks (`sans-serif` / `monospace` per `tailwind.config.js`
  fontFamily). Condensed headers looking wide/wrong locally is a network
  symptom, **not** a build or code bug. Do not "fix" it by vendoring fonts.

## 7. Known traps

| Trap | Reality / fix |
|---|---|
| npm on restricted networks | `npm ci` needs registry access on a cold cache. In sandboxes here, HTTPS routes through a pre-configured proxy (CA bundle at `/root/.ccr/ca-bundle.crt`) and `npm ci` worked; if it 403s, check `curl -sS "$HTTPS_PROXY/__agentproxy/status"` — never disable TLS verification. |
| Stale `node_modules` after a lockfile change | Symptoms: "Cannot find module", version-skew weirdness after pulling. Fix: re-run `npm ci` (it deletes and rebuilds `node_modules` to match the lock exactly). When in doubt after any `git pull` that touched `package-lock.json`, `npm ci`. |
| Committing build output | `dist/` and `node_modules/` are gitignored (`.gitignore` also covers `.DS_Store`, `*.local`). Never force-add them; Pages deploys build `dist/` fresh in Actions. |
| Case-sensitivity | CI builds on Linux (case-sensitive). An import like `./playerCard` for `PlayerCard.jsx` can work on macOS and fail only in the deploy build. Match file-name case exactly in every import. |
| `sharp` is a native binary | Platform-specific prebuilds land in `node_modules`. After switching OS/arch (e.g. copying `node_modules` between machines — don't), icon generation fails until `npm ci` on the target platform. Irrelevant to `npm run build` (sharp is script-only). |
| Node skew vs CI | Workflows pin Node 20; local Node 22 verified fine. If a build passes locally but fails in Actions (or vice versa), reproduce with Node 20 before digging deeper. |
| Preview URL confusion | Everything is under `/dynastyedge/` locally (dev and preview). `curl localhost:4173/` returns 302, not the app. |
| "Styles fine in dev, gone in prod" | Almost always the literal-class trap (§3). Grep the built CSS before suspecting anything else. |

## Provenance and maintenance

All facts verified 2026-07-05 by executing in this repo: `npm ci` (Node
22.22.2/npm 10.9.7), `npm run build` (3.5 s, dist/ layout above), `npm run
preview` + curl (200 at `/dynastyedge/`, 302 at `/`), `npm run dev` (starts,
serves `/dynastyedge/`), and by reading `vite.config.js`,
`tailwind.config.js`, `postcss.config.js`, `package.json`,
`package-lock.json`, `index.html`, `.gitignore`, `src/index.css`,
`src/utils/positionColors.js`, `src/utils/roundColors.js`,
`src/components/ui/cn.js`, `src/hooks/useTheme.js`, both `scripts/generate-*`
files, and the three workflow files. Not separately tested: Node 20 locally;
dev-server hot-reload nuances of the Tailwind content scan (marked in §3).

Re-verify before trusting, one-liners:
- Deps/versions: `cat package.json` · `node -p "require('./package-lock.json').packages['node_modules/vite'].version"`
- CI Node: `grep -rn node-version .github/workflows/`
- Base path: `grep base vite.config.js && grep -o '/dynastyedge/assets/[^\"]*' dist/index.html | head -2`
- Content scan: `grep -n content tailwind.config.js` · class presence: `grep -c '<class>' dist/assets/index-*.css`
- Env-var claim: `grep -rn 'import.meta.env' src/`
- Icon script outputs: `sed -n 56,66p scripts/generate-icons.mjs` · cache-bust N: `grep '?v=' index.html`
- Legacy favicon script still unreferenced: `grep -rn generate-favicons --include='*.{json,yml,md,mjs,js}' . | grep -v node_modules`
