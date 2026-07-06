---
name: dynasty-fantasy-reference
description: >
  Fantasy-football domain theory for DynastyEdge. Load whenever a task involves
  fantasy-football domain reasoning: trade logic or verdicts, player/pick
  valuations, draft picks or pick capital, rosters/lineups/taxi/IR, waivers or
  FAAB, playoff odds, rookie or startup drafts, win windows, buy-low/sell-high —
  or whenever domain terms appear that you cannot ground (Superflex, PPR, FLEX,
  ADP, contender, rebuilder, handcuff, stash, tanking, dynasty vs redraft).
  Explains what these concepts mean AS IMPLEMENTED IN THIS APP, with file
  pointers and this league's exact settings.
---

# Dynasty Fantasy Football — Domain Reference for DynastyEdge

You are working on an app whose entire logic layer encodes fantasy-football
reasoning. You know React; this file teaches you the domain — **as this app
implements it**, not as a generic textbook. Every league-specific claim below
is verified against `CLAUDE.md` and `src/` (as of 2026-07-05). Claims marked
**[convention]** are general fantasy-community knowledge from training, safe to
rely on for intent/comments but not encoded verbatim in this repo.

## When NOT to use this skill

- **App data plumbing** (Sleeper/FantasyCalc endpoints, caching contracts,
  hooks, ID joins, news/values pipelines) → `dynastyedge-data-contracts`.
- **Model math internals** (Monte Carlo mechanics, age-curve kernel math,
  scoring-model shrinkage, algorithm tuning) → `dynastyedge-analysis-toolkit`.
- Build/deploy, debugging process, change management → the respective
  `dynastyedge-*` siblings.

This skill is for *understanding what the domain concepts mean* so you can
read, modify, and sanity-check the app's logic without misinterpreting it.

---

## 1. Fantasy football in 10 sentences

1. A fantasy league is a group of people (here: 10) who each manage a virtual
   "team" made of real NFL players.
2. Each week of the NFL season, your players' real-game statistics (yards,
   touchdowns, receptions) convert into fantasy points via the league's
   scoring rules.
3. Each week you face one other league member head-to-head: whoever's
   **starting lineup** scores more points wins that week.
