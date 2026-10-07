# History — Features

> **Verbatim text of this CLAUDE.md section as it stood at `8c25d03` (2026-10-07), before CLEANUP-2 slimmed it.**
> Nothing here was edited. The live rules, contracts and traps are in CLAUDE.md; this file keeps the
> measurements, dated rulings and narratives that explain them. When the two disagree, CLAUDE.md is current.

## Features

-----

### Feature 1 — Roster + Picks Viewer

**Purpose:** View any team’s full roster with dynasty values and all pick capital
across future seasons.

#### Your team view (Nix Cage — default on load)

- Roster grouped by position: QB · RB · WR · TE · Bench · Taxi · IR
- Each player shows: name, NFL team, dynasty value, overall rank, position rank,
  30-day trend arrow
- Draft picks section below roster: all picks owned, grouped by year (2026 / 2027 / 2028),
  color-coded by round (see color system below)
- Each pick shows original owner if different from current owner
- Total roster value score at top (sum of all player values + pick values)
- **Action Items** (`RosterActionItems`, shared with The Edge — see Feature 12),
  under an **"Action Items"** neutral band — deliberately *not* "On your desk",
  which The Edge's generated GM line already uses for a different count
  (briefing items), and two counts under one phrase on one screen read as a bug: generated roster alerts, each a
  **`Lede`** — eyebrow, a headline with the finding in a `Mark`, the sentence,
  and a real CTA. Four types, all derived from live data:
  1. **Taxi deadline** — any taxi player with `years_exp >= 2` must be
     activated before the regular season (see League Context taxi rules).
  2. **Bloated QB room** — 4+ rostered QBs. Names the most expendable
     QB (lowest dynasty value) and, via `suggestSellMove`, a concrete partner
     and return; the action deep-links into the Analyzer with `preloadTrade`
     already filling both sides.
  3. **IR slot opportunity** — an active player whose `injury_status`
     is `Out` or `PUP` and who isn't on IR yet.
  4. **Missing future 1st** — no 1st-round pick in a `pickYears` season
     later than the current one; deep-links to Trade Partners.

  **Types 1, 3 and 4 aggregate — one item per type, never one per player.**
  A `Lede` is the open density register, for *one* decision; three stacked
  entries reading "X can go on IR" with identical prose is the
  icon+title+one-liner pattern wearing editorial clothes, and it was what the
  first Matchday pass produced (measured on screen, 2026-09-12: three
  near-identical blocks where the old tinted rectangles had at least been
  short). An aggregated item names every player it covers in its prose.

  Items are **dismissible**, persisted in `dynastyedge_action_dismissals`
  against a `conditionSnapshot` — a dismissal only holds while the condition
  is unchanged, so a re-bloated QB room or a newly injured player re-surfaces
  rather than staying silently hidden forever. **An aggregated item snapshots
  the SET, not the count** (sorted sleeper ids, joined): one player aging off
  taxi while another ages on would leave the count unchanged, and a dismissal
  must not survive that swap.
- **Roster Analysis** — a `NavRow` beside Dynasty Trajectory → bottom sheet
  (`RosterAnalysisSheet`): age chart with one lane per position (QB/RB/WR/TE),
  each lane shaded with its position-specific peak window (RB 23–26, WR 24–28,
  TE 25–29, QB 26–33); dots are tappable (detail row below the chart) and a
  position filter expands a single lane. Stat cards: avg starter age, league
  avg, core win window years, direction (Ascending / At Peak / Declining).
  Plus per-position age table vs league average and a collapsible
  "How to read this" explainer. All data from LeagueContext — no extra fetches.
  Win-window years derive from `nflState.season`, never hardcoded.

#### League-wide view

- **My Roster** lives in the **Squad** tab's contents rail (My Roster · Lineup ·
  Season Review · Trajectory — Squad is the navigation label for the My Team
  section; the route is `/my-team`). The all-10-teams list lives in **League ›
  Overview** — see Feature 5 — which fused in the old "All Teams" view.
- **Free Agents** now lives under **League** (League › Free Agents): search +
  position filter + **Upgrades Only** and **Hide Rookies** toggles (both default
  off; rookie detection = Sleeper `years_exp === 0` with the age≤25 fallback,
  same logic as the Rookie badge). Above the list, **Recommended Pickups** (top
  4 from `recommendFreeAgents` — see The recommendation engine below) turns the
  list from a filter into actual advice: each row carries plain-English reasons
  ("fills your TE deficit", "rising 30-day trend"). Respects the position
  filter; hidden while searching.

  **Each Recommended Pickup carries a suggested FAAB bid** (OPEN-3, shipped
  2026-10-07) — *"BID $110 · Value play · 11% of budget"* — from
  `utils/faabBid.js`, the same function the MCP server's
  `recommend_free_agents` quotes, so the phone and the chat cannot disagree.
  Read against the **current period's** budget from settings (see the
  recommendation engine below for the rule). A caption under the card states
  the calibration honestly — *"calibrated on 2023–25 at $100; n = 3 contested
  auctions on $1000"* — that the bid is sized by what the player does for
  this roster rather than by who else might bid, and the batch trap (order
  your claims). Only the four Recommended Pickups carry a bid; the full list
  below does not.

  **Two axes, not one.** The list used to rank purely by dynasty value, which
  is the wrong yardstick for a waiver list — the two orderings correlate at
  only r = 0.427 and three of the current dynasty top ten project **0.0 points**
  (rookies who won't play). So each row now carries **this week's Sleeper
  projection** beside the dynasty value, with a **Proj** sort mode
  (`useWeeklyProjections`, the shared session cache the Optimizer also reads —
  one projections fetch per session across both). In-season only: offseason
  hides the column and the sort mode, like every other weekly surface. A line
  under the sort row states what the projection buys — among waiver-tier
  players a 0–2 projection means a **0.9%** chance of a 15+ point game, 6–8
  means **10.6%** (`docs/analysis/optimizer-data-sources-2026-09.md` R2).

  **DEF is a separate pool behind its own chip — never mixed in.** The pool
  used to be built from FantasyCalc's `playerMap` filtered to QB/RB/WR/TE, and
  FantasyCalc ranks **zero** defenses, so every available defense was invisible
  in a league that starts one. Defenses now come from the shared `usePlayerDB`
  cache — but they are reachable **only** through the DEF chip, because you
  roster exactly one (see League Context) and a list mixing 14 of them into the
  general pool reads as "pick up some defenses", which is advice this app must
  never give. Under the Proj sort they would rank mid-list too: a defense
  projects 4–8 and plenty of real stashes project less. They never enter
  `recommendFreeAgents` (which scores in dynasty value).

  Under the DEF chip the view answers the only question that matters — **"is
  there a reason to replace the one I have?"** A `DefenseRosterNote` card leads
  with the incumbent and its projection, states that only one starts and that
  streaming measured worth nothing, and turns urgent in the two cases that
  actually cost points: **no defense rostered**, or **mine on bye**. Bye
  detection needs no schedule fetch — a defense on bye has **no row at all** in
  the projections payload (verified against 2025 W6: 30 of 32 defenses
  projected, the two bye teams absent). The dead controls hide with it: Upgrades
  Only and Hide Rookies (a defense has no value and is never a rookie), the
  sort toggle (projection is the only real ordering), and the Value column (a
  column of `—`). Rule 7 is about never dropping a *player*; a column no row in
  the view can ever fill is noise, and the card says why.
- Tap any team card → full roster + picks drill-down (`/league/teams/:rosterId`)
- League › Overview team cards also drill into the same view; the back button
  returns to wherever you came from with filters preserved

#### Sorting and filtering (league-wide)

- **Default sort:** Total roster value, high to low
- **Sort toggle:** Overall value / Pick capital / FAAB remaining
- **Position filter:** Tap QB / RB / WR / TE at top →
  teams re-sort and display horizontally as a swipeable ranking
  showing that position’s strength across all 10 teams

#### Pick capital rules

- Show the **live three-season pick window** — the upcoming rookie draft plus
  the two after it, from `pickYears` on `LeagueContext` (see the Constants File
  section). It rolls itself the day a rookie draft completes; never hardcode a
  season list, and never take `PICK_YEARS` as the truth.
- Fetch `/traded_picks` to find all picks that have moved
- Any pick NOT in traded_picks is still owned by the original team
  (original team = the roster_id that matches the pick’s season/round)
- Picks in traded_picks belong to `owner_id` in that record
- **Exact slot resolution:** `useSleeper` also fetches `/league/{id}/drafts`
  (best-effort — a failure just falls back to round medians). For the upcoming
  rookie-draft season, `useLeague` resolves each pick to its exact slot from
  the draft order — `slot_to_roster_id` once Sleeper builds the board, else
  `draft_order` (set in `pre_draft`, so slots are known a month early) — via
  `buildDraftSlots` + `slotForRound` (honors snake/linear). A pick sits at its
  **original owner's** slot. Each enriched pick then carries `slot` +
  `slotLabel` ("1.09") and is priced at FantasyCalc's exact-slot value
  (`findExactSlotValue`, e.g. "2026 Pick 1.09"), falling back to the round
  median when the slot is unknown or has no slot entry (future seasons). This
  flows to every roster-derived surface — pick badges, roster/team-value
  totals, and the Trade Analyzer. (League Activity and the Manager ledger price
  *historical*-trade picks at round medians, as before — they're at today's
  prices anyway.)

-----

### Feature 2 — Trade Partner Finder

**Purpose:** Identify which teams are the best trade targets before building an offer.
Answers “who do I call?” — not “what do I offer?”

#### Position filter bar

At the top of the screen: **QB · RB · WR · TE · Picks**

- Tap a position to re-rank all teams based on that specific need
- Default (no filter): rank by overall roster fit match

#### Analysis logic

For each of the 9 opponent teams, compute:

1. **Positional strength scores** — top players at each position, summed FantasyCalc value
1. **Nix Cage surpluses** — positions where my value is above league average
1. **Nix Cage deficits** — positions where my value is below league average
1. **Their surpluses / deficits** — same calculation per opponent team
1. **Match score** — how well their surplus covers my deficit, and vice versa
1. **Pick capital score** — weighted sum of all future picks they own
   (2026 picks worth 3×, 2027 worth 2×, 2028 worth 1×)
1. **Win window tier** — see calculation below

#### Win window tier calculation

Score = (total roster value × 0.5) + (pick capital score × 0.3) + (youth score × 0.2)

Youth score = inverted average age of starters (younger = higher score)

- Top 3 teams by score = **Contending**
- Bottom 3 = **Rebuilding**
- Middle 4 = **Middle**

#### Output — ranked list of all 9 opponents

Each team card shows:

- **Tier badge:** 🎯 Priority / ✅ Good Fit / ⚪ Poor Fit
- What they need (their deficit positions)
- What they have (their surplus you could target)
- Pick capital status: Rich / Neutral / Depleted
- Win window tier badge: Contending / Middle / Rebuilding
- ⚠️ Win window mismatch warning if their tier differs from Nix Cage’s
  (e.g. *“They’re rebuilding — expect them to ask for picks, not players”*)
  Show the warning but still show the team — do not hide or deprioritize them.
- Buyer/seller read from live playoff odds (in-season): a long-shot opponent
  (< 35% odds) is flagged "likely seller", a near-lock (≥ 70%) "buying
  win-now". From `usePlayoffOdds`; hidden in the offseason.
- Multi-year value-direction read from the Dynasty Trajectory model
  (`getTrajectoryRead`, Feature 17): a team whose projected value is sliding
  ("selling vets"), climbing ("building"), or holding ("balanced window") —
  always available (zero extra fetch), and distinct from the this-season
  playoff-odds flag.
- **Tap → opens Trade Analyzer pre-loaded with this team selected**
- **"See their targets →"** footer button (a sibling *below* the card, never
  nested inside its `<button>`) → Trade › Targets scoped to that team. Two
  exits per partner, matching the two questions: the card answers "build an
  offer", the footer answers "what do I even ask for?"

-----

### Feature 3 — Trade Analyzer

**Purpose:** Evaluate any trade proposal with a verdict, then build or refine offers.

#### Setup

- Nix Cage always pre-loaded as “Your team”
- Other team: selected from dropdown, OR pre-loaded when tapping from Trade
  Partner Finder. The dropdown isn't a blind list of names — options are
  grouped by trade fit (Priority / Good Fit / Poor Fit, from `rankTradePartners`)
  and each carries the team's win-window tier + record, so "who do I call?" is
  answerable in the picker itself.
- A context strip under the selector carries the partner intelligence into the
  build: their needs / surpluses, pick capital status, win-window tier, and the
  mismatch warning (all from `rankTradePartners`)
- Two columns: **“You give”** and **“You get”** — each has an **+ Add** button
  that opens a roster-browser bottom sheet pre-pointed at the right roster

#### Building the trade

- Players must come from actual Sleeper rosters only — no searching all NFL players
- The add sheet has search + position chips (All/QB/RB/WR/TE/Picks) and a
  "Draft Picks" section; its header shows live Give ⇄ Get totals + % diff so
  every tap gives instant feedback. Tap toggles, sheet stays open for multi-add.
- Picks must come from actual pick inventories only
  (derived from traded_picks data — only show picks each team actually owns)
- Running FantasyCalc value total updates live on both sides as assets are added
- A **sticky summary bar** (Give ⇄ Get totals, % diff, verdict chip) pins below
  the sub-tabs while a trade is in progress
- Show 30-day trend arrow on every player added to the trade
- The in-progress trade persists in sessionStorage (`dynastyedge_trade_draft`)
  so navigating away and back doesn't lose it. Navigation state (from Partners
  or Targets) takes priority over the draft. "× Clear trade" resets it.

#### Analysis — three layers, always shown together

**Layer 1 — Raw value**
Simple FantasyCalc math. Side A total vs. Side B total.
Show the % difference clearly: “You’re getting 12% more value” or “You’re overpaying by 8%.”

**Layer 2 — Roster fit (post-trade lineup simulation)**
Fit is judged against the **actual resulting starting lineup**, not a bare
position-tag match. `analyzeTrade` re-simulates my optimal starting lineup by
dynasty value (`buildValueLineup`, the shared slot-fill engine in
`utils/lineupBuild.js` — the same `ROSTER_SLOTS` fill the in-season Optimizer
uses, but fed **dynasty value** instead of weekly points, so it works
year-round) *before* and *after* the swap:

