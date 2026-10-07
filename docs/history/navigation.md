# History — Navigation

> **Verbatim text of this CLAUDE.md section as it stood at `8c25d03` (2026-10-07), before CLEANUP-2 slimmed it.**
> Nothing here was edited. The live rules, contracts and traps are in CLAUDE.md; this file keeps the
> measurements, dated rulings and narratives that explain them. When the two disagree, CLAUDE.md is current.

## Navigation

**The app is gated by sign-in** (Feature 18): until an identity is set, `App`
renders `LoginScreen` instead of the router — no route is reachable, and the
drawer's footer carries the "Switch team" / "Sign out" affordance.

**Navigation is a BOTTOM TAB BAR** (`components/shared/TabBar.jsx`) — four
weekly sections plus the Index. The old rule in this section said "There is NO
bottom tab bar … do not add a bottom nav"; the owner reopened it for the
September 2026 design review and it is **dead** (DESIGN-3, 2026-09-11). What
replaced it and why:

- The drawer was the app's **only map**, and it hid all 21 destinations behind a
  top-left tap on a one-handed 390px phone. NN/g measures hidden navigation at a
  **20%+ discoverability drop**, used in **57% of cases against 86%**, and
  **15% slower** on mobile. Four weekly sections fit the 2–5 visible tabs
  Apple's HIG and the iOS 26 tab bar assume.
- Both taps also went through a **full-screen overlay that hid the screen you
  were reading** — the thing that felt like "context-wiping". A bar doesn't.

**Navigation is TEXT.** No icon set anywhere in the bar or the Index — a
thin-line icon set is a named AI-slop marker and Matchday's house rules make
navigation typographic. The bar is an **ink field** — the same material as the
hero poster, the section band, the active chip and the CTA — and it inverts with
the theme by construction (`bg-text-primary` / `text-bg-primary`): a cream slab
in dark, an ink one in light. **Inverted in BOTH themes is the owner's call**
(2026-09-11), made when asked directly whether a cream slab pinned to the bottom
of every screen reads badly at night; the alternatives offered were inverting
only in light mode, or never. It carries no top border — the inversion is the
separation. Inactive tabs sit at 55% opacity; the active one is full opacity
with a 2px marker in the bar's own ink. Red is NOT spent here — it stays
rationed to "you" accents and the contents rail's active item.

**Two sections lost their top-level rank, not their reachability.** Draft is
three seasonal views and News is a browse that already surfaces its best items
on The Edge; a third of top-level navigation was being spent on things you
don't open in a normal week. Both keep every route and every existing entry
point, and both are on the Index — which is also the tab that reads as current
while you are in one.

|#  |Tab   |Route    |Feature name|Views                                       |
|---|------|---------|-----------|---------------------------------------------|
|1  |Today |`/edge`  |The Edge   |Daily briefing home screen (default route)   |
|2  |Squad |`/my-team`|My Team   |My Roster · Lineup · Season Review · Trajectory|
|3  |Trade |`/trade` |Trade      |Partners · Analyzer · Targets · Managers · Picks (+ deadline banner)|
|4  |League|`/league`|League     |Overview · Free Agents · Activity · Movers · Playoffs|
|5  |Index |`/index` |—          |The complete map — every section, plus the four consulted views|

**The nav labels and the feature names are deliberately different.** "The Edge"
and "My Team" are what the *features* are called throughout this document and
in the product; **Today** and **Squad** are what *navigation* calls them, in
Matchday's voice. **"Picks" joined them 2026-09-13** — the feature is still the
**Pick Trade Calculator** at `/trade/pick-trades` (Feature 13), and global
search still finds it by that name via `searchLabel`; only the rail's label
shortened, so the Trade rail fits on one line. Routes are unchanged (`/edge`, `/my-team`), so no deep-link,
briefing item or redirect is affected. The app header names the section using
the nav label, read from the same map, so the header and the bar can never
disagree.

**The Index (`/index`)** is the fifth tab and a real destination, not an
overlay: a Find row that opens the same `PlayerSearchSheet` the header icon
does, then every section with its views listed, then a **"Consulted, not
daily"** group holding Season Review, Dynasty Trajectory, Manager Scouting and
Rookie Research. Those four had **zero content-level inbound links** before
this — you reached them only by already knowing they existed. They are listed
here *as well as* in their own section's contents rail, and each now also has a
content-level link from the screen that raises the question it answers.

