# CODE-REVIEW-1 — where the code took the convenient path (2026-10-07)

**Status:** review only. No code changed. Each finding below waits for the
owner's OK before it becomes its own small PR (one home per rule, plus a test
that fails if a copy comes back — the `marketTrend.js` pattern).

**Scope:** `src/`, `mcp/`, `scripts/`, `.github/workflows/`, against the five
kinds of shortcut in `docs/open-items.md` §2 CODE-REVIEW-1. Every finding cites
the command or the lines that show it. Live probes were run on 2026-10-07
against Sleeper, ESPN and the published `news.json`.

---

## The short version (plain English)

The worry was right. The code mostly does the right thing, but the same rule is
often written down in several places, and in a few of them the copies have
already drifted apart. Where that matters is when two screens answer the same
question differently, or when a failure quietly turns into a fact.

The four that touch decisions you make before the trade deadline:

1. **Injury status is judged three different ways, and a failed lookup reads as
   "healthy".** The Lineup screen, the player card and the Trade Analyzer each
   have their own list of which statuses count as "out". They disagree today on
   real players in this league. Worst case: the Trade Analyzer tells you a
   Doubtful player is *out* and downgrades the verdict, while the Lineup screen
   says he's startable — or, if the lookup fails, it says nothing at all and
   grades the trade as if he were healthy.
2. **"Buyer" and "seller" are defined once on paper, three times in code.** The
   rule says 70% playoff odds = buyer, under 35% = seller, and CLAUDE.md says
   one function owns that. The Trade Partners cards and the Playoffs colours
   type the numbers in themselves. If those numbers are ever retuned (an open
   question, because 6 of 10 teams make the playoffs), those two screens would
   keep the old ones.
3. **Manager Scouting can't tell "never traded" from "we couldn't load it".**
   The MCP server was fixed to keep those apart; the app's own Trade › Managers
   screen still treats a failed download as an empty record. A bad network
   moment can make a manager look like he's never made a trade or never
   drafted.
4. **The Trajectory screen disagrees with itself.** The headline calls a roster
   "declining" at −1%, but the 3-year-change number next to it only turns red
   at −5%. A −3% roster gets a "declining" headline over a grey number.

Everything else is lower risk — mostly copies that agree today and will drift
the next time someone edits one of them — plus a few workarounds whose reason
has expired. The most valuable of those: the data pipelines keep their own copy
of the FantasyCalc reader because "GitHub Actions can't import the app's code".
That stopped being true when the MCP server shipped its import helper; the
pipelines could now use the app's code directly, which removes the copy that
already caused two months of picks archived at 0 (failure-archaeology §3d).

**Suggested order:** 1 → 2 → 4 → 3, then the rest by size. 1, 2 and 4 are
small or medium and land before the deadline; 3 is the largest.

---

## Ranked findings

Size: **S** < 1 hour, **M** a session, **L** more than one session.
Category numbers are the entry's five kinds: 1 duplicated rule · 2 deliberate
copy · 3 swallowed failure · 4 hand-rolled beside a shared piece · 5 stale
workaround.

### 1. Injury status: three classifications, and failure means "healthy" — HIGH · M · cat 1, 3, 4

**What it means for you.** The player card and the Trade Analyzer can
contradict the Lineup screen on whether a player is playing, and the trade
verdict can change (or silently not change) because of it.

**Where.** Three separate lists of which statuses block a player:

| Where | "Out" (blocks / red) | "Questionable" (soft / yellow) | Everything else |
|---|---|---|---|
| `src/utils/projections.js:3-6` — the Optimizer and `lineup_advice` | Out, IR, Suspended, PUP, NFI, NFI-R, SUSP, NA | Questionable, **Doubtful** | healthy |
| `src/hooks/usePlayerNews.js:6-12` — the player card and the Trade Analyzer | out, ir, **doubtful**, pup, sus | questionable | healthy |
| `src/components/roster/RosterActionItems.jsx:139` — the IR action item | Out, PUP | — | — |