- **A need is filled only by a player who would actually START post-trade** at a
  position where I'm below league average. A player I acquire who'd sit on the
  bench does **not** count as filling the gap — he's surfaced as depth
  (`benchNote`: "Sutton projects as WR depth in your lineup — not a starting
  upgrade").
- **Giving a player hurts only when it actually weakens the position** — i.e.
  the trade drops that position below league average (post-trade delta < 0 and
  strictly worse than before). So dealing a starter out of a surplus that then
  falls below the line registers as a hurt, while shedding a benchwarmer that
  changes nothing does not.
- **Shipping a lineup regular that does *not* crater the position** is a
  heads-up note, not a hurt (`starterLossNote`: "You're dealing a starter
  (Brown) from your best lineup … make sure the return replaces the
  production").

The league-relative deficit/surplus (top-N-by-value vs league average, shared
with Trade Partner Finder) is still the yardstick for what counts as a "need";
the lineup sim adds the "…and does this specific player actually start?" gate.

**Depth context BOTH ways** (`analyzeTrade`'s `giveContext` + `getContext`,
rendered as two blocks under Roster Fit): so "what am I actually surrendering?"
is concrete,
for every position I'm dealing from the panel shows my roster's positional
pecking order by dynasty value — a mini depth chart marking the piece(s)
leaving (`OUT`), who currently starts (`ST`, from the same `buildValueLineup`
sim), and each dealt player's standing (e.g. "Gunnar Helm — your TE3 of 4 ·
depth"). Grouped by position (dealing two TEs shows one chart), taxi/IR excluded
(they can't start), capped at 6 rows. Unranked players show `—`.

**"Coming In" is the same chart for the players I'm ACQUIRING** (2026-09-07,
owner ask). The panel used to draw the full pecking order for every piece
leaving and a one-line landing spot for every piece arriving — the roster cost
was concrete and the roster gain was a sentence. `buildDepthContext` now takes a
`marker` (`out` | `in`) and is called twice; the arrival is highlighted `IN` in
success green, the departure `OUT` in amber. **`getContext` reads the POST-trade
roster on purpose** — the arrival's rank has to count the players actually left
at the position, so trading a WR for a WR still reads true (pinned by test; the
pre-trade reading ranks him behind a player who is no longer on the team).
Picks carry no position and are excluded, exactly as they are from the landing
spots.

Both charts are descriptive context, not a verdict input — they never change the
score, they just make the roster cost and the roster gain legible before you
confirm.

**Layer 3 — Win window fit**
Are you acquiring the right type of asset for where Nix Cage is now?

- Buyer / Contending → favor proven players, not picks or unproven youth
- Seller / Rebuilding → favor picks and young players, not aging veterans

**Live playoff odds decide the lean in season; the win-window tier is the
offseason fallback (2026-09-07).** `analyzeTrade` exposes `windowBasis`
(`'odds'` | `'tier'`) so the panel can name what actually scored the layer.
The asset-type tests above are unchanged — only what *selects* them moved.

- **Why.** The tier is a RANKING of accumulated assets (50% total roster value
  including bench and picks · 30% pick capital · 20% youth; top 3 Contending,
  bottom 3 Rebuilding). Measured live 2026-09-07 it tracks total assets at
  Spearman **0.952** but the actual **starting lineup at only 0.721**. Playoff
  odds track the starting lineup at **0.988** — which is the question this
  layer asks. Two live mislabels the swap fixes: roster 5 has the **2nd-best
  starting lineup and 87.7% odds** yet reads `Rebuilding` (top-heavy, picks
  spent — in fact the most win-now team in the league, and the old read told
  you to expect them to ask for picks); Jake & Bake has the **9th-best lineup
  and 8.3% odds** yet reads `Middle` because hoarding picks props up their tier.
- **`Middle` was a dead branch and that was the sharper bug.** The tier has no
  `Middle` case at all, and top-3/bottom-3 makes `Middle` a **fixed-size bucket
  of four teams every season** — 40% of the league, this owner included. Live
  effect on the 20-target board: `windowScore` was **0 on 20 of 20** trades and
  the panel printed "Neutral — fits your current win window" every time; on
  odds it reads **15 aligned / 5 conflicting**. "On the bubble" is a *measured*
  state that can hold any number of teams, including none.
- **The verdicts did not move on that board** (17 Counter · 1 Decline ·
  2 Accept, before and after) — `windowScore` only reaches the ladder via the
  clean-Accept gate and the "winning value but off-window" Counter branch. The
  gain here is a layer that says something true instead of a placeholder; it
  will change verdicts when odds fall and win-now buying turns into a mistake.
- **`getDeadlineVerdict` stays the ONE definition of buyer/seller** (shared with
  League › Playoffs, Trade Partner Finder and The Edge) and is now called
  **once** per analysis, feeding both the score and the printed stance — so the
  badge can never contradict the note. Its thresholds (≥70% Buyer, <35% Seller)
  are unchanged; note that **6 of 10 teams make these playoffs, so 60% is
  baseline** and the middle of the league compresses. Recalibrating them is a
  separate, unmeasured change that would ripple to three other surfaces.
- **Offseason / odds-not-yet-loaded** ⇒ `windowBasis: 'tier'` and the exact
  pre-existing tier behavior, pinned by test. The fallback copy deliberately
  does **not** say "offseason" — odds are also null while the simulation loads,
  and asserting the wrong reason is worse than naming the basis.
- **Scope.** Only Layer 3's *score* moved. `assignWinWindowTiers` still backs
  the other eight consumers (League Overview, Managers, Movers, Playoffs,
  Optimizer, rookie fit, keep-scores, The Edge) — changing the tier itself
  would ripple through all of them and is NOT part of this change.
- When you're acquiring the partner's players, Layer 3 also adds a **partner
  trajectory** line from the Dynasty Trajectory model (Feature 17, via
  `analyzeTrade`'s optional `opponentTrajectoryRead`): a declining team reads
  as a buy window ("their value slides through {year} — they may move win-now
  talent"), an ascending team as a caution ("they're building — may resist
  parting with youth"). Always available (no extra fetch); hidden for a
  balanced-window partner.
- **My-side trajectory lens** (`analyzeTrade`'s optional `curves` from
  `buildAgeCurves`): a forward-looking read on *my own* pieces, distinct from
  raw value. Dynasty value already prices age in, so this never rewrites Layer
  1 — it's a note. Selling a player the model projects to keep **climbing**
  (`myTrajectoryNote`: "you may be selling an ascending asset before its peak")
  is the sharpest flag; acquiring one projected to **decline** reads as a
  win-now add, not a long-term hold. Per-player direction via
  `projectPlayerSeries` + `seriesDirection`; hidden without curves.
- **Draft-grade confidence nudge** (`analyzeTrade`'s optional `myDraftGrade`,
  from my Manager Scouting report card — `useManagerProfiles().my.draft`):
  when I'm **acquiring picks**, my rookie-draft hindsight record adjusts
  confidence in that capital (never the raw value). Keyed to **hit rate** — the
  share of my rookie picks now worth starting-caliber dynasty value (≥ 1000):
  ≥ 70% hits gets "your recent rookie picks have hit … this pick capital has
  tended to pan out for you"; ≤ 35% gets "value this capital at market, not on
  upside". **Gated at ≥ 5 graded picks**; the copy states the record as fact,
  not durable skill, because the sample is small. (Hit rate replaced the earlier
  avg-slot-beat trigger: on this league's ~7-picks-per-owner sample, slot-delta
  is noise — it flips sign year-to-year for most owners and mislabels a
  9-of-11-hit drafter "weak" for taking good players at their slot — while hit
  rate is steadier and closer to what "will this pick capital pan out?" asks.
  See `docs/analysis/trajectory-calibration-2026-07.md`, Item 3.) Best-effort
  (renders only once the lazy league-history fetch lands).

**Layer 4 — Their side (would they even want this?)**
Layers 1–3 are entirely my-side; a verdict that never asks what the deal does
for the team being asked to accept it produces green ACCEPTs on offers that go
unanswered. Layer 4 is Layer 2 **run on the partner's roster** — their
positional deltas against league average, and their optimal lineup
(`buildValueLineup`) simulated before and after the swap:

- **`startersDelta`** — the change in the value of their best startable lineup,
  which is the one honest measure of "does this help them". A player who only
  stacks their bench moves it by 0 however much he's worth.
- **`fills`** — a deficit position where an arriving player would *start* for
  them. **`stacks`** — arriving at a position they're already above league
  average at. **`weakens`** — a position the trade drops them below average at
  (the same test Layer 2 applies to me, so "they can't replace him" reads the
  same in both directions).
- **`landingSpots`** — where each arriving player lands on their post-trade
  depth chart (`{position}{rank} of {count}`, whether he starts, and the slot).
  The mirror, `myLandingSpots`, does the same for the players I'm acquiring and
  renders inside Roster Fit — the "Fills WR need" chip names the position, the
  landing spot names the actual spot.
- **`giveContext`** — their depth chart at the position I'm asking from, so
  "he's their WR2 of 10" is on screen before you send the offer.
- **`appeal`** (Strong / Fair / Weak) from a small signed score over those
  facts plus the win-window lean on picks (a rebuilder wants them; a contender
  offered only picks does not).

**A stack scores against the deal ONLY when the player can't crack their
lineup.** When he does start, the upgrade is merely marginal and
`startersDelta` already measures exactly how marginal — penalising it twice
would also put the weaker of the two sentences in front of the verdict gate
(observed live: Jordan Love → Password Is Taco, where he starts at their SFLX
and their lineup still *loses* 1,183).

**The same rule now holds on the POSITIVE side (2026-09-07).** A `fill` is
defined as an arriving player who *starts* at a position they're below average
in — which is precisely what raises `startersDelta`. Scoring both charged one
event the 2 points that mean `Strong`, the identical double-count already
removed from the `stacks` branch above. The point is awarded once, by the
lineup delta; the fill adds its own point only when the delta did not already
score it. **Both sentences still render** — naming *where* the hole is, is
information the delta alone doesn't carry. Live effect on the 20-target board:
`Strong` 7 → 5, which is the bar for "a clear reason to say yes" returning to
two independent facts (they profit on value **and** their lineup improves).

**ONE engine, both seats (`buildSideFit`) — 2026-09-07, owner ask.** Layer 4's
body is now the seat-agnostic `buildSideFit(incoming, outgoing, roster,
allRosters, opts)`, and `buildPartnerFit` is a thin wrapper passing
`seat: 'them'` — so the partner read is unchanged **by construction**, not by
inspection (pinned: `buildPartnerFit(…) deepEqual buildSideFit(…, {seat:'them'})`).
`analyzeTrade` calls the same function a second time from my seat →
**`myFit`**, carrying the same `appeal` / `summary` / `reasons` / `concerns` /
`startersDelta`, plus `lineupNote` (the lineup sentence as its own field — it is
the one measure the verdict gate quotes).

- **Why.** The Analyzer graded the partner and nothing graded me. Every
  suggestion read "Fair for them" while my own side was scattered across chips,
  and `myStartersDelta` — the exact mirror of the number the partner was
  credited with — **printed only when it was bad enough to downgrade a
  verdict.** The engine mentioned my lineup only as bad news.
- **`myFit` is DISPLAY ONLY.** It never enters `baseTradeVerdict` or either
  gate: my side is already scored by Layers 1–3 plus the `myStartersDelta` gate,
  and a second my-side score would charge the ladder twice. **Verified
  byte-identical verdicts, reasoning strings, selected packages, partner appeal
  and totals across the live 20-target board** — 0 differences on every
  pre-existing field; pinned synthetically across the whole ladder too.
- **Copy is spelled out per seat (`SEAT_VOICE`), not stitched from pronouns.**
  The partner's sentences must stay byte-identical (the verdict gate quotes them
  and `buildTradePitch` is built from them).
- **My seat scores on the odds stance, theirs on the tier.** Layer 3 moved to
  live playoff odds; the fit engine's pick lean reads a tier. My seat is passed
  the `buying`/`selling` Layer 3 actually scored on, so two adjacent blocks
  can't print different answers to one question.
- **"Weak for me" on 17 of 20 was the BOARD OVERPAYING, and it is fixed
  (2026-09-21, OPEN-10).** The finding recorded here on 2026-09-07 was that the
  grader discriminates and the board's offers sat outside the band:
  `suggestFairPackage` assembled inside `[0.9×, 1.15×]` while `buildFairBand`
  calls fair **±5%**, so my seat took a −1 on value that their seat took as +1.
  That diagnosis was right and reproduced exactly two weeks later — with one
  number it had not measured: **0 of 20 suggestions landed inside the fair
  band**, 35 of 180 across all ten seats.
  **The mechanism was never the window — it was the price of an appeal step.**
  Crossing 1.05 hands the partner a whole appeal point, phase 2 prices a
  Weak→Fair step at 1.0 keep-pain, and the distance penalty resisting it is
  `0.3 × 0.09 ≈ 0.027`. The overpay was ~37× cheaper than what it bought, which
  is why the `APPEAL_BONUS` sweep is flat over the shipped band: the lever
  moving the board was not the one that had been tuned.
  **The fix is a split, not a narrowing** — see the two-phase section below. The
  board now reads **18 Fair · 2 Weak** from my seat and every suggestion lands
  in the band. The my-side concern line still prints when a `Weak` survives, but
  it now names a roster objection rather than a price the app chose to pay. See
  `docs/analysis/trade-fair-band-2026-09.md` (supersedes §4 of
  `trade-my-side-read-2026-09.md`).

**Layer 4 is exported as `buildPartnerFit` and shared with the recommenders.**
`suggestFairPackage` scores its candidate packages with this exact function, so
the package the app suggests and the appeal the Analyzer shows for it are
computed by one piece of code and cannot disagree. It is extracted rather than
reached by calling `analyzeTrade` because the package search runs it hundreds of
times per board — measured on the live league, scoring the full candidate set
through `analyzeTrade` takes 1.5s against 78ms through this alone, and the rest
of `analyzeTrade` (trajectory, scarcity, weekly points, the draft nudge) answers
questions a package search never asks. `leagueAverages` / `winWindowTiers` are
accepted as options so a caller in a loop computes them once; both are derived
from `allRosters` when omitted, and injecting them can never change the answer.

**This is roster logic, never a prediction that they will accept.** Per-manager
behavioral profiling was pre-registered, tested on this league's full 4-season
corpus (95 trades / 176 sides) and **DISCONFIRMED** — the own-manager profile
scored *below* the league baseline
(`docs/analysis/trade-structure-stability-2026-08.md`, standing ruling). Layer 4
models the roster and the copy says so.

#### The pitch (`buildTradePitch`)

The message you actually send, stated entirely from **their** side of the table
— an argument for why the trade is good for you is not a pitch. Rendered as a
"Pitch It" card under the analysis with a Copy button, it names what they get
and give, the value from their seat, where each incoming piece lands in *their*
lineup, and why the piece you're asking for is one they can spare (or, when
`weakens` fires, honestly says it isn't and asks what it would take). Every line
is a number Layer 4 already computed, so it can never oversell. Needs both sides
of the trade; returns null otherwise.

#### The negotiating layer (five signals — none of them moves the verdict)

Owner call 2026-09-06: verdict provenance stays **raw value / lineup-sim fit /
win window / partner appeal**. These five change what you understand and how you
negotiate, not the call — the same discipline that keeps usage stats, camp
movement and combine numbers out of every score in this app. All five are
best-effort: each degrades to `null` and its block simply doesn't render.

- **Fair band** (`buildFairBand`, in `utils/fairBand.js`) — the ±5% window of "you give" totals that
  lands the deal fair for what you're getting, rendered as a track in THE CALL
  with a marker for the current offer. A point estimate says the offer is
  wrong; a band says how much room you have, which is what you need at the
  table. Carries `gapToBand` — what closing it actually costs.
- **Scarcity / value over replacement** (`utils/positionalValue.js`) — a sum of
  raw values across positions quietly assumes a point of QB value and a point of
  WR value are interchangeable, and in a 10-team Superflex they are not.
  Replacement level is **derived from the league, never hardcoded** (same
  discipline as the trajectory age curves): run the shipped slot-fill over all
  10 rosters, count the starters at each position, and the (S+1)-th best
  rostered player there is the replacement. Measured live 2026-09-06 — QB 3,086
  · RB 1,806 · WR 1,883 · TE 1,946, against 19/32/38/11 starters. The
  counter-intuitive result is that *mid* QBs are the least scarce thing on the
  board (everyone already rosters a startable QB2); the scarcity is in elite
  QBs only. **The flag speaks ONLY when the two scales disagree** — by 10
  percentage points or a different winner — because a second number that agrees
  is noise. FantasyCalc stays the headline everywhere so the pitch quotes a
  total the other manager can look up.
- **Roster space** (`utils/rosterSpace.js`) — nine of ten teams were at or over
  the 24-man active cap the week after the rookie draft, so this is a binding
  constraint on almost every trade here, and a real lever: a team carrying more
  players than slots *wants* a 2-for-1. **It is never a legality check** — being
  over the cap post-draft is a normal transient state (teams are simply owed
  drops before the season), so it reports headroom and owed drops and never
  refuses a trade. Taxi/IR players occupy no active slot, so dealing one frees
  nothing while every arrival costs one.
- **Weekly lineup impact** — the roster-fit question in the other currency:
  both teams' optimal lineups re-solved on this week's Sleeper projections
  (`selectOptimalStarters` fed points instead of dynasty value, via the shared
  `weeklyProjections` session cache — no extra fetch). In-season only; the
  offseason yields no `projMap` and the block hides. Labelled in-panel as one
  week of context, never the reason for a dynasty call.
- **Partner recent moves** (`utils/partnerActivity.js`) — a 21-day window over
  the already-cached transaction feed, resolved to names and positions. A TE
  surplus they just went out and bought is not spare depth. Descriptive only:
  modelling manager *behavior* was tested on the full corpus and disconfirmed
  (`docs/analysis/trade-structure-stability-2026-08.md`).

#### Panel layout — THE CALL, then three acts

The verdict used to sit at the **bottom** of ~7 sections of evidence, making the
Analyzer the only surface in the app that doesn't lead with its answer (the
Optimizer's moves card, The Edge's hero and Playoff Odds all do). With twelve
signals feeding the panel, reading to the end to find out what to do stopped
being viable at 390px. So:

- **THE CALL** (`components/trade/TheCall.jsx`) — verdict + reasoning, the fair
  band, the counter with its Apply button, and three tappable summary rows
  (`FOR YOU` · `FOR THEM` · `ROSTER`) that scroll to their act. Injury alerts
  ride directly beneath it. `FOR YOU` and `FOR THEM` both read
  *"{appeal} for you/them — …"* off the one fit engine, so the two seats are
  phrased alike (before 2026-09-07 only `FOR THEM` carried a graded read).
- **YOUR SIDE** (`#act-yours`) — **"Is it good for you?"** (`myFit`'s badge,
  summary and reasons — the mirror of "Would they want it?"), raw value
  (+ scarcity flag), roster fit + landing spots (+ weekly lineup), **Coming In**
  then **Giving Up** depth charts, roster space, win window. The reasons list
  restates facts the blocks below also carry, deliberately: a `Weak` above a
  "+3,702 lineup gain" reads as a contradiction until you can see it is paying
  for a 6% overpay.
- **THEIR SIDE** (`#act-theirs`) — Layer 4's appeal read, landing spots, their
  depth chart, their roster space, their recent moves, their weekly lineup and
  trajectory (which previously sat oddly under *my* win window).
- **CLOSING IT** (`#act-closing`) — the pitch, then Live Intelligence.

**Nothing collapses and nothing hides** — the summary rows just tell you whether
you need to scroll. Anchors carry `scroll-mt-28` so a jump clears the fixed
header, sub-tabs and sticky summary (verified: the act lands 112px from the top).

#### Verdict

- **✅ Accept** / **❌ Decline** / **🔄 Counter**
- One plain-English sentence explaining the reasoning
- When contextual verdict (Layers 2–3) conflicts with raw value (Layer 1), flag it explicitly:

> *“✅ Accept — you’re overpaying 8% on raw value, but this directly fills your WR2 gap
> which is your roster’s most critical weakness right now.”*
> *“❌ Decline — raw value slightly favors you, but you’d be selling QB depth you
> genuinely need in Superflex.”*
- The verdict only renders once **both** sides have at least one asset — until
  then a quiet "add assets to both sides" hint shows instead (totals still show)
- **TWO gates sit on the verdict, and both only ever downgrade an Accept.**
  - **My lineup (`myStartersDelta`) — the mirror of Layer 4's measure, applied
    to my own roster (2026-09-07).** Layer 2 grades fit by *counting* positions
    filled against positions hurt, which ties whenever a trade swaps one
    position for another — measured live, `fitScore` was **0 on 18 of 20**
    suggested trades, and two Accepts sat on top of a starting lineup that got
    *worse* while the reasoning read "this fills your WR need". Layer 4 had
    computed exactly this number for the partner all along and called it "the
    single honest measure of does this help them"; both lineups were already
    built here, so my own side was one subtraction from having it. A drop
    clearing **`MY_LINEUP_MATERIAL_PCT` (1%) of my current starting lineup**
    turns a clean **Accept** into a **Counter** ("…your best starting lineup
    drops N in value — the position count balances, the players don't").
    - **Proportional, never absolute** — the live league's lineups span
      27,000–63,000, so a fixed threshold would be noise on one roster and a
      hair-trigger on another.
    - **It gates; it does NOT feed `fitScore`.** `fitScore < 0` is a hard
      *Decline* branch, and a rebuild trade that ships a starter for youth and
      picks *should* lower today's lineup. Declining those would be a worse
      error than the one being fixed.
  - **Layer 4 (partner appeal).** A `Weak`-appeal deal turns an otherwise-clean
    **Accept** into a **Counter**, quoting the specific objection ("…but there's
    little in it for them. Their best starting lineup loses 1,183 in value.").
  - Neither ever upgrades: a trade that's bad for me doesn't become good because
    they'd love it — their enthusiasm is evidence *against* it, not for it.
    Nothing below Accept is touched by either.
- **Counter:** Name a specific player or pick (never vague) that would make the trade fair.
  Show what needs to move to which side to get within ~5% raw value.
  The suggestion is structured (`getCounterSuggestion` returns `{side, type, item, text}`)
  with an **Apply** button that adds the named asset to the right column directly.
  Assets already in the trade are never suggested.

#### “What’s fair” (Targets sub-tab + scale icon)

There is no separate "mode" — What's Fair is a starting point that pre-fills
the trade, reachable two ways:

- The **Targets** sub-tab (top suggested trade targets ranked by need × value) —
  tap a target → Analyzer pre-fills You Get with the target and You Give with a
  suggested fair package from Nix Cage's actual roster
- The **scale icon** on any player row in the "their roster" add sheet does the
  same in place
- Apply all three analysis layers to the suggested package too
- The callout card above the analysis is dismissible (×)

##### The package search runs off the render path

Pricing every candidate for 20 targets is ~730ms, and it used to run in a
`useMemo` — which executes **during** render, so it blocked the very paint that
would have shown a loading state and the tab simply sat blank. `WhatsFair` now
walks the targets **one per tick in an effect**: the board (and the cash-out
block) paints immediately, each card shows *"Working out what it would cost…"*
until its own package lands, and a line above the list counts down *"Pricing
every package the targets could cost you — N to go."* The longest the main
thread is ever held is a single target (109ms worst case on this roster). A team
switch or data refresh cancels the walk in flight rather than letting a stale
run write over the new board. **This is what makes the untruncated search
affordable** — if a much deeper roster ever makes it bite, chunk *within* a
target rather than truncating, which is what this replaced.

##### Targets has two modes — league-wide and team-scoped

A **team selector** (`PartnerSelect`, the same control the Analyzer uses —
options grouped by trade fit, each carrying win-window tier + record) sits
between the header and the position chips. It turns one fixed list into two
modes; the position chips compose with both.

- **All teams (default)** — the league-wide board: every opponent's players at
  a position where I'm below league average, ranked by
  `need × value × movability`, top 20.
- **One team ("scout this team")** — `getTopTradeTargets`'s `ownerRosterId`
  option scopes the ranking to that opponent **and keeps their non-deficit
  pieces**, ranked below the need-matched ones and tagged `Depth` (need-matched
  rows tag `Your need`). **The filter must push into the ranking, not sit on
  top of it:** the league-wide list is sliced to 20 before anything sees it, so
  filtering that slice client-side would leave most opponents showing zero or
  one row. Keeping their whole board is also why an explicitly chosen team
  never renders empty just because they hold nobody at a deficit position —
  a line above the list states the split honestly ("6 of 14 fill a positional
  deficit; the rest are their most valuable pieces", or "Nothing on {team}
  fills a positional deficit — these are their most valuable movable pieces").
- Scoping also renders the **`PartnerContextStrip`** (their needs / surpluses,
  pick capital, win-window tier, mismatch warning) — the same strip the
  Analyzer carries under its opponent selector, so the mode reads as scouting
  rather than filtering. Row 2 of each card swaps by mode: league-wide shows
  the owning team (the thing you can't infer), team-scoped shows the
  need/depth tag (the owner is already in the header and selector, and
  league-wide *every* row fills a need, so the tag would carry no information
  there).
- Selection persists in sessionStorage `dynastyedge_targets_team`, and nav
  state (Partners → "See their targets →") takes priority over it — the same
  precedence the Analyzer uses for its pre-fills. A stale or foreign roster id
  (identity switch, departed team) silently falls back to the league-wide list.

##### The board is two-sided too — movability, and a package they'd take

Both halves of a suggestion used to be computed entirely from my own roster,
which produced a loop worth naming: tap a target → the app pre-fills a package →
the Analyzer grades it `Weak` appeal and downgrades its own suggestion to
Counter. **Measured against the live league before the fix: 19 of 20 suggested
packages graded `Weak`, none graded `Strong`, and every verdict came back
Counter or Decline.** The app proposed and then argued with itself.

- **`getTopTradeTargets` ranks by `need × value × movability`.** Movability
  (`assetMovability`) is three **roster facts** about the team that holds him —
  his depth rank on their chart, whether he cracks their optimal lineup
  (`buildValueLineup`), and whether dealing him would drop them below league
  average. `need × value` alone ranks the most expensive player at my thinnest
  position first, every time, which put an untouchable WR1 at the top of a list
  answering "who should I call about?".
  - **It is a TILT, not a co-equal factor.** `MOVABILITY_RANGE` is
    `[0.70, 1.35]` — max/min is 1.93, so a player must be worth less than half
    as much to be outranked on movability alone. A first cut at `[0.35, 1.6]`
    failed that on live data: a 2,174 WR5 outranked a 4,395 WR2 purely for being
    available, which is not a better target, only a cheaper one. Same discipline
    as the rookie board's age tilt.
  - **It multiplies, it never gates.** A player his team would hate to lose
    stays on the board, ranked below the ones they can spare. Nothing is hidden
    by it, and the team-scoped contract above is untouched.
- **`suggestFairPackage` is two-phase.** Phase 1 enumerates every package in the
  **assembly window** (`PACKAGE_BAND`, `[0.9×, 1.15×]` of the target) and ranks
  them by what they cost **me** — surplus and depth first, core starters never
  auto-included (`PROTECT_THRESHOLD`), win-window lean.
  Phase 2 scores **every** one of those with **`buildPartnerFit`** — the same
  Layer 4 the Analyzer will grade the suggestion with — then takes the best
  appeal, breaking ties by my own cost. It is deliberately **not** truncated:
  phase 1 orders by what a package costs *me* and knows nothing about them, so
  cutting its output hides packages they would actually want. Measured on the
  live 20-target board — cheapest 40: 102ms, **Weak 2** · cheapest 150: 211ms,
  **Weak 1** · all: 731ms, **Weak 0**. Only the full search leaves no target
  whose best offer the other manager has no reason to accept.
  - Phase 1's objective alone selects, by construction, the pieces a partner has
    least use for: the cheapest asset by keep-score was a third quarterback, and
    nobody in a Superflex league needs one. The packages that work were inside
    the same band the whole time — an exhaustive search found a Fair-or-better
    package for **all 20** targets (8 Strong, 12 Fair) without touching a
    protected asset. Phase 1 simply never looked at their side. After the fix
    the live board reads **Strong 4 · Fair 13 · Weak 3**, with 5 Accepts.
  - **Phase 2 reorders candidates; it never widens the pool.** The assembly
    window and the protected-asset rule are unchanged, so the builder still
    never reaches for a core starter to make a deal palatable.
  - **THE SUGGESTION MUST LAND INSIDE `buildFairBand` — the assembly window only
    feeds `alternative` (2026-09-21, OPEN-10).** The two windows answer
    different questions and §4e-iv is right that they may differ; what they may
    not do is let the *suggestion* leave the band the Analyzer grades in.
    Measured live, it always did: **0 of 20** on the owner's board and **35 of
    180** across all ten seats landed inside ±5%, at a mean of **1.0965× the
    target**. So the card proposed an offer and THE CALL, one tap later, called
    it an overpay — the "app argues with itself" loop that phase 2 exists to
    close, returning in a new place.
    - **Asked of `buildFairBand`, never re-derived** from a 0.95/1.05 literal —
      the Targets card hands its package straight to the Analyzer, so it is
      precisely the surface §4e-iv's standing ruling names.
    - **The overpay is not deleted; it becomes the `alternative`**, now carrying
      `premiumPct`. A fairly-priced offer gives the other manager no edge on
      value, so the package they would say yes to is usually an overpay —
      *"To get a yes: 2027 2nd + Jonathan Taylor (+7% over fair) — fair for
      them"*. That keeps the read the two-phase search exists to produce without
      letting it silently pick the offer. Shown on **88 of 180** rows, against 8
      before; **75 of the 106 `Weak for them`** carry one.
    - **Measured, all four axes together** (the only honest way to report it —
      they trade against each other). Owner's board: keep-pain **17.24 → 15.19**,
      value sent **106,195 → 98,444 (−7.3%)**, inside the band **0/20 → 20/20**,
      my-side appeal **3 Fair/17 Weak → 18 Fair/2 Weak**, verdicts
      **3A/16C/1D → 8A/12C/0D**. All ten seats: keep **198.0 → 191.5**, value
      **979,546 → 934,876 (−4.6%)**, in band **35/180 → 161/180**, Weak-for-me
      **74 → 9**.
    - **The price, stated rather than buried: `Weak for them` rises 31 → 106 of
      180.** It is a *different* Weak from §4e-v's — that one was about
      composition (a third quarterback nobody needs), this one is about price —
      and it is **not a search failure**: across all 176–597 in-band candidates
      per target, the best achievable partner appeal is exactly what phase 2
      chose on **20 of 20**. At fair value those partners cannot be interested by
      anything the owner can spare, which is the literal thing a surviving
      `Weak` has always been documented to mean.
    - **`APPEAL_BONUS` was re-swept jointly and NOT moved.** Its 0.40
      mid-plateau setting is unchanged; the sweep is the evidence for leaving it
      alone rather than an assumption. If the assembly window is ever changed,
      sweep them together again — they are one measurement.
    - **A near-miss still gets an answer.** When nothing reaches the band the
      search falls back to the assembly window and returns `inFairBand: false`,
      and the card says so rather than implying an agreement the Analyzer will
      not give.
    - `PACKAGE_BAND` and `requireFairBand` are exported **sweep hooks**; nothing
      in `src/` passes them. Full method:
      `docs/analysis/trade-fair-band-2026-09.md`.
  - **Phase 2 is a TRADE-OFF, not an override (2026-09-07 — supersedes the
    2026-09-06 owner call recorded below, on the owner's explicit later ask).**
    It used to be lexicographic: best appeal won outright and my own cost only
    broke ties, so the search bought their enthusiasm at any price inside the
    band. Candidates are now ranked on **`APPEAL_BONUS[appeal] − my keep-pain`**,
    one scale, both roster facts.
    - `APPEAL_BONUS` = **Weak −1 · Fair 0 · Strong +0.4**, deliberately
      asymmetric. A `Weak` package is a real failure (the offer goes
      unanswered — the whole reason phase 2 exists), so it is priced as a
      near-prohibitive guard. `Strong` over `Fair` is negotiating comfort, so it
      is a nudge: it is bought only when it is nearly free.
    - **Set mid-plateau, not at a step edge.** Swept over the live 20-target
      board, keep-pain paid across all 20 suggestions: w ≤ 0.20 → 17.79 (5/20
      changed) · **0.30–0.50 → 18.46 (2/20)** · 0.70 → 19.02 (1/20) · 1.00 →
      19.84 (0/20, i.e. the old rule). Three flat plateaus; 0.40 is the middle
      of the selected one, so a small mis-estimate changes nothing.
    - Upgrading Fair → Strong costs −0.63, 0.08, 0.23, 0.28, 0.73 and 0.85
      keep-pain on the six live targets where both tiers exist — so 0.40 takes
      the first four and refuses the last two.
    - **Measured effect: 2 of 20 suggestions changed, −1.38 total keep-pain, and
      raw value sent essentially unmoved (−13 across all 20).** Both changed
      targets had been reaching for an asset just under `PROTECT_THRESHOLD`
      (TreVeyon Henderson at 0.85 keep) when a Fair package at ~0.4 keep-pain
      was available. The fix is narrow because the **fair band already bounds
      the damage** — the old rule could only overpay within `[0.9×, 1.15×]`.
    - These are **preference weights, not measured constants** — same status as
      `AGE_TILT_BY_TIER`. They break near-ties; the fair band and the protect
      threshold still bind first, and the search is still untruncated (§4e-v).
  - **A SUGGESTED PICK CARRIES ITS IDENTITY, and that is load-bearing
    (2026-09-22).** `pickLabel` is `"{season} {suffix}"` — it drops the original
    owner, and **a roster can hold several picks under one label**. Measured on
    the live league: **6 of 10 rosters** do, one holding *three* 2027 2nds. So
    a consumer that recovers a pick by rebuilding its label is not doing a
    lookup, it is tossing a coin between real, distinct assets.
    `suggestFairPackage`'s pick assets therefore carry `season` +
    `originalOwner` alongside `round`, and every consumer matches on the triple.
    **`TradeAnalyzer.jsx`'s `mapPackageToAssets` did rebuild the label and
    `.find` the first match**, which loaded the Analyzer with a **different real
    asset** than the search had chosen. Measured across all ten seats' boards:
    **13 of 142 pick handoffs (9%) loaded the wrong pick** — and **0 of them on
    the owner's own seat**, because he currently holds no twins, which is
    exactly why it was invisible. It was also value-neutral *today* (twins share
    a round-median price, so totals stayed right and nothing looked broken) and
    stops being so the moment slots resolve, since the draft season prices picks
    per slot. 92657ae's ruling — *a preload must resolve to what the add sheet
    produces* — is unchanged; what this adds is that **identity, not a rendered
    label, is what it must resolve by.**
  - **A surviving `Weak` is real information, not a failure** — it means nothing
    you can spare interests them at this price. The card says so rather than
    hiding the row.
  - Without a partner roster it degrades to phase 1 and reports `appeal: null`;
    no read is invented.
  - **The `rationale` is CHECKED against the lineup, not asserted (2026-09-22,
    SMALL-1).** It said *"protects your starters"* unconditionally whenever a
    package drew from a surplus. What it meant was "touched nothing scoring ≥
    `PROTECT_THRESHOLD`", which is a weaker and different claim — a core
    starter lands on exactly **0.85**, and only a deficit or a cliff crosses
    0.9. Measured on the live board it said so on **11 of the owner's 20**
    suggestions and **77 of 180** across all ten seats *while sending a player
    who actually starts* (Jonathan Taylor, Bo Nix, Chase Brown, TreVeyon
    Henderson). `packageRationale` now takes
    `buildValueLineup(myRoster.players).starterIds` and **names the starter**
    instead — *"Drawn from your RB surplus — but Jonathan Taylor starts in your
    best lineup."* Both counts are **0** after; the claim still prints where it
    is true (103 of 180), so this is a check rather than a blanket suppression.
    The `bestUnder` copy lost *"without dealing a core starter"* for the same
    reason — it was the identical unchecked claim, and it would have
    contradicted the corrected sentence on the same line.
    **It is a copy fix over a fact the engine already had**: no keep-score, no
    `PROTECT_THRESHOLD`, no search behaviour moved, and **all 180 selected
    packages across all ten seats are byte-identical** on assets, totals,
    keep-pain, both appeals, `inFairBand` and `alternative`. That equality is
    the acceptance test — a package that changed would mean the search moved,
    and the screen looks plausible either way.
  - **`alternative` — the road not taken, and it now points the OTHER way
    (2026-09-07, widened 2026-09-21).** While appeal won outright the suggestion
    was always the most agreeable package, so the useful footnote was the
    *cheaper* one. Now that the winner already weighs my cost — and, since
    OPEN-10, is held inside the fair band — the card names the package they'd
    like **more** that it declined to pay for, and that is this field's main
    job: *"To get a yes: 2027 2nd + Jonathan Taylor (+7% over fair) — fair for
    them."* It is drawn from the **whole assembly window**, so it is usually the
    overpay the suggestion no longer makes.
    **It still never reorders anything** — it is information beside the pick.
    - **`ALTERNATIVE_MIN_SAVING` (0.25) keeps its value but gained an OR: the
      alternative must cost more in EITHER currency** (keep-pain or value sent).
      The keep-pain test alone was written when both packages were selectable,
      and it hid the most useful row on the card — an upgrade that leaves the
      band for a few hundred points of value while barely touching keep-pain.
      Verified across all ten seats: **not one alternative sends less value than
      the suggestion**, so "costs more" is unconditionally true. Effect: 85 → 88
      of 180.
    - **Historical note.** Making appeal trade off against my own cost was
      proposed and **declined by the owner on 2026-09-06** (reasoning: knowing
      whether they would accept is the information the search exists to
      produce). The owner **reversed that on 2026-09-07** after the review above
      measured what the lexicographic rule was costing. The earlier ruling is
      superseded, not forgotten — if the trade-off is ever revisited, the
      original objection is the thing to answer.
- Each target is a **ruled row, not a card** (law 5): the board is an
  enumeration of twenty, and twenty bordered rectangles is exactly the shape
  finding B7 named. It sits under a **neutral ink band** — the board mixes
  positions, so the hue rides on a 7px swatch per row instead.
  **The hierarchy is inverted from what finding B2 measured.** B2: "the loudest
  element on every one is the player's *name* … the least decision-relevant
  field on the card (you know who Ja'Marr Chase is). The most decision-relevant
  fields, the two appeal reads, are the smallest text on the card." So the name
  drops out of display uppercase into body text, the value becomes a
  **`Magnitude`** (size is the quantity), and the appeals come up out of 9px
  badges into labelled `YOU` / `THEM` lines.
- Each target row carries **both** reads — `YOU {appeal}` above
  `THEM {appeal}` plus one short line. **Only `Strong` and `Weak` are
  `Mark`ed** (success / warning): `Fair` is the null result, and marking all
  three would put forty coloured blocks down a twenty-row board and scan as
  noise. Marking the two decisive tiers leaves a readable pattern of "gettable"
  and "they won't bite" down the list, which is the question the board answers.
  Never brand red — that is reserved for "you" accents. The board no longer hands over an
  offer without saying what it is worth to the team being asked to accept it —
  or to mine. `myAppeal` / `mySummary` / `myStartersDelta` / `myConcern` are
  computed **once, for the winning package, after phase 2 has chosen it**, so
  the measured ranking (`APPEAL_BONUS − keep-pain`) is untouched and the
  untruncated search stays affordable. A `Weak for you` prints the concern
  itself — *"you'd be giving up 7% more value than you get back"* — because that
  is a counter you can make; see Layer 4's note on why 17 of 20 read that way.
- **The five negotiating signals stay out of all of this.** The rule the app
  runs on is *roster facts may score; second opinions describe* (owner call,
  2026-09-06) — one rule for verdicts and rankings alike. Layer 4 and movability
  are arithmetic over a roster, so they score; scarcity, roster space, weekly
  points and a partner's recent moves are unbacktested second opinions about
  value or intent, so they describe and never reorder a recommendation.

**No saved history.** The in-progress trade survives the session via
sessionStorage, but there is no multi-trade history — that lives in Sleeper.

-----

### Feature 4 — Lineup Optimizer

**Purpose:** answer one question every week — **"what should I change, and what
does it cost me if I don't?"** Not a status board: a start/sit engine that
solves the whole lineup, names the moves, and lets you build the result.

*The Optimizer is the **Lineup** view under **Squad** (`/my-team/lineup`),
a sibling of My Roster, Season Review (Feature 9), and Trajectory. The
standalone Lineup section is gone — `/lineup` redirects here.*

*This feature is hidden entirely during the offseason.*
*Detect via `/state/nfl` → `season_type !== 'regular'`. In the offseason the
Optimizer tab shows a placeholder (biggest roster need, rookie draft capital,
win window); Season Review remains available on its own tab.*

#### Data sources for this feature

|Data                        |Source                                                                                            |
|----------------------------|--------------------------------------------------------------------------------------------------|
|Weekly point projections    |Sleeper `/projections/nfl/regular/{year}/{week}`                                                  |
|Injury / availability status|Sleeper player data (injury_status field)                                                         |
|Bye weeks **and game locks** |Sleeper `/schedule/nfl/regular/{year}` (off `/v1` — `SLEEPER_ROOT`; fields `home`/`away`, **plus `status`** — see Game locks)|
|Points already scored        |`players_points` on `/league/{id}/matchups/{week}` — already fetched by `useSleeper`, so no extra request|
|Matchup quality             |Sleeper `/stats/nfl/regular/{year}/{week}` for points, joined to the player DB (position + team) and the schedule (opponent) — those stats carry no `pos`/`opp`/`tm`|
|Dynasty value (secondary)   |FantasyCalc (already cached)                                                                      |

**Sleeper's projections payload carries no floor/ceiling** (verified against the
live 2026 W1 endpoint — only `pts_half_ppr` plus stat components). So there is
no boom/bust or confidence read here, and inventing one would be fabrication.

#### The engine (`utils/lineupMoves.js`, pure)

`buildLineupMoves` solves the **whole lineup at once** with the shared slot-fill
(`selectOptimalStarters` — the same engine Season Review uses in hindsight, fed
weekly points), then **diffs** the optimal starter set against the one you're
actually starting. The set difference is the move list.

This replaced a per-slot check ("is any bench player projecting higher than this
starter?"), which was not an optimization and was wrong in two ways:

1. **Gains double-counted.** One bench player who outprojected two starters
   flagged *both* slots, advertising his points twice for a player who can only
   fill one.
2. **Cascading moves were structurally invisible** — promoting a WR out of FLEX
   into WR2 so a better RB takes the FLEX is the most common real optimization,
   and no single-slot comparison can see it.

The diff has the property the old math lacked: **the per-move gains sum exactly
to the headline** ("points sitting on your bench"), because shuffling a player
between slots changes no total. `tests/lineupMoves.test.mjs` pins that
invariant, both original bugs, and the swap algebra.

#### Game locks — the difference between "best lineup" and "best lineup you can still reach"

**Sleeper seals a player's slot the moment his NFL game kicks off.** The engine
did not know that, and the failure was not cosmetic. Measured live on
2026-09-20 (Week 2, Sunday lunchtime), it told the owner:

> `[MUST FIX] SIT DJ Moore → START TreVeyon Henderson · +8.5` · "DJ Moore is
> listed Out and will likely score 0" · **8.4 points sitting on your bench**

Moore's game (DET @ BUF) had finished on **Thursday**. Three of those claims
were false at once: he could not be benched, he had not scored 0 — he had
banked **−0.1** before leaving with an AC joint sprain — and the 8.5 points
were reported as recoverable when nothing could recover them. The schedule
payload had carried `status: "complete"` for that game the whole time.

So the question the engine answers narrows, and the narrower question is the
better one:

- **`parseLockedTeams`** (`utils/projections.js`) reads the `status` field.
  `getAvailability` gains **`locked`**, which is **orthogonal to `blocked`**:
  `blocked` is a forward-looking claim ("he will score 0, take him out"),
  `locked` is a claim about the transaction ("you cannot take him out at all").
  Moore was both, and conflating them is what produced the advice.
- **Locked starters are PINNED to their slots** (`selectOptimalStarters`'s new
  `pinned` option) at their real score. **Locked bench players leave the
  eligible pool** — you cannot start a player whose game is over. Neither can
  produce a move.
- **The Σ-gains invariant survives by construction**: a locked contribution
  appears identically in the current total and the optimal total, so it cancels
  out of the difference. Pinned by test.
- **A played game is FACT, and it outranks both the projection and the
  blocked-scores-0 rule.** Actual points come from `players_points` on the
  current week's matchups — which the app **already fetches** (`useSleeper`),
  so the phone pays nothing; `useLeague` exposes them as `weeklyPlayerPoints`.
  A locked player with no live score falls back to his **projection, never
  0** — "he will score 0" is a claim about the future and his game is not in
  the future, so guessing 0 re-manufactures the same overstatement.
- **An empty locked set means "locks unknown", never "everything locked"** —
  the same discipline an empty `playingTeams` keeps about byes. An absent or
  unrecognised `status` does not lock: over-locking would pin a player you can
  still move and hide a real move, while under-locking merely degrades to the
  behaviour that shipped before locks existed.
- **The UI drops the swap handle on a locked row**, refuses to arm or target
  it, and **replaces the matchup pill with a `FINAL` / `LOCKED` badge** — a
  matchup rating forecasts the defense a player is due to face, and after
  kickoff that is not a stale number but a meaningless one. That is also a
  layout fix: carrying both squeezed the name column hard enough to break
  "DJ Moore" into **seven lines** at 390px. **`--overflow` cannot see this** —
  the name *wraps*, it does not clip, so the truncation instrument reports
  nothing. Look at the screenshot.
- The moves card reads **"Nothing left to change · 6 slots locked · 9.2
  banked"** rather than "Lineup is optimal", which would claim credit for a
  lineup the rules froze, and its figure is labelled **Live total** rather than
  **Projected** once any slot is sealed.

Measured on the live league, same roster, minutes apart: **`128.5 → 136.9,
8.4 left on bench, 1 must-fix`** became **`76.4 total, 0.0 left, 0 must-fix,
6 slots locked, 9.1 banked`**.

Two contracts worth stating:

- **A blocked player is dropped from the eligible pool outright**, not handed a
  0 metric — a 0-metric player still gets *placed* when nothing else is
  eligible, which would quietly "optimize" a bye-week player back into your
  lineup. An unfillable slot stays empty; that's the truthful outcome, and it
  surfaces as "no eligible replacement on your bench".
- **A blocked starter contributes 0 to the current total**, whatever projection
  Sleeper still carries for him. An "Out" starter holding 12.4 would otherwise
  inflate the total and hide the exact gap this tool exists to surface.

**`getAvailability` (`utils/projections.js`) is the one availability verdict** —
`{ blocked, status, label, short, locked }` for bye / IR / Out / Questionable /
ok, taking `(player, playerStatuses, playingTeams, lockedTeams)`. `locked` is
orthogonal to `blocked` (see Game locks); omitting the fourth argument means
"locks unknown" and reproduces the pre-lock behaviour exactly.
`label` is the full word for prose ("is listed Questionable"); `short` is the
fantasy shorthand for a row chip, because a full-width badge at 390px squeezes
the player's own name to "Rach…".

**The DEF slot is part of the lineup.** The old view skipped it entirely, so an
unset or bye-week DEF was invisible — verified live on 2026-09-04, when roster 6
had an empty DEF slot, a rostered Chiefs DEF on the bench, and the Optimizer
reporting no changes needed.

#### Main view

- **Moves card (top, the red score-bug hero):** projected **points sitting on
  your bench** as the headline, `now → optimal` totals, and a must-fix /
  upgrades / coin-flips count. When nothing needs changing it flips to the green
  "Lineup is optimal — no changes needed" state.
- **The move list:** one card per move — `SIT <player>` / `START <player>` with
  its own gain, a Must fix / Upgrade badge, a **confidence line**, and a
  plain-English reason ("Rachaad White is on bye and will score 0"). A move
  whose one-for-one pairing isn't directly legal is labelled part of a
  multi-player reshuffle rather than implying an illegal swap.

#### Confidence — how much to believe the recommendation

A "+2.3 pts" upgrade shown with the same authority as a "+9" one is a lie of
presentation: residual weekly scoring noise is 5.6–7.3 points per player, so a
two-point edge is nearly a coin flip. `utils/lineupConfidence.js` ships the
**measured** hit-rate curve — "how often does the higher-projected player
actually outscore the lower, as a function of the gap?" — and every non-must-fix
move renders it: *"61% likely to be the right call."*

|gap|right|
|---|---|
|0–1|52.0%|
|1–2|56.9%|
|2–3|61.2%|
|3–4|65.3%|
|4–5|69.4%|
|5–8|74.7%|
|8–12|82.5%|
|12+|87.2%|

- **N = 666,026 FLEX-eligible same-week pairs (2022–25), monotone across every
  bin.** Regenerate with `scripts/dev/optimizer-signal-backtest.mjs` §3 and copy
  the "FLEX-eligible" block — **never hand-edit the numbers.** The file carries
  the command and the last regeneration date.
- **One curve, not three.** The same run measures it independently for QB and
  DEF and they track within ~3 points at every bin, so the gap — not the
  position — is what drives it. What is *not* measured is a cross-position
  slot-fill (a QB winning Superflex over a WR); the file says so.
- **A must-fix carries NO confidence.** A bye/Out/empty slot scores 0 by rule,
  not by projection — there is no "higher-projected player" question to be 61%
  sure about, and borrowing the curve's authority for it would misstate what it
  measured.
- **Sub-1-point moves are demoted out of the move list** into a collapsed
  "N swaps with no meaningful edge" group that states the 52% figure. They are
  **demoted, never dropped**: the headline is optimal − current, and hiding a
  move outright would leave points in that number with nothing on screen
  explaining them. The invariant "per-move gains sum exactly to the headline"
  still holds over *all* moves, and `tests/lineupMoves.test.mjs` pins it.
- **Starting lineup + bench**, both rendered by the shared `LineupRow` so a
  player reads identically wherever he sits: slot/position lead, name, status
  chip, NFL team, projection, matchup pill, and an optimal tick.

#### The sandbox — swapping

Sleeper's API is **read-only**; a lineup can never be written back. So the
lineup here is a **local scratchpad** seeded from Sleeper's actual starters:

- Tapping a row **body** opens the `PlayerProfileDrawer`, like every other
  player row in the app. The **⇄ handle** arms a swap.
- While a swap is armed the **whole row becomes the target hit-area** (a 24px
  handle is not a mobile tap target for the action you're mid-way through), and
  only **legal** targets highlight — the rest mute. A starter↔starter swap is
  legal only when **both** players can occupy the other's slot; a bench player
  only needs to be eligible for the armed slot.
- **Apply N moves** writes the optimal lineup; **Reset** restores Sleeper's.
  While edited, a line says plainly that this is a local preview and the real
  lineup is set in the Sleeper app.
- An **empty slot** carries its own "Tap to fill" affordance — it's the one row
  you must act on and the only one with nothing to tap.
- The armed banner also offers **Waiver options** for that slot, which is the
  moment you're actually asking "who else can play here?" — the free-agent list
  is an explicit action, never the accidental result of tapping a flagged
  player (which is what it used to be).

**Free agents are deliberately NOT folded into the optimal lineup** (owner
decision, 2026-09-04): the headline must stay honest, and you can't start a
player you don't own.

#### Status flags — shown on every player

- 🔴 **Hard block:** Out, IR, Suspended, PUP, or on bye. Scores 0, excluded from
  the optimal pool, always a **Must fix** move.
- 🟡 **Soft flag:** Questionable / Doubtful — startable, still counted, but
  surfaced on the row and named in any move that involves them.
- 🟢 **Confirmed:** healthy and in the optimal lineup — a green tick, no action.

#### Free agent layer

- The armed-slot **Waiver options** action opens a drawer of available players at
  that slot's eligible positions, sorted by weekly projection
- Each free agent shows **both** values side by side:
  - Weekly projected points (from Sleeper)
  - FantasyCalc dynasty value (from cached FantasyCalc data)
- Reason: if two free agents project similarly this week, prefer the one with
  higher dynasty value. Both numbers must be visible to make this call.
- **The list is NEVER gated on FantasyCalc.** It used to be (`if (!fc) return
  null`), and since FantasyCalc ranks **zero** defenses that emptied the DEF
  slot completely: 0 rows against 14 available defenses, behind the one row the
  Optimizer marks "Tap to fill". Unranked players — every defense, plus deep
  stashes — resolve from the shared `usePlayerDB` cache and show `—` for value,
  exactly as rule 7 requires everywhere else. The list itself is built by the
  pure, tested `utils/freeAgents.js` (`buildWaiverOptions`), which also carries
  the `TEAM_*` guard.
- **Framed honestly for the DEF slot:** the drawer says this is for filling an
  empty slot or covering a bye, **not** a weekly streaming edge. Streaming
  defenses on Sleeper's projection was measured over **408 team-weeks
  (2023–25) at −0.00 pts/wk** (one season significantly negative) — the
  original single-season "+0.91, significant" result did not replicate. This is
  a correctness bug worth a few points a year, not a feature.

#### Matchup quality indicator

Shown on players in both the starting lineup and the bench:

- 🟢 **Easy** — opponent defense ranks bottom third against this position
- 🔴 **Tough** — top third
- Middle third shows **nothing** — a column of "Neutral" pills is noise

Rankings are computed fresh each week by `computeDefenseRankings`
(`utils/projections.js`) from the previous week's stats: **total** half-PPR
points each defense allowed to each position — totalled, not averaged over the
players faced, since the stats payload includes every rostered player and an
average would punish a defense merely for facing a deep bench of zero-point
players. The stats endpoint carries no position/team/opponent, so those come
from the shared player DB and the schedule (see the Critical stats note).
Update when the user manually refreshes or opens the Lineup tab.

**Week 1 degrades honestly:** no prior week has been played, so Sleeper returns
`{}`. Rather than rating every player "Neutral" off an empty sample, the pills
**hide entirely** and a line explains that matchup ratings start in Week 2. The
schedule and prior-week stats are both **best-effort** — either failing leaves
byes/matchup quality degraded but must never blank the Optimizer behind an
`ErrorState` (it renders that check *before* the offseason check, so a rejected
fetch would take the whole tab down for the season).

### Feature 5 — League-Wide Overview

**Purpose:** State-of-the-league dashboard. Understand the full competitive
landscape before making any move. **This is the single all-10-teams list** —
the old Roster › All Teams view was fused in here (it was a strict subset of
this richer dashboard); the old `/roster/teams` list route now redirects to
`/league`, and the drill-down lives at `/league/teams/:rosterId`.

#### Top section — Current matchups *(in-season only)*

- Show all 5 games this week across the league
- Each matchup: both team names, projected scores if available
- Hidden entirely in offseason

#### League health banner *(always visible)*

Three tappable tier chips — “3 Contending · 4 Middle · 3 Rebuilding” — plus
a “You: <tier>” readout. Tapping a chip filters the team list to that tier
(tap again to clear). The tier filter persists in sessionStorage
(`dynastyedge_league_tier`) and applies to both the team list and the
position-ranking view (ranks stay league-wide; the filter only hides rows).

#### Team list

**Default:** Vertical list, all 10 teams sorted by total roster value (high to low).
Every card shows its rank ordinal for the current sort (computed before the
tier filter, so ranks always reflect true league-wide standing). Nix Cage's
card is highlighted (accent border + “You” chip) in both the team list and
the position-ranking view.

**Sort toggle:** Overall value / Record / Pick capital / FAAB remaining
(Record sorts by wins, then points for; FAAB mode shows remaining + spent of
budget). The Record option is hidden entirely when no team has played a game
yet (offseason) — a persisted `record` sort silently falls back to value.

**Position filter:** Tap QB / RB / WR / TE →
List switches to a ranked list (1–10) sorted by that position's strength.
Sort and position filters persist in sessionStorage so drilling into a team
and coming back doesn't reset them.

**Divergence badges:** when records exist, teams whose roster-value rank and
record rank differ by ≥ 4 places get a badge — **Underperforming** (amber:
talented roster, bad record — a frustrated owner is a buy window) or
**Overachieving** (blue: record outruns talent — regression candidate).

**Each team card shows:**

- Team name + owner username
- Win window tier badge (Contending / Middle / Rebuilding)
- Total roster value
- Positional read: QB · RB · WR · TE — each letter **lit in its position hue
  when the team is above league average there, muted when below**, with the
  30-day trend arrow beside it. This replaced a fill bar that clamped at twice
  league average (see law 2's bar test); the binary is what this line always
  meant.
- Pick capital: 2026 / 2027 / 2028 — show count of picks owned per year
- FAAB remaining (from Sleeper roster data, format as `$XXX`)
- Win/loss record next to the owner username (when the season has records)
- **Tap → full roster + picks detail (same as Roster + Picks Viewer drill-down)**

-----

### Feature 6 — League Activity (League › Activity)

Season-wide transaction feed: trades, waiver claims (with winning FAAB bid),
and free-agent moves, newest first.

- **Filter chips:** All / Trades / Waivers / FA / My Moves (My Moves = any
  transaction involving roster 6). Changing the filter resets pagination.
- Trades show each side's full haul: players, picks (with original owner), FAAB
- **Every asset shows its current FantasyCalc value** with a per-side total
  next to each "X gets" header; when two sides' totals differ by more than
  5%, the larger haul renders green. FAAB dollars display but don't count
  toward totals. A header note says values are at today's prices, not at
  trade time. Unranked players show `—`.
- **A pick spent in the same season it was traded is priced in three tiers,
  best first** — the same ladder the manager scouting ledger uses, from the
  same two shared helpers in `utils/pickCapital.js`, so a trade can never read
  differently on the two screens that both show it:
  1. **What it became** (`buildDraftPickIndex`) — the player actually drafted
     at that slot, at his value today, rendered `2026 1.10 → Jonah Coleman` and
     **tappable** into his profile. The exact slot replaces the usual "(via X)"
     here: it says more and costs a third of the width, and the label truncates
     at 390px where the player's name is the new information.
  2. **The market price** (`findPickValue`, median of round) for a pick whose
     draft hasn't happened.
  3. **The generic round median** (`buildGenericRoundValues`, across every
     season FantasyCalc lists) marked with a **≈** — "a 2nd is a 2nd".
  `—` is reached only when FantasyCalc lists no picks at all.
  **Why this is not cosmetic:** FantasyCalc retires a season's pick entries the
  moment its draft completes, so before this the current season's own trades
  priced their spent picks at **0** — and the per-side totals, and therefore the
  green larger-haul flag, were computed from those zeros. Verified live
  2026-09-07 on this league's one 2026 trade: 1,620 vs 858 (wrong) became
  2,095 vs 2,798 (the other side is the larger haul).
  The draft's pick list comes from `useSleeperDraft` — session-cached and
  shared with the Draft section, and after a completed draft it is holding
  exactly that draft. Best-effort: a failure drops the feed to tier 2/3, never
  an error.
- **Player names are tappable** (dotted underline) and open the
  PlayerProfileDrawer — only for FantasyCalc-ranked players; unranked
  fallback names are plain text. A pick resolved to its drafted player is
  tappable on the same terms.
- Transactions involving Nix Cage get an accent border + “You” chip.
- Player names resolve via FantasyCalc playerMap, falling back to the player DB
  (so dropped players still show names)
- 25 entries per page with a "Show more" button
- Data: all 18 weekly `/transactions/{week}` buckets fetched in parallel,
  filtered to `status === 'complete'`, cached per session

-----

### Feature 7 — Market Movers (League › Movers)

30-day dynasty value trends, turned into actionable lists:

- **Watching** (top section) — every watchlisted player, sorted by absolute
  trend, shown regardless of trend size. Hidden when the watchlist is empty.
- **Buy-Low Targets** — falling players (trend < −50) at my deficit positions,
  not on my roster, value ≥ 1000. A rebuilding owner is flagged as a prime target.
- **Sell-High Candidates** — my rising players (trend > +50) at my surplus positions
- **Top Risers / Top Fallers** — league-wide, rostered players plus free agents
  with value ≥ 500 (filters out deep-FA noise)
- **Trend shows both absolute and %** (vs the value 30 days ago) — +120 on an
  800 player reads very differently than on a 7,500 one.
- **Buy-Low and Sell-High never vanish silently** — when empty they render a
  one-line hint explaining why (no deficit/surplus positions, or no movers
  matching them). Watching/Risers/Fallers still hide when empty.
- Every rostered player's row has a **Trade button** that deep-links into the
  Trade Analyzer: an opponent's player arrives as a What's Fair target
  (opponent + fair package pre-filled); my own player arrives pre-loaded in
  You Give. Free agents get no button.
- **The row SPLITS around that button — it is a sibling, never a child.** The
  Trade action used to sit inside `Row`'s own `<button>` with a
  `stopPropagation`, i.e. a `<button>` nested in a `<button>`: invalid HTML,
  and React warned on every render of the page. `MoverRow` now renders `Row`
  as a plain `<div>` (which is what `Row` does with no `onClick`) holding two
  real sibling buttons — the content, which opens the profile, and the action.
  **This deliberately does NOT follow the Partners-card precedent** ("a sibling
  *below* the card"), and the difference is **cardinality**, which is law 5's
  own test. Partners is nine tall cards, so a full-width footer button costs
  one row of height each. Movers is up to ~30 dense rows across six sections;
  the footer treatment was built and measured at 390px and it adds **752px
  (+24%)**, turning a list you SCAN into a wall of buttons whose CTA out-shouts
  the value and the trend. The split row costs nothing — measured **3,020px
  against the nested version's 3,175px**, i.e. 155px *shorter*, with 0 nested
  interactive elements and 0 React warnings in both themes. Both targets carry
  `.focus-ring` and `.press`.
- Rows show a **sparkline** when the values-history feed has ≥ 4 snapshots
  for the player (see Value history pipeline).
- Tap any row → Player Profile drawer
- Zero extra API calls beyond the lazy once-per-session history fetch:
  computed from cached FantasyCalc data

-----

### Feature 8 — Watchlist

Star any player from the Player Profile drawer (star icon in the header).

- Stored in `localStorage` key `dynastyedge_watchlist_v1` via the `useWatchlist`
  hook (a shared external store — all components update together)
- Trade Partner Finder shows "Watching: …" on any partner card whose roster
  holds watched players

-----

### Feature 9 — Lineup Efficiency (Squad › Season Review)

"How many points did I leave on the bench?" — actual vs optimal lineup for
every completed week.

- Optimal lineup computed from `players_points` in past matchups, filling
  single-position slots first, then FLEX, then Superflex (`utils/lineupHistory.js`,
  which delegates to the shared slot-fill in `utils/lineupBuild.js`)
- Summary card: efficiency % + total points left on bench
- Per-week rows: actual, optimal, delta (green ✓ when optimal, amber/red otherwise)
- Shows during the offseason too (it reviews the completed season)
- Data: `/matchups/{week}` for completed weeks, read from the shared
  matchup-weeks cache (`src/hooks/matchupWeeks.js`, shared with Playoff Odds —
  one fetch per week per session across both). If every week fails to load,
  the page shows an error + retry instead of "no data"
- **Its own view** under **Squad** (`/my-team/season-review`), a sibling of
  My Roster, the Optimizer, and Trajectory — not stacked inside the Optimizer's
  scroll. It renders as a standalone padded page with its own header.
  (`/lineup/season-review` redirects here.)
- **Reached from the Optimizer** (a footer link on Squad › Lineup), which is
  where the question gets asked: you have just been told what *this* week's
  lineup is costing you, and this is the season-long version of that number.
  Before 2026-09-11 it had no content-level inbound link at all.

-----

### Feature 10 — Draft (Draft › Board · Tracker)

Rookie draft prep plus a live draft-day companion, synced with Sleeper's
real draft.

**Board:** the full rookie class (Sleeper `years_exp === 0`) enriched with
FantasyCalc values, grouped in value tiers. Two modes — FantasyCalc order and
**My Board** (drag-to-reorder, persisted). Per-prospect notes are shared with
the Tracker. Search box + position chips. A pre-loaded FantasyPros CSV column
plus user-uploaded CSV ranking columns (syncable across devices via
`public/rankings.json`). When a synced Sleeper draft exists, drafted players
grey out and amber badges show the latest of my remaining picks where each
prospect is still projected available (by derived rookie ADP).

**Tracker — synced via `useSleeperDraft`:** the 2026 rookie draft comes from
`/league/{id}/drafts` → `/draft/{draft_id}` + `/draft/{draft_id}/picks` +
`/draft/{draft_id}/traded_picks`.
**The single-draft call is load-bearing:** `/league/{id}/drafts` **omits
`slot_to_roster_id` entirely** (verified 2026-08-08), and only `/draft/{draft_id}`
carries it. Without it `buildDraftOrder` returns `null`, which silently disables
the entire order-driven live path — on-the-clock banner, "N picks until yours",
Best Available, and slot-accurate capital all vanish with no error. The fetch
merges the single-draft object over the listed one and falls back to
`draft_order` + rosters (same two-tier contract as pick capital, Feature 1) so
the board still resolves in `pre_draft`.
All live-path derivation is **pure logic in `utils/draftLive.js`**
(`deriveDraftState`, `buildBestAvailable`, `buildMyCapital`, `buildRecap`) —
extracted from the component so `tests/draftLive.test.mjs` can replay a real
past draft pick by pick.
Real draft order (`slot_to_roster_id` + in-draft pick trades), live pick feed,
on-the-clock banner, "N picks until yours", a My Draft Capital card (real pick
slots + FantasyCalc pick values + taxi usage), and an on-the-clock **Best
Available** card (best overall + top prospect at each deficit position). The
undrafted list has search, position chips, and a My Board / ADP sort toggle so
board prep carries into draft day. Rows open the Player Profile drawer (with
notes). When the draft completes: the recap below, biggest steals/reaches
(pick slot vs rookie ADP), and full results.

**Draft recap — the standing is Value Over Expected, not value drafted.**
Raw value drafted ranks *volume*: a team holding 8 picks out-drafts a team
holding 3 by picking more often, which is what the original table measured and
called a result. Verified on the real 2026 recap — the 7-pick team led on raw
total (15,113) and sits **3rd** on the grade. Each row now carries three
numbers, strongest first:

- **Value over expected** (the sort) — value drafted minus what that team's
  pick *slots* were owed. The expected curve is built from the class itself:
  sort every drafted player by value descending, and the k-th best value is
  the expected return of the k-th pick of the board. `Σ expected == Σ actual`
  by construction, so **VOE sums to exactly zero league-wide** (pinned by
  `tests/draftLive.test.mjs`) and pick count cancels out of the ranking.
  Colored as a verdict outside a `VOE_NEUTRAL` (100) noise band — a hundred
  points on the 0–10000 scale is less than one FantasyCalc tick.
- **Value per pick** — the weaker efficiency read, biased toward whoever
  picked least, kept as a secondary column rather than a sort.
- **Hits** — picks already worth `DRAFT_HIT_VALUE` (1000, starter-caliber),
  the same bar Manager Scouting grades rookie picks against and now **exported
  from `managerAnalysis.js`** so the two can't drift. Immune to one stud
  inflating a total.

**The expected curve deliberately does NOT come from FantasyCalc's pick
entries, because they don't survive the draft.** Verified against the live feed
2026-09-06: all 24 pick entries on the board covered 2027–2029 only — a
season's picks are retired the moment its draft completes, so a recap opened
the day after would have had nothing to price slots against. Pricing slots off
a *later* season's picks (the only ones that exist post-draft) prices them a
year further out, i.e. cheap, which re-introduces the exact "more picks =
better draft" artifact this replaces.

With no priced player anywhere in the class, every expectation is 0 and a
"+0" grade would be fabricated confidence: `graded` goes false, `voe` and
`expected` are `null`, the header falls back to "Value Drafted by Team", and
the raw total takes the column (rule 7). The card states in-page what the
number means and closes with the honest caveat that it grades at *today's*
prices, pointing at Trade › Managers, which regrades the same picks in
hindsight every season.

**Rookie Research** is the third Draft view — see Feature 19. The Board links
to it directly (a footer link): the Board ranks the class by dynasty *value*,
which prices consensus, and Research answers the question that ordering cannot
— which of them will actually play. Before 2026-09-11 Research had no inbound
link anywhere and was also missing from global search.

**Refresh model:** Board and Tracker share one session-cached fetch
(`useSleeperDraft` module cache). A manual Refresh button refetches on demand;
the hook also refetches when the tab regains focus (aggressively while the
draft is live — exactly the flip-back-from-the-Sleeper-app moment — gently
otherwise) and polls every 30s while status is `drafting` and the tab is
visible.

**Which draft the Tracker shows** is resolved from live data by
`selectTrackedDraft` (`utils/seasonWindow.js`): the **upcoming** rookie draft
whenever Sleeper has one, otherwise the **most recent completed** one, so a
finished draft's recap stays on screen through the months before next year's
board exists rather than the tab collapsing to an empty placeholder. The
Tracker reads its season off the draft it is actually rendering; the manual
fallback below uses `pickYears[0]`.

**Manual fallback:** until the league creates the rookie draft in Sleeper, the
Tracker offers manual pick logging (slots provisionally assume roster-ID order
— labelled as such) plus a "Check" button to re-poll for the draft. Manual log
stored in `dynastyedge_draft_tracker_{season}`, keyed by season so one draft's
log can't leak into the next.

Draft-section storage keys live in `src/components/draft/boardStorage.js`:
`dynastyedge_board_order` (My Board order) · `dynastyedge_prospect_notes`
(notes, shared Board ↔ Tracker) · `dynastyedge_csv_rankings` (uploaded CSVs).

-----

### Feature 11 — Manager Scouting (Trade › Managers)

Behavioral trading profiles for every manager, built from **every season of
league history** — the intel layer behind "who do I call?". Plus a report
card on me: how am I actually doing, and what should I work on?

> **Location:** lives under **Trade › Managers** (`/trade/managers`) — it's
> trade intel, so it sits with the trade tools. `/league/managers` redirects
> here. The component files remain in `src/components/league/`.
> **Reached from Trade › Partners** (a footer link), which is where it belongs:
> the partner cards answer "who do I call?" from their *roster*, and the next
> question is how that owner has actually traded before. Before 2026-09-11 it
> had no content-level inbound link at all.

**League history walking (`useLeagueHistory`):** every Sleeper league carries
`previous_league_id` — the same league's prior season. The hook walks the
renewal chain (capped at 8 hops), and for each past season fetches users,
rosters, all 18 transaction buckets, and every draft with its full pick list.
It also fetches the **current** league's drafts (with picks) so traded picks
from completed rookie drafts resolve into players. Lazy (first consumer
mount) + session-cached — past seasons are frozen, so one fetch per session.
If the league was ever recreated instead of renewed, the chain just ends
there and profiles cover fewer seasons.

**Analysis (`utils/managerAnalysis.js`, composed via `useManagerProfiles`):**

- **Identity:** managers are keyed by `owner_id` (stable across seasons) —
  roster IDs are only resolved within their own season. Profiles exist for
  current owners; departed owners still appear as named counterparties.
- **Trade ledger:** every completed trade, recorded per participant from
  their perspective (got / gave / net / win-loss-even at ±5% of trade size).
- **Hindsight valuation:** everything is graded at *today's* FantasyCalc
  prices — did the move age well? Traded picks whose draft has since
  happened resolve to the actual player drafted at that slot
  ("2026 1st → Player Name") via `slot_to_roster_id` + the draft's pick
  list (falling back to `draft_order` + that season's user → roster map
  when Sleeper omits `slot_to_roster_id`). Future picks use today's market
  pick value (`findPickValue`); past picks that can't be resolved use the
  median of that round across FantasyCalc's listed picks (shown with ≈) —
  never 0 just because the draft year passed. FAAB in trades displays but
  counts 0, same as League › Activity.
- **Tendencies:** pick accumulator/shipper, buys youth/veterans (avg age of
  players acquired vs given), position chasing, FAAB aggression vs league
  average — rendered as chips.
- **FAAB efficiency — measured in BUDGETS, never in raw dollars**
  (fixed 2026-09-20). `budgetsCommitted` (a **multiple**: 1.73 = one and three
  quarter budgets), `valuePerBudget` (today's value of waiver pickups per one
  **full budget** committed), `avgBidPct` (a **percent** — a single bid really
  is a share of the budget it drew against), claims, FA move count. Every bid
  is divided by **its own season's `waiver_budget`** before it is aggregated.
  - **The total is a COUNT, not a percent, because the budget resets twice a
    league year** (see League Context). "173%" invites *"of what?"*, and with
    two resets a year across four seasons the honest denominator is ~8 budgets,
    not one — a number whose unit misreads is the exact bug this fix exists to
    remove. The per-bid percent is untouched: both periods carry the same
    `waiver_budget`, so no period split is needed and the bidder tendencies
    compare like with like.
  - **Why a dollar is not a unit here.** This league's budget went **$100
    (2023–25) → $1000 (2026)**, so a cross-season dollar total is a number in
    no unit at all. The bug was live, not theoretical: measured against the
    live league on 2026-09-20 (four seasons, 287 bid-bearing claims, 2026 top
    bid **$695**), summing raw dollars moved **four of ten** tendency chips and
    **inverted two** — the league's largest raw spender ($1,071, avg bid 26.1)
    wore "Aggressive bidder" while actually bidding **10.7%** of budget,
    *below* the league's 12.5%; and a manager whose raw $132 read mid-pack was
    in truth a 4.8%-average **"Bargain hunter"**. His FAAB efficiency was
    understated **4.6×** (832 → 3,853).
  - **`valuePerBudget` is the successor to the old "value per $100", and it is
    continuous with it.** On a $100 budget a full budget *was* $100, so the two
    are the same number and the fix **restates no pre-2026 history** — verified
    live: all four managers with no 2026 spend scored byte-identically either
    way. Only 2026's dollars stop being counted at 10×.
  - The `budgetsCommitted >= 0.2` coaching gate now means what it always said
    it meant — "committed ≥20% of a budget". On raw dollars it tripped at **2%**
    of 2026's $1000.
  - **No raw-dollar field is carried out of `buildFaabStats`**, deliberately
    (`dollars`, `avgBid` and `valuePer100` are gone, not deprecated). Leaving a
    mixed-scale total on the object is what put one on screen for three
    seasons; a test pins their absence, and pins that no `budgetPct` comes back
    either.
  - A season with no `waiver_budget` falls back to **100**, matching
    `leagueState.js`'s own `?? 100`. Absence of a budget is not evidence of a
    scale.
  - The UI reads **"Budgets Used · 1.7×"** and **"Value / Full Budget"**. Over
    1× is normal and correct — it is a multi-season total across two budgets a
    year, and the sheet header states the seasons covered directly above it.
  - See `docs/analysis/faab-bid-corpus-2026-08.md`, which works in percent of
    budget throughout for exactly this reason.
- **Rookie draft grades:** every rookie pick scored as slot vs the player's
  current-value rank within that draft class (delta ≥ +5 = Steal, ≤ −5 =
  Reach; value ≥ 1000 today = "hit"). Startup drafts (> 6 rounds) excluded.
- **Head-to-head:** per-opponent trade count + my cumulative net vs them.

**UI (League › Managers):**

- **My Report Card** pinned on top: trade record / net value / rookie hits /
  FAAB efficiency stat grid, then generated **"Your Edge"** (green) and
  **"Work On"** (amber) coaching bullets from league-relative ranks.
- **Scouting report cards** for all 9 opponents, sorted by trade activity:
  activity label, record + net, tendency chips, head-to-head line.
- Tap any card (or the report card's ledger button) → **scouting bottom
  sheet** (`ManagerScoutingSheet`): stat grid, tendencies, head-to-head,
  full rookie draft record with steal/reach badges, and the complete
  multi-season trade ledger (paginated, player names open the
  PlayerProfileDrawer, picks show what they became). Each ledger card
  groups assets by receiving team ("X got · total" sections, one per
  partner in multi-team trades). Assets the manager re-traded in a later
  deal carry an "↪ flipped" marker — the value washes out across the two
  trades, leaving only the true profit/loss on the flip in the cumulative
  net. Zero-value assets (FAAB, unranked players, unpriced 3rd/4th picks)
  display `—`, never a raw 0.
- **Trade Partner Finder integration:** each partner card gets a one-line
  behavioral read ("6 trades · 4W-1L · +2,140 · Accumulates picks", or
  "Hasn't completed a trade — cold call"). Best-effort — renders only once
  the lazy history fetch lands.

**Trade-time value archive (best-effort second lens):**
`scripts/snapshot-trade-values.mjs` runs in the same daily workflow as the
values snapshot and permanently records asset values for any trade completed
in the last 8 days into `trade-values.json` on the `values-history` branch
(never pruned, never overwritten — trades are immutable). If the script
fails, the publish step carries the previous archive forward from the branch
via git, and aborts the publish rather than push without it, so a bad run
can't erase it. The app loads it lazily via `useTradeTimeValues` (whose "is
this entry complete?" rule is `tradeTimeTotals` in `utils/managerAnalysis.js`,
shared with the MCP server's `scout_managers`); when a ledger
trade has a complete archive entry, the scouting sheet shows an
"At trade time: got X ⇄ gave Y" line under the hindsight numbers. Missing
file/entries ⇒ the line simply hides — never an error or loading state.

-----

### Feature 12 — The Edge (home screen / daily briefing)

**Purpose:** the assistant-GM landing page — "what happened since I last
looked, and is there a move to make?" Synthesizes everything the app already
caches into one prioritized, tappable morning briefing. **This is the app's
default route** (`/` → `/edge`), useful in season and offseason alike.

**Zero new data sources.** Everything composes existing session caches:
league/FantasyCalc (LeagueContext), transactions (`useTransactions`), the
news feed (`useLeagueNews`, same aggregated feed as the profile drawer),
value history (`useValueHistory`), and draft sync (`useSleeperDraft`). Pure
logic lives in `utils/edgeBriefing.js`.

**Sections (top to bottom, staggered `edge-rise` entrance animation):**

- **Hero (red score-bug):** a `.bug-red` cap bar (team name · "Franchise
  Report", short dateline) over the dark hero panel: time-of-day greeting, a
  generated assistant-GM summary line ("2 items on your desk · 3 new league
  moves"), team value in white mono with a 30-day trend (sum of player
  `trend30Day`, % vs baseline) and a team-value sparkline (per-player history
  rows summed with last-known-value carry-forward — best-effort, hides
  without history). A divider-separated stat strip closes it: value rank
  (medal gold in top 3), record (when it exists), win-window tier, FAAB.
  Value taps to My Roster; rank/window cells tap to League.
- **Action Items:** the shared `RosterActionItems` component, reused as-is
  (dismissals included).
- **Roster Analysis shortcut:** a `NavRow` opening the same
  `RosterAnalysisSheet` as My Roster — surfaced here so the age-curve /
  win-window tool is discoverable from the home screen.
- **Your Briefing:** up to 5 prioritized items from `buildBriefing`, each a
  **`Lede`** — eyebrow, a display headline with the finding in a `Mark`, prose,
  and a solid ink CTA. Each was a tinted lucide medallion beside a title and a
  one-liner, which is **two of the twelve slop markers in one component**
  ("lucide icons throughout" and "identical cards in the icon + title +
  one-line-description pattern"). The eyebrow does the medallion's job better
  because it can *say* the thing: a downward arrow gestures at "something fell";
  "Buy low" is the instruction. Items carry two optional presentational fields
  for this, `mark` (the substring of `title` to reverse out) and `cta` — they
  live in `edgeBriefing.js` for the same reason `icon` and `tone` always have,
  that only the builder knows which fact each item turned on. `markedHeadline`
  degrades to a plain headline when a `mark` no longer occurs in its title, so
  copy can change without breaking one. Each item still
  deep-links somewhere: live/paused rookie draft → Tracker; trade deadline
  ≤ 2 weeks → Trade; `pre_draft` rookie draft → Board; N league moves since
  last visit → Activity; best buy-low (falling player at my deficit position,
  rebuilding-owner note) → Analyzer pre-filled as a What's Fair target; best
  sell-high (my riser at a surplus position) → Analyzer pre-loaded in You
  Give; biggest watchlist mover → profile drawer; biggest underperforming
  opponent (record rank trails value rank by ≥ 4, same gap as League
  Overview) → their roster drill-down; **closing-window opponent** (the most
  valuable team whose Dynasty Trajectory is declining — likely to move win-now
  talent) → their `/league/trajectory/:rosterId`; playoff-odds standing
  (in-season, "N% · Buyer/Seller" from `usePlayoffOdds`) → League › Playoffs.
- **Headlines:** news-feed items matched to my roster + watchlist players
  (≤ 5), "New" badge when published after the last visit; tap opens the
  player's profile drawer. Hides entirely when nothing matches — never an
  error (standard news contract).
- **Market Radar:** the primary daily entry point into League › Movers.
  Watchlist movers + my roster's movers (> ±50 trend) lead, deduped, then the
  list **backfills with my roster's biggest remaining movers** (any non-zero
  trend) up to ≤ 6 rows — so the section stays useful even with a thin
  watchlist. Rows carry sparklines; tap → profile drawer; prominent footer
  link to League › Movers. Empty state (no roster movement at all) hints at
  starring players.
- **Around the League:** compact one-line transaction summaries — moves since
  the last visit, or the latest 3 — with "You"/"New" badges; everything links
  to League › Activity.
- **League pulse footer:** the three tier-count chips; tapping one writes
  `dynastyedge_league_tier` and opens League Overview pre-filtered.

**Last-visit model (`useLastVisit`):** localStorage key
`dynastyedge_edge_last_visit`. The previous timestamp is read once per
session (stable all session, so navigating away and back doesn't clear the
diff) and the stored value is bumped to now on that first read. First-ever
visit ⇒ no "New" badges, activity shows the latest moves instead.

-----

### Feature 13 — Pick Trade Calculator (Trade › Pick Trades)

> **Location:** lives under **Trade › Pick Trades** (`/trade/pick-trades`) — it
> builds a trade, so it belongs with the trade tools. `/draft/trades` redirects
> here. The component file remains in `src/components/draft/`
> (`PickTradeCalculator.jsx`) — route-only move.


**Purpose:** "What does it cost to move up — and what should moving down
bring back?" Rookie-draft pick-swap planning for the weeks before and during
the draft. Zero new data sources: composes LeagueContext (rosters, pick
ownership, FantasyCalc pick entries) with `useSleeperDraft`'s draft order.
Pure logic lives in `utils/pickTrades.js`.

**Discoverability:** the Trade Partners view carries a footer button —
"Planning a pick swap? Open the Pick Trade Calculator →" — that deep-links
here (a sibling Trade sub-tab), so the planner is reachable from the start of
the trade workflow, not just its own tab.

**It plans the NEXT draft, always.** The season it trades in is `pickYears[0]`
— the upcoming rookie draft — not whichever draft `useSleeperDraft` has on
screen, which after a completed draft is last season's (kept there for the
Tracker's recap). It also **refuses to borrow a draft board from another
season**: a board prices slots only for its own draft, so applying the finished
one's order to next year's picks would stamp the wrong slots on them. Round
medians are the honest price until Sleeper sets the new order, and the in-page
note says so.

**Slot-level pricing:** FantasyCalc lists exact-slot picks as "2026 Pick 1.09"
(round.slot, zero-padded) once a draft season's order is known — the old
Early/Mid/Late tier naming was dropped in 2026-07. Picks arrive already
resolved to their exact slot by `useLeague` (from the draft order —
`slot_to_roster_id` once Sleeper builds the board, else `draft_order` in
`pre_draft`, so slots are known a month early) and priced at their exact-slot
value (`findExactSlotValue`). `buildPickMarket` reads that enrichment directly,
falling back to a live draft board (`buildDraftOrder`) when one exists so
in-draft pick trades are honored. When no order exists at all, picks fall back
to round-level medians (`findPickValue`) with a note that prices upgrade
automatically. A price-board card shows each round's reference (round-median)
price on top; the exact per-slot price lives on each pick row.

**Move Up:** every opponent-owned pick of the draft season in draft order;
tap one → up to 3 suggested packages from my pick inventory (this season's
picks at slot prices + future-year picks at medians). Packages are 1–3
picks, each strictly worth less than the target (equal value = a swap, not
a move), totaling 80–145% of the target; undershoot is penalized 1.6× over
overshoot (sellers don't take light offers; buyers may pay a premium).

**Move Down:** my picks; tap one → the best return package from each
opponent's inventory (top 4 partners by closeness).

**Analyzer handoff:** every package has a "Build →" button →
`navigate('/trade/analyze', { state: { preloadTrade: { opponentRosterId,
give, get } } })`. Assets are the owner's actual roster pick objects (same
id as the add sheet, so toggles dedupe) but priced at slot precision and
carrying `slotLabel`, so the Analyzer's totals match the calculator's math
and the builder displays "'26 1.02". `preloadTrade` joins the Analyzer's
nav-state inputs (takes priority over the sessionStorage draft, like the
others). Picks added later via the add sheet use round-median values —
mixed precision is accepted.

**Empty states:** no package reaches fair value → one-line hint ("add a
player in the Analyzer to bridge the gap") — never silently empty.

-----

### Feature 14 — Playoff Odds (League › Playoffs)

**Purpose:** "Am I making the playoffs, and should I be buying or selling?"
A rest-of-season Monte Carlo simulation turned into one plain-English page.
Built to be correct and self-explanatory for someone who's never used playoff
odds before — every number is defined on the page, no outside lookup needed.

**One new data source, lazy + session-cached (`usePlayoffOdds`):** the only
fetch is every regular-season week's matchups (weeks 1 … `playoff_week_start − 1`
from league settings, in parallel) via the **shared matchup-weeks cache**
(`src/hooks/matchupWeeks.js`) — one session-cached fetch per week, shared
with the Season Review's lineup history so visiting both features never
refetches the overlapping weeks. A failed week degrades to empty entries
(the per-week `.catch(() => [])` contract), but when **every** requested week
fails the load rejects, so the Playoffs page shows `ErrorState` + retry
instead of masquerading as preseason during a total outage (retry clears the
shared cache and refetches). That single pass
yields *both* the remaining schedule (future pairings, grouped by `matchup_id`)
*and* every completed week's actual per-team score — no separate history call.
A week counts as **complete** only when *every* team in it has scored, so a
partially-played current week is simulated fresh instead of contaminating the
model. The fetch waits until league settings / NFL state have loaded (The Edge
mounts the hook before they exist) — otherwise it would guess the week range
from the default `playoff_week_start` instead of the league's real setting. Everything else (rosters, records, points-for, FantasyCalc values,
win-window tiers) comes from `LeagueContext`. The **derived results (model +
sim) are memoized at module scope** too, keyed by the schedule and league
references, so the four odds consumers (The Edge, Trade Analyzer, Partner
Finder, the Playoffs page) share one ~50–200 ms simulation per data load
instead of each re-running it on mount; only the cheap `myOdds` lookup stays
per-instance.

**The model + sim (`utils/playoffOdds.js`, pure):**

- **Scoring model (`buildScoringModel`):** each team's weekly score is
  `Normal(mean, std)`. The mean is a shrinkage blend (4-game pseudo-count) of
  a **roster-strength prior** — the team's best-lineup FantasyCalc value mapped
  onto a points scale around a league baseline — and its **actual** completed-week
  scores. Early-season the prior dominates; as games pile up the empirical mean
  (and, at ≥3 games, empirical std) takes over. This is the "seeded from
  projections early, real data later" behavior.
- **Monte Carlo (`simulatePlayoffs`):** plays the remaining schedule out 10,000
  times with a **fixed-seed RNG** (mulberry32 + Box–Muller) so the page never
  reshuffles its numbers across renders. Each iteration draws scores, decides
  the real matchups, accumulates wins + points-for on top of current standings,
  seeds the field by Sleeper's default tiebreaker (wins, then points-for), and
  records who lands in the top `playoff_teams`. Returns per team: playoff %,
  #1-seed %, average seed, full seed distribution, and projected final record.
- **`getDeadlineVerdict(playoffPct, tier)`** → Buyer / On the bubble / Seller
  with a one-sentence rationale. Exported for the planned Trade/Edge reuse.
- **`buildStrengthPreview`** → the preseason fallback: projected seeding ranked
  purely by roster strength (clearly labelled a preview, not odds).

**Three page states (`PlayoffOdds.jsx`):**

- **Preseason** (no games *and* no posted schedule — the deep-offseason case):
  a clear "odds activate when the Week 1 schedule posts" hero plus the
  strength-ranked projected seeding preview.
- **Active** (games remain): my-team hero (big playoff %, projected record,
  projected seed, Buyer/Seller verdict chip in the red score-bug treatment),
  a basis line ("Based on N completed weeks + M remaining games"), then every
  team ranked by playoff % with a likelihood-colored odds bar, projected
  record, average seed, and win-window badge.
- **Complete** (all weeks played, none remaining): same layout, deterministic
  100%/0% odds, with a "regular season complete" note.

**Always explained:** a collapsible **"How this works"** panel defines playoff
odds, seed, projected record, the early-season strength lean, and Buyer/Seller
in plain language — plus inline one-liners under the key numbers. Standard
loading / `ErrorState` + retry; mobile-first at 390px.

**Odds consumers (wired via `getDeadlineVerdict` + `usePlayoffOdds`):**

- **Trade Analyzer Layer 3** (`analyzeTrade` takes an optional `myPlayoffPct`):
  the odds **SCORE** the Win Window layer in season — they are not a line
  printed under a tier read any more (2026-09-07, see Feature 3 Layer 3 for the
  measurement). `getDeadlineVerdict`'s stance selects the buyer/seller branch;
  the win-window tier is the offseason fallback and rides along as context.
  This is the only consumer where the odds affect a **score** rather than
  display — everywhere else they describe.
- **Trade Partner Finder:** each opponent card flags a likely **seller**
  (< 35% odds) or **buyer** (≥ 70% odds) from their live odds.
- **The Edge:** a "Playoff odds: N% · stance" briefing item (Trophy icon) deep-
  links to League › Playoffs.

All three read `usePlayoffOdds`'s `oddsByRoster` / `myOdds` and **degrade
silently in the offseason** (no odds yet → the flag/item simply doesn't render,
and Layer 3 falls back to the tier-only read).

**Baseline caveat, unaddressed:** this league seats **6 of 10** teams in the
playoffs, so 60% is the coin-flip baseline and the ≥70% Buyer threshold sits
only modestly above it — measured at 2026 Week 1, five teams bunched between
76% and 88%. The thresholds separate the top and bottom of the league cleanly
and compress the middle. Recalibrating them relative to
`playoff_teams / numTeams` is a real option but would move three surfaces at
once and has not been measured; do not change them casually.

-----

### Feature 15 — News (top-level drawer section)

**Purpose:** a browsable, filterable view of the **entire** aggregated news
feed — the "show me everything" companion to the per-player news in the
Profile drawer and the roster-scoped Headlines slice on The Edge. Its own
top-level drawer section (`/news`, violet identity), single view (no
sub-tabs).

**Zero new data sources.** It reads the same once-per-session aggregated feed
(`loadNewsFeed` → the `news-data` branch's `news.json`, up to ~1,280 items
since the player cap went to 1200) used everywhere else — see the Player news
pipeline. **The page renders 50 rows at a time with a "Show more"**, the same
pattern as League › Activity; each date band's count is the full bucket, not
the rendered slice, so paging never understates how much news there is.

**`useNewsFeed` hook:** returns `{ items, loading }` — the *full* feed
(newest-first), each item enriched with the best-matched FantasyCalc-ranked
player (so a tap opens that player's profile) and an `isMine` flag. Matching
builds two memoized indices from `values.playerMap` + `playerDB`:
`espn_id → player` (primary, via the item's `athleteIds`) and a
normalized-full-name → player fallback (sorted longest-first so a more
specific name wins). Unlike `useLeagueNews` — which filters to a player set
and drops the rest — this keeps unmatched general NFL items too (shown with
an "NFL" tag). Same best-effort contract: any failure yields `[]`.

**`NewsView` page:**
- Search box (headline text + player name) + `All / My Players / Watchlist`
  filter chips (My Players = roster ∪ watchlist; Watchlist = watchlisted
  players only).
- Light date grouping (Today / Yesterday / Earlier); rows show source · time,
  the matched player + position color (or "NFL"), a "You" chip for my-roster
  items, the headline, and a 2-line story snippet.
- Tap a row → `NewsArticleSheet` (reused); its "View profile" →
  `PlayerProfileDrawer` (reused).
- **States:** standard loading spinner; a friendly empty state ("No news
  right now") when the feed is empty/unreachable, or "No stories match your
  filter" when filtered to nothing — never an error or retry-loop (a full
  page can't silently hide like the inline news surfaces do).

**The Edge integration:** the Headlines section gains an "All headlines →"
footer link to `/news` (same treatment as "All market movers →").

-----

### Feature 16 — Global Player & Feature Search

**Purpose:** find any player — or any section/feature — from anywhere in the
app and jump straight to it, without first navigating to the section that
happens to list it. The single global accelerant for a feature-dense app.

- **Entry point:** a search icon in the **fixed app header** (top-right, every
  screen) — always visible, so it works within the side-drawer paradigm
  without a bottom nav. Lives in `App.jsx`'s `AppShell`.
- **`PlayerSearchSheet`** (`components/shared/`): a standard bottom sheet
  (`useScrollLock` + `useSheetDrag` + `overscroll-contain` + safe-area
  bottom pad, same contract as every sheet). Auto-focuses the input on open.
- **Zero new data sources.** Searches the cached FantasyCalc dataset
  (`values.playerMap` from `LeagueContext`) by normalized name (≥ 2 chars),
  ranked by `overallRank`, capped at 40 results. Each row shows name · team ·
  position (identity color) · value · trend arrow.
- **Feature jump (`DESTINATIONS`):** the same query is matched against a static
  list of every navigable section/feature by recognizable name (label +
  section, so typing "league" surfaces its views) — **names only, no
  verb/keyword synonym map yet**. Matches render in a **"Jump to"** group
  *above* the player results (capped at 8), each with a section-colored dot and
  its section name; tap → `navigate(to)` + close. When both groups have
  results a "Players" subheading separates them.
- **Tap a player result → `PlayerProfileDrawer`**, rendered by the sheet itself
  at the same `z-50` *after* the results in the DOM, so it paints on top (the
  same stacking trick The Edge uses for its drawer + article sheet). Closing the
  profile returns to the search results. Nested scroll-locks unwind correctly
  via `useScrollLock`'s save/restore of the previous value.
- Picks (named like "2026 1st" / "2026 Pick 1.09", with a non-numeric
  `sleeperId`) aren't in `playerMap`, so player search covers players only —
  by design.

-----

### Feature 17 — Dynasty Trajectory (Squad › Trajectory)

**Purpose:** the app's one forward-looking lens. Everything else is a snapshot
of *now* (current values, current odds, *historical* trade grades); a dynasty
is a multi-*year* horizon. Trajectory turns a roster from a value snapshot into
a value curve over the next few seasons and answers the core dynasty question:
**"when does my window peak — am I a buy-now or a build team?"** Works in season
and offseason alike. **Zero new data sources** — pure logic over caches
`LeagueContext` already holds.

**Location:** a **Squad view** (My Roster · Lineup · Season Review ·
**Trajectory**, `/my-team/trajectory`), and **roster-agnostic** — `RosterView`
carries a "Dynasty Trajectory →" card **on both seats**: my own roster opens
`/my-team/trajectory`, a drill-down (`:rosterId`) opens
`/league/trajectory/:rosterId`, so you can scout an opponent's window ("this
contender's value slams shut after 2026 — they'll sell"). The card used to be
gated on the drill-down, which left **my own** trajectory with no inbound link
anywhere in the app (fixed 2026-09-11, DESIGN-3) — "is this roster aging out?"
is the obvious next question from the roster you are looking at, and nothing on
the screen answered it.

**Consumers (all via `getTrajectoryRead`, zero extra fetch):**
- **Trade Partner Finder:** each opponent card carries a one-line trajectory
  read — "Value slides through {year} — selling vets" / "Value climbing toward
  {year} — building" / "Value holds near {year} — balanced window". Distinct
  from the this-season playoff-odds buyer/seller flag.
- **Trade Analyzer Layer 3** (`analyzeTrade`'s optional `opponentTrajectoryRead`):
  when acquiring the partner's players, a declining team reads as a buy window,
  an ascending one as a caution (see Feature 3).
- **The Edge:** a "closing-window opponent" briefing item — the most valuable
  team whose trajectory is declining — deep-links to their
  `/league/trajectory/:rosterId` (see Feature 12).

**The model (`utils/dynastyTrajectory.js`, pure):**

- **Market age curve per position (`buildAgeCurves`)** — for each position,
  learn what the dynasty market pays at every age *straight from today's
  FantasyCalc pool*: a Gaussian-kernel-smoothed (bandwidth 2.5y) weighted
  *median* of value by age, blended toward a `peakWindows.js`-shaped prior
  (pseudo-count 3) so thin age bins stay sane. No hardcoded decay rates — it
  recalibrates every load as the market moves, matching the "never hardcode
  values" rule. (The pseudo-count was 4 before 2026-07; lowered to 3 because the
  well-sampled 21–31 core over-weighted the shape prior and inflated the young-QB
  curve, flattening its real ascent — the thin 35+ tails still lean
  majority-prior. See `docs/analysis/trajectory-calibration-2026-07.md`, P3.)
  - **The curve is a CROSS-SECTION, so it must never feed a score, a ranking,
    or a recommendation** — it is descriptive shape only, which is all this
    feature and its `getTrajectoryRead` consumers use it for. Measured
    2026-09-06: the only 33-year-old TE still carrying value is the one who
    didn't decline, so the curve reads survivorship as aging (TE 31 = 641 vs
    TE 33 = 1,020; QB 25–26 = 790 vs QB 30–31 = 2,255). Fed into a keep-score
    tilt it projected a 31-year-old Mark Andrews **+47%** and a 26-year-old Bo
    Nix **+64%** (the latter just the `YEAR_RATIO_CEIL ** 3` clamp) — which is
    why the shipped aging signal is the longitudinal one in
    `docs/analysis/asset-aging-and-pick-value-2026-09.md` §2, not this. The
    real fix is curves rebuilt from `values-archive.json` once it holds enough
    months; until then this ruling stands.
- **Projection** — a player's value `n` seasons out is
  `currentValue × curve(age + n) / curve(age)`, clamped per year (0.55×–1.18×).
  The talent residual cancels, so a stud and a scrub ride the same proportional
  curve; a 27-yo RB sheds value faster than a 24-yo WR. Unranked / no-age
  players hold flat (we never invent a curve the market hasn't priced) and
  contribute 0, same contract as everywhere.
- **Picks mature into rookies** — a pick holds at its current FantasyCalc value
  until its draft year, then converts to a rookie-aged (22) young asset that
  ages on a generic cross-position blended curve. So a 2027 first starts paying
  into the +1/+2 outlook.
- `buildRosterTrajectory` sums player + pick projections into a
  current→+1→+2→+3 team series plus per-position sub-series.
  `getTrajectoryVerdict` and `getTrajectoryRead` read the **net 3-yr change** of
  that team total into a plain-English window call: **declining** (net change
  < −1% → "selling vets"), **ascending** (net change > +5% → "building"), else
  **balanced**. The cuts are keyed to how a *roster total* behaves, not a single
  player: aging decliners and pre-peak risers largely cancel in the sum and
  every pick matures upward, so real 3-yr team totals compress into a narrow,
  slightly-positive band (~−2% … +10% on this league). Hence the asymmetry
  (−1% vs +5%) — pick maturation lifts every roster ~+2–3%, so a *net-negative*
  total is a stronger aging signal than an equal-magnitude gain — and hence the
  classification is on **net** change, not on when the interim peak lands (pick
  maturation routinely pushes the peak to +1/+2 even for an eroding roster, so
  an earlier "peak-is-now" gate left "selling vets" unable to fire). The
  per-player and per-position tags use `seriesDirection` (symmetric ±5%,
  unchanged — a single player's curve swings far more than a whole roster's) and
  `peakStatusShort`.

**UI (`components/roster/TrajectoryView.jsx`):**
- **Window verdict** — a `Lede`: "Window peaks {year}" as the eyebrow, then
  "Value *climbing* / *sliding* / *holding* through {year}" with the direction
  `Mark`ed, then the one-sentence buy/hold/sell read. It was a card with a 3px
  tone-coloured rail down its left edge — the banned rail, which survived step
  4's sweeps because it was a raw `border-l-[3px]` rather than `Card`'s deleted
  `accent` prop (see the Design System status block; audit for the shape, not
  the API).
- **Forward value chart** — inline SVG line of the team's current→+3 value with
  a gradient area fill, peak year ringed + labeled, and a dashed
  **league-average** line for context (built across all rosters).
- **Stat cards:** value now, projected final year, peak season, 3-yr change %.
- **By Position** rows: each position's now→+3 with a `Sparkline`, Rising /
  Holding / Falling tag, and delta %.
- **Player Projections** table: now→+3 per player with a sparkline, delta %, and
  peak-window status; tap → `PlayerProfileDrawer`.
- Collapsible **"How this works"** — states plainly it's a model/estimate, not a
  forecast (can't know breakouts, injuries, trades) — read the *shape*.
- Mobile-first at 390px; standard loading / `ErrorState` + retry.

-----

### Feature 18 — Sign-in & Identity

**Purpose:** answer "which team am I?" at runtime instead of at build time, so
the app is no longer hardcoded to roster 6. Gates the entire app — nothing
renders until an identity is set.

**Zero new data sources.** Sign-in reads `useLeague`'s Sleeper-only
`signInRosters` (rosters + owners), plus one `/user/{username}` lookup on
submit. **Never gate sign-in on FantasyCalc** — a FantasyCalc outage must not
be able to lock the owner out of his own app (rule 4).

**"Login" is read-only identity resolution** against a public Sleeper
endpoint — no password, no token, no OAuth; it never touches the user's Sleeper
account.

**`LoginScreen`** (`components/auth/`): enter a Sleeper username → resolve to a
`user_id` → match it against this league's rosters. Two failure messages, both
recoverable rather than dead ends — unknown username ("Check the spelling or
pick your team below") and valid-but-not-in-this-league ("Pick your team
below") — because the **tap-to-pick team list is always shown as a fallback**.
The screen owns its own full-viewport scroller (the document body never
scrolls, so it would otherwise clip below the fold) and carries the
`.login-bg` sweep.

**`useIdentity`** (hook): a tiny `useSyncExternalStore` store (same pattern as
`useWatchlist`) so the App gate and the side drawer re-render together the
moment identity is set or cleared. Persisted in `dynastyedge_identity_v1` as
`{ userId, rosterId }`; a stored value is only valid with a **numeric
`rosterId`** — that's the join key every "is this me?" check uses — and
anything else reads as logged-out. Storage failures degrade to an in-memory
identity rather than crashing.

**Switching identity wipes roster-scoped state.** `setIdentity` and
`clearIdentity` both clear `dynastyedge_action_dismissals` (localStorage) and
`dynastyedge_trade_draft` (sessionStorage), so a teammate signing in on the
same device never inherits dismissed action items or a half-built trade.
League-wide caches (transactions, history, draft) are **not** roster-specific
and are deliberately left alone.

**Sign out / Switch team** lives at the bottom of the side drawer.

`MY_ROSTER_ID` / `MY_USERNAME` / `MY_TEAM_NAME` in `constants.js` remain only
as the league's original-owner reference — nothing reads them as the source of
truth. Use `myRosterId` from `LeagueContext` / `useIdentity`.

-----

### Feature 19 — Rookie Research (Draft › Research)

**Purpose:** "which rookies become something?" — the question a dynasty
*value* number can't answer, because value prices consensus, not opportunity.
Sits between the Board (what do I think?) and the Tracker (what's happening
now?) as the **Research** sub-tab (`/draft/research`).

**One new data source** — the rookie intel feed above; everything else
composes `LeagueContext` and the existing `useRookieADP` rookie class.

**The model (`utils/rookieResearch.js`, pure):** an **opportunity score**
(0–100 on screen, 0–1 internally) blending **30% depth-chart standing / 70%
NFL draft capital**. Calibrated in
`docs/analysis/rookie-research-signals-2026-08.md` against **n=396 drafted
skill rookies, 2021–2025** (`node scripts/dev/rookie-signal-backtest.mjs`,
which **imports the shipped constants** so the analysis and the app cannot
drift):

- Draft capital alone rho **+0.598**, depth rank alone **+0.541**, blended
  **+0.664**. The blend curve is flat from w=0.2–0.5, so `DEPTH_WEIGHT` is not
  knife-edge and needs no annual re-tuning.
- `DEPTH_VALUE` is the measured median rookie-season half-PPR by position ×
  depth rank — observed medians, not hand-tuned weights. **Re-derive them from
  the back-test rather than nudging by feel**; the script prints a drift check.
- **All depth scores share ONE points scale** (`DEPTH_MAX`, the largest cell).
  Scaling per-position was tried and is wrong: it made a TE2 (41 median pts)
  score 0.40 while a WR2 (43 — the same outcome) scored 0.28, which put five
  backup tight ends in the top six of the undervalued list.
- Off the depth chart folds into the rank-4+ bucket — for a rookie, "not
  listed" and "listed fourth" are the same fact.
- Undrafted floors at `UDFA_SCORE` rather than 0, so a rank-1 UDFA still
  outranks a buried day-three pick.

**Market vs Model** is the product: market rank (FantasyCalc value) against
model rank, **computed WITHIN POSITION**. Cross-position ranking is not a fair
comparison — a FantasyCalc value already prices Superflex QB scarcity and the
shallow TE pool, while the model prices expected points, so comparing the two
orderings across positions measures the difference between *yardsticks* and
flags every tight end as undervalued. Default `minGap` is 5, tuned to
within-position group sizes (~8–30 players).

**Camp movement is shown, not scored** — a rookie's depth-chart climb since
March is computable for the current class but **could not be back-tested**
(nflverse's 2025 depth charts begin 2025-08-03, so the historical window has
no pre-camp baseline). Display it; don't let it move the score until a season
of it exists.

**Age at draft and combine athleticism are shown, not scored either — and here
the reason is a measured null, not missing evidence.** Tested over n=866
drafted skill rookies (2013–2023) against years 2–3 production in
`docs/analysis/rookie-longterm-signals-2026-09.md`
(`node scripts/dev/rookie-longterm-backtest.mjs`, which imports the shipped
constants so it cannot drift): athleticism buys **+0.002** held-out Spearman;
a long-term score built on age and athleticism correlates **0.934** with the
shipped opportunity score, *loses* to it at predicting years 2–3 (+0.602 vs
+0.632), and the "low impact now / high upside later" quadrant that a two-axis
UI would exist to surface held **0 rookies across nine real classes**. So
**there is no second axis and Draft › Research keeps one score.**
`COMBINE_BASELINE` is a display baseline only — never a score input.
`AGE_BASELINE` is the exception: it feeds the age tilt below.

**The age tilt — the one thing Phase 3 shipped into a score.** The board number
is `dynastyOpportunityScore`: the back-tested year-1 `opportunityScore`, tilted
**10% toward youth measured within position** (a 22-year-old QB is normal, a
22-year-old WR is not). Measured over n=712 drafted skill rookies, classes
2015–2023, with 2015–2020 entirely outside the window the year-1 core was
calibrated on:

|                | per-class delta at w=0.10 | t | classes improved |
|----------------|---------------------------|---|------------------|
| vs **years 2+3** | **+0.0183** | **+3.35** | **8 of 9** |
| vs year 1        | −0.0023 | −0.37 | 4 of 9 |

Clearly better at the three-year question, no measurable cost at year 1.
Three contracts hold it together, all pinned by tests:

1. **`opportunityScore` still means exactly what it always meant** — the
   year-1 core `scripts/dev/rookie-signal-backtest.mjs` grades at rho +0.664.
   The tilt is a separate function layered on top; the old back-test stays
   valid.
2. **An unknown age is a no-op, not an imputed average.** The shipped form is
   written re-centred (`base + 0.0278·z`) rather than as the measured blend
   (`0.9·base + 0.1·(0.5+0.25z)`). The two are a positive affine transform of
   each other and **rank rookies identically** — the back-test asserts it live
   at Spearman **0.999946**, and the only residual is the 0–1 clamp saturating.
   Re-centring matters because only **78 of the 237** published 2026 rookies
   carry an age and the rest are almost all undrafted: the blended form would
   pull them toward 0.5 and more than double a buried UDFA's score.
3. **It is a tilt, not a second axis.** The two-axis rookie UI was tested twice
   and rejected twice (below). A tilted board correlates 0.971 with the
   untilted one on the back-test frame — showing both would be showing the same
   list twice.

Live behaviour on the 2026 class: score changes are small (max 8 points of 100,
median 0), and among **drafted** rookies — the population the tilt was
validated on — the board moves at Spearman 0.946, median 5 spots. Whole-board
rank movement looks far larger, but that is a ties artifact and not signal: 172
of 237 rookies share just 26 distinct scores under 6/100, so a sub-point change
vaults past dozens of players who all read "thin opportunity" anyway.

**College production was tested too, and it is also a null.** With the owner's
`CFBD_API_KEY` in place, dominator rating and breakout age were back-tested in
`docs/analysis/rookie-college-production-2026-09.md`
(Actions → *Snapshot rookie intel* → `mode: college-backtest`, run 33931139020).
Dominator is genuinely **orthogonal to draft capital** (r = +0.05…+0.09, against
age's +0.36) and it does produce a materially different ranking (0.725 vs the
shipped score, where age managed only 0.934) — but being different is not being
better: the long-term score built on it predicts years 2–3 **worse than the
shipped score and worse than draft capital alone** (+0.543 vs +0.608 vs +0.576),
it adds only +0.011 at t = 1.71 on top of the shipped score, and the two-axis
"taxi stash" quadrant holds 6 of 391. **So Draft › Research keeps one score, the
app calls no college endpoint, and the two-axis question is closed.** Note the
frame: CFBD's `playerId` is only ESPN-aligned from college season ~2015, so only
draft classes 2019+ are usable (n = 391) — the memo's §2 carries that cliff.

**Roster fit (`buildTeamFit` / `topTargets`)** answers the second question — the
model above is league-agnostic ("which rookies become something?"), this is
"which of them should *I* take?". It is a **re-ranking over the back-tested
score, never a change to it**: `fit` blends the opportunity score with the
market price (`FIT_MARKET_WEIGHT` 0.45 — opportunity alone leads the board with
a well-placed day-three flier over a consensus 1.01, a fine *divergence*
finding and a bad *draft plan*), then adds bonuses for a position I'm below
league average at (`FIT_NEED_BONUS`), a ≥5-spot model-over-market gap, and a
win-window lean (a contender wants a rookie already listed first; a rebuilder
can let top-64 capital develop). Deficits come from `getDeficitPositions` and
the tier from `getWinWindowTier`, so "you need a TE" means exactly what it
means in Free Agents and the Trade Analyzer. An **unscored rookie gets
`fit: null` and never appears as a target** — same contract as the score:
absence of feed data is not evidence of a bad fit — but `fitsNeed` still marks
his position, so the need badge survives the degraded state.

**UI (`components/draft/RookieResearchView.jsx`):** an always-visible
"Scout the rookie class" explainer (what an opportunity score is, plus the
three-step read order — this page shipped without one and was unusable),
**Your Targets** (the roster-fit shortlist, stating my deficits and win window
in plain English, with per-card fit reasons), the Market vs Model divergence
cards (corner-cut, tone edge bar, plain-English reasons plus a sentence
spelling out the rank gap), then an Opportunity Board with search, position
chips, a score legend, and a sort toggle (Best for me / Opportunity / Dynasty
value / Camp risers, default **Best for me**) with a line under it naming what
the active sort means. Rows show the score, a position-aware depth read
("Backup behind Kirk Cousins"), capital, alignment slot, a movement chip, and a
"Your need" badge; tap → `PlayerProfileDrawer`. Dynasty value sorts as the
tiebreaker, which is what keeps the board useful in the degraded state. A
collapsible "How this works" states the model, its back-test, that the fit
re-ranking is a judgement call rather than a back-tested one, and why preseason
stats are absent. Unranked rookies show `—` and are never dropped.

**The drawer carries the research read — everywhere a rookie is opened, not
just here.** The card used to render only when `RookieResearchView` passed its
`research` prop, so the same rookie opened from League › Free Agents, My
Roster, Movers, News, the Draft Board or global search showed nothing but
dynasty framing ("D — Deep Stash" on a rookie with a starting job). The
composition now lives in **`useRookieResearch`** (`hooks/`), which both this
page and `PlayerProfileDrawer` read, so the class is built once per data load
and there is no second copy to drift. Since 2026-09-22 the hook holds only the
**memo**: the composition is `buildRookieBoard` in `utils/rookieResearch.js`
(and the class rule `buildRookieMap` in `utils/rookieAdp.js`), which the MCP
server's `research_rookies` calls too — so there is no second copy there either. The drawer resolves its own row via
`useRookieResearchFor(sleeperId)`; an explicit `research` prop still wins, so
this page keeps handing over the exact row you tapped.
- **The intel fetch stays lazy at a second level.** `useRookieIntel(enabled)`
  doesn't load until a consumer will actually render a rookie — the drawer
  passes `false` until the player is in the `useSleeperRookies` map (read from
  the shared player DB cache, no extra request), so opening a veteran costs
  nothing.
- **Outside this page a rookie the feed has no entry for renders no card.**
  `useRookieResearchFor` returns null without a score: an empty "no draft
  record in the feed" card on every deep stash in the app is noise. Draft ›
  Research still shows that state, where the player is on screen because you
  tapped him on this board.

`PlayerProfileDrawer` renders the row as a **Rookie
Opportunity** card at the top of the sheet (score/100 + tier, depth read, NFL
capital, camp move, a **"Measurables · context, not scored"** block — age at
the draft read against his position, height/weight, and the combine drills each
banded within position — the score's reasons, the within-position
market-vs-model sentence, and the roster-fit reasons) — a value number alone doesn't answer
"is he going to play?", which is why the user opened the sheet. The row shape
therefore also carries `positionRank` and `age`, which the model itself does
not use: the drawer grades from `positionRank ?? 99`, so the first shipped
shape (which dropped both) stamped **every** rookie opened from this page
"D — Deep Stash" with no age, no position rank, and no peak-window line.

-----

### The recommendation engine (`utils/recommendations.js`)

**Purpose:** the assistant-GM "brain" — the one place that decides *how willing
we should be to part with each asset*, so every recommendation surface reasons
about the roster the same way. It is not a screen; it is shared pure logic.
**Zero new data sources** — composes caches `LeagueContext` already holds.

**The core idea — a keep score, not a value.** `assetKeepScore` returns 0
(very expendable) → 1 (untouchable core) for each of my assets, built from
`buildGivabilityContext` (my positional surpluses/deficits, my win-window
tier, and each player's depth rank within his position). The rules that
matter:

- **`CORE_DEPTH` = QB 2 · RB 3 · WR 3 · TE 1** — the starters protected
  hardest in this 10-team Superflex Half-PPR league (QB doubles up via the
  Superflex slot; 3 FLEX spots make RB/WR depth matter). Beyond that rank, a
  player decays toward expendable.
- **A deficit protects everyone at the position; a surplus only unlocks the
  depth pieces** (rank ≥ `CORE_DEPTH`). A surplus must *never* discount a core
  starter — one elite player (a top-1 TE with no backup) inflates the
  position's summed value and makes a thin spot read as deep. We don't trade
  the stud because he makes the bin look full.
- **Cliff protection:** my best at a position with a steep drop to the
  next-best is protected regardless of how the summed positional value reads.
  This is what keeps an elite, backup-less starter out of auto-suggested
  packages.
- **Picks are priced by ROUND, not flat (`PICK_ROUND_KEEP` = 1st 0.65 · 2nd
  0.50 · 3rd 0.40 · 4th 0.30).** The old flat 0.5 made a 2027 1st and a 2029
  4th equally spendable. Measured over all 120 rookie picks this league has
  made, valued at today's prices: a class's round-1 median beat the **dearest**
  future 1st on the board in **3 of 3** classes (30/30 became starter-caliber),
  while no class's round-4 median reached the **cheapest** future 4th (8/30).
  Hype flattens the pick curve and resolution steepens it — the market prices a
  1st at 3.5× a 4th; the most-resolved class delivered **8.0×**. An unknown
  round falls back to `PICK_KEEP_DEFAULT` (0.5) rather than the cheapest —
  absence of a round is not evidence a pick is cheap (rule 7's discipline).
  `PICK_KEEP_CAP` (0.85) holds every pick below `PROTECT_THRESHOLD` at every
  tier: that threshold exists for irreplaceable *players*, and a rebuilder's
  +0.3 on a first would otherwise strip the builder of the currency it builds
  with. Re-derive with `scripts/dev/asset-aging-backtest.mjs` (needs the diagnostics resolver hook); revisit
  once the 2027 class resolves. See
  `docs/analysis/asset-aging-and-pick-value-2026-09.md` §3.
- **Win-window lean on age:** a contender cashes picks and young fliers; a
  rebuilder hoards youth. These are *window* preferences (what do I want when
  my window opens), distinct from the aging tilt below.
- **Past-peak age tilt (`pastPeakTilt`)** — an asset past its
  `peakWindows.js` window gets more expendable, saturating `AGE_TILT_SPAN` (3)
  years past it. **Decline-only:** protecting players *younger* than their
  window was proposed and disconfirmed — absent at RB (−0.02, p=0.853), the
  position the tilt exists for, with one near-hit in four tests. **Weighted per
  position** (`AGE_TILT_BY_POSITION` = RB 1.00 · WR 0.65 · QB 0.40 · TE 0.15),
  because the penalty is: past-peak retention falls 0.94 → 0.66 for RB
  (p=0.0001) and 0.84 → 0.67 for WR (p=0.0016), while QB and TE are not
  distinguishable from zero and take their measured relative effect **halved**
  — unproven is not the same as known-small. Magnitude by tier
  (`AGE_TILT_BY_TIER` = Contending 0.04 · Middle 0.10 · Rebuilding 0.16) is the
  one knob no measurement sets: it is a preference weight, bounded so the tilt
  breaks near-ties rather than arguing with a market that already prices age.
  Being decline-only it can only ever make an asset **more** available — it can
  never protect one, so it cannot reach past `PROTECT_THRESHOLD` or undo cliff
  protection. An unknown age or a position with no window is a **no-op**, never
  an imputed average. This replaced a flat `age >= 28 → −0.2` that fired only
  for a rebuilder — 28 is two years past an RB's peak and mid-window for a QB,
  and a **Middle** team got no age opinion at all. Measured over n=762
  player-seasons (2020–2025) following the same player year over year, a
  departed player counted as 0; the peak windows themselves are **not**
  re-tuned (RB 26 and WR 28 both test significant at the shipped boundary). See
  `docs/analysis/asset-aging-and-pick-value-2026-09.md` §2.
- **`PROTECT_THRESHOLD` = 0.9** — assets at or above this keep score are never
  *auto-*included in a suggested package. The user can still add them manually.

**Consumers:**
- **Feature 1 / Feature 12 — Action Items:** `suggestSellMove` turns "you have
  a surplus" into the actual move, and its partner pick is **two-sided**. It
  used to take whichever opponent's positional delta was most negative and then
  hope a return existed on their roster — so the neediest team won the call even
  holding nothing I wanted, and the move degraded to a bare "shop him to X".
  Every opponent is now scored on three roster facts: do they need the position,
  would he actually **start** for them (`buildValueLineup` — a player who only
  stacks their bench is not a sale, however thin their summed value reads), and
  do they own a comparable-value player at one of **my** deficit positions. A
  partner with a real return beats a needier one without, because the two-sided
  move is the thing worth surfacing; it still falls back to the neediest team
  when nobody has a return. Returns nav-ready `preloadTrade` state for the
  Analyzer, plus `startsForThem`.
- **League › Free Agents (Feature 1) and The Edge's `pickup` briefing item
  (Feature 12):** `recommendFreeAgents` ranks available players by what they'd
  do for *my* roster — fill a deficit, beat my replacement level at the
  position (my `CORE_DEPTH`-th best), ride a rising trend, fit my win window —
  and returns only players that genuinely move the needle, each with reasons.
  Its roster facts (my deltas, tier and replacement levels) are
  `buildPickupContext`, exported so the FAAB bid reads the same definition of
  "fills your need".
- **The FAAB bid (`utils/faabBid.js` → `recommendFaabBid`, OPEN-3, 2026-10-07)**
  — the bid beside each Recommended Pickup and in `recommend_free_agents`.
  Spec, the live re-run and the pre-registered grading bars:
  `docs/analysis/faab-bid-corpus-2026-08.md` §10.
  - **It does NOT predict whether anyone else will bid.** That was tested:
    the 2023–25 contest rate barely moves with value (27% unpriced, ~39–44%
    from 600 up). So the tier is chosen by **how much winning this player
    matters to my roster**, from the same roster facts as the pickup list:
    **must-win 23%** (fills a need AND starts in my dynasty-value best
    lineup) · **default 16%** (starts, or fills a need AND beats my depth) ·
    **value play 11%** (beats my depth, or sits at a need) · **floor**
    (anything else). The ladder is §6's, from 2023–25 contested clearing
    prices.
  - **The floor is what this league actually pays uncontested** (owner
    decision 2026-10-07, dropping the spec's 1% = $10): **0.2% of budget,
    min $1, never under `waiver_bid_min`** — **$2** on $1000 (the 2026
    in-season uncontested median) and $1 on $100 (the 2023–25 median).
  - **Priced against the FULL budget, capped at what is left** — not "% of
    remaining", which would underbid the market exactly when the period is
    nearly spent. Week scaling (§6 Part C): **0.8×** weeks 1–4, **1.0×**
    5–14, **0.3×** from 15; offseason 1.0×; the floor never scales.
  - **The budget is READ, never assumed.** `readFaabPeriod` takes
    `leagueInfo.settings.waiver_budget` and the roster's
    `waiver_budget_used` (the **current period** — the budget resets twice
    a league year). A league reporting no budget gets **no bid**, not a 100
    or a 1000 — unlike `leagueState.js`'s display fallback.
  - **Rule 7 and the one-defense doctrine:** a defense or an unpriced player
    gets `bid: null`, never a fabricated number.
  - **Measured on the live league (2026 Week 5):** across all ten seats the 81
    recommended rows were **51 value play / 30 floor / 0 default / 0
    must-win**. No waiver-tier player (≤ 1,300) cracks any team's
    dynasty-value lineup; the top two tiers exist for a real starter cut
    mid-season, and the tests pin that they fire then.
  - **Graded at Weeks 13–15** against bars pre-registered in §10 of the memo
    (wins ≥ 75% of contested auctions it enters; cost per contested win ≤ the
    league median). Do not move the bars.
- **Feature 3 — Trade Analyzer:** `buildGivabilityContext`, `assetKeepScore`,
  and `getDeficitPositions` back the "Giving Up" depth context and the fair
  package suggestions.
- **Feature 3 — Trade › Targets, the cash-out board (`buildCashOutBoard`):**
  the one move the Targets board structurally cannot surface. Targets ranks
  opponents' players by **my positional deficits**, so a roster thin at WR sees
  WRs priced around that deficit and never a target sized to its most valuable
  aging asset — and `suggestFairPackage` won't bridge it either, since it never
  offers an asset worth far more than its target. Measured live 2026-09-06: the
  owner's 27.6-year-old RB1 (5,752) and the 23.1-year-old WR1 he'd want for him
  (6,484) could not appear together on any surface in the app.
  `pickCashOutAsset` names the asset bleeding most **value at risk** —
  `value × how far past its peak window`, which is neither "my oldest" (a
  38-year-old QB4 is worth nothing to cash) nor "my most valuable" (that is
  just my best player) — excluding anything at `PROTECT_THRESHOLD`. Then it
  lists younger targets (`CASH_OUT_MIN_YEARS_YOUNGER` = 2) around his price,
  each tilted by the same `assetMovability` the Targets board uses (extracted
  as `buildMovabilityIndex` so the two cannot drift) and **labelled with how it
  misses fair**: above the band, what to add; below it, the premium you'd pay.
  **The band and every gap come from `fairBand.js`, not from
  `suggestFairPackage`'s package-building window** — the first cut borrowed the
  latter and told the owner a deal needed "~84 more" that THE CALL then scored
  **408 light** on the very next screen. Tapping a row hands the Analyzer a
  two-sided `preloadTrade` built from the **full roster objects** (92657ae's
  lesson: a preload must resolve to what the add sheet produces). Renders in
  league-wide mode only — while a team is scoped the page is a scouting view of
  one roster. No past-peak asset ⇒ no block, never an invented one.

-----

### Trade deadline banner

The Trade section shows a persistent banner under the sub-tabs during the
regular season (deadline week comes from league settings — Week 13):

- More than 2 weeks out: neutral "Trade deadline: Week 13 · N weeks away"
- 2 weeks or less: amber urgency styling; deadline week says "THIS WEEK"
- After the deadline: muted "Trade deadline passed"
- Hidden entirely in the offseason

-----


