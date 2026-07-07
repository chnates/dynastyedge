---
name: dynastyedge-change-control
description: How changes are classified, gated, and landed in the DynastyEdge repo. Load BEFORE making any commit, merge, or push here — especially before touching main, editing CLAUDE.md, adding an npm dependency, changing a GitHub Actions workflow, or modifying index.html / manifest.webmanifest (PWA metas). Also load when deciding whether a change needs a design review, real-data verification, or a CLAUDE.md update, or when CLAUDE.md and the code appear to disagree.
---

# DynastyEdge Change Control

**The one fact that shapes everything:** every push to `main` auto-builds and
deploys to the owner's iPhone within minutes (`.github/workflows/deploy.yml`
triggers on `push: branches: [main]`). There is no staging environment, no
test suite, no linter, no typecheck. `main` **is** production, and the only
machine gate is `npm run build`. Everything else in this skill exists to
compensate for that.

Terms used below (defined once):
- **CLAUDE.md** — the ~108KB doc of record at the repo root. Authoritative
  except where code demonstrably diverges (see Divergence protocol).
- **PWA meta** — the `<meta>`/manifest tags in `index.html` +
  `public/manifest.webmanifest` that control how iOS renders the app when
  installed via Add to Home Screen ("standalone" mode).
- **Sleeper / FantasyCalc** — the two free public APIs the app lives on
  (live fantasy-league data and dynasty player trade values, respectively).

## When NOT to use this skill

| You actually need | Go to |
|---|---|
| Symptom → diagnosis for a bug | `dynastyedge-debugging-playbook` |
| Why a past decision was made / already-fought battles | `dynastyedge-failure-archaeology` |
| Load-bearing architecture invariants (what the rules protect) | `dynastyedge-architecture-contract` |
| API/feed/localStorage shapes | `dynastyedge-data-contracts` |
| Setting up the dev environment | `dynastyedge-build-and-env` |
| Operating the deploy / news / values pipelines | `dynastyedge-run-and-operate` |
| Evidence standards for "real-data verification" | `dynastyedge-validation-and-qa` |
| Writing/updating CLAUDE.md itself (house style) | `dynastyedge-docs-and-writing` |
| Fantasy-football terms or domain reasoning (taxi, FAAB, Superflex…) | `dynasty-fantasy-reference` |
| Running `src/utils/*.js` under plain Node (loader hook) | `dynastyedge-diagnostics-and-tooling` |
| UI-diff design-system audit (a gate this skill references) | the existing `design-review` skill (`.claude/skills/design-review`) |

This skill is the **process** layer: what class a change is, which gates it
must pass, and how it lands.

## 1. Change taxonomy

Derived from the actual git history (69 commits visible as of 2026-07-05) and
CLAUDE.md. Classify every change before starting work; a change spanning two
classes must pass the union of both gate sets.