What Sleeper actually sends today (`/players/nfl`, tallied live 2026-10-07):
`Questionable 273 · IR 271 · Out 223 · NA 97 · PUP 38 · Sus 5 · DNR 2 · COV 2`.
So, measured:

- **`Sus` (suspended) is not in the Optimizer's list** — it has `Suspended` and
  `SUSP`, neither of which Sleeper sends. A suspended starter would not be
  flagged as a must-fix. (5 players league-wide today, none rostered here.)
- **`NA` blocks in the Optimizer but reads "Active" on the player card.** Live:
  Josh Jacobs (roster 5) is `NA` right now.
- **`DNR` and `COV` are in neither list**, so both treat them as healthy. Live:
  Brandon Aiyuk (roster 5) is `DNR`.
- **Doubtful** is a soft flag in the Optimizer but "red" for the Trade Analyzer,
  where `adjustVerdictForInjuries` (`src/utils/tradeAnalysis.js:1052-1064`)
  calls him "currently out" and downgrades Accept → Counter. (No player is
  Doubtful on a Tuesday; this bites on game weeks.)

**The swallowed failure.** `usePlayerNews.js:33-37`: if the per-player request
fails, the result is `injuryFlag: 'green'` — healthy. The trade verdict then
skips its injury check without saying so. CLAUDE.md's own rule for news is
"silence is a gap in coverage, never good health".

**The hand-rolled half.** That per-player request
(`GET /players/nfl/{id}`, one per player, `usePlayerNews.js:22`) exists only to
get `injury_body_part` / `injury_notes`, because the app's shared player-DB
trim drops them. The MCP server's trim (`mcp/snapshot.js:105-128`) keeps both.
Rule 6 says injuries read the one shared cache.

**Proper fix.** One `classifyInjuryStatus(status)` in `src/utils` (next to
`getAvailability`), used by the Optimizer, the player card, the trade verdict,
the IR action item and the MCP tools; add the two fields to `usePlayerDB`'s
trim and delete `usePlayerNews`'s per-player fetch — which also deletes the
failure path, rather than handling it. Test: every live status value maps, and
a source scan fails if a second status list appears.

