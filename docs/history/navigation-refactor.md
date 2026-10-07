# History — Navigation Refactor (Planned — phased, not yet built)

> **Verbatim text of this CLAUDE.md section as it stood at `8c25d03` (2026-10-07), before CLEANUP-2 slimmed it.**
> Nothing here was edited. The live rules, contracts and traps are in CLAUDE.md; this file keeps the
> measurements, dated rulings and narratives that explain them. When the two disagree, CLAUDE.md is current.

## Navigation Refactor (Planned — phased, not yet built)

> **SUPERSEDED IN PART, 2026-09-11 (DESIGN-3 — the navigation rebuild).**
> Phase 2's central decision — *"the drawer stays; rebuild it as an
> always-expanded hierarchical map"* — was reopened by the owner for the
> September 2026 design review and **reversed**. The drawer's `NAV_TREE` is
> gone, primary navigation is a bottom tab bar, and the sub-tab layer it
> duplicated is a contents rail. What survives, and it is the load-bearing
> half: the **information architecture** this refactor established (My Team =
> my squad · Trade = only things that help build a trade · League = everyone
> else), every route it created, and every redirect it added. Only the
> *mechanism* changed. The live design is the **Navigation** section above;
> this section stays as the historical spec/record.
>
> **Status:** Phase 1 complete. **Done:** step 1 — Overview + All Teams fused
> (`AllTeamsView` + its Roster tab gone; `/roster/teams` → `/league`; the
> `/roster/teams/:rosterId` drill-down stays). step 2 — "My Team" stood up as a
> grouped section (My Roster · Lineup · Season Review · Trajectory sibling
> sub-tabs); standalone Lineup section dissolved (`LineupLayout` gone, `/lineup*`
> redirects into My Team); Free Agents moved to League. All still served from
> `/roster/*` + `/league/*` paths. **Phase 2 complete** — the `/roster` →
> `/my-team` URL rename + full redirect set; Pick Trades moved to
> `/trade/pick-trades` (Draft → Trade); scouting drill-downs are standalone
> `/league/teams/:id` + `/league/trajectory/:id` routes (header "League"); the
> `SideDrawer` is now the always-expanded hierarchical map; and global search
> jumps to sections/features as well as players. **Phase 3 complete
> (2026-07-20)** — the "Primetime Blackout" visual refresh (owner-approved
> direction 2026-07-19, spec: `docs/archive/design/phase3-design-brief.md` + reference
> render) executed in the brief's six steps: token pass, primitive pass, red
> score-bug heroes, per-section sweeps, red/silver logo re-cut, docs. The
> **Design System section below is the live post-refresh truth** and matches
> the brief — but its *direction* was superseded 2026-09-11 (see the status
> block on that section; the refresh shipped, the look was rejected on review). Both drawer watch-items were handled in the primitive pass
> (Anton parents, 2px rails). The refactor is done — this section stays as
> the historical spec/record.

**Why:** the app grew to 17 features behind a 7-label drawer that hides ~21
real destinations one level down. Sub-tabs only render *after* you've entered a
section, so substantial features (Trajectory, Managers, Pick Trades, Movers,
Playoffs) are invisible from the only map the app has. The felt problems:
every non-home view is 2–3 taps behind a context-wiping overlay; you can't tell
where a feature lives; and two workflows are split across sections (the trade
workflow, and duplicated team-list views).

**The drawer stays — no bottom nav.** The fix is making the drawer a complete,
legible map and regrouping the IA around jobs-to-be-done, not replacing the
paradigm. The *visual* refresh is explicitly a separate, later job (Phase 3) —
it repaints the settled structure; it does not restructure.

### Target information architecture

|Group     |Sub-views                                                   |
|----------|------------------------------------------------------------|
|The Edge  |*(home — leaf)*                                             |
|My Team   |My Roster · Lineup · Season Review · Trajectory             |
|Trade     |Partners · Analyzer · Targets · Managers · Pick Trades      |
|League    |Overview *(fused with All Teams)* · Free Agents · Activity · Movers · Playoffs|
|Draft     |Board · Research · Tracker                                 |
|News      |*(feed — leaf)*                                            |

Principle: **My Team = my squad · Trade = only things that help build a trade ·
League = everyone else / the market.** Moves vs. today: Lineup + Trajectory →
My Team; Pick Trades → Trade; All Teams (fused into Overview) + Free Agents +
Movers → League. Movers stays *out* of Trade deliberately — it's market intel,
not a trade-builder (its per-row "Trade" deep-link into the Analyzer is a
cross-link, not a reason to rehouse it).