4. Your roster is bigger than your lineup — you choose which players to
   **start** in fixed positional slots and which to leave on the **bench**
   (bench points don't count).
5. Slots restrict position: a QB slot takes only quarterbacks, a FLEX slot
   takes any of RB/WR/TE, etc. (this league's exact slots: `ROSTER_SLOTS` in
   `src/constants.js`).
6. Players get injured, have "bye" weeks (their NFL team doesn't play), and
   break out or bust — so managers constantly adjust lineups, add **free
   agents**, and **trade** with each other.
7. Wins accumulate into standings; the top teams (here: read from Sleeper's
   `playoff_teams` setting) reach an end-of-season playoff bracket to crown a
   champion.
8. In a **redraft** league, rosters reset every year; in a **dynasty** league
   (this one), you keep your roster year over year — so players are long-term
   assets with multi-year value, like a real GM's franchise.
9. Dynasty leagues therefore trade **future rookie draft picks** as assets,
   and each offseason holds a **rookie draft** where incoming NFL rookies are
   picked.
10. The core dynasty tension: win **now** (acquire proven veterans, spend
    picks) versus win **later** (accumulate picks and young players) — almost
    every analysis in this app is a lens on that tradeoff.

## 2. Glossary — every term the codebase uses

| Term | Meaning | This app / league specifics |
|---|---|---|
| **Dynasty** | Rosters carry over between seasons; players are multi-year assets. | The whole premise. Values come from FantasyCalc's *dynasty* market (`isDynasty: true` in `FANTASYCALC_PARAMS`). |
| **Redraft** | The opposite: fresh draft every season, only this-year production matters. | Not this league; term appears only as contrast. |
| **Superflex (SFLX)** | An extra flex slot that also accepts QB — effectively a 2nd starting QB. Creates a QB scarcity premium (see §3). | This league IS Superflex: `numQbs: 2` in constants; `SFLX` slot in `ROSTER_SLOTS`. |
| **PPR / Half PPR** | Points Per Reception: catching a pass scores bonus points (full = 1.0, half = 0.5). Raises pass-catcher value. | This league: **0.5/reception** (`ppr: 0.5`). Never change FantasyCalc params. |
| **FLEX** | A lineup slot accepting multiple positions (here RB/WR/TE). | **3 FLEX slots** here — unusually many; see §3. |
| **Bench** | Rostered players not starting this week; score nothing. | 12 bench spots (CLAUDE.md roster slots). |
| **Taxi squad** | A stash zone for developmental players; they can't be started but don't occupy bench spots. | 5 taxi spots. THIS league (CLAUDE.md taxi rules): only **rookies** can be *added*, but a player may **stay 2 years** (rookie + 2nd-year season). Players entering year 3 (`years_exp >= 2`) must be activated by the regular-season start — taxi action items flag `years_exp >= 2`, never 2nd-year players. |
| **IR** | Injured Reserve slots — park injured players without using bench space. | 2 IR slots. IR players are excluded from positional-strength math (`!p.isIR` in `rosterAnalysis.js`). |
| **FAAB** | Free Agent Acquisition Budget — a season-long blind-bid dollar budget for claiming free agents (highest bid wins). | Always displayed `$XXX` (e.g. `$142`). Winning bids surface from `settings.waiver_bid` on transactions. |
| **Waivers** | The claim process for recently dropped/unrostered players (bid via FAAB, resolves on a schedule). | League › Activity shows claims + bids. |
| **Free agent (FA)** | An unrostered player anyone may add. | League › Free Agents view; lineup optimizer's FA drawer. |
| **Rookie draft** | Annual offseason draft of incoming NFL rookies, in dynasty leagues typically 3–5 rounds. | 4 rounds here (`ROUNDS = 4` in `pickCapital.js`). Draft section syncs the real Sleeper draft. |
| **Startup draft** | The one-time draft when a dynasty league forms (all players, many rounds). | Manager draft grades exclude drafts > 6 rounds as startups (`managerAnalysis`, per CLAUDE.md). |
| **Pick trading** | Future rookie-draft picks are tradeable assets. | Ownership derived *only* from Sleeper `traded_picks` (`pickCapital.js`); never assumed. |
| **ADP** | Average Draft Position — market consensus of where a player gets drafted. | THIS app derives rookie ADP locally: rookie class ranked 1..N by FantasyCalc overall rank (`rookieAdp.js`). FantasyCalc has no rookie ADP field; its `rookiesOnly` endpoint is broken — never use it. |
| **Win window** | The span of seasons a roster is built to contend in. | Tiers Contending / Middle / Rebuilding computed in `rosterAnalysis.js` (§5). |
| **Contender / Rebuilder** | A team trying to win now / a team trading present value for future value. | Top-3 / bottom-3 by the tier score (§5). |
| **Buy low / Sell high** | Acquire a player while their market value is depressed / trade one away at a peak. | Market Movers: buy-low = trend < −50 at my deficit positions; sell-high = my players with trend > +50 at surplus positions. |
| **Boom/bust** | High-variance player: big weeks and dud weeks. **[convention]** — no explicit boom/bust metric in this codebase. | Variance shows up only implicitly (playoff-odds scoring std). |
| **Handcuff** | The direct backup to a star RB, rostered as injury insurance. **[convention]** — no handcuff logic in the app. | |
| **Stash** | A low-value player held for future upside (bench/taxi). | "Deep stashes" are the canonical unranked players shown with value `—` (CLAUDE.md rule 7). |
| **Tanking** | Deliberately losing to improve draft position / sell veterans. **[convention]** as a strategy; the app's "Seller" stance (§6) is its analytic cousin. | |
| **Bye week** | A week an NFL team doesn't play — its players score 0. | Lineup optimizer hard-blocks byes (🔴). |
| **Trade deadline** | Last week trades are allowed. | Week 13 here (from league settings); Trade section banner. |

## 3. Why Superflex changes everything

**The single most important valuation fact in this app: elite QBs are the most
valuable dynasty asset class here.**

- In a standard league you start 1 QB; with 32 NFL starters and 10 teams,
  startable QBs are abundant → cheap. In **Superflex** every team wants to
  start **2 QBs** (the SFLX slot), so 10 teams chase ~20 startable QBs out of
  32 — QB becomes scarce, and scarcity is value. FantasyCalc's `numQbs: 2`
  parameter bakes this into every player value the app displays.
- This holds **despite 4-pt passing TDs** (vs 6 for rushing/receiving TDs)
  here — the scarcity premium dominates the mild scoring discount. CLAUDE.md
  states this explicitly in League Context; treat it as league fact.
- **Roster math of 10-team / 3-FLEX:** starters are QB, 2 RB, 2 WR, TE,
  3 FLEX (RB/WR/TE), SFLX, DEF (`ROSTER_SLOTS`). With 3 FLEX slots, starting
  5–6 combined RB/WR is routine — so **RB and WR depth is disproportionately
  valuable** relative to a standard league. A "bench" RB3/WR4 here is often a
  weekly starter.
- Practical implications you'll see encoded: `POSITION_DEPTH = { QB: 3, RB: 5,
  WR: 5, TE: 3 }` in `rosterAnalysis.js` (positional strength sums a team's
  top 3 QBs and top 5 RBs/WRs — depth counts); trade verdicts warn about
  "selling QB depth you genuinely need in Superflex" (CLAUDE.md Feature 3).
- **No kicker in this league** — never add K handling. DEF (team defense) is
  a starting slot but is typically unranked by FantasyCalc (shows `—`,
  contributes 0 to roster value).

## 4. The value economy

Everything is priced in **FantasyCalc dynasty value**: a crowd-sourced market
number on a **0–10000 scale** (derived from real trades in leagues with this
format — Superflex, 0.5 PPR, 10 teams). Display as whole numbers, never
decimals. Unranked players show `—` and contribute 0.

### Fair-trade bands (verified in `src/utils/tradeAnalysis.js`)

- **±5% = even.** `valuePct <= 5 ? 'even'` — inside 5% of the larger side's
  total, raw value is a wash. The same ±5% defines win/loss/even in the
  manager-scouting trade ledger (CLAUDE.md Feature 11) and the counter
  suggestion's target ("within ~5%").
- **> 15% loss = hard Decline** regardless of fit (`valueWinner === 'them' &&
  valuePct > 15`).
- **5–15% overpay can still be Accept** if it fills a deficit position
  (`fitScore > 0`) — raw value is layer 1 of 3, not the whole verdict.
- `suggestFairPackage` targets **90%–115%** of the target's value
  (`FLOOR = 0.9×`, `CAP = 1.15×`) — a lowball gets rejected, a big overpay
  guts the roster.
- % diff convention: `valuePct = |get − give| / max(give, get) × 100`,
  rounded — the denominator is the **larger** side.

### 30-day trend semantics (app-wide)

`trend30Day` from FantasyCalc: **> +50 → ↑ green (rising) · < −50 → ↓ red
(falling) · between → → grey (flat)**. These ±50 thresholds also gate Market
Movers' buy-low/sell-high lists. Movers show both absolute and % change (vs
the value 30 days ago).

### Picks as market assets

- FantasyCalc lists picks *as players* named like `"2026 Mid 1st"` — they live
  in the same 0–10000 economy.
- **Early / Mid / Late = draft-slot thirds.** In this 10-team league
  (verified `slotTier` in `src/utils/pickTrades.js`): Early = slots 1–3,
  Mid = 4–7, Late = 8–10 (via `ceil(teams/3)` / `ceil(2*teams/3)`). When
  Sleeper's draft order is known, a pick prices at its exact tier entry
  (`findSlotPickValue`); otherwise it falls back to the round median.
- **Round median = `findPickValue`** (in `src/utils/pickCapital.js`, not
  pickTrades): take every FantasyCalc entry whose name contains the season +
  round suffix ("1st"…"4th"), sort by value, return the middle one. This is
  the app-wide default pick price (League Activity, pick capital, ledger ≈
  values).
- **Pick capital score** (`computePickCapitalScore`): year-weighted sum —
  2026 picks ×3, 2027 ×2, 2028 ×1 (near picks are worth more because they
  convert to players sooner **[convention]**, encoded as these weights).
- Move-up packages (`suggestPickPackages`): 1–3 picks each strictly worth
  *less* than the target (equal = swap, not a move), totaling 80–145% of it;
  undershoot penalized 1.6× vs overshoot — sellers reject light offers,
  buyers may pay a premium.
- Between the NFL draft and the league's rookie draft, generic pick entries
  vanish from FantasyCalc (rookies get named) — `makePickPricer` then prices
  current-season picks via the rookie projected at that slot (derived ADP) or
  the round-median rookie. Never let a live pick read 0 just because its
  generic entry retired.

## 5. Age curves and win windows

### Peak windows — THIS app's definition (`src/utils/peakWindows.js`)

| Position | Peak window (age) |
|---|---|
| QB | **26–33** |
| RB | **23–26** |
| WR | **24–28** |
| TE | **25–29** |

`getPeakStatus(position, age)` → `ascending` (below window) / `peak` (inside)
/ `declining` (above). **Why RBs age fastest:** the position absorbs the most
physical contact per touch (workload), so production and market value collapse
earliest — usually by the late 20s. QBs take little contact and hold value
deep into their 30s. **[convention, and the stated rationale in
peakWindows.js's own comment.]** Consequence: a 27-year-old RB and a
27-year-old QB are opposite assets — one is declining, the other hasn't
peaked.

### The contend/rebuild lifecycle **[convention]**

Dynasty rosters cycle: accumulate young players + picks (rebuild) → talent
matures into a contending core (window opens) → the core ages (window closes)
→ sell veterans for picks and restart. Good GMs time trades to this cycle:
buy declining teams' veterans cheap when contending; sell your own veterans
*before* the cliff when rebuilding. The app's Trajectory feature
(`dynastyTrajectory.js`) models exactly this: per-year value projections
clamped to 0.55×–1.18× per year, picks maturing into rookie-aged (22) assets
in their draft year, and `getTrajectoryRead` classifying a team as
`declining` ("selling vets") / `ascending` ("building") / `stable`.

### Win-window tiers — THIS app's formula (verified `assignWinWindowTiers` in `src/utils/rosterAnalysis.js`)

```
score = 0.5 × norm(totalValue) + 0.3 × norm(pickCapitalScore) + 0.2 × norm(1 / avgStarterAge)
```

Each component min-max normalized across the 10 rosters (all-equal → 0.5;
missing age → league median). Rank by score: **top 3 = Contending, bottom 3 =
Rebuilding, middle 4 = Middle** — fixed counts, always 3/4/3. Recomputed
whenever roster data refreshes; never cached across data changes. Youth is
`1/age`, so *younger* starters raise the score — a young, valuable,
pick-rich team scores highest.

Related, same file: `getPickCapStatus` ranks pick capital — top 3 = Rich,
bottom 3 (rank ≥ 7) = Depleted, else Neutral.

## 6. Dynasty strategy doctrine

All **[convention]**, but each is the reasoning behind specific verdict logic
in this repo — cited so you can tell doctrine from code:

- **Contenders buy proven now-value and sell picks.** A pick can't score
  points this season. Encoded: `analyzeTrade` (tradeAnalysis.js) penalizes a
  Contending team acquiring *only* picks, and penalizes it giving away proven
  vets (`value > 5000 && age <= 30`).
- **Rebuilders accumulate picks and youth, shed aging veterans.** A veteran's
  value decays before a rebuilder's window opens. Encoded: Rebuilding teams
  are penalized for acquiring expensive vets (`value > 6000 && age >= 28`)
  and rewarded for youth (`age < 25`) or picks.
- **A rebuilding trade partner asks for picks, not players** — your veterans
  don't help them; picks fit their timeline. Encoded verbatim as the mismatch
  warning in `rankTradePartners`: *"They're rebuilding — expect them to ask
  for picks, not players."*
- **The deadline dynamic:** as playoff hopes die, long-shot teams become
  sellers (their veterans are worth more to contenders than to them), and
  near-locks become buyers. Encoded: `getDeadlineVerdict` in
  `playoffOdds.js` — playoff odds **≥ 70% → Buyer**, **35–70% → On the
  bubble**, **< 35% → Seller** (Partner Finder flags use the same cutoffs).
  Trade deadline here is Week 13, so weeks 10–13 are the buy/sell crunch.
- **An underperforming owner is a buy window** — a talented roster with a bad
  record breeds frustration and motivated selling. Encoded: League Overview's
  Underperforming badge (value rank vs record rank gap ≥ 4) and The Edge's
  briefing item.
- **Rookie fever:** each spring (post-NFL-draft through the rookie draft),
  the community systematically overvalues rookie picks and fresh rookies on
  hope; shrewd GMs sell picks into that hype and buy proven players cheap.
  **[pure convention — not encoded anywhere in this repo; do not invent
  logic for it.]**

## 7. This league's facts (as of 2026-07-05)

Source of record: `CLAUDE.md` League Context + `src/constants.js`.

| Setting | Value |
|---|---|
| Platform / League ID | Sleeper · `1313933520715907072` (`LEAGUE_ID`) |
| Teams / format | 10-team **Dynasty**, **Superflex**, **Half PPR (0.5/rec)** |
| TD scoring | Passing TD **4 pts** · rushing/receiving TD **6 pts** |
| Starting slots | QB · RB · RB · WR · WR · TE · FLEX ×3 (RB/WR/TE) · SFLX (QB/RB/WR/TE) · DEF — exact order in `ROSTER_SLOTS`, `src/constants.js` (indices match Sleeper's `starters` array) |
| Reserves | 12 bench · 5 taxi · 2 IR |
| Kicker | **None** — never handle K |
| Taxi rules | Add rookies only; 2-year stay; `years_exp >= 2` must activate by regular-season start |
| Trade deadline | **Week 13** (from league settings via API) |
| Trade review | None — trades execute immediately |
| Playoff teams | **From the Sleeper API**: `leagueInfo.settings.playoff_teams` (code fallback `?? 6`), playoffs start at `settings.playoff_week_start` (fallback `?? 15`) — `src/hooks/usePlayoffOdds.js:83-84`. Not statically determinable; never hardcode a count. |
| Rookie draft | 4 rounds (`ROUNDS = 4`, `pickCapital.js`); pick years tracked: 2026/2027/2028 (`PICK_YEARS`) |
| The user | Team **Nix Cage**, username `chnates`, roster ID **6**, owner ID `965787707299430400` — but identity is now **runtime state** via `useIdentity`/LeagueContext (`myRosterId`); the constants are original-owner reference only (see comment in `src/constants.js`) |

**Roster/owner semantics:** Sleeper identifies teams by numeric `roster_id`
(1–10, stable within a season) and humans by `owner_id` (stable **across**
seasons — manager scouting keys on it). Rosters return numeric player IDs
only; names resolve by joining on FantasyCalc's `sleeperId` (normalized to
strings). Win/loss/points live in `roster.settings`.

## 8. Domain concept → code map

| Concept | Implementation | File |
|---|---|---|
| Win-window tiers (Contending/Middle/Rebuilding) | `assignWinWindowTiers` — 0.5/0.3/0.2 weighted score, top-3/bottom-3 | `src/utils/rosterAnalysis.js` |
| Positional strength / surplus / deficit | `getPositionalStrength` (top 3 QB/TE, top 5 RB/WR, non-IR) + `getPositionalDeltas` vs league avg | `src/utils/rosterAnalysis.js` |
| Trade partner ranking / mismatch warnings | `rankTradePartners` (matchScore = surplus×deficit cross terms) | `src/utils/rosterAnalysis.js` |
| Peak age windows | `PEAK_WINDOWS`, `getPeakStatus` | `src/utils/peakWindows.js` |
| Fair trade / verdicts / ±5% band / counter | `analyzeTrade`, `getTradeVerdict`, `getCounterSuggestion`, `suggestFairPackage` | `src/utils/tradeAnalysis.js` |
| Pick ownership (who owns which pick) | `resolvePickOwnership` — from `traded_picks` only | `src/utils/pickCapital.js` |
| Pick price (round median) / pick capital score | `findPickValue` (median), `computePickCapitalScore` (3/2/1 year weights) | `src/utils/pickCapital.js` |
| Pick slot tiers (Early 1–3 / Mid 4–7 / Late 8–10) + move-up/down packages | `slotTier`, `findSlotPickValue`, `makePickPricer`, `suggestPickPackages` | `src/utils/pickTrades.js` |
| Rookie ADP (derived, not fetched) | `assignRookieAdp`, `buildRookieProspects` | `src/utils/rookieAdp.js` |
| Playoff odds + Buyer/Seller deadline stance | Monte Carlo sim; `getDeadlineVerdict` (70%/35% cutoffs) | `src/utils/playoffOdds.js` (+ `src/hooks/usePlayoffOdds.js`) |
| Multi-year value projection / age curves / pick maturation | `buildAgeCurves`, `buildRosterTrajectory`, `getTrajectoryRead` (0.55–1.18 yearly clamps) | `src/utils/dynastyTrajectory.js` |
| Lineup optimization & matchup quality | slot filling, defense-vs-position ranks | `src/utils/projections.js` |
| Optimal-lineup hindsight (bench points left) | `src/utils/lineupHistory.js` |
| Manager behavior (ledgers, tendencies, draft grades) | `src/utils/managerAnalysis.js` |
| Daily briefing signals (buy-low, sell-high, closing windows) | `src/utils/edgeBriefing.js` |

---

## Provenance and maintenance

Written 2026-07-05 against the working tree at that date. All league/app facts
verified by reading `CLAUDE.md` and the files in §8. Live APIs were **not**
consulted (blocked in this sandbox) — anything runtime-only (e.g. actual
`playoff_teams` value) is stated as API-sourced, not asserted.

Re-verify before trusting volatile numbers:

```bash
# League parameters & roster slots
grep -n "ROSTER_SLOTS\|PICK_YEARS\|FANTASYCALC_PARAMS\|MY_ROSTER_ID" src/constants.js
grep -n "Half PPR\|Superflex\|taxi\|Week 13\|no kicker\|No kicker" CLAUDE.md | head -20

# Peak windows
grep -n "QB:\|RB:\|WR:\|TE:" src/utils/peakWindows.js

# Tier formula weights and 3/4/3 split
grep -n "0.5\|0.3\|0.2\|rank < 3\|length - 3" src/utils/rosterAnalysis.js

# Fair-trade thresholds (±5%, 15% hard decline, 0.9/1.15 package band)
grep -n "valuePct <= 5\|valuePct > 15\|targetValue \* 0.9\|targetValue \* 1.15" src/utils/tradeAnalysis.js

# Pick tiers, package band, undershoot penalty
grep -n "slotTier\|0.8\|1.45\|1.6" src/utils/pickTrades.js

# Round-median pick pricing + year weights
grep -n "PICK_YEAR_WEIGHTS\|Math.floor(matches.length / 2)" src/utils/pickCapital.js

# Buyer/Seller cutoffs + playoff_teams source
grep -n "0.7\|0.35" src/utils/playoffOdds.js
grep -n "playoff_teams\|playoff_week_start" src/hooks/usePlayoffOdds.js

# Trend-arrow thresholds (±50)
grep -rn "trend30Day > 50\|trend30Day < -50\|> 50\b" src/components/shared/TrendArrow.jsx
```

If any grep disagrees with this file, **the code wins** — update this skill.