**Within a section, views are a contents rail** — `SectionContents`
(`src/components/shared/SectionContents.jsx`), never a hand-rolled row. It
replaced `SubTabBar`, and the two differences are the point:

1. **It is no longer a duplicate.** All 17 of the old bar's entries were
   byte-identical label→route pairs with the drawer's children — two navigation
   systems over one payload. The drawer now carries no destinations at all, so
   this is the only place a section's views are listed on a content screen.
2. **It WRAPS instead of scrolling.** The old bar was `overflow-x-auto` with a
   right fade, which put "Pick Trades" — a real destination — off-screen at
   390px until you scrolled a nav bar sideways. A wrapping, left-aligned line
   cannot hide an entry. Items are not `flex-1`, which is what made the old row
   wrap *badly* before it was converted to clipping. Each item is a real 44px
   touch target; `.tap-target` is deliberately not used, because on a row that
   wraps its oversized hit area would let vertically adjacent items steal each
   other's taps — the same reason `index.css` keeps it off `Chip`.
3. **It fits on ONE line in every section, and it still wraps if it ever
   can't** (2026-09-13). It was spending a second 44px row on **three of the
   four** multi-view sections — Squad, Trade *and* League, i.e. ~16 of the
   app's 18 content routes — putting **140px** of fixed chrome (50px masthead +
   90px rail) above the content on an 844px screen. Three changes bring every
   section to **96px**: the gap (16px → 10px), the tracking
   (0.08em → 0.055em), and shortening the two labels that were over on their
   own — **"Pick Trades" → "Picks"** and **"Free Agents" → "FA"**.
   - **`flex-nowrap` is NOT the mechanism and was reverted.** A first cut used
     it and appeared to fit all three; nowrap does not *fit* an over-long rail,
     it **hides** the overflow — reintroducing the exact A4 failure this
     component was built to fix. Switching back to `flex-wrap` is what exposed
     that League had never actually fitted. **A layout that "fits" under nowrap
     has not been measured, it has been silenced.**
   - **Measured headroom at 390px** (358px available inside the gutter), so the
     next person adding a view knows the budget: **Squad 344** (14 spare) ·
     **Trade 352** (6 spare) · **League 306** (52 spare) · **Draft 196**
     (162 spare). The numbers live in the component too. **Trade is the tight
     one** — a sixth view there, or a longer label on any of its five, puts it
     back on two rows, which is the honest failure mode `flex-wrap` preserves.
   - **`railLabel` is the shortening mechanism, and it is rail-only.** "FREE
     AGENTS" was 90px, the widest label in the app, and League was over by
     exactly 21px — no tightening closes that while staying legible. But
     `label` also feeds the **Index**, whose whole job is discoverability, and
     "Overview · FA · Activity · Movers · Playoffs" is a worse map. So
     `SectionContents` reads `railLabel ?? label` and **only the rail
     shortens**; the Index and global search still say "Free Agents". Same
     precedent as `searchLabel` — one consumer with a different constraint gets
     its own string, rather than every consumer inheriting the tightest one.
     Add a `railLabel` only when a section is measurably over budget.
   - **`FA` is not a coinage** — it is already this app's own vocabulary:
     League › Activity's filter chips read *All / Trades / Waivers / FA / My
     Moves*.

**Every navigable destination lives in ONE place: `src/navigation.js`.** The
tab bar, the contents rails, the Index and global search all read from it, so a
destination can only be added or moved once. It used to exist three times — the
drawer's `NAV_TREE`, four per-section `SUB_TABS` arrays, and
`PlayerSearchSheet`'s `DESTINATIONS` — which is how Rookie Research ended up as
the one view in the app that could not be found by searching for its own name.

**The side drawer survives with ZERO destinations.** The hamburger (top-left)
now opens the app's **utility surface**: manual Refresh, the per-source
data-status block, the running build, the theme toggle and Switch team / Sign
out. Deleting its nav tree also deleted a standing rule violation — it had been
assigning Trade `text-success` and League `text-warning`, the same status
tokens used for real success/error state in the same file, so a green TRADE
above an amber LEAGUE read as "good / caution" before it read as navigation.
**Status colours and navigation identity are separate and exclusive**; nothing
in navigation may wear a status token.

