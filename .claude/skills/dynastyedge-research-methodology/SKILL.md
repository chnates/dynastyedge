---
name: dynastyedge-research-methodology
description: >
  The discipline that turns a hunch into an accepted result in the DynastyEdge
  repo. Load when: forming a hypothesis about app behavior, performance, or
  model quality (trade verdicts, playoff odds, trajectory curves, pick pricing,
  bundle size); designing an experiment or benchmark; evaluating whether a
  claimed improvement is REAL rather than plausible-sounding; deciding whether
  an idea graduates into src/ or gets retired; writing a pre-registration
  note, experiment report, or adversarial review; or asking "how do I prove
  this worked?" / "is this change actually better?". This is the scientific
  method as practiced HERE — evidence bar, idea lifecycle, small-N experiment
  designs, and copy-pasteable templates.
---

# DynastyEdge Research Methodology

**The problem this skill solves:** an AI session can produce a change that
*sounds* like an improvement in one pass — confident prose, tidy diff, green
build. This project's owner does not accept that. A result is accepted only
when it was **predicted before it was measured**, survives an **assigned
attempt to break it**, and is explained by **one mechanism that also covers
the negatives**. This file is the procedure for meeting that bar.

Context you must hold (all as of 2026-07-05):

- DynastyEdge is a static React SPA for one Sleeper dynasty league. The
  analytical core is **pure ESM in `src/utils/`**, runnable under plain Node
  via the loader in `dynastyedge-diagnostics-and-tooling`
  (`node --import ./.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/reg.mjs your-script.mjs`).
- **There is no test suite.** `npm run build` is the only machine gate.
  Everything else that looks like "testing" in this repo is a discipline you
  perform, not a harness that catches you.
- `main` auto-deploys to the owner's phone on every push. A half-finished
  experiment on `main` is a broken app in the owner's pocket.
- Owner's laws: **real-data verification · always-shippable main ·
  CLAUDE.md updated in the same commit · no new dependencies.**
- **This sandbox cannot reach the fantasy APIs** (proxy 403 on
  api.sleeper.app / api.fantasycalc.com). Never claim a live-data run you did
  not actually do; label such steps "requires network — not run here" and
  hand them to the network runbook in `dynastyedge-run-and-operate` /
  `dynastyedge-validation-and-qa`.

## When NOT to use this skill

- **Landing a change (commit/merge/push mechanics, gate classification,
  CLAUDE.md same-commit rule)** → `dynastyedge-change-control`. This skill
  produces the evidence; that one accepts the change.
- **Chasing a reported bug/symptom** → `dynastyedge-debugging-playbook`.
  Debugging is abduction from a symptom; this skill is for testing an idea
  you originated.
- **"Was this tried before?"** → `dynastyedge-failure-archaeology` (read it
  during the grounding check below; write to it when retiring an idea).
- **"Is this architecturally allowed?"** (new dep, new fetch, backend,
  structure) → `dynastyedge-architecture-contract`.
- **How to measure** (Node loader, model harness, bundle report, feed
  checks) → `dynastyedge-diagnostics-and-tooling`. **What counts as which
  class of evidence** → `dynastyedge-validation-and-qa`.
- **The math for making numeric predictions** (error metrics, calibration,
  baselines) → `dynastyedge-analysis-toolkit`. **A worked end-to-end
  instance of this methodology** → `dynastyedge-model-quality-campaign`.
  **Where to find new hypotheses worth testing** →
  `dynastyedge-research-frontier`.
- **Domain reasoning** (is this trade verdict fantasy-sensible?) →
  `dynasty-fantasy-reference`. **Endpoint/feed shapes** →
  `dynastyedge-data-contracts`.

-----

## 1 — The evidence bar (law, with rationale)

Four rules. A claimed improvement that fails any of them is not a result —
it is a hypothesis still in flight.

### Law 1: Predict the numbers BEFORE you run

Write a **pre-registration note** (template §5.1) in your scratchpad before
executing the experiment. It must contain: the hypothesis, the mechanism, the
**predicted values with tolerances**, and — critically — **the outcome that
would disconfirm it, named in advance**.

