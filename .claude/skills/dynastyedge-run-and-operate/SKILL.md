---
name: dynastyedge-run-and-operate
description: >
  DynastyEdge operations runbook: run the app locally (npm run dev / preview,
  the /dynastyedge/ base path), deploy to GitHub Pages (deploy.yml anatomy,
  status checks, rollback = revert on main), and operate the two data
  pipelines (news.yml → news-data branch, values-history.yml →
  values-history branch). Load when: starting the app locally; deploying or
  checking why the live site is stale or serving an old bundle; operating,
  re-running, or fixing the pipelines behind a stale news feed or stale
  value-history sparklines; re-running or re-enabling a
  scheduled workflow (60-day cron auto-disable); manually triggering
  workflow_dispatch; investigating the news-data / values-history branches;
  or running scripts/*.mjs locally for debugging.
---

# DynastyEdge — Run & Operate

Operational runbook for a zero-context session. DynastyEdge is a static React
SPA (Vite) with **no backend**: the deployed site is GitHub Pages, and two
GitHub Actions cron workflows publish data files to orphan branches that the
app fetches at runtime.

**Owner's laws (non-negotiable):** every push to `main` auto-deploys to the
owner's phone — `main` must always be shippable. CLAUDE.md updates ship in the
same commit as the change they describe. Verify against real data. No new
dependencies.

## When NOT to use this skill

- **Build failures, Node/npm setup, Tailwind/PostCSS/Vite config, icon
  generation, dependency questions** → `dynastyedge-build-and-env`.
- **Shape/semantics of `news.json`, `values-history.json`,
  `trade-values.json`, or the Sleeper/FantasyCalc API responses** →
  `dynastyedge-data-contracts`. This skill covers *operating* the pipelines,
  not their payload schemas.
- Committing/branching discipline → `dynastyedge-change-control`.
- App-logic bugs → `dynastyedge-debugging-playbook`.

## 1. Running the app locally

Verified in-sandbox 2026-07-05 (Node v22, npm 10; CI uses Node 20 — both work).

| Command | What happens (verified) |
|---|---|
| `npm run dev` | Vite dev server on port **5173** (auto-increments to 5174 etc. if busy). Serves at the **base path**: `http://localhost:5173/dynastyedge/`. Ready in <1s. |
| `npm run build` | Production build to `dist/` (~3s locally). |
| `npm run preview` | Serves the built `dist/` on port **4173**, also at `http://localhost:4173/dynastyedge/`. Run `npm run build` first. |

The `/dynastyedge/` base (from `vite.config.js` `base: '/dynastyedge/'`,
matching the GitHub Pages repo path) applies **in dev too** — hitting `/`
returns a **302 redirect** to `/dynastyedge/`. Quick smoke test:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/dynastyedge/   # expect 200
```

Kill servers with `pkill -f vite` when done (verify with `pgrep -f vite` —
a backgrounded `npm run dev` can leave both the npm wrapper and the vite
child alive; kill both).

**The app needs live API access to be useful.** All data comes at runtime
from `api.sleeper.app` and `api.fantasycalc.com` (plus
`raw.githubusercontent.com` for the news/values feeds). Expected behavior
without network (per the app's architecture — LoginScreen gates on Sleeper's
`signInRosters`; every fetch goes through `fetchJSON` with an
AbortController timeout; every surface has a loading + `ErrorState` with
retry): the shell renders, then the login screen / data panels show
ErrorStates with retry buttons rather than hanging spinners. Best-effort
surfaces (news, sparklines, trade-time values) silently hide — that is by
design, not a bug. *(Behavior inferred from code + CLAUDE.md contracts, not
visually verified in a browser in this sandbox.)*

In this Claude sandbox, raw HTTPS to external APIs is proxy-blocked (403), so
a locally-running app cannot fetch real data — "requires open network" for
any end-to-end verification.

## 2. Deploy anatomy (`.github/workflows/deploy.yml`)

**Trigger: push to `main`. Only.** No workflow_dispatch, no PR builds, no
other branch. There is no staging environment.

Steps, in order (as of 2026-07-05):

1. `actions/checkout@v4`
2. `actions/setup-node@v4` — Node **20**, npm cache
3. `npm ci`
4. `npm run build` → `dist/`
5. `actions/configure-pages@v4`
6. `actions/upload-pages-artifact@v3` with `path: dist`
7. `actions/deploy-pages@v4` → publishes to <https://chnates.github.io/dynastyedge/>

Permissions: `contents: read`, `pages: write`, `id-token: write`; environment
`github-pages`. Typical end-to-end time: a few minutes (build itself is ~3s;
runner spin-up + `npm ci` + Pages propagation dominate — estimate, not
measured here).

**One-time setting (already done — do not redo):** repo → Settings → Pages →
Source: **GitHub Actions**.

### Checking deploy status

| Method | How | Availability |
|---|---|---|
| Web UI | <https://github.com/chnates/dynastyedge/actions> → "Deploy to GitHub Pages" | Always |
| `gh` CLI | `gh run list --repo chnates/dynastyedge --workflow deploy.yml --limit 5` then `gh run view <id>` | **Not installed in this Claude sandbox** — may exist on the operator's machine |
| MCP GitHub tools | `actions_list` / `actions_get` / `get_job_logs` (in Claude sessions with the github MCP server) | Claude sessions; requires open network |

### Rollback

**The only rollback mechanism is a revert commit on `main`.** There is no
"redeploy previous artifact" button, no versioned releases, no manual deploy.

```bash
git revert <bad-sha>        # or git revert <oldest-bad>..<newest-bad>
git push origin main        # triggers a fresh deploy of the reverted state
```

Never force-push `main`. If the site is broken, revert first, investigate
after — the owner's phone is on the live URL.

## 3. Data pipeline operations

Two cron workflows publish **orphan, single-commit, force-pushed branches**.
Design rationale: each run does `git init` in a temp dir, one commit,
`git push --force` — so the branch always has exactly one commit. Without
this, news alone would add ~48 commits/day of JSON churn to the repo history,
unboundedly. Consequence: **the workflow owns those branches.** Never push to
`news-data` or `values-history` by hand — the next scheduled run
force-pushes and clobbers whatever you put there.

GitHub Actions cron is **UTC**.

### 3a. News pipeline (`.github/workflows/news.yml`)

- **Schedule:** `17,47 * * * *` — twice hourly at :17 and :47 UTC (offsets
  avoid top-of-hour congestion). Plus `workflow_dispatch`.
- **Script:** `node scripts/fetch-news.mjs` (repo root cwd in Actions). Tries
  **five sources**, each best-effort with a 15s timeout and a browser
  User-Agent: ESPN news API (JSON — the only source carrying `athleteIds`),
  FantasyPros player-news RSS, Yahoo NFL RSS, ESPN RSS, CBS RSS. A failing
  source is logged and skipped. Items are merged, sorted newest-first,
  deduped by normalized headline, capped at **100 items** (story ≤600 chars,
  `link` kept only if a real http(s) URL, else null).
- **Failure semantics:** exits 1 **only when ALL sources return zero items**
  — the workflow run fails and the previous `news.json` stays published.
  One or two dead sources = still a green run.
- **Publish:** writes `news.json` to cwd; the workflow copies it into a fresh
  repo and force-pushes branch **`news-data`** (single commit "Update news
  feed").
- **Consumed at:**
  `https://raw.githubusercontent.com/chnates/dynastyedge/news-data/news.json`
  (raw CDN caches ~5 min; sends CORS `*`).

### 3b. Values pipeline (`.github/workflows/values-history.yml`)

- **Schedule:** `41 9 * * *` — daily at **09:41 UTC** = 5:41 AM New York
  (EDT) / 4:41 AM (EST), 2:41 AM Pacific (PDT). Plus `workflow_dispatch`.
- **Step 1 — `scripts/snapshot-values.mjs`** (failure fails the run):
  fetches FantasyCalc current values (fatal if empty/not-array → exit 1,
  previous history stays), loads the existing history from the branch's raw
  URL (load failure = start fresh, best-effort), then appends **today's UTC
  column**. Re-running on the same UTC day **replaces** that day's column
  (idempotent). Rolling window 90 days; tracks top 500 players by current
  value, plus already-tracked players until their row is all-null. Writes
  `values-history.json` (columnar: `{updatedAt, dates[], players{sid:[v|null]}}`).
- **Step 2 — `scripts/snapshot-trade-values.mjs`** (`continue-on-error:
  true`): loads the existing archive — **404 = first run, start fresh; any
  other load error = exit 1** (deliberate abort to avoid data loss). Empty
  FantasyCalc response ⇒ rewrites the archive unchanged and exits 0. Fetches
  all 18 Sleeper weekly transaction buckets, filters to completed trades in
  the **last 8 days**, and archives each new `transaction_id` (player values
  by sleeperId; picks keyed `season-round-rosterId` at median-of-round).
  **Append-only: existing entries are never overwritten, nothing is ever
  pruned.** Writes `trade-values.json`.
- **Publish:** force-pushes branch **`values-history`** with
  `values-history.json`, plus `trade-values.json` — if step 2 produced no
  file, the workflow **re-fetches the previous `trade-values.json` from the
  branch** before pushing (`curl ... || true`), so a bad archive run can
  never erase the archive.
- **Consumed at:**
  `https://raw.githubusercontent.com/chnates/dynastyedge/values-history/values-history.json`
  and `.../values-history/trade-values.json`.

### Manual trigger (workflow_dispatch)

- **Web UI:** repo → Actions → select "Refresh news feed" or "Snapshot
  dynasty values" → "Run workflow" dropdown → branch `main` → Run.
- **`gh` CLI** (if available; not in this sandbox):
  `gh workflow run news.yml --repo chnates/dynastyedge` /
  `gh workflow run values-history.yml --repo chnates/dynastyedge`
- **MCP:** `actions_run_trigger` (github MCP server).

Safe to re-run anytime: news fully regenerates; values replaces today's
column; trade archive never overwrites existing entries.

### Verifying feed freshness (requires open network)

```bash
# news: updatedAt should be < ~40 min old (cron every 30 min + CDN ~5 min)
curl -s https://raw.githubusercontent.com/chnates/dynastyedge/news-data/news.json | head -c 200

# values: updatedAt should be today (UTC); last date in `dates` = today
curl -s https://raw.githubusercontent.com/chnates/dynastyedge/values-history/values-history.json | head -c 300
```

Or check the branch's single commit date: repo → branch selector →
`news-data` / `values-history` (or `gh api repos/chnates/dynastyedge/branches/news-data --jq .commit.commit.committer.date`,
or MCP `list_commits` with `sha: news-data`).

### The 60-day cron auto-disable (KNOWN RISK)

GitHub **disables scheduled workflows after ~60 days without repo activity**.
Symptoms: both feeds go stale simultaneously, workflows show "This scheduled
workflow is disabled" banners in the Actions UI. Cure: **any push to the
repo re-enables them**, or Actions → the workflow → "Enable workflow"
button. If the app has been untouched for weeks, check this *first* when a
feed is stale.

## 4. Running the pipeline scripts locally (debugging)

All three scripts are plain Node ≥18 (global `fetch`, `AbortSignal.timeout`),
**zero npm dependencies, no `GITHUB_WORKSPACE` or env-var reliance** — they
write their output JSON to the **current working directory**. So they run
anywhere, but **require open network** (blocked in this Claude sandbox —
external API curls get proxy 403; not runnable/verified here).

```bash
# Run from a scratch dir so output doesn't land in the repo root
# (news.json / values-history.json / trade-values.json are NOT gitignored):
mkdir -p /tmp/de-scratch && cd /tmp/de-scratch
node /home/user/dynastyedge/scripts/fetch-news.mjs            # → ./news.json
node /home/user/dynastyedge/scripts/snapshot-values.mjs       # → ./values-history.json
node /home/user/dynastyedge/scripts/snapshot-trade-values.mjs # → ./trade-values.json
```

Each prints per-source/per-step counts — that log is the diagnostic. The
snapshot scripts read their *existing* state from the live branch raw URLs,
so a local run reproduces exactly what Actions would do today.

**NEVER hand-push script output to `news-data` or `values-history`.** The
workflows force-push those branches on every run; a manual push will be
clobbered within 30 minutes (news) or a day (values), and a manual
force-push fights the automation. If a feed needs fixing, fix the script on
`main` and `workflow_dispatch` the workflow.

## 5. Operational health checklist (weekly-ish)

All checks require open network. `gh` alternatives assume the CLI exists on
your machine (not in this sandbox).

| Check | How | Healthy looks like |
|---|---|---|
| News feed fresh | `curl -s .../news-data/news.json` → `updatedAt` | < ~1 hour old |
| Values fresh | `curl -s .../values-history/values-history.json` → `updatedAt`, last `dates` entry | Today or yesterday (UTC) |
| Trade archive intact | `curl -s .../values-history/trade-values.json` → `trades` present | File exists, trade count never decreases |
| Actions green | <https://github.com/chnates/dynastyedge/actions> or `gh run list --repo chnates/dynastyedge --limit 10` | Recent runs of all 3 workflows succeeded |
| Crons still enabled | Actions tab → each scheduled workflow, look for a "disabled" banner | No banner; recent scheduled (not just manual) runs exist |
| Pages serving latest | Load <https://chnates.github.io/dynastyedge/>, compare bundle hash in view-source (`assets/index-*.js`) against latest `dist/` build of `main` | Hash matches the latest deploy run |

## 6. Incident playbook stubs

**News feed stale > 1 day**
1. Actions tab → "Refresh news feed": disabled banner (60-day cron kill)? →
   re-enable / push anything to the repo.
2. Recent runs red? Open the run log — `fetch-news.mjs` prints per-source
   counts; all-sources-zero (exit 1) means upstream outages or blocked UA,
   not our bug. One-source failures are normal noise.
3. Runs green but app shows old news? Check the raw URL directly (CDN ~5 min
   cache), then the app's once-per-session cache — reload the tab.

**values-history missing today's column**
1. Actions tab → "Snapshot dynasty values": disabled banner? red run? Read
   step 1's log — a FantasyCalc empty/HTTP error exits 1 by design and keeps
   yesterday's file.
2. `workflow_dispatch` it manually — same-day re-runs safely replace today's
   column.
3. Remember it fires 09:41 UTC — "missing today" before ~10:00 UTC is not an
   incident. Trade-archive step failing is non-fatal (`continue-on-error` +
   publish-time re-fetch); check its log separately only if the ledger's
   "at trade time" lines vanished.

**Deploy failed**
1. Actions → "Deploy to GitHub Pages" → open the red run; failures are
   almost always `npm ci` or `npm run build` (build/toolchain → switch to
   `dynastyedge-build-and-env`).
2. Reproduce locally: `npm ci && npm run build` on the same commit (CI is
   Node 20).
3. If a bad commit is live-adjacent, revert on `main` first (Section 2
   rollback), then fix forward. Re-run the failed job via the run page's
   "Re-run jobs" if the failure looks transient (runner/network flake).

**Site serving old bundle**
1. Confirm the deploy actually ran and succeeded for the latest `main`
   commit (Actions tab — deploy only triggers on push to `main`; a commit on
   another branch deploys nothing).
2. Cache angle: Vite emits hashed asset names, so stale JS almost always
   means stale `index.html` — hard-reload; on the iPhone home-screen app,
   fully close and reopen it. GitHub Pages' CDN can lag a few minutes after
   a green deploy.
3. Compare the deployed `assets/index-*.js` hash (view-source on the live
   URL) with a fresh local `npm run build` of `main`. Mismatch after 10+
   minutes and a green deploy → re-run the deploy job.

## Provenance and maintenance

Ground truth as of **2026-07-05** (dev/build/preview behavior verified by
running them in-sandbox 2026-07-05; network-dependent items marked above were
not executable here). Re-verify before trusting:

- Deploy steps/trigger: `cat .github/workflows/deploy.yml`
- News schedule + publish: `cat .github/workflows/news.yml` and read `scripts/fetch-news.mjs`
- Values schedule + fallback publish: `cat .github/workflows/values-history.yml`, `scripts/snapshot-values.mjs`, `scripts/snapshot-trade-values.mjs`
- Dev/preview ports + base path: `npm run dev` / `npm run build && npm run preview`, then `curl -s -o /dev/null -w "%{http_code}" http://localhost:<5173|4173>/dynastyedge/`
- Base path config: `cat vite.config.js` (`base: '/dynastyedge/'`)
- Feed URLs/consumers: grep `NEWS_FEED_URL` / `VALUES_HISTORY_URL` in `src/`
- If any of these drift from this file, update this skill and CLAUDE.md in the same commit as the change.