**Data status — five rows** (Rosters · Values · News · History · Rookies), each showing
the app-side "last refreshed" age of that source. **News carries a second,
indented line** — the retained window's depth and how many players it reaches,
amber when depth falls under 48h. Publish age surfaces a *dead* pipeline; that
line surfaces a *degraded* one (see the `coverage` block). The three Actions-published
feeds (News, History, Rookies) additionally show their **publish age** from the feed's
own `updatedAt` — labelled separately, because that's the number that only
moves when the cron publishes, and it's how a dead pipeline becomes visible.
Amber when news > 2h or values > 36h stale; a feed age hides entirely when
that feed never loaded (standard best-effort contract — never an error).
Reads the session caches via `loadNewsFeed` / `loadHistory` on drawer open —
zero extra requests.

An **"Update available — Reload"** row appears above Refresh only when the
running bundle is behind the deployed one (see App version self-heal). Cold
starts fix themselves silently, so this row is the mid-session case.

An **"App build"** row closes the block, below a hairline: the **build number**
the running bundle was compiled from (`__BUILD_ID__`), with a leading dot and a
suffix carrying what the last version check established — green **· up to
date** (server agrees), amber **· update ready** (it does not), or nothing at
all. The number is a first-parent commit count that advances by exactly one per
merge to main (PR #32 shipped build 131), so "am I on 132?" is answerable
against the repo in a way a timestamp never was.
**"Nothing" is the honest state and is never dressed up as reassurance:** the
dev server emits no `version.json` and a failed check proves nothing, so both
show the stamp alone. This exists because the self-heal is otherwise invisible
— it reloads a stale bundle silently, so the failure it protects against
leaves no trace, and after a deploy there was no way to confirm the phone had
actually picked it up.

**Refresh** is one button over five independent sources fired in parallel and
non-blocking: a `phase` state drives the button (idle → refreshing → done)
while each source tracks its own loading/done/error tick. Live APIs keep
cached data on screen while refetching (stale-while-revalidate), so no view
blanks.
The app header shows the active section name.

**Route map (post-refactor).** My-squad views live under `/my-team`
(`/my-team` = My Roster, `/my-team/lineup`, `/my-team/season-review`,
`/my-team/trajectory`). The market / everyone-else views live under `/league`
(`/league` = Overview, `/league/free-agents`, `/league/activity`,
`/league/movers`, `/league/playoffs`). Team **scouting drill-downs** are
standalone routes (no contents rail; header reads "League"):
`/league/teams/:rosterId` (any roster) and `/league/trajectory/:rosterId` (any
team's trajectory). Trade adds `/trade/pick-trades`; Draft is just
`/draft/board` + `/draft/research` + `/draft/tracker`. Every moved/renamed path keeps a redirect
(see Navigation Refactor below) so saved deep-links and Edge briefing items
keep working: `/roster*` → `/my-team*` (or `/league*` for the team list /
drill-downs / free agents), `/lineup*` → `/my-team/*`, `/draft/trades` →
`/trade/pick-trades`, `/league/managers` → `/trade/managers`.
**The navigation rebuild (DESIGN-3) moved NO path** — it added `/index` and
renamed labels only — so it needed no redirect of its own. That is deliberate:
`edgeBriefing.js` deep-links by path (`action.to`), so a missed redirect
silently breaks the home screen, and the cheapest way not to miss one is not to
move anything.

**Global search** lives in the fixed app header (search icon, top-right, on
every screen) — opens `PlayerSearchSheet`, a bottom sheet that searches the
cached FantasyCalc dataset by name (opening the matched player's
`PlayerProfileDrawer`) *and* matches section/feature names, surfacing a
"Jump to" group that deep-links to any view. Its destination list is read from
`src/navigation.js`, not hand-maintained, and its rows carry **no section
colour dot** — a section swatch would collide with the position hues, which are
load-bearing everywhere else. See Feature 16.

**Manager Scouting moved from League to Trade** (it's trade intel — "who do I
call?"). The old `/league/managers` path redirects to `/trade/managers` so saved
deep-links and briefing items keep working. The component files still live in
`src/components/league/` (`ManagersView.jsx`, `ManagerScoutingSheet.jsx`) — only
the route changed.

-----