*Why:* after seeing results, any number can be narrated as success. A
Sonnet-class session is especially good at post-hoc narration; that is
exactly the failure mode. Pre-registration makes the result falsifiable: the
run either lands inside the predicted band or the hypothesis takes damage.
The house example of the standard in action is `ff116ba` (2026-06-15, trade
package protection): the commit message itself records the pre-stated
acceptance check — "Verified against a synthetic Bowers scenario
(keep 0.95 → excluded)" — a named scenario with a named threshold and a
named expected outcome, decided before the code was judged done.

### Law 2: One mechanism must explain ALL observations — including the negatives

If your explanation covers the wins but you need a *second* story for the
cases that didn't improve ("those are probably noise", "that one's a data
issue"), you do not have a mechanism — you have **two half-explanations**,
and two half-explanations are worth less than an honest "unknown". Before
accepting: list every observation from the run, including regressions and
non-movers, and check each against the single proposed mechanism. Anything
the mechanism cannot cover must be either (a) investigated until it fits, or
(b) written into the report as an explicit open anomaly that blocks the
"accepted" verdict.

*Why:* the local history shows unexplained negatives are where wrong models
hide. The PWA status-bar saga (`cfd9ad0` → reverted in `3083f0c` → resolved
in `78b6c29`, all 2026-06-16; canonical record:
`dynastyedge-failure-archaeology` §1) went through a fix that handled the
observed light-mode symptom but was reverted the same day because it didn't
account for the full observation set on the real device — its "manifest
`theme_color` overriding the live meta" diagnosis was wrong for standalone
mode. The accepted fix (`78b6c29`) was the one whose mechanism — iOS
standalone doesn't honor the live theme-color meta, so restore the
`black-translucent` status bar plus a light-mode-only dark strip behind the
status text — explained *every* observed bar color in both themes.

### Law 3: Every accepted result survives an assigned adversarial-refutation pass

Before an experimental result graduates, a **second session actively tries
to break it** — not "review it", *break* it. In this project that is cheap:
spawn a subagent with the assignment prompt in §5.3 (or, when the owner is
driving, ask them to open a fresh session with it). The refuter gets the
claim, the data, and the harness — **not** your reasoning or your draft
report, so it cannot anchor on your narrative. The claim is accepted only if
the refuter fails.

*Why:* this repo has no test suite to catch you, and the same session that
built a result is structurally incapable of hunting its own confounds.
Precedent that fresh adversarial eyes find real defects here: the structured
audits `a3a34dc` (2026-06-20, UX audit — found four shipped-and-broken
interaction flaws) and `6ad6e24` (2026-06-12, integration review — found
sheet-contract violations in shipped Draft views). Both were review passes
over "finished" work; both produced real fixes.

### Law 4: Success is measured, never judged by eye

"Looks better", "feels faster", "seems more accurate" are inadmissible. Every
claim carries a number produced by a rerunnable script — the harnesses in
`dynastyedge-diagnostics-and-tooling` (e.g. `bundle-report.mjs` for size
claims, `run-model.mjs` for model claims) or a scratch script you write
against the pure `src/utils/` modules via the Node loader. The one sanctioned
exception is *visual/gesture behavior on the physical iPhone* (dogfooding, §4),
where the measurement is a structured observation checklist on the real
device — still recorded, still specific, never "seems fine".

*Why:* eyeball verdicts already failed here once in the one domain where
they're tempting — the neon-glow experiment (`e31deaf`, 2026-06-12) shipped
on aesthetic judgment and was reverted the same day (`aa0892b`) when it was
actually looked at on the device. Cheap to run, cheap to revert — but only
because it was recognized and killed fast. Numeric domains never get even
that grace.

-----

## 2 — The idea lifecycle in this repo

