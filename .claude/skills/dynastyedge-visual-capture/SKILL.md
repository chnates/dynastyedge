---
name: dynastyedge-visual-capture
description: >
  Screenshot the RUNNING DynastyEdge app in headless Chromium to verify a UI
  change looks right — at the real 390px iPhone width, against live data, in
  dark or light mode. Load when asked to "screenshot", "show me", "what does it
  look like", "verify the UI/card/drawer", or to confirm an unmerged branch
  change renders correctly on the phone. Owns the reusable harness
  (scripts/dev/screenshot-app.mjs) and the three sandbox gotchas it already
  solves: the app is local-only (no public URL serves your branch), headless
  Chromium can't reach the Sleeper/FantasyCalc APIs through the agent proxy
  (curl can), and the app is a HashRouter so --route goes in the URL hash — so
  DON'T re-derive them. Companion to
  dynastyedge-validation-and-qa (which says WHAT to verify; this is HOW to see
  it).
---

# Visual capture — screenshot the running app

Produces a pixel-accurate screenshot of the real app at 390px. Use it to *see*
a UI change instead of guessing, and to hand the owner a picture.

## TL;DR

```bash
# 1. app running (leave it in the background)
npm run dev &

# 2. one-time per session: playwright-core in a THROWAWAY dir (NOT a project dep)
mkdir -p /tmp/pw && ( cd /tmp/pw && npm i playwright-core )

# 3. capture
node scripts/dev/screenshot-app.mjs --player "Rashid Shaheed"
node scripts/dev/screenshot-app.mjs --route /league --full
node scripts/dev/screenshot-app.mjs --player "Bijan Robinson" --theme light --out /tmp/b.png
```

Output defaults to `.screenshots/<slug>.png` (gitignored). Then `Read` the PNG
to view it, or `SendUserFile` it to the owner.

Flags: `--player NAME` (opens global search → clicks the match → shoots the
profile drawer) · `--route PATH` (navigates an app route — any form works,
`/league`, `league`, or `#/league`) · `--out PATH` · `--width N` (default 390)
· `--height N` · `--theme dark|light` · `--full` (full page, not just the
sheet) · `--url BASE` · `--wait MS`.

## The three gotchas — already solved, do not rediscover

These cost real turns to figure out the first time. The script bakes in all three.

### 1. The app is LOCAL. There is no public URL for your branch.

"Can't you just put the address in the browser?" — the app is a static site
served by a **local** Vite dev server (`http://localhost:5173/dynastyedge/`).
The only public URL, `https://chnates.github.io/dynastyedge/`, serves **`main`**
— it never has your unmerged feature branch. So:

- To verify a **branch** change → you MUST `npm run dev` and screenshot
  localhost. (This is the normal case.)
- Screenshotting the **live `main`** site is fine for a sanity check of what's
  deployed, but it will NOT show work that isn't merged yet.

### 2. Headless Chromium can't reach the APIs through the sandbox proxy.

Outbound HTTPS in this environment goes through a TLS-intercepting agent proxy.
`curl` trusts its CA and works; **headless Chromium resets the connection**
(`ERR_CONNECTION_RESET`) on the Sleeper / FantasyCalc / GitHub-raw calls the app
makes. Symptom: the app shell paints but every panel spins forever and search
returns nothing (empty `playerMap`). Passing `--ignore-certificate-errors` /
disabling http2/quic does **not** fix it.

**The fix (in the script):** don't give the browser a proxy at all. Intercept
every *external* request with Playwright's `context.route` and fulfill it by
shelling out to `curl` (piping the bytes back with `access-control-allow-origin:
*`). Local dev-server requests pass through untouched. This is why the script
looks the way it does — leave that structure alone.

### 3. The app is a HashRouter — routes live in the URL hash, not the path.

`--route /league` must load `…/dynastyedge/#/league`, **not**
`…/dynastyedge/league`. A bare path returns index.html via Vite's SPA fallback
and the router, seeing no hash, falls back to the default route (`/edge`) —
so you silently screenshot The Edge instead of the page you asked for. Symptom:
the capture succeeds and looks fine, but it's the wrong screen.

**The fix (in the script):** `--route` is normalized into the hash — pass
`/league`, `league`, or `#/league` and all three become `#/league`. Deep paths
(`/league/teams/6`) work too. If you ever build a URL by hand for `--url`,
remember the `#/`.

## Other things the script handles

- **Login gate** — seeds `dynastyedge_identity_v1` in localStorage
  (`owner_id` 965787707299430400 + roster 6, from `src/constants.js`) so it
  lands logged in as Nix Cage. Change the seed to screenshot as another team.
- **Chromium binary** — auto-found under `/opt/pw-browsers/chromium-*`
  (version dir changes; don't hardcode). Override with `PLAYWRIGHT_CHROMIUM`.
- **playwright-core** — resolved from `/tmp/pw` (or `PLAYWRIGHT_CORE_DIR`) if not
  importable from the repo. It is deliberately **not** in `package.json` — the
  repo's dependency rules (CLAUDE.md) forbid unsanctioned deps, and the browser
  is already on disk so no download happens.
- **Selectors** — global search icon is `aria-label="Search players"`; the
  search input placeholder is `Search players & features…`; player-profile and
  sheets render as `[role="dialog"]`. If a capture hangs on `waitFor`, re-grep
  these in `src/App.jsx` / the target component — a label may have changed.

## When NOT to use this

- Pure-logic changes (utils, hooks with no visual output) → `npm test` is the
  faster proof; see dynastyedge-validation-and-qa.
- You only need to know an API's live shape → `curl` it directly (see
  dynastyedge-diagnostics-and-tooling), no browser needed.
