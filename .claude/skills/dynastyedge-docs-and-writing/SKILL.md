---
name: dynastyedge-docs-and-writing
description: How to write and maintain DynastyEdge documentation at the house standard. Load when updating CLAUDE.md (adding/moving/graduating a feature, changing a rule, documenting a data source), writing a commit message for this repo, auditing doc/code drift, deciding which CLAUDE.md sections a change must touch, or creating/updating any skill in .claude/skills/. Also load when CLAUDE.md's prose style or a commit-subject convention is in question.
---

# DynastyEdge Docs & Writing

**The premise:** CLAUDE.md (repo root, ~108 KB — verify: `wc -c CLAUDE.md`) is
the **doc of record**. Every future session reads it before writing code; it
is the *only* onboarding this one-person project has. A stale sentence in it
doesn't mislead one reader — it poisons every session from then on. This skill
teaches you to write like the retiring lead: what goes where in CLAUDE.md, the
house prose style, the same-commit doctrine, a runnable drift audit, the commit
message conventions, and the rules for maintaining the skill library itself.

Terms (defined once):
- **Doc of record** — CLAUDE.md; authoritative except where code demonstrably
  diverges (then follow `dynastyedge-change-control`'s divergence protocol).
- **Drift** — any disagreement between CLAUDE.md and reality. Two grades:
  a **contradiction** (doc asserts X, code does not-X) and an **omission**
  (code grew something the doc never mentions). Both are bugs in the doc.
- **Same-commit doctrine** — any behavior change updates CLAUDE.md in the SAME
  commit as the code. Owner's law, enforced by review habit, not tooling.

## When NOT to use this skill

| You actually need | Go to |
|---|---|
| Whether a change is allowed at all, gates before commit/push | `dynastyedge-change-control` |
| What to do when doc and code disagree *about behavior* | `dynastyedge-change-control` (divergence protocol) — this skill only covers *recording* the resolution |
| Why the architecture is shaped this way | `dynastyedge-architecture-contract` |
| Exact API/feed/storage-key schemas to cite | `dynastyedge-data-contracts` |
| The history behind a revert you're about to document | `dynastyedge-failure-archaeology` |
| Debugging a symptom, not documenting it | `dynastyedge-debugging-playbook` |
| Fantasy-football terms you don't understand | `dynasty-fantasy-reference` |
| Auditing a UI diff for design-system compliance | `design-review` |

This skill is the **writing** layer: what to say, where to say it, and how the
house says it.

---

## 1. CLAUDE.md anatomy

Build your mental map from the file itself, never from memory:

```bash
grep -n '^## ' CLAUDE.md          # top-level sections
grep -n '^### Feature' CLAUDE.md  # the 17 feature entries
```

### Section map (verified 2026-07-06)

| Section (in order) | Purpose — one line |
|---|---|
| What This App Is | Elevator pitch, target device (iPhone 390px), hosting (GitHub Pages static) |
| Tech Stack (+ Non-negotiable rules) | Framework table + the always/never architectural laws |
| League Context (+ Roster slots) | The one league's exact settings: IDs, scoring, slots, taxi rules |
| Data Sources | Sleeper API endpoint table · news pipeline · value-history pipeline · FantasyCalc contract |
| Features 1–17 | One `### Feature N — Name (Location)` entry per feature |
| Trade deadline banner | Small cross-feature UI contract (lives after Feature 17) |
| Navigation | The **live** nav truth: drawer tree, sub-tabs, route map, redirects |
| Navigation Refactor (Planned — phased…) | Phased plan + status line ("Phase 1 complete… Phase 2 complete") + watch-items |
| Design System | Component library table, palettes, position/tier/round color maps, logo, typography, motion |
| File Structure | Annotated tree of the whole repo — every file with a one-line role |
| GitHub Pages Deployment | deploy.yml listing, vite `base`, one-time Pages setting |
| Constants File | The `src/constants.js` contract ("never hardcode these anywhere else") |
| Rules Claude Code Must Always Follow | Numbered rules 1–23: joins, caches, display formats, sheets, storage keys |
| Future Features (Do Not Build Yet) + Already built | Backlog, and the graduation ledger for shipped ones |

### Which sections a change type must touch

Treat this as a checklist — a change that skips a row ships doc drift.

| Change type | CLAUDE.md sections to update in the same commit |
|---|---|
| **New feature** | New `### Feature N` entry · **File Structure** (new files, one-line roles) · **Navigation** (if it gets a route/sub-tab — table + route map) · **Rules** storage-key list (if it adds a `dynastyedge_*` key) · **Already built** (if it graduates a Future Feature — move it, keep a `→ location` pointer) · integration bullets in the *other* features it feeds (see how Feature 14's odds appear inside Features 2, 3, 12) |
| **New data source / endpoint / feed** | **Data Sources** (endpoint table row or a new pipeline subsection) · the consuming feature's "data sources" line · `constants.js` snippet in **Constants File** if a URL constant was added |
| **Component/route moved** | **File Structure** if the file moved; if only the route moved, do NOT move it in the tree — annotate with the **route-only move** convention: "(routed under X; file stays here)" (models: PickTradeCalculator, ManagersView/FreeAgentsView notes) · **Navigation** table + redirect list ("`/old` → `/new` redirects so saved deep-links keep working") |
| **Rule changed** | **Rules** (and/or Non-negotiable rules) — restate the rule *with its reason*; if it supersedes an old rule, rewrite the old text, don't append a contradiction |
| **Refactor phase lands** | The **Navigation Refactor** status line + its "Doc upkeep during the refactor" checklist (it names the exact sections per phase) |
| **New storage key** | Rules → the storage-key rule's exhaustive list (all keys prefixed `dynastyedge_`) |
| **Design primitive added** | Design System → component library table · File Structure `ui/` block |
| **Pipeline/workflow change** | The pipeline's subsection under Data Sources (cron, branch, file schema) · File Structure `.github/workflows` annotations |

### House feature-entry anatomy

Derived from Features 12–17 (the most recent, most refined entries). A new
feature entry contains, in order:

1. `### Feature N — Name (Section › Sub-tab)` — location in the title.
2. **`**Purpose:**` line** — one or two sentences, often ending with the user
   question the feature answers in quotes: *"when does my window peak — am I a
   buy-now or a build team?"* (Feature 17).
3. **Data-source declaration, up front** — either the proud
   **"Zero new data sources."** (Features 12, 13, 15, 16, 17) or **"One new
   data source, lazy + session-cached (`useHook`)"** (Feature 14), followed by
   exactly what is fetched and cached. This line is load-bearing: it tells the
   next session whether the feature can affect load performance.
4. **Location note** if the route and the component folder disagree
   (blockquote `> **Location:** …` — Features 11, 13).
5. **Model / logic** — where the pure logic lives (`utils/x.js, pure`) and how
   it works, bolded term per paragraph.
6. **UI walkthrough** — sections top-to-bottom, exact component filenames,
   empty/loading/error states spelled out ("never an error, the section simply
   hides").
7. **Integration points** — a "Consumers" or bullet list naming every other
   feature that reads this one, each with the mechanism (`getTrajectoryRead`,
   `analyzeTrade`'s optional param) and "(see Feature N)" back-references.
8. **Storage keys / caching contract** if any.

Write new entries to this template. An entry missing its Purpose line or its
data-source declaration is below standard.

---

## 2. House style — extracted from the document itself

Match these patterns; they are consistent across all ~2,000 lines.

- **Bold the load-bearing term**, not whole sentences: "**Format is columnar**
  to stay mobile-sized", "**Strictly best-effort:**". One bold anchor per
  paragraph lets a skimming session find the contract.
- **Tables for anything enumerable** — endpoints, colors, sections, settings.
  Prose is for mechanism and rationale only.
- **Never/always rules carry their reason in the same breath.** Not "Never
  call raw fetch()" but "All fetches go through `fetchJSON.js` — it adds a
  hard timeout via AbortController so a hung API can never leave the app on a
  permanent spinner." A rule without a WHY gets cargo-culted or deleted;
  either way it dies. When you add a rule, attach the incident or constraint
  that created it.
- **Cross-reference by feature number:** "(see Feature 11)", "(see Feature 12)",
  "same gap as League Overview". Never re-explain a mechanism owned by another
  section — point at it.
- **Em-dash voice.** The doc's signature rhythm is claim — mechanism — 
  consequence in one sentence: "Lazy (first consumer mount) + session-cached —
  past seasons are frozen, so one fetch per session."
- **Status annotations, dated and loud:** "**Status:** Phase 1 complete.",
  "**RESOLVED (UX audit)**", "(Planned — phased, not yet built)" with the
  header updated as phases land. Anything aspirational must be visibly marked
  as such, or a future session will "verify" the app against a plan.
- **The graduation pattern:** when a Future Feature ships, move its bullet to
  "Already built (formerly future features)" with an arrow to its new home:
  "League transaction feed with FAAB bids → League › Activity". Never leave a
  shipped item under "Do Not Build Yet".
- **Negative space is documented.** The doc says what does *not* exist and
  why: "**No saved history.** … that lives in Sleeper", "no
  verb/keyword synonym map yet", "**There is NO bottom tab bar.** … This is a
  deliberate design decision". When you decide not to build something, write
  the decision down where the next session would go looking for the feature.
- **Exceptions are enumerated, never implied:** "those two are the sanctioned
  hand-rolled overlays". If a rule has a carve-out, name every member of it.

---

## 3. The same-commit doctrine

**The rule:** any commit that changes app behavior, structure, routes, data
contracts, storage keys, or process includes the matching CLAUDE.md edit *in
that same commit*, and the commit body mentions the doc update when it isn't
obvious from the diff.

**Why this is absolute here:** there is no team, no wiki, no tribal knowledge —
CLAUDE.md is the entire institutional memory, and every session is instructed
to trust it. A doc updated "in a follow-up" is a doc updated never (the
follow-up session reads the stale doc and doesn't know a follow-up is owed).

**Exhibit A — the rule-16 drift (the one known live contradiction, as of
2026-07-06).** The full story, from git:

1. A prior commit (locally unrecoverable — shallow-clone history gap) had
   removed the `apple-mobile-web-app-status-bar-style` meta in favor of the
   `theme-color` approach, and CLAUDE.md rule 16 was written to say "**No
   `apple-mobile-web-app-status-bar-style` meta**". `cfd9ad0` "Fix PWA
   status-bar color in installed app (light + dark)" then refined that
   theme-color approach — its diff touches ONLY `public/manifest.webmanifest`
   (dropped the static `theme_color`) + `src/hooks/useTheme.js` (verify:
   `git show cfd9ad0 --stat`).
2. `3083f0c` reverted it (the theme-color approach read as a black bar on iOS
   standalone).
3. `78b6c29` "Restore black-translucent status bar (seamless, both themes)" —
   deliberately re-added `<meta name="apple-mobile-web-app-status-bar-style"
   content="black-translucent" />` (index.html line 18, with a long comment
   explaining the mechanism). **CLAUDE.md rule 16 was never updated.**

Result: the doc of record still asserts the opposite of what the code
deliberately ships. Any session that "fixes" index.html to match rule 16
re-introduces the black-bar regression that `78b6c29` fixed. That is what one
missed doc edit costs. (The revert saga itself is `dynastyedge-failure-
archaeology` territory; the doc lesson is this skill's.)

**Do not fix rule 16 yourself.** It needs an owner-approved doc edit (rewrite
rule 16 to describe the black-translucent approach + the light-mode dark
strip, citing `78b6c29`). Until then, flag it in any work that touches PWA
metas. Verify it still stands before citing it:

```bash
sed -n '18p' index.html
grep -n 'apple-mobile-web-app-status-bar-style' CLAUDE.md
```

**Mechanics, as practiced in history** (verify:
`git log --format='%h %s' -- CLAUDE.md | head`):

- Feature/refactor commits carry the doc edit inline: `59627db`, `9fb39df`,
  `77bb3fe`, `f7df308`, `8b6edb4` all touch `CLAUDE.md` + code together.
- Pure doc commits exist for doc-only work and use the `docs:` prefix:
  `700ce00` "docs: reflect UX audit fixes in CLAUDE.md" (catch-up after an
  audit — the exception that proves the rule), `d4f9e75` "docs: add phased
  Navigation Refactor plan to CLAUDE.md" (spec-before-code).
- When the doc edit is part of a code commit, the body lists what was
  documented (see `700ce00`'s bullet-list body as the format model).

---

## 4. Doc-drift audit routine

Run this checklist periodically (after any multi-commit stretch, before a
handoff, or whenever `dynastyedge-change-control` sends you here). Every
command below was run against the repo on **2026-07-06**; findings from that
run are listed after the table. **Report findings; do not unilaterally edit
CLAUDE.md to match code or code to match CLAUDE.md** — route contradictions
through the change-control divergence protocol.

| Drift class | Command | What a clean result looks like |
|---|---|---|
| Rules vs shipped HTML (PWA metas) | `grep -n 'apple-mobile-web-app' index.html; grep -n 'apple-mobile-web-app-status-bar-style' CLAUDE.md` | Doc and index.html agree on which metas ship |
| Constants section vs the real file | `diff <(sed -n '/^## Constants File/,/^## Rules/p' CLAUDE.md) src/constants.js` — or eyeball `cat src/constants.js` against the doc's snippet | Every exported constant appears in the doc's snippet |
| File Structure vs actual tree | `ls src src/components/* src/hooks src/utils` vs the doc's tree; quick check: `for f in $(ls src/utils); do grep -q "$f" CLAUDE.md \|\| echo "undocumented: $f"; done` | No undocumented files; no documented ghosts |
| Storage keys vs code | `grep -rhoE 'dynastyedge_[a-z0-9_]+' src \| sort -u` vs the Rules storage-key list | Every key in code appears in the rule (prefix keys like `dynastyedge_draft_*` cover `dynastyedge_draft_tracker_…`; key inventory canonical: `dynastyedge-data-contracts`) |
| Workflow crons vs stated schedules | `grep -n cron .github/workflows/*.yml` vs the Data Sources pipeline text | news `17,47 * * * *`, values-history `41 9 * * *` (matches doc as of 2026-07-06; pipeline ops canonical: `dynastyedge-run-and-operate`) |
| Feature locations vs routes | `grep -n 'path=\|Navigate' src/App.jsx \| head -50` vs the Navigation route map | Every route in App.jsx appears in the doc's route map or redirect list |
| Future Features vs reality | Read "Future Features"; for each bullet, `grep -rn` a distinctive term in `src/` | Nothing listed as "do not build yet" already exists |

### Open findings from the 2026-07-06 run

1. **CONTRADICTION (known, owner-fix pending):** rule 16 vs
   `index.html:18` — see Exhibit A above.
2. **OMISSION:** `dynastyedge_identity_v1` (set in
   `src/hooks/useIdentity.js:3`) is absent from the Rules storage-key list
   (the doc describes useIdentity as "localStorage store" but never names the
   key). Needs a one-line addition to the storage-key rule.
3. **OMISSION:** the Constants File snippet lags `src/constants.js` — the real
   file also exports `ESPN_BASE`, `ESPN_WEB_BASE`, `NEWS_FEED_URL`,
   `VALUES_HISTORY_URL`, `TRADE_VALUES_URL`, `ROSTER_SLOTS`, plus the
   "identity is now runtime state" comment qualifying `MY_ROSTER_ID`. The
   League Context table still says "always use this when fetching my roster"
   for roster 6, which the constants.js comment now softens.
4. **OMISSION:** `src/utils/recommendations.js` exists but is missing from the
   File Structure tree.
5. **CONTRADICTION (known, owner-fix pending):** CLAUDE.md Feature 13 (and
   the inline comment in `src/utils/pickTrades.js` ~line 14) say pick slot
   tiers are Early 1–3 / Mid 4–7; the code (`slot <= Math.ceil(teams/3)`,
   ceil(10/3)=4) computes Early 1–4 / Mid 5–7 / Late 8–10. Code wins; doc
   fix is owner-gated. Canonical record: `dynastyedge-failure-archaeology`
   §7; worked test: `dynastyedge-validation-and-qa` §6.

Items 2–4 are omissions (doc gaps, low blast radius); items 1 and 5 are the
dangerous ones. When you fix any of them (with owner sign-off for 1 and 5),
remove it from this list in the same session — see §6.

---

## 5. Commit message style guide

Extracted from `git log --format='%h %s'` (history through `6fb85f3`,
verified 2026-07-06). **Caveat:** this clone is **shallow with grafts**
(`cat .git/shallow` → `4f31aad`, `dc0afdc`); diffs *at* those graft commits
render as whole-tree adds — trust the messages, not the diffs, there.

**Subject line:**
- Imperative mood, capitalized, no trailing period: "Restore black-translucent
  status bar", "Wire playoff odds into Trade Analyzer…".
- Prefixes actually in use (use them, don't invent new ones):

| Prefix | When | Verified examples |
|---|---|---|
| *(none — bare imperative)* | Most feature/fix work: `Add`, `Fix`, `Wire`, `Make`, `Restore`, `Surface`, `Keep`, `Prevent` | `119c164` Add Dynasty Trajectory…, `ba75c67` Fix Trade Analyzer add sheet… |
| `docs:` | Doc-only commits | `700ce00`, `d4f9e75` |
| `perf:` | Performance work | `6fb85f3` |
| `UX:` | UX/IA sweeps | `cd6bc08` |
| `Fix:` | Occasional variant of bare Fix | `ff116ba` |
| `Phase N:` / `Phase N (x):` | Steps of a pre-declared phased plan — the N must match the plan section in CLAUDE.md | `59627db` Phase 1.1:…, `77bb3fe` Phase 2 (a):…, `6cf78c1` Phase 3:… |
| `Merge:` | Merge commits restating the branch's subject | `52a56fb`, `68b8c3b` |
| `Revert "…"` | Standard git revert subject | `3083f0c` |

**Body — required when the mechanism is non-obvious.** The model is
`78b6c29`: first a paragraph explaining *why the previous state was wrong and
what mechanism the change relies on* (iOS standalone theme-color behavior),
then bullets listing the concrete edits. Doc commits (`700ce00`) use bullets
naming each documented fact. A one-line `Fix typo`-class change needs no body;
anything a future session might revert without understanding does.

**Feature-number references:** commits adding a documented feature cite it —
`119c164` "…(Feature 17)", `77c868b` "…(Feature 15)".

**Trailers:** Claude-authored commits carry `Co-Authored-By:` +
`Claude-Session:` trailers (see `700ce00`) — your harness appends these; keep
them.

---

## 6. Skill-library maintenance (.claude/skills/)

The library you are reading is itself documentation of record, under the same
doctrine.

**The same-session rule:** when a code change invalidates a fact stated in any
skill, the SAME session that lands the change updates the skill file. Skills
state volatile facts with date stamps precisely so staleness is detectable —
but a date stamp is a smoke alarm, not a fire extinguisher.

**House pattern for every skill** (mirror `dynastyedge-change-control` as the
reference implementation):

1. Directory `.claude/skills/<name>/SKILL.md`; name kebab-case, prefixed
   `dynastyedge-` unless genuinely repo-agnostic (`design-review`,
   `dynasty-fantasy-reference`).
2. Frontmatter: `name:` matching the directory + a **trigger-rich
   `description:`** — it must say *exactly when to load the skill* ("Load
   when…", "Load BEFORE…"), listing concrete task types and file names, not a
   topic summary. The description is the only text the router sees; a vague
   one means the skill never fires.
3. A **"When NOT to use this skill"** routing table pointing to siblings by
   name.
4. Jargon defined once, near the top. Imperative voice. Tables for
   enumerables. Copy-pasteable commands only — every command tested before it
   is written down.
5. **Date-stamp every volatile fact** ("as of 2026-07-06", "history through
   `6fb85f3`").
6. Close with **"Provenance and maintenance"**: when facts were verified and a
   table of one-line re-verification commands per fact class.

**Sibling inventory** (all 16 exist on disk as of 2026-07-07; cross-reference
these by name; verify with `ls .claude/skills/`): design-review ·
dynasty-fantasy-reference · dynastyedge-analysis-toolkit ·
dynastyedge-architecture-contract · dynastyedge-build-and-env ·
dynastyedge-change-control · dynastyedge-data-contracts ·
dynastyedge-debugging-playbook · dynastyedge-diagnostics-and-tooling ·
dynastyedge-docs-and-writing (this file) · dynastyedge-failure-archaeology ·
dynastyedge-model-quality-campaign · dynastyedge-research-frontier ·
dynastyedge-research-methodology · dynastyedge-run-and-operate ·
dynastyedge-validation-and-qa. If you cite a sibling, confirm it exists on
disk first.

**Adding a skill:** check the inventory for overlap first — extend the owning
skill rather than fork a near-duplicate. New skills are commits like any
other: imperative subject (the `8b6edb4` commit updated
`design-review/SKILL.md` alongside the code it governs — the same-commit
doctrine applies to skills too).

---

## Provenance and maintenance

All facts verified against the repo on **2026-07-06** (working tree at
`6fb85f3`; shallow clone, grafts at `4f31aad`, `dc0afdc`). Re-verify before
trusting:

| Fact class | Re-verification command |
|---|---|
| CLAUDE.md section map + size | `grep -n '^## ' CLAUDE.md; wc -c CLAUDE.md` |
| Feature-entry anatomy | `sed -n '/^### Feature 17/,/^-----/p' CLAUDE.md` |
| Rule-16 contradiction still live | `sed -n '18p' index.html; grep -n 'status-bar-style' CLAUDE.md` |
| Storage keys in code vs doc | `grep -rhoE 'dynastyedge_[a-z0-9_]+' src \| sort -u` (2026-07-06: `dynastyedge_identity_v1` undocumented) |
| Constants drift | `cat src/constants.js` vs CLAUDE.md → Constants File |
| File Structure drift | `ls src/utils` (2026-07-06: `recommendations.js` undocumented) |
| Pipeline crons | `grep -n cron .github/workflows/*.yml` |
| Commit conventions + cited hashes | `git log --format='%h %s' \| head -40` · `git show -s --format='%h %s%n%b' 78b6c29 700ce00 d4f9e75 cfd9ad0 3083f0c` |
| Doc-edits-with-code pattern | `git log --format='%h %s' -- CLAUDE.md \| head -15` |
| Shallow-clone grafts | `cat .git/shallow` |
| Sibling skills on disk | `ls .claude/skills/` |