```
 hunch (research-frontier, audits, dogfooding, owner request)
   │
   ▼
 GROUNDING CHECK  ── already tried & retired? → read failure-archaeology entry, STOP or re-scope
   │                 architecturally forbidden? → architecture-contract, STOP or ask owner
   ▼
 PRE-REGISTRATION  (scratch note: hypothesis · mechanism · predicted numbers
   │                + tolerances · named disconfirming outcome)          §5.1
   ▼
 OFFLINE EXPERIMENT  (Node harness over pure src/utils — app code UNTOUCHED;
   │                  script lives in scratchpad or a skill's scripts/, never src/)
   ▼
 EXPERIMENT REPORT  (setup · data · prediction · result · verdict · next) §5.2
   │
   ▼
 REAL-DATA VALIDATION  (live Sleeper/FantasyCalc via the network runbook —
   │                    NOT possible from this sandbox; never fake it)
   ▼
 ADVERSARIAL REFUTATION  (assigned second session tries to break it)      §5.3
   │
   ▼
 OWNER SIGN-OFF  (only when scope demands: new deps, structural change,
   │              anything on CLAUDE.md's Future-Features "do not build" list)
   ▼
 GATED LANDING  via dynastyedge-change-control
   │            (CLAUDE.md updated in the SAME commit; main stays shippable)
   ▼
 POST-LANDING OBSERVATION  (live app on the owner's phone; feeds/pipelines
   │                        via check-feeds.mjs the next day if touched)
   │
   ├─► ADOPTED   — docs/skills updated; becomes the new baseline
   └─► RETIRED   — reverted + written entry in failure-archaeology         §5.4
                   (symptom → cause → evidence → status)
```

Notes on specific stages:

- **Grounding check is mandatory and first.** `dynastyedge-failure-archaeology`
  exists precisely so no session re-fights a settled battle (sheet gestures,
  PWA metas, pick pricing at 0, glow effects all have standing rulings).
- **"Feature flag" here = "script outside `src/`".** There is no flag
  infrastructure and no staging environment. The offline experiment stage IS
  the isolation mechanism: your candidate logic runs as a scratch script
  importing the pure utils, and `src/` is only touched once the idea has
  passed refutation. This is what keeps `main` always shippable during
  research.
- **Retirement is a SUCCESS outcome.** A documented dead end is durable
  value — it permanently cheapens every future session's grounding check.
  The house example: neon edge glow, `e31deaf` → `aa0892b`, tried and
  reverted within the same day (2026-06-12), and its "no dark-mode glow on
  cards" ruling now saves every design pass a re-litigation. Never let
  "I don't want to admit it failed" push a marginal result toward adoption;
  write the retirement entry and take the win.
- **Staged landing for multi-step ideas.** Big ideas land as phases, each
  independently shippable, with an explicit status line in CLAUDE.md updated
  as each phase lands. Verified precedent: the Navigation Refactor — plan
  committed first (`d4f9e75`), then `59627db` (Phase 1.1), `9fb39df`
  (Phase 1.2), `77bb3fe` (Phase 2a), `f7df308` (Phase 2b), all with
  same-commit CLAUDE.md updates and the plan's status line advanced each
  time. Copy that pattern for any experiment whose adoption spans commits.

-----

## 3 — Experiment design under 1-user / 10-team constraints

You cannot run an A/B test: there is one user, one league, ten teams, and a
season of ~14 relevant weeks. N is tiny everywhere. These are the substitute
designs that produce defensible evidence anyway:

| Design | What it is here | Use it for |
|---|---|---|
| **Historical replay** | Re-run candidate logic over past seasons via the `previous_league_id` chain (`useLeagueHistory`'s data path — see data-contracts). Every past trade, draft pick, and matchup is a frozen labeled example. | Trade-verdict quality, manager-tendency logic, draft-grade logic, "would this rule have fired correctly last season?" |
| **Deterministic re-simulation** | Fixed-seed reruns of stochastic code. `playoffOdds.js` already uses a fixed-seed mulberry32 RNG precisely so results are reproducible — keep that property in any candidate. Compare old vs new implementation **at the same seed**; any diff is the change, not noise. | Monte Carlo changes, perf work on the simulator (cf. `6fb85f3`), any sampling logic |
| **Before/after on the same frozen dataset** | Snapshot the inputs ONCE (FantasyCalc payload, rosters, values-history JSON) into scratch files; run baseline and candidate against the identical bytes. Never let the two runs fetch independently — live values drift intraday. | Valuation/model changes, pick pricing, trajectory curves, anything reading live APIs |
| **Cross-season / temporal split** | Tune parameters on one season's data, evaluate frozen on another (or tune on weeks 1–7, evaluate 8–14). The evaluation slice is decided in the pre-registration note and is touched exactly once. Fence details: `dynastyedge-model-quality-campaign`. | Any change with tunable constants (shrinkage counts, thresholds, curve bandwidths) |
| **Synthetic scenario battery** | Hand-constructed inputs with known correct answers, stated in the pre-registration. Precedent: `ff116ba`'s "synthetic Bowers scenario". | Rule/threshold logic, edge cases real data doesn't currently exhibit |

Hard rules that fall out of tiny N:

- **Never tune and evaluate on the same slice.** With 10 teams you can fit
  noise perfectly. If you touched a constant while looking at a dataset,
  that dataset is burned for evaluation.
- **One variable per experiment.** With no statistical power to attribute
  effects, the only attribution you get is isolation. Two changes in one run
  = zero conclusions.
- **Report the N.** "Improved on 6 of 9 opponent profiles" is honest;
  "improved 67%" over N=9 is dressing. Small-N results are directional
  evidence that justify the next experiment, not victory laps.

-----

## 4 — Where good ideas historically came from (repeatable practices)

Each verified against `git log`/`git show` on 2026-07-05. Treat these as
*practices to schedule*, not trivia.

1. **Structured self-audits of shipped work.** A fresh pass with a specific
   lens over already-"done" features keeps finding real defects:
   - `a3a34dc` (2026-06-20) — usability audit → sign-in, sub-tab wrapping,
     lineup feedback, opponent-picker fixes, and the shared `SubTabBar`.
   - `6ad6e24` (2026-06-12) — integration review → shared `ErrorState`
     adoption and sheet-contract fixes in Draft views.
   - `8b6edb4` (2026-06-20) — design-system audit → the entire
     `src/components/ui` library **plus the `/design-review` skill in the
     same commit**, codifying the audit so it reruns forever.
   *Practice:* when an audit lens finds ≥2 real issues, codify that lens as
   a skill (as design-review was) so it becomes a standing gate.
2. **Dogfooding on the real device.** The PWA regressions (black status
   bar, `cfd9ad0`→`3083f0c`→`78b6c29`; plus the iOS keyboard/zoom/scroll
   family — `e98260f`, `781599c`, `ba75c67`) were all invisible in desktop
   dev and only surfaced on the owner's installed iPhone app. *Practice:*
   any change touching viewport, sheets, metas, or gestures gets a
   real-device checklist before being called done — simulators and desktop
   Safari are inadmissible for these claims.
3. **Phased plans with status lines in CLAUDE.md.** The Navigation Refactor
   (plan `d4f9e75`; phases `59627db`/`9fb39df`/`77bb3fe`/`f7df308`) shows
   the shape: spec first, small independently-shippable steps, doc status
   advanced each landing. *Practice:* any multi-commit idea gets a written
   phase plan with an explicit "Status:" line before phase 1 lands.
4. **Fix the class, not the instance.** The highest-value fixes here turned
   one bug into a shared contract: `5b8668f` (one sheet's missing
   swipe-dismiss → the extracted `useSheetDrag` hook wired into *every*
   sheet + the CLAUDE.md sheet rule); `e98260f` (one zooming search box →
   app-wide `pointer: coarse` 16px form-control guard); `a3a34dc` (one
   wrapping tab row → the shared `SubTabBar`); `1ef480a` (one pick priced
   at 0 → `makePickPricer` threaded through the whole pick market, plus a
   latent `p.value ?? 0` bug found in the sweep). *Practice:* after any
   fix, ask "where else does this class of bug live?" and sweep before
   closing — the sweep is where the latent bugs are.

-----

## 5 — Templates (copy-paste, fill in, keep in scratchpad)

### 5.1 Pre-registration note

Write BEFORE running anything. File it in your scratchpad as
`prereg-<slug>.md`; quote it verbatim in the experiment report.

```markdown
# PRE-REGISTRATION — <one-line idea>            (date, session)

HYPOTHESIS: <single falsifiable sentence>
MECHANISM:  <the one causal story — why would this work?>

EXPERIMENT: <design from §3 · exact script/harness · exact frozen dataset
             (file paths + how/when snapshotted) · seed if stochastic>
VARIABLE CHANGED: <exactly one>

PREDICTIONS (numbers, before running):
  - <metric 1>: baseline <X> → predicted <Y> ± <tolerance>
  - <metric 2>: <no change expected — must stay within ±Z>   ← guard metric

DISCONFIRMED IF: <named outcome that kills the hypothesis — e.g.
  "metric 1 improves < half the predicted delta, OR guard metric moves > Z">

EVALUATION FENCE: <which data slice is held out; confirm it was not used
  while developing the change>
```

### 5.2 Experiment report

```markdown
# EXPERIMENT REPORT — <slug>                    (date, session)

PRE-REGISTRATION: <quote or link the §5.1 note — unedited>
SETUP: <commands actually run, verbatim, incl. the loader invocation;
        environment notes — e.g. "sandbox, APIs blocked: live-data step
        NOT run, delegated to network runbook">
DATA:  <frozen dataset files + provenance + snapshot timestamp>

RESULTS (all of them — movers, non-movers, regressions):
  | metric | baseline | predicted | measured | in band? |
  |---|---|---|---|---|

NEGATIVES / ANOMALIES: <every observation the mechanism must explain;
  for each: explained-by-mechanism? or OPEN (blocks acceptance)>

VERDICT: SUPPORTED / DISCONFIRMED / INCONCLUSIVE — <one sentence>
NEXT: <graduate to real-data validation + refutation / re-scope / retire
       (if retire → write §5.4 entry into failure-archaeology NOW)>
```

### 5.3 Adversarial-review assignment prompt

Give this to a fresh subagent/session. Do NOT include your report's
reasoning section — only the claim, data, and reproduction command.

```
You are an adversarial reviewer for the DynastyEdge repo
(/home/user/dynastyedge). Your ONLY job is to BREAK the following claim —
you succeed by refuting it, not by confirming it. Do not modify the repo.

CLAIM: <the specific numeric claim, e.g. "the new shrinkage constant cuts
mean absolute seed error from 1.9 to 1.4 on the 2025 season holdout">
REPRODUCE: <exact command(s) + frozen data paths + seed>

Attack in this order, reporting evidence for each:
1. Reproduce the number. Does the stated command on the stated data yield
   the stated result? Any hidden state or unpinned input?
2. Evaluation-set leakage: was the holdout plausibly consulted during
   tuning? (Check the pre-registration date vs script history in the
   scratchpad; check whether constants suspiciously fit the holdout.)
3. Confound hunt: change something that SHOULDN'T matter (seed, row order,
   an irrelevant team) — does the "improvement" survive?
4. Negatives: find cases in the data where the change makes things worse.
   Are they disclosed in the report? Does the claimed mechanism explain them?
5. Degenerate inputs: empty roster, unranked players (value —), missing
   picks, offseason state — does the change violate any contract in
   dynastyedge-data-contracts or dynastyedge-architecture-contract?

FINAL OUTPUT: verdict "BROKEN: <how>" or "SURVIVED: <what you tried and
failed>", with commands and numbers for every attack you ran.
```

### 5.4 Retirement entry (append to `dynastyedge-failure-archaeology`)

```markdown
## <Idea name> — RETIRED <date>  (commits: <tried> → <reverted, if landed>)
- **Symptom / motivation:** <what prompted the idea>
- **What was tried:** <the mechanism + where the experiment script lives/lived>
- **Cause of failure:** <why it didn't work — the actual mechanism learned>
- **Evidence:** <the measured numbers or device observations that killed it;
  link/quote the experiment report>
- **Status / standing ruling:** <what future sessions must NOT re-try, and
  under what changed conditions the idea could be revisited>
```

-----

## 6 — Anti-patterns (each has already cost this project something)

| Anti-pattern | Why it fails here | Local story |
|---|---|---|
| **Eyeball verdicts** ("looks better/faster") | No test suite means your eye is the only gate you skipped | Neon glow `e31deaf` shipped on aesthetic judgment, reverted same day `aa0892b` once actually viewed in dark mode on the device. Cheap only because it was killed fast. |
| **Tuning on the evaluation set** | With N=10 teams you can fit noise perfectly and "prove" anything | Standing fence in `dynastyedge-model-quality-campaign`: tune on season A, evaluate frozen on season B; the holdout is named in the pre-registration and touched once. |
| **Changing two things at once** | Tiny N gives you zero statistical attribution; isolation is the only attribution you get | The Navigation Refactor deliberately split IA restructure (Phases 1–2, `59627db`…`f7df308`) from the visual repaint (Phase 3, still unbuilt) — CLAUDE.md states the reason: "so we don't restructure and restyle at once". |
| **Claiming without explaining the negatives** | Two half-explanations hide a wrong model; the unexplained case is where it bites | First PWA status-bar fix `cfd9ad0` addressed the observed symptom via the (wrong) theme-color-override diagnosis, reverted `3083f0c` same day; accepted fix `78b6c29` — restore `black-translucent` + light-mode-only dark strip, since iOS standalone ignores live theme-color — covered all observations in both themes. |
| **Experiment lingering half-landed on main** | main auto-deploys to the owner's phone — a half-experiment is a broken pocket app; violates always-shippable | House rule from the lifecycle: candidate logic lives in scratch/skill scripts until it passes refutation; multi-step adoptions land as independently-shippable phases with CLAUDE.md status lines (`d4f9e75` pattern). Same-day-revert culture (`aa0892b`, `3083f0c`) exists precisely so nothing lingers. |
| **Claiming live-data runs from this sandbox** | Fantasy APIs are proxy-blocked (403) here; a fabricated "verified against live rosters" poisons the whole evidence chain | Standing sandbox fact (verified 2026-07-05). Write "requires network — not run here" and route through the runbook instead. |
| **Skipping the grounding check** | You will re-fight a settled battle and possibly re-land a reverted change | `dynastyedge-failure-archaeology` carries standing rulings on sheets, PWA metas, pick pricing, and glow effects that exist because sessions DID retry these. |

-----

## Provenance and maintenance

- **Verified 2026-07-05** against the repo at `/home/user/dynastyedge` (HEAD
  `6fb85f3`). Every cited commit was inspected with `git show --stat` and
  full messages: `a3a34dc`, `6ad6e24`, `8b6edb4`, `e31deaf`→`aa0892b`,
  `cfd9ad0`→`3083f0c`→`78b6c29`, `d4f9e75`, `59627db`, `9fb39df`, `77bb3fe`,
  `f7df308`, `5b8668f`, `e98260f`, `1ef480a`, `ff116ba`, `6fb85f3`. Note:
  the local clone is **shallow with grafts at `4f31aad`/`dc0afdc`** —
  commit messages are trustworthy, but diffs AT the graft boundaries are
  not locally inspectable; re-verify boundary diffs on a full clone or via
  the GitHub UI before citing their contents.
- Sibling-skill references: all cited siblings (`dynastyedge-validation-and-qa`,
  `dynastyedge-model-quality-campaign`, `dynastyedge-analysis-toolkit`,
  `dynastyedge-research-frontier`, and the rest) exist on disk as of
  2026-07-07 — verify with `ls .claude/skills/`.
- **Update this skill when:** a test suite or CI gate beyond `npm run build`
  appears (Law 4's "no harness catches you" framing changes); a new
  experiment-design substitute proves out (add it to §3 with its first
  verified use); an audit lens gets codified as a skill (add to §4.1's
  list); or the sandbox's network posture changes.
- Templates in §5 are the canonical versions — if you improve one in
  practice, improve it HERE in the same session, per the CLAUDE.md
  same-commit doc discipline.