| Class | Examples from history | Required gates before merge to main |
|---|---|---|
| **UI-only** (styling/layout, no logic or data change) | `4457e45` stadium-lights rollout · `0b15ca3` login neon styling · `e98260f` iOS focus-zoom fix | build green · **`design-review` skill on the diff** · 390px mental layout check · CLAUDE.md same-commit *if* the design system or a documented treatment changed (`8b6edb4` bundled CLAUDE.md with the ui/ library) |
| **Behavior/logic** (any change to what the app computes, fetches, stores, or shows) | `24ed7cf` taxi (developmental-player stash — see dynasty-fantasy-reference) rule fix · `1ef480a` pick pricing fix · `119c164` new Feature 17 · `92657ae` trade preload fix | build green · **real-data verification** against the live league (route: `dynastyedge-validation-and-qa`) · **CLAUDE.md updated in the SAME commit** · design-review if UI moved too |
| **Data-pipeline/workflow** (`.github/workflows/*.yml`, `scripts/*.mjs`) | `news.yml` (cron `17,47 * * * *`) · `values-history.yml` (cron `41 9 * * *`) — both force-push single-commit data branches | build green (if app code touched) · run the script locally where network allows · **never write a publish step that can erase accumulated branch data** (values-history.yml's publish step re-fetches the old trade archive on script failure — preserve that pattern) · CLAUDE.md same commit · after merge, verify with a manual `workflow_dispatch` run (workflows can only truly be tested on the default branch) · pipeline ops/schedules canonical: `dynastyedge-run-and-operate` |
| **Doc-only** (CLAUDE.md / skills, no code) | `700ce00` "docs: reflect UX audit fixes" · `d4f9e75` "docs: add phased Navigation Refactor plan" | prefix subject with `docs:` · verify every claim against the code before writing it (see Divergence protocol) · build not required but costs 4s — run it anyway |
| **PWA-meta/manifest** (index.html metas, manifest.webmanifest, theme-color logic in `useTheme`) | the `cfd9ad0` → `3083f0c` → `78b6c29` status-bar saga (below) | **highest-risk class.** All behavior-class gates, PLUS: read the saga below and `dynastyedge-failure-archaeology` first · know that meta changes only take effect after the owner **removes and re-adds** the home-screen app (stated in index.html's own comment and CLAUDE.md rule 16) — you cannot verify this class in any sandbox; it needs the physical phone · bump the `?v=N` icon query only for logo changes |

**The PWA saga (why that class is special), as of 2026-07-05:** a prior
commit had already dropped the `black-translucent` status bar for a
theme-color approach; `cfd9ad0` refined that pre-existing theme-color
approach (manifest + useTheme only); it
looked fine — until the owner re-added the home-screen app, which finally
pulled in the regression (iOS standalone doesn't honor live per-theme
theme-color; the bar rendered as a solid black band). `3083f0c` reverted it;
`78b6c29` restored `apple-mobile-web-app-status-bar-style=black-translucent`
plus a light-mode-only dark strip behind the white status text. Three deploys
to production to relearn one iOS quirk. The feedback loop for this class is
*days* (until the owner reinstalls), so the bar for touching it is proof, not
plausibility.

## 2. The gate checklist

Run top to bottom before any merge to `main`:

```bash
cd /home/user/dynastyedge
npm run build          # the ONLY machine check; must end "✓ built in …"
```

1. **Build green.** Verified working as of 2026-07-05 (`vite build`, ~3s).
   There is no `npm test` / `npm run lint` — do not invent one, do not skip
   the build because the change "is just CSS".
2. **Design review for any UI diff.** Invoke the `design-review` skill on the
   diff. It enforces CLAUDE.md's rule that all UI routes through
   `src/components/ui` (Button, Card, Sheet, Chip, Badge, Input…). This is
   the project's stated enforcement mechanism, not a suggestion.
3. **Real-data verification for behavior changes.** The owner's law: verify
   against the REAL live league, never mocks. Evidence standards live in
   `dynastyedge-validation-and-qa`. Example spot-checks (⚠ require open
   network — api.sleeper.app / api.fantasycalc.com return proxy 403 in
   restricted sandboxes like this one; never claim you ran these if blocked):

   ```bash
   curl -s 'https://api.sleeper.app/v1/league/1313933520715907072/rosters' | head -c 2000
   curl -s 'https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=10&ppr=0.5' | head -c 2000
   ```

   Pure utils in `src/utils/` can be exercised under plain Node via the
   resolver hook in `dynastyedge-diagnostics-and-tooling` (extensionless ESM
   imports — plain `node` can't load them without it; don't duplicate the hook).
4. **CLAUDE.md in the SAME commit for any behavior change.** This is the
   observed, consistent house pattern — verify it yourself:

   ```bash
   git log --format='%h %s' --name-only | grep -B8 'CLAUDE.md' | head -60
   ```

   Feature commits bundle their doc update (`119c164`, `dd31311`, `afa30dc`,
   `77bb3fe`, `9fb39df`, `59627db`, `8b6edb4`); even small behavior fixes do
   (`24ed7cf` = 8 lines of CLAUDE.md + 9 lines of code; `5b8668f` updated the
   sheet rule alongside the gesture fix). Pure doc syncs get a `docs:` prefix
   (`700ce00`, `d4f9e75`). A behavior commit without its CLAUDE.md hunk is
   incomplete — the next zero-context session inherits a lying doc.
5. **No new npm dependencies without genuine need.** `package.json` as of
   2026-07-05 has exactly 7 runtime deps (`@dnd-kit/*` ×3, `lucide-react`,
   `react`, `react-dom`, `react-router-dom`) and 7 devDeps — even the icon
   tooling (`sharp`, `png-to-ico`) sits in devDependencies. The house
   `cn.js` exists specifically so nobody adds a classnames package. If you
   think you need a dep, first write the ~30-line vanilla version; only if
   that's genuinely worse, propose the dep *to the owner* — don't just add it.
6. **Commit hygiene** (observed style): imperative subject; body explains the
   *cause*, not just the fix (read `1ef480a` or `5b8668f` as models); session
   link trailer. Any Claude session also appends its required
   `Co-Authored-By` / `Claude-Session` trailers.

## 3. Non-negotiables, with the incident behind each

These are the change-control-relevant subset of CLAUDE.md's "Rules Claude Code
Must Always Follow". The rule text is the *what*; this table is the *why* and
the scar tissue. Deeper invariants: `dynastyedge-architecture-contract`.

| Rule | Why | Where history punished a violation (or near-miss) |
|---|---|---|
| Every network call goes through `src/utils/fetchJSON.js` (AbortController timeout) — never raw `fetch()` | A hung public API must never leave a no-backend app on a permanent spinner; there's no server-side timeout to save you | Preventive rule. Known sanctioned exceptions as of 2026-07-05: `fetchJSON.js:9` itself, plus two same-origin static-asset fetches in `DraftBoard.jsx:540,560` (`rankings.json`, the FantasyPros CSV). Those are NOT license to bypass the wrapper for API calls. |
| Never hardcode player names, values, or roster data; join Sleeper↔FantasyCalc on `sleeperId` (string-normalized) | Sleeper returns numeric IDs only; FantasyCalc carries the `sleeperId` bridge; IDs arrive as strings *or* numbers per endpoint | Preventive + doc'd repeatedly; the string-normalization clause exists because mixed-type joins silently miss. Related league-fact incident: `24ed7cf` — the taxi alert flagged `years_exp === 1` players, but the league's taxi duration is 2 years (`years_exp >= 2` is the real deadline). Wrong *domain* facts ship as confidently as wrong code; check league settings in the live API, not your priors. |
| Never price an unresolvable asset at 0; unranked/unpriced shows `—` | A 0 silently poisons every sum, grade, and verdict downstream | Twice. `4f31aad`: manager-scouting pick resolution required `slot_to_roster_id` (Sleeper omits it on older drafts) and past picks fell through `findPickValue` to 0 — every traded pick showed 0 and skewed all trade grades. `1ef480a`: after the NFL draft, FantasyCalc retires generic current-season pick entries, so the Pick Trade Calculator priced live picks at 0 and `suggestPickPackages` bailed on `if (!targetValue) return []`; the same commit fixed a latent `p.value ?? 0` that always yielded 0 (roster pick objects carry no `.value`). (Full sagas canonical: `dynastyedge-failure-archaeology` §3.) |
| FantasyCalc fetched once per load, cached; player DB (`/players/nfl`, 5–8MB) once per session via `usePlayerDB` | Huge responses + a 1,000 calls/min courtesy limit on a client-only app | Preventive; the module-cache pattern is load-bearing — a re-fetch-per-render regression would be invisible in the sandbox and brutal on the phone. |
| Every bottom sheet uses the `Sheet` primitive / full sheet contract (`useScrollLock`, `useSheetDrag`, overscroll-contain, safe-area pad) | iOS scroll-chaining and rubber-banding break hand-rolled sheets in ways desktop dev never shows | `5b8668f`: every sheet except PlayerProfileDrawer had a grabber handle that *implied* swipe-to-dismiss but didn't do it — swiping just rubber-banded. Fix extracted `useSheetDrag` and wired all seven sheets; CLAUDE.md rule updated same commit. Only sanctioned hand-rolled overlays: the two keyboard-aware sheets (PlayerSearchSheet, TradeBuilder add sheet — `ba75c67`). |
| No bottom nav; navigation is the side drawer. Never shorten `<main>` with a bottom offset | Deliberate, re-evaluated decision (usability review kept the drawer); the `<main>` rule guards an iOS fixed-element clip | `e8cd044` + `86903a7`: bottom-offset layouts produced a black/dead bar above the home indicator — fixed by extending `<main>` to the physical edge with safe-area padding *inside*. Re-litigating the drawer wastes a session: see `dynastyedge-failure-archaeology`. |
| All new UI through `src/components/ui`; run design-review before committing component work | Keeps Tailwind's content scan working (literal class strings) and one visual language | Enforced by the `design-review` skill since `8b6edb4`. |
| Nav-state preloads must actually seed state, and verify the *flow*, not the component | Cross-screen handoffs (drawer → analyzer, What's Fair → analyzer) fail invisibly if you only test the destination in isolation | `92657ae`: What's Fair computed the fair package but only passed it to the display component — both trade columns arrived empty. `a18fdef`: TradeAnalyzer opened empty when launched from PlayerProfileDrawer. Same lesson twice: exercise the entry path end-to-end. |
| Best-effort features (news, sparklines, trade-time values) never error, block, or retry-loop — they hide | Static-file feeds from data branches can be missing/stale by design | Encoded contract (`31a7b32` even hides sparklines below 4 snapshots because a 2-point "graph" reads as broken). A change that adds an error state to a best-effort surface is a regression even if it "handles errors better". |

## 4. Branch and deploy discipline

- **Work on `claude/*` feature branches.** Observed convention:
  `claude/<topic>-<suffix>` (e.g. `claude/app-color-design-d504kn`,
  `claude/app-integration-flow-review-jiy6nb`). Merge commits read
  `Merge claude/<branch>: <subject>` or `Merge: <subject>`.
- **Merging/pushing to `main` IS deployment.** `deploy.yml`: push to main →
  `npm ci` → `npm run build` → deploy `dist/` to GitHub Pages (Node 20).
  No approval step, no environment gate you control.
- **Therefore: no WIP, no experiments, no "let's see how it looks" on main.**
  History shows the cost: `e31deaf` (neon glow experiment) → `aa0892b`
  (revert) and the `cfd9ad0` → `3083f0c` PWA revert — each round-trip was two
  production deploys to the owner's phone. Iterate on the branch; land the
  settled result.
- Every commit on main must be individually shippable — if the build passes
  but the feature is half-wired, it does not merge.
- Keep GitHub Pages' data branches (`news-data`, `values-history`) out of
  manual reach: they are force-pushed single-commit branches owned by the
  workflows. Never rebase, delete, or hand-edit them (see
  `dynastyedge-run-and-operate`).

## 5. Divergence protocol: when CLAUDE.md and code disagree

CLAUDE.md is authoritative — *except* when the code demonstrably diverges.
Then:

1. **Investigate git history before "fixing" either side.**
   `git log --follow -p -- <file>` and `git log --grep='<keyword>' --oneline`.
   The divergence usually encodes a fought-and-settled battle.
2. **Code + history win.** A doc claim that lost to reality is stale, not
   binding.
3. **Fix CLAUDE.md in the same change** that touches the area (or a `docs:`
   commit if you're not touching code), and
4. **Record the case in `dynastyedge-failure-archaeology`** so the next
   session doesn't re-derive it.

**Worked example (live divergence, unfixed as of 2026-07-05):** CLAUDE.md
rule 16 (line ~1896) states "**No `apple-mobile-web-app-status-bar-style`
meta**". But `index.html:18` deliberately ships
`<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />`,
restored by `78b6c29` after the `cfd9ad0` → `3083f0c` revert saga, with a
14-line comment explaining why (transparent bar; app glow paints under it;
light mode adds a dark strip behind the white status text). The doc describes
the *reverted* approach. If you touch this area: the meta STAYS, and rule 16
gets corrected in the same commit. Never "fix" index.html to match the stale
doc — that re-ships the regression the owner already caught on his phone.

**Sub-case — this clone's git history is shallow:** `.git/shallow` grafts at
`4f31aad` and `dc0afdc`, so `git show 4f31aad` displays the whole tree
(16,597 insertions) as if it were a root commit — that is a shallow-clone
artifact, not a real mega-commit. Commit *messages* are trustworthy; diffs at
or beyond the graft points are not locally inspectable. Say so rather than
guessing, or `git fetch --unshallow` if the remote allows it.

## 6. No exceptions

No skill, agent, subagent, slash command, or "just this once" shortcut may
route around these gates. A subagent's output merges under the same rules as
your own. If a gate cannot be run (e.g. real-data verification in a
network-blocked sandbox), the change does not silently ship anyway — you
state explicitly which gate is unmet and leave the merge decision to the
owner, on a branch. Never claim a verification you did not run.

## Provenance and maintenance

All facts verified against the repo on **2026-07-05** (branch
`claude/skill-library-handoff-i4yv4v`, history through `6fb85f3`). Re-verify
each class before trusting it:

| Fact class | Re-verification command |
|---|---|
| Deploy trigger + steps | `cat .github/workflows/deploy.yml` |
| Only machine check is the build (no test/lint scripts) | `cat package.json` (scripts: dev/build/preview only) |
| Build is green | `npm run build` |
| Dependency count / icon tooling in devDeps | `cat package.json` |
| CLAUDE.md-same-commit pattern | `git log --format='%h %s' --name-only \| grep -B8 CLAUDE.md \| head -60` |
| Incident stories (5b8668f, 24ed7cf, 4f31aad, 1ef480a, a18fdef, 92657ae) | `git show --stat --format='%h %s%n%b' <hash>` |
| PWA saga + live doc/code divergence | `git log --oneline -- index.html` · `grep -n 'status-bar-style' index.html CLAUDE.md` |
| Raw-fetch exceptions | `grep -rn 'fetch(' src/ --include='*.js*'` |
| Branch conventions | `git log --merges --format='%h %s' \| head` |
| Pipeline crons / force-push pattern | `head -30 .github/workflows/news.yml .github/workflows/values-history.yml` |
| Shallow-clone graft points | `cat .git/shallow` |
| Non-negotiables source text | CLAUDE.md → "Rules Claude Code Must Always Follow" |
