# History — GitHub Pages Deployment

> **Verbatim text of this CLAUDE.md section as it stood at `8c25d03` (2026-10-07), before CLEANUP-2 slimmed it.**
> Nothing here was edited. The live rules, contracts and traps are in CLAUDE.md; this file keeps the
> measurements, dated rulings and narratives that explain them. When the two disagree, CLAUDE.md is current.

## GitHub Pages Deployment

Every push to `main` triggers an automatic build and deploy — gated by
`npm run lint` and `npm test`, which must pass before the build and publish
steps run. No manual steps ever.

### GitHub Actions workflow

File: `.github/workflows/deploy.yml`

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      # fetch-depth: 0 is LOAD-BEARING — the build id is a first-parent commit
      # count, and a shallow clone makes that count 1 for EVERY build.
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      # Quality gates — a broken push fails here, BEFORE anything publishes.
      - run: npm run lint
      - run: npm test
      - run: npm run build
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - uses: actions/deploy-pages@v5
        id: deployment
```

### Vite config

File: `vite.config.js` — sets `base` to the repo name, and stamps one build id
into **both** the bundle (`__BUILD_ID__`, via `define`) and an emitted
`version.json` (via a tiny inline plugin). The app compares the two — see
**App version self-heal** below.

**The build id is a BUILD NUMBER**: `git rev-list --count --first-parent HEAD`,
which advances by exactly one per merge (or direct push) to `main`. It is
deliberately **not** the PR number — `deploy.yml` runs on *push to main*, where
no PR number exists, and `values-history.yml`'s keepalive commits to `main` with
no PR at all.

**A shallow clone silently poisons it**, which is why `deploy.yml` sets
`fetch-depth: 0`: `actions/checkout` defaults to depth 1, where the count is
**1 for every build** — every deploy would share an id and the self-heal could
never detect a stale bundle. If that guard is ever lost, `vite.config.js`
detects the shallow repo (`git rev-parse --is-shallow-repository`) and falls
back to a timestamp id — uglier, but never a duplicate. `formatBuildId` renders
a digits-only id verbatim and only date-formats the fallback.

```js
export default defineConfig({
  plugins: [react(), buildVersionPlugin()],
  base: '/dynastyedge/',            // must match the GitHub repo name exactly
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
})
```

`version.json` must be **emitted by the build**, never committed under
`public/` — a checked-in file would have to be bumped by hand and would
silently drift from the compiled-in id, which is the one thing this mechanism
cannot tolerate (drift either way means updates are never noticed, or every
launch reloads). `__BUILD_ID__` is declared in `eslint.config.js`'s browser
globals; `npm run dev` emits no `version.json`, so the check no-ops in dev.

### App version self-heal

**The problem:** on iOS a home-screen (standalone) web app keeps its own WebKit
cache, and GitHub Pages serves `index.html` with a fixed
`cache-control: max-age=600` that Pages gives **no way to configure**. A cold
launch can therefore boot **cached HTML referencing the old hashed chunks**, and
nothing in the running app notices. Reloading doesn't help — same URL, same
cached entry. Before this, the only reliable fix was deleting and re-adding the
home-screen app. (Confirmed 2026-09-04: the deploy was verified byte-identical
on the CDN while the phone still showed the previous build.)

**The mechanism (`useAppVersion` + `utils/appVersion.js`):** the running bundle
carries its own build id and fetches `version.json` to ask the server what the
current one is. A mismatch means the HTML on screen is stale.

- **Cold start reloads silently** — nothing is in flight to lose.
- **On focus it only reports** (`updateAvailable`), surfaced as an
  "Update available — Reload" row above Refresh in the side drawer. Yanking the
  page out from under a half-built trade is worse than a stale render.
- The reload target is `?v=<build id>` placed **before** the hash: it must be a
  real URL change (a hash-only edit reuses the same cache entry) and the app is
  a HashRouter, so a query after the hash would fold into the route.
- **Loop guard:** sessionStorage `dynastyedge_version_reload` records which
  build id was already reloaded toward. If the app is still stale afterwards the
  reload didn't land, so it never retries — it falls back to the drawer row.
  Without this, a reload that fails to take would cycle forever.
- The check is a **unique query per request** (`?t=<now>`) rather than
  `cache: 'no-store'`: the whole problem is caches that don't honor what
  they're told, and a URL nothing has seen can't be served from any of them.
- The hook is called **above the identity gate** in `App`, so a stale bundle
  that boots to the login screen self-heals too.
- It also returns **`buildId`** and **`versionState`** (`current` / `stale` /
  `unknown`) for the drawer's "App build" row — the mechanism's only visible
  surface. `unknown` is the default and covers both dev and a failed check;
  neither may render as "up to date".
- **Best-effort, fails open:** any fetch failure simply offers no update. It is
  deliberately **not** a service worker — a SW would also solve this, but a bad
  one can pin the app to a stale build permanently with no delete-and-re-add
  escape hatch left. This mechanism can only ever fail open.
- Caveat: the check runs after boot, so the first launch after a deploy still
  paints the old UI briefly before reloading. It removes the manual step, not
  the round trip.

### GitHub Pages setting (one-time, done manually)

In GitHub repo → Settings → Pages → Source: **GitHub Actions**
This only needs to be set once. After that, every push auto-deploys.

-----


