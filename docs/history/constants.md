# History — Constants File

> **Verbatim text of this CLAUDE.md section as it stood at `8c25d03` (2026-10-07), before CLEANUP-2 slimmed it.**
> Nothing here was edited. The live rules, contracts and traps are in CLAUDE.md; this file keeps the
> measurements, dated rulings and narratives that explain them. When the two disagree, CLAUDE.md is current.

## Constants File

`src/constants.js` — never hardcode these values anywhere else:

```js
export const LEAGUE_ID = '1313933520715907072'

// Identity is runtime state, not a constant — the signed-in roster comes from
// the `useIdentity` store (see Feature 18). These remain only as the league's
// original-owner reference; nothing reads them as the source of truth.
export const MY_ROSTER_ID = 6
export const MY_USERNAME = 'chnates'
export const MY_TEAM_NAME = 'Nix Cage'

export const SLEEPER_BASE = 'https://api.sleeper.app/v1'
// The NFL schedule is the ONE Sleeper endpoint NOT under /v1 (that path 404s
// for every season). Fields are `home`/`away`, not `home_team`/`away_team`.
export const SLEEPER_ROOT = 'https://api.sleeper.app'
export const FANTASYCALC_BASE = 'https://api.fantasycalc.com'
// Unofficial ESPN API — no auth; per-player news only, degrades silently
export const ESPN_BASE = 'https://site.api.espn.com'
export const ESPN_WEB_BASE = 'https://site.web.api.espn.com'

// Static feeds published by GitHub Actions to their data branches
export const NEWS_FEED_URL      = '…/dynastyedge/news-data/news.json'
export const VALUES_HISTORY_URL = '…/dynastyedge/values-history/values-history.json'
export const TRADE_VALUES_URL   = '…/dynastyedge/values-history/trade-values.json'
export const ROOKIE_INTEL_URL   = '…/dynastyedge/rookie-intel/rookie-intel.json'

export const FANTASYCALC_PARAMS = {
  isDynasty: true,
  numQbs: 2,       // Superflex
  numTeams: 10,
  ppr: 0.5,        // Half PPR
}

// SEED ONLY — the live window is derived per load (see the note below).
export const PICK_YEARS = ['2026', '2027', '2028']
export const POSITIONS = ['QB', 'RB', 'WR', 'TE']

// Ordered roster slots — indices match Sleeper's `starters` array positions.
// The shared slot-fill engine (utils/lineupBuild.js) reads this.
export const ROSTER_SLOTS = [ /* QB · RB×2 · WR×2 · TE · FLEX×3 · SFLX · DEF */ ]
```

(The four feed URLs are elided above for width — they are full
`raw.githubusercontent.com/chnates/…` URLs in the real file.)

**`PICK_YEARS` is a SEED, not the source of truth.** The live three-season pick
window is derived per load by **`utils/seasonWindow.js`** and reaches the app as
**`pickYears` on `LeagueContext`**; every pick surface reads that, and the
constant is only what renders in the moment before `/state/nfl` resolves.

`resolvePickYears(nflState, drafts, seed)` asks one question — **has this
season's rookie draft been held?** The window starts at the current NFL season
until that season's non-auction draft reports `status: "complete"`, then at the
next one, plus the two seasons after it. Both inputs are already in the
`useSleeper` payload, so this costs **no extra request**. It degrades to the
seed when NFL state hasn't landed (never an empty window — every pick surface
is built from it).

**Why it stopped being a hand-rolled constant (2026-09-07).** The moment a
rookie draft completes, **FantasyCalc retires that season's pick entries** —
verified live the day this shipped: three days after the 2026 draft, all 24 of
its pick entries were 2027/2028/2029. So a stale window is not cosmetic. It
generated **40 spent picks across the league, every one priced at 0**, which
cluttered the Trade Analyzer's add sheet, roster pick badges and TeamCard grids;
and it left the newly tradable **2029** picks — four per team, priced by
FantasyCalc at 1,933 for a 1st — invisible to every surface in the app.
Measured on the live league at the fix: 120 picks, **0 priced at 0**, against
40 of 120 before.

Two things the roll must not break, both pinned by tests:

- **Year weights follow the WINDOW, not the calendar.** Feature 2's pick-capital
  score weights the nearest draft 3× / next 2× / third 1×. Keyed by literal year
  (`{ '2026': 3, … }`, as it was) the newly surfaced third season silently
  scores **0** the first time the window rolls.
- **The Draft Tracker keeps its recap.** `selectTrackedDraft` follows the
  upcoming draft whenever Sleeper has one — its whole purpose on draft day —
  and otherwise falls back to the **most recent completed** draft, so its recap
  stays on screen through the ~10 months before the league creates next year's
  board instead of collapsing to an empty "no draft yet" placeholder.
  `useSleeperDraft` therefore exports `FALLBACK_DRAFT_SEASON` (a seed), not the
  old `DRAFT_SEASON` constant, and the Tracker reads the season off the draft it
  is actually showing. **Trade › Pick Trades reads `pickYears[0]` instead** — it
  trades the *next* draft's picks — and refuses to borrow a draft board from a
  different season, so last draft's slots can never be stamped onto next
  draft's picks.

-----