**Needs your call:** for *trade* purposes, should Doubtful count as out (today's
Trade Analyzer) or as questionable (today's Optimizer)? And `DNR` / `COV`?

**Risk of fixing:** it can change a trade verdict involving a Doubtful player.
That is the point, but it is a visible change.

### 2. Buyer/seller thresholds typed into two screens — HIGH · S · cat 1, 4

**What it means for you.** Trade Partners' "likely seller / buying win-now"
line and the Playoffs colours use their own copy of 70% / 35%, not the function
that the Analyzer, the Edge and the MCP server use.

```
$ grep -rnE "(>=|<) *(0\.7|0\.35)\b" src mcp
src/components/trade/TradePartnerFinder.jsx:71:  if (p < 0.35) {
src/components/trade/TradePartnerFinder.jsx:80:  if (p >= 0.7) {
src/components/league/PlayoffOdds.jsx:26/27/32/33   (oddsClass, oddsBarClass)
src/utils/playoffOdds.js:229/236                    (getDeadlineVerdict — the one home)
mcp/tools/playoffOdds.js:180   note text hard-codes ">=70%" and "<35%"
```

CLAUDE.md Feature 3 says `getDeadlineVerdict` "is THE one definition of
buyer/seller (shared with Playoffs, Partners, The Edge)". Partners doesn't call
it. Feature 14 already flags recalibrating the thresholds as an open, unmeasured
question; today a recalibration would leave these copies behind.

**Proper fix.** Export `BUYER_PCT` / `SELLER_PCT` from `playoffOdds.js`; Partners
calls `getDeadlineVerdict`; the colours and the MCP note read the constants. A
`marketTrend`-style source scan test. No behaviour change.

### 3. Manager history: "couldn't load" becomes "never traded", and the walk exists twice — HIGH · L · cat 1, 3

**What it means for you.** Trade › Managers' report card and the one-line
behaviour read on Partner cards can describe a manager from incomplete data
without saying so.

**Where.** `src/hooks/useLeagueHistory.js`:
- `:24-31` — every weekly transaction bucket `.catch(() => [])`. If a past
  season's whole log fails, it reads as "nobody traded that season".
- `:44-47` — the drafts LIST `.catch(() => [])`: an outage reads as "never
  drafted".
- `:84-89` — a failed hop in the season chain just `break`s: older seasons
  vanish as if the league were younger.

The MCP server fixed the first two on purpose (CLAUDE.md, "The drafts LIST
error is not swallowed"; "A season whose buckets all fail throws … and is named
in `failedSeasons`") — so the server and the app answer the same question
differently. The third (a broken hop) is silent in **both**
(`mcp/history.js:132-134`), so even the server's `seasonsMissing` can't name the
seasons it never reached.

The walk itself is written twice, which is where the entry's `MAX_SEASONS_BACK`
(8, `useLeagueHistory.js:17` / `mcp/history.js`) and `TX_WEEKS` (18,
`useLeagueHistory.js:18` / `scripts/snapshot-trade-values.mjs:30`;
`useTransactions.js:18` writes it inline) come from.

**Proper fix.** Move the walk into `src/utils` as a pure function that takes the
fetcher (the pattern `mcp/` already uses), returns `seasonsRead` /
`seasonsMissing` / `chainBroken`, and is called by both the hook and
`mcp/history.js`. The app's screens then show "N seasons couldn't be read" the
way `scout_managers` does. Largest item here because the UI needs the new
state.

### 4. Trajectory: headline and numbers use different cut-offs — MEDIUM · S · cat 4

**Where.** The verdict uses `TEAM_DECLINE_CUT = −0.01` / `TEAM_ASCEND_CUT =
+0.05` (`src/utils/dynastyTrajectory.js:73-74`, deliberately asymmetric and
documented). The same screen colours the same 3-year change with an inline
symmetric ±0.05 (`src/components/roster/TrajectoryView.jsx:291, 297`), and
colours each player row with its own inline ±0.05 (`:339`) instead of the
exported `seriesDirection`, which is the same rule.

**Effect.** A roster at −3%: headline "declining", number grey.

**Proper fix.** The view reads the verdict's tone for the two stat cards and
calls `seriesDirection` for rows. No new rule.

### 5. Three definitions of an "even" trade — MEDIUM · S · cat 1 (needs your call)

```
src/utils/fairBand.js:28           FAIR_BAND_PCT = 0.05   — ±5% of what you GET
src/utils/managerAnalysis.js:16    TRADE_EDGE   = 0.05    — net ÷ the LARGER side
src/components/league/LeagueActivity.jsx:82  inline 0.05  — (max−min) ÷ max  (same as TRADE_EDGE)
```

`TRADE_EDGE` and League › Activity are one rule written twice (the
managerAnalysis header even says "same convention as League › Activity").
`fairBand` is a different denominator, so near the edge they disagree: give 105.2
for 100 → the Analyzer calls it an overpay; the scouting ledger later calls the
same trade "even".

**Proper fix.** Give Activity + ledger one home now (S). Whether they should
also *be* the fair band is your call — I'd lean yes (one meaning of "fair" in
the app), but it re-grades some historical W-L-E records slightly.

### 6. The FantasyCalc reader exists three times; the reason for the pipeline copy has expired — MEDIUM · M · cat 1, 2, 5

**Where.**
- Player/pick split by id shape: `src/hooks/useFantasyCalc.js:28-56`,
  `mcp/snapshot.js:69-100` ("Mirrors useFantasyCalc's split EXACTLY"),
  `scripts/fantasyCalcValues.mjs:28-40`.
- Round-median pick pricer: `src/utils/pickCapital.js:56-67` (returns **0** on a
  miss) and `scripts/fantasyCalcValues.mjs:55-67` (returns **null**). Same
  question, two answers.
- The FantasyCalc URL with its four "never change" parameters, hand-typed in
  four pipeline scripts (`snapshot-values.mjs:17`, `snapshot-values-archive.mjs:31`,
  `snapshot-trade-values.mjs:24`, `snapshot-consensus.mjs:33`); `LEAGUE_ID` and
  `SLEEPER_BASE` in `snapshot-trade-values.mjs:22,27`.

**Why the copy was kept** (`scripts/fantasyCalcValues.mjs:9-11`): "these scripts
cannot import [src/utils] (Vite-style extensionless imports don't resolve under
plain Node in Actions)". **That is no longer true:** `mcp/register.mjs` is a
two-line resolver hook the repo already runs in production (`npm run mcp`), and
the pipelines run Node 20, which supports it. A workflow step becomes
`node --import ./mcp/register.mjs scripts/snapshot-values.mjs`, and the scripts
import `src/constants.js` and one shared reader.

**Proper fix.** `src/utils/fantasyCalcPayload.js` (split + pricer + URL builder
from `FANTASYCALC_PARAMS`), imported by the hook, `mcp/snapshot.js` and the
pipelines. Decide null-vs-0 once (null is the honest answer; the app's 0 is
what renders `—`, so the app would map null → 0 at its edge).

**Risk of fixing:** the pipelines write **permanent** archives. Verify by
branch dry-run and by reading the published files after merge, per
change-control.

### 7. Pick round labels written eight times — MEDIUM · S · cat 1

```
$ grep -rnE "'1st', *'2nd'" src mcp scripts
src/utils/pickCapital.js:54        ROUND_SUFFIX  (to 5th) — a LOOKUP KEY into FantasyCalc names
scripts/fantasyCalcValues.mjs:17   ROUND_SUFFIX  (to 5th) — same lookup, pipelines
src/utils/managerAnalysis.js:15    ROUND_LABELS  (to 5th)
src/components/league/LeagueActivity.jsx:13  (to 5th)
src/utils/pickTrades.js:7          (to 4th)
src/utils/tradeAnalysis.js:28      (to 4th)
src/components/trade/TradeBuilder.jsx:12     (to 4th)
src/utils/roundColors.js:41        ROUND_LABELS object (to 4th)
```

Half stop at 4th, half at 5th, so a 5th-round pick reads "R5" on some screens
and "5th" on others. Two of the copies are not labels but the key used to find
a pick's price — if they ever diverge, pricing diverges.

**Proper fix.** One `roundSuffix(round)` + `pickLabel(pick)` in `pickCapital.js`.

### 8. The schedule's bye parser is a "verbatim copy" — MEDIUM · S · cat 2, 4

`src/hooks/useLineupData.js:10-20` and `mcp/weekly.js:85-93`. This is the code
that owns the silent `home`/`away` trap CLAUDE.md warns about three times. Its
sibling `parseLockedTeams` already lives in `src/utils/projections.js` and is
imported by both — so the "must be a copy" reason doesn't hold.

**Proper fix.** Move `parseByeTeams` beside `parseLockedTeams`.

### 9. Two player-DB trims with different fields — LOW-MEDIUM · S · cat 2

`src/hooks/usePlayerDB.js:28-37` keeps `depth_chart_*` and `news_updated`;
`mcp/snapshot.js:105-128` keeps `injury_body_part` / `injury_notes` instead.
Fixing #1 needs the app to gain the injury fields; one `trimPlayerDB` in
`src/utils` used by both ends the drift. (A few hundred KB more in memory for
the MCP server; nothing for the phone.)

### 10. The news matcher written three times in the app — LOW-MEDIUM · M · cat 1

`usePlayerIntel.js:136-147` (`matchFeedItems`), `useLeagueNews.js:42-50`,
`useNewsFeed.js:57-80` each implement playerIds → athleteIds → headline name.
They agree today (I checked: the feed's `athleteIds` and the player DB's
`espn_id` are both numbers, and all three convert). CLAUDE.md lists all three
matchers by name, which documents the copy rather than justifying it. Plus five
name normalisers (`PlayerSearchSheet.jsx:25`, `usePlayerIntel.js:130`,
`resolveAssets.js:31`, `fetch-news.mjs:159`, `snapshot-rookie-intel.mjs:106`) —
two are identical on purpose (feed and client must normalise alike), the
others differ in whether they drop "Jr."/punctuation.

**Proper fix.** One matcher in `src/utils/news.js`; one normaliser shared by
the feed script (via #6's import path) and the client. The MCP matcher stays
different on purpose (no headline fallback — the two DJ Moores).

### 11. FAAB budget: "never assume 100" vs `?? 100` — LOW-MEDIUM · S · cat 1 (needs your call)

`src/utils/leagueState.js:90` — `waiver_budget ?? 100`, which feeds every
"$X remaining". `src/utils/faabBid.js:100-101` — no budget ⇒ no bid. CLAUDE.md
League Context: "read the budget from `league.settings.waiver_budget`, never
assume 100". Sleeper always sends it today, so this is dormant. Proper fix:
no budget ⇒ remaining shows `—`. (`managerAnalysis.js`'s `DEFAULT_FAAB_BUDGET`
for *past* seasons is documented and reasonable — see "kept" below.)

### 12. Storage keys have no single home — LOW · S · cat 1

`dynastyedge_league_tier` is written by `EdgeView.jsx:518` and read by
`LeagueOverview.jsx:29` as two separate string literals; `useIdentity.js:10-11`
repeats three keys owned by other files (the wipe list behind "Switch team");
`main.jsx:7` reads `dynastyedge_theme` outside `useTheme` (rule 19: "All theme
logic lives in useTheme"). A rename in one place silently breaks the other.
Proper fix: `src/storageKeys.js`, imported everywhere.

### 13. The module resolver hook exists twice — LOW · S · cat 2

`mcp/loader.mjs` and `.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/loader.mjs`
are byte-identical apart from comments (`diff` with comments stripped: no
output). `npm test` uses the skills copy. The stated reason — "a runnable server
must not depend on a skills directory" — argues for pointing the *tests* at a
neutral copy, not keeping two. Proper fix: one hook at the repo root
(e.g. `tools/register.mjs`), used by `npm test`, `npm run mcp` and (#6) the
pipelines.

### 14. ESPN per-player news: documented as dead, half of it works — LOW · S · cat 5

CLAUDE.md: "CORS-blocked in practice". Probed live:
`site.api.espn.com/apis/fantasy/v2/games/ffl/news/players?playerId=…` → **200**,
3 items, `access-control-allow-origin: *`. The fallback
`site.web.api.espn.com/…/athletes/{id}/news` → **404**. So the doc is wrong
about the working one and the fallback is dead code
(`usePlayerIntel.js:176-191`). Proper fix: drop the 404 fallback, correct the
doc. (curl is not a browser; the header is what a browser checks, but confirm
on the phone before relying on it.)

### 15. Year-stamped seeds that now need hand-rolling — LOW · S · cat 5

`src/constants.js:57` `PICK_YEARS = ['2026','2027','2028']` — the live window is
2027–2029, so before `/state/nfl` resolves the app briefly renders a spent
season; `useSleeperDraft.js:11` `FALLBACK_DRAFT_SEASON = PICK_YEARS[0]` inherits
it. The window logic was built to design out the annual chore; the seed brought
a small one back. Also `TrajectoryView.jsx:400` prose "a 2027 first" and
`DraftBoard.jsx:561`'s 2026 CSV filename (already scheduled in §0). Proper fix:
derive the seed from the current date (season = year, minus one before
September) so it never goes stale.

### 16. Smaller copies, recorded so they aren't rediscovered — LOW · S

- `MAX_DAYS` 90: `mcp/tools/valueHistory.js` vs `scripts/snapshot-values.mjs` —
  the tool should read the file's real length, not a second 90.
- `['QB','RB','WR','TE']` re-declared in 6 files beside `constants.POSITIONS`
  (`projections.js:1`, `dynastyTrajectory.js:24`, `TrajectoryView.jsx:25`,
  `findTradeTargets.js:51`, `researchRookies.js:52`, plus dev scripts).
- `['Contending','Middle','Rebuilding']` in `EdgeView.jsx:72` and
  `LeagueOverview.jsx:24` beside `tierColors.js`.
- `scripts/snapshot-trade-values.mjs:110` — transaction buckets `.catch(() => [])`
  with no log. The 8-day look-back covers a bad day, but a week-long outage would
  lose trades from a permanent archive with nothing saying so. Fix: log failed
  buckets; fail the step if all 18 fail.
- `mcp/loader.mjs:15-16` says the hook is "NOT the long-term answer … bundling,
  which is phase 2". Phase 2 shipped (`api/mcp.js`); the comment is stale.
- `scripts/dev/*` repeat `LEAGUE_ID`, the owner id and the FantasyCalc URL.
  Analysis-only, but `news-coverage.mjs` copies `MY_ROSTER_ID` (entry's own
  example) — after #6 they can import `src/constants.js` too.

---

## Re-judged and kept (with the reason that still holds)

| What | Where | Why it stays |
|---|---|---|
| `MY_ROSTER_ID` as the MCP default | `mcp/config.js:48` | MCP non-negotiable 3: a *parameter* default, env-first. Not runtime identity |
| Trade-values archives an unranked **player** as 0 | `snapshot-trade-values.mjs:125-131` | Documented: rule 7 counts an unranked player as 0 in totals; picks are the null case |
| Past seasons with no `waiver_budget` count as $100 | `managerAnalysis.js:61` | History only, and the one value those seasons actually had |
| Class B `.catch(() => [] / null)` on news, intel, sparklines, rookie intel, `useSleeper` drafts, the Optimizer's schedule and prior-week stats | `usePlayerIntel.js`, `useSleeper.js:30`, `useLineupData.js:65-68`, `mcp/server.js` news | Documented best-effort contracts (architecture §5) |
| Per-week bucket catches in `useTransactions` / `matchupWeeks` | — | They reject when **every** bucket fails, which is the contract |
| Free Agents' DEF "bye = absent from projections" | `FreeAgentsView.jsx:242-246` | Deliberate: avoids a schedule fetch; measured (32 projected, bye teams absent) |
| The MCP news matcher has no headline fallback | `mcp/news.js` | Different on purpose — the two DJ Moores |
| Crown geometry in the logo component and the icon script | `DynastyEdgeLogo.jsx:17` / `generate-icons.mjs` | The script needs `sharp` and SVG strings; small, rarely changes, cross-referenced |
| Two raw `fetch()` calls in `DraftBoard.jsx:541,561` | — | Sanctioned same-origin static assets |

## How this was measured

- Constants defined in more than one file: a grep of every top-level
  `const UPPER_CASE =` across `src/ mcp/ scripts/`, grouped by name (the
  `ROUND_SUFFIX`, `POSITIONS`, `TIERS`, `LEAGUE_ID`, `MAX_SEASONS_BACK`,
  `TX_WEEKS`, `MAX_DAYS` hits above came from it), then by value
  (`0.05`, `0.7`/`0.35`, `?? 100`, `'1st', '2nd'`).
- Swallowed failures: `catch {}`, `.catch(() => [] | null | {} )` — 38 hits
  outside `scripts/dev`, each read and sorted into documented-best-effort
  (kept) or not (findings 1, 3, 16).
- Deliberate copies: comments containing "mirror", "copy", "verbatim",
  "cannot import", "extensionless".
- Live: Sleeper `/players/nfl` status tally and this league's rosters; the two
  ESPN endpoints with an `Origin` header; the published `news.json` id types.

Gates on this branch (docs only): `npm ci`, `npm run lint` exit 0, `npm test`
**841 / 841**, `npm run build` ✓ — test count unchanged.