### Phase 1 — Consolidation (feature work; small, independently verifiable steps)

- **Fuse Overview + All Teams into one League view.** They're redundant today
  (both list all 10 teams, both drill into the same roster view). Collapse into
  a single team list + drill-down living under League. Remove the All Teams tab
  from Roster.
- **Stand up "My Team" as a grouped section** with My Roster · Lineup · Season
  Review · Trajectory as **sibling sub-tabs** — *not* a fused screen. (Roster
  and the weekly Optimizer are different jobs; the Optimizer is offseason-hidden
  and would break a shared scroll.) The standalone Lineup section disappears as
  its views land here.

These two steps inherently *begin* the regroup (removing All Teams from Roster,
removing the Lineup section), so Phase 1 and Phase 2 are intentionally
entangled — land the heavier feature work first, in isolation, before the
mechanical nav rewrite.

### Phase 2 — Navigation (mechanical)

- **Rebuild `SideDrawer` as an always-expanded hierarchical map.** Pattern:
  docs-sidebar / IDE-tree, *not* Material subheader+divider (parents here are
  themselves destinations).
  - **Parent row** = group anchor *and* destination: section icon in its
    identity color + label, tappable → section default view.
  - **Children** indented beneath, text-aligned past the icon, tied to the
    parent by a thin vertical guide rail in the section color; no per-child
    icons; muted until active. Active child keeps the full color + tinted
    background + edge bar already in use.
  - Leaf sections (The Edge, News) render as plain single rows — no children,
    no rail. Whitespace separates groups (no heavy dividers).
- **Route redirects for everything that moved/renamed** — same pattern as the
  existing `/league/managers` → `/trade/managers` redirect — so saved
  deep-links and The Edge's briefing/deep-link items keep working. (Notably:
  old `/roster*`, `/roster/teams/:id`, `/roster/free-agents`,
  `/roster/trajectory/:id`, `/lineup*`, `/draft/trades` all get redirects to
  their new homes. Movers stays in League, so `/league/movers` is unchanged.)
- **Extend the header search sheet to jump to sections/features** by name
  (start with feature/section names only — no verb/keyword synonym map yet).
  Reuses `PlayerSearchSheet`'s sheet contract; results list features above/below
  player matches.

### Phase 3 — Design refresh (separate, later)

The "Claude Design visual refresh" already listed under Future Features. It
repaints the now-correct structure — kept out of Phases 1–2 so we don't
restructure and restyle at once (and don't do the migration twice).

**Watch-items carried over from Phases 1–2** (structural decisions deferred to
the visual pass — surface these when doing the refresh):

- **Sub-tab bar crowding at 390px — RESOLVED (UX audit).** The hand-rolled
  `flex-1` sub-tab rows wrapped long two-word labels ("Season Review", "Free
  Agents", "Pick Trades") onto a second line, making one cell taller than its
  neighbors. Replaced by the shared `SubTabBar` (`components/shared/`; itself
  since replaced by `SectionContents` — see Navigation): an
  adaptive `flex-1 min-w-max` strip that fills the width when tabs fit and
  scrolls horizontally when they don't, never wraps, scrolls the active tab
  into view, and shows a right-edge fade only while overflowing. All four
  multi-view sections (My Team · Trade · League · Draft) use it. The Phase 3
  visual pass can still restyle it (icon+label, etc.), but the structural rough
  edge is gone.
- **Always-expanded drawer length — RESOLVED (Phase 3 primitive pass).** The
  hierarchical drawer shows all ~18 destinations at once. The visual pass made
  the hierarchy read instantly: parent rows in Anton uppercase (clear type
  scale vs. Archivo children), guide rails thickened to 2px, verified at
  390px in both themes.

### Doc upkeep during the refactor

As **each phase lands**, update: the live **Navigation** section (table + the
sub-tab/section notes), the **Features** entries whose location changed
(Feature 1 Roster, Feature 4 Lineup, Feature 5 League Overview, Feature 7
Movers, Feature 9 Season Review, Feature 13 Pick Trades, Feature 17
Trajectory), the **File Structure** if components move, and this section's
status line. The component files may keep their existing folders (as Manager
Scouting did) — note any route-only moves explicitly.

-----


