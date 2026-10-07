# History — League Context

> **Verbatim text of this CLAUDE.md section as it stood at `8c25d03` (2026-10-07), before CLEANUP-2 slimmed it.**
> Nothing here was edited. The live rules, contracts and traps are in CLAUDE.md; this file keeps the
> measurements, dated rulings and narratives that explain them. When the two disagree, CLAUDE.md is current.

## League Context

|Setting              |Value                                          |
|---------------------|-----------------------------------------------|
|Platform             |Sleeper                                        |
|League ID            |`1313933520715907072`                          |
|Format               |10-team Dynasty                                |
|Scoring              |Half PPR (0.5 per reception)                   |
|QB format            |Superflex (QB eligible in flex)                |
|Passing TDs          |4 pts                                          |
|Rushing/Receiving TDs|6 pts                                          |
|Trade deadline       |Week 13                                        |
|Trade review         |None — executes immediately                    |
|FAAB budget          |**$1000 for 2026** — was $100 in 2023–25 (see below)|
|Playoff teams        |6, starting Week 15                            |
|My team name         |Nix Cage                                       |
|My Sleeper username  |chnates                                        |
|My roster ID         |**6** — original-owner reference only (see below)|
|My owner ID          |965787707299430400                             |

**The FAAB budget changed 10× for 2026** ($100 → $1000, from
`league.settings.waiver_budget`). Always read it from league settings — never
assume 100. Historical bids are on the old scale, so any cross-season bid
comparison must normalize to **percent of budget**
(see `docs/analysis/faab-bid-corpus-2026-08.md`).

**IT ALSO RESETS TWICE A LEAGUE YEAR — offseason, then again at the start of
the regular season, and anything unspent in the offseason is LOST** (owner,
2026-09-20). So one Sleeper season carries **two** budgets, and two things
follow that are easy to get backwards:

- **`roster.settings.waiver_budget_used` tracks only the CURRENT period.** That
  is why `leagueState.js`'s `faabRemaining` / `faabSpent` are correct as
  written, and must never be "reconciled" against a transaction-log total.
  Live 2026-09-20: docj11 had spent **$703** in the offseason and his
  `waiver_budget_used` read **$0** — both numbers true, answering different
  questions.
- **A season's transaction log routinely exceeds one budget**, because it spans
  both periods. Measured across 2023–26: **six manager-seasons exceed one
  budget and none has ever exceeded two** — which is the signature of exactly
  two resets. chnates 2025 spent exactly $100 in the offseason and a fresh $30
  in-season. Anything that caps a season at one budget is discarding real
  spend.

A *single bid* needs no period split: both periods carry the same
`waiver_budget` and Sleeper exposes no separate offseason figure, so
`bid ÷ waiver_budget` is exact either side of the reset. A *total* is therefore
a **count of budgets committed**, never a percent of an allocation.

**Identity is runtime state, not a constant.** The signed-in roster comes from
the `useIdentity` store (set on the login screen — see Feature 18), so
`MY_ROSTER_ID` is no longer the source of truth. Every "is this me?" check
reads `myRosterId` from `LeagueContext` / `useIdentity`; the constants above
remain only as this league's original-owner reference.

### Roster slots

QB · RB · RB · WR · WR · TE · FLEX × 3 (RB/WR/TE) · Superflex (QB/WR/RB/TE) · DEF
**13 bench** · 5 taxi · 2 IR — **24 active slots** in total.

**Read the cap from `leagueInfo.roster_positions`, never from prose.** This
line said 12 bench until 2026-09-06, when `getRosterLimits` was written against
the live payload and found 13. Taxi and IR sit *outside* the 24.

**Taxi rules (Sleeper settings):** only rookies can be *added*, but taxi
duration is **2 years** — a player may stay through their rookie and 2nd-year
seasons. Players entering their 3rd NFL season (`years_exp >= 2`) must be
activated before the regular season starts (taxi deadline: start of regular
season). Taxi action items flag `years_exp >= 2`, never 2nd-year players.

**No kicker in this league.**

**Exactly one defense is ever rostered.** There is one DEF slot, only one
defense can start in any week, and a defense carries no dynasty value
(FantasyCalc ranks zero of them) — so a second one is a wasted bench spot.
Owner doctrine, 2026-09-04. The app must therefore **never suggest adding a
defense as a pickup**: defenses appear only against the DEF slot (the
Optimizer's waiver drawer) or the DEF filter (League › Free Agents), never in
a general free-agent pool, never in `recommendFreeAgents`, and never with
dynasty-asset framing (no opportunity grade, no value card, no trade CTA).
The one question worth answering there is "is there a reason to replace the
one I have?" — and the measured answer is almost always no (see Feature 4's
free-agent layer).

3 FLEX spots means starting 5–6 RBs/WRs is common. RB and WR depth are
disproportionately valuable. Superflex makes elite QBs the single most
valuable dynasty asset despite 4-pt passing TDs.

-----


