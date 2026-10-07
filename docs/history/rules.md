# History — Rules Claude Code Must Always Follow

> **Verbatim text of this CLAUDE.md section as it stood at `8c25d03` (2026-10-07), before CLEANUP-2 slimmed it.**
> Nothing here was edited. The live rules, contracts and traps are in CLAUDE.md; this file keeps the
> measurements, dated rulings and narratives that explain them. When the two disagree, CLAUDE.md is current.

## Rules Claude Code Must Always Follow

1. **Read this entire file before writing any code in a new session.**
   Then, if the task is "what should I build next?" rather than a named change,
   read **`docs/open-items.md` §0** — the plan, in priority order, with the
   trigger that makes each item ready. An item there carrying a
   **`Kickoff prompt`** block is ready-to-run work the owner has already signed
   off; paste it into a fresh session. **Never start an item whose trigger has
   not fired** — doing it early is a bug, and OPEN-2 is the worked example
   (rolling the pick window before the draft ran broke the Draft Tracker during
   the one event it exists for).
1. **Player resolution:** Sleeper returns IDs. FantasyCalc returns names + sleeperId.
   Always join on `sleeperId`. Never guess player names from IDs.
1. **Pick ownership:** Derive from traded_picks endpoint only.
   Do not guess, assume, or hardcode pick ownership.
1. **FantasyCalc caching:** Fetch once at app load via `useFantasyCalc` hook.
   Store result in React state at the app level. Pass down as props or via context.
   Never fetch inside a component that renders repeatedly.
   Auto-refresh on tab focus when data is >30 min old — silently, keeping
   cached data on screen while the refetch runs (stale-while-revalidate).
   **Sign-in must never depend on FantasyCalc.** Identity selection (the
   `LoginScreen` team list) reads `useLeague`'s Sleeper-only `signInRosters`,
   so a FantasyCalc outage can't lock the user out of their own app.
1. **Fetch timeouts:** Every network call goes through `src/utils/fetchJSON.js`
   (AbortController timeout). Never call raw `fetch()` directly.
1. **Player DB:** `/players/nfl` is fetched once per session via `usePlayerDB`.
   All consumers (rookies, injury statuses, unranked names, lineup history,
   transaction feed) read from that single cache.
1. **Unranked players:** Rostered players with no FantasyCalc value (deep
   stashes, some rookies, DEFs) are still shown — name resolved from the
   player DB, value displayed as `—`, contributing 0 to roster totals.
   Never silently drop a rostered player from a roster view.
1. **Sleeper ID normalization:** Sleeper returns IDs as strings or numbers
   depending on endpoint. Normalize to `String(id)` at ingestion (useLeague
   does this); all lookups and joins use string IDs.
1. **FAAB display:** Always format as `$XXX` (e.g. `$142`, not `142`).
1. **Dynasty values display:** Whole numbers only on 0–10000 scale.
   Never show decimals for values.
1. **Trend arrows:**
- `trend30Day > 50` → ↑ green
- `trend30Day < -50` → ↓ red
- Between → → grey
1. **Offseason mode:** Always check `/state/nfl` on load.
   If `season_type !== 'regular'`, hide: current matchups, lineup optimizer,
   weekly projections. All other features remain fully functional.
1. **Win window tiers:** Top 3 = Contending, Bottom 3 = Rebuilding, Middle 4 = Middle.
   Recalculate whenever roster data refreshes.
1. **Mobile layout:** Every component must work at 390px width. Test mentally
   before considering it done. Nothing should require horizontal scrolling
   unless explicitly designed as a swipeable horizontal list.
1. **Safe areas:** The main scroll area and the side drawer must account for
   the iPhone home indicator and notch via `env(safe-area-inset-*)`.
   `<main>` extends to the physical bottom edge (`bottom: 0`) and carries the
   home-indicator clearance as `padding-bottom` *inside* the scroll container —
   never shorten `<main>` with a bottom offset; that clips content at a dead
   bar above the home indicator. **The bottom tab bar does not relax this rule —
   it sharpens it.** `<main>` keeps `bottom: 0` and reserves the bar's height in
   its own `paddingBottom`
   (`calc(TAB_BAR_HEIGHT + env(safe-area-inset-bottom))`); the bar is a separate
   fixed element at `bottom: 0` carrying the inset as *its* bottom padding. A
   bottom bar is precisely the change that tempts you to write `bottom: 4rem` on
   `<main>`, and that re-creates the dead black bar already fixed twice
   (`86903a7`, `e8cd044`) — `overflow:hidden` on a root element clips fixed
   descendants above the bottom inset on iOS. Headless Chromium cannot show that
   failure; only a real iPhone can, so get it right by construction. (The old
   "there is no bottom nav — do not add one" clause is dead: the owner reopened
   it for the September 2026 design review — see Navigation.)
1. **Standalone web app (Add to Home Screen):** `index.html` declares
   `apple-mobile-web-app-capable` + `manifest.webmanifest` (display
   standalone, icons 192/512) so iOS draws the app edge-to-edge instead of
   letterboxing it with black bars. The standalone status bar uses the
   **`apple-mobile-web-app-status-bar-style` meta set to `default`**: iOS
   draws an opaque status bar and **auto-contrasts the clock/battery text to
   the appearance** (black on a light appearance, white on dark), so the bar
   matches the header in both themes with no hand-drawn strip. The bar color
   comes from **two static `prefers-color-scheme` `theme-color` metas** (light
   `#E8E5DC`, dark `#141413` — each matching the header, i.e. `--bg-secondary`
   in that theme). **They moved with the Matchday repaint** (from `#E7E9EC` /
   `#101013`); any future change to a ground colour must move them again, or the
   iOS status bar stops matching the header. They must be static:
   a single JS-mutated `theme-color` gets cached at launch in standalone mode,
   which is what previously rendered a stuck black band (owner-directed change
   2026-07-20 — the earlier `black-translucent` + light-mode dark strip design
   was replaced because the strip read as a hard black bar in light mode). The
   app header is **opaque** (`bg-bg-secondary`, no translucency/backdrop-blur)
   and fills the safe-area region via `paddingTop: env(safe-area-inset-top)`,
   so the bar and header read as one surface with no `-webkit-backdrop-filter`
   hairline at the boundary. Caveat inherent to `default`/system-driven bars:
   if the in-app theme toggle disagrees with the phone's system appearance,
   the iOS bar follows the system, not the toggle. Changes to these metas only
   take effect after the user removes and re-adds the home-screen app.
   Icon link tags carry a `?v=N` query — bump it to bust Safari's per-site
   icon cache when the logo changes.
   **App code updates are handled separately** — the standalone app's HTML
   cache used to require the same remove-and-re-add; it no longer does. See
   **App version self-heal** under GitHub Pages Deployment.
1. **Bottom sheets:** The app's scroll container is `<main>` — the body never
   scrolls. Every bottom sheet (PlayerProfileDrawer, RosterAnalysisSheet,
   trade add sheet, and any future sheet) must: call `useScrollLock()` while
   mounted (prevents iOS scroll chaining to the page behind), set
   `overscroll-behavior: contain` on its scroll container, pad its bottom
   with `env(safe-area-inset-bottom)`, and wire `useSheetDrag(onClose)`
   (attach `sheetRef` to the sheet panel and `scrollRef` to its scroll
   container) so swipe-down dismisses the sheet. The drag only arms when
   the content is at scroll top — without it iOS rubber-bands the content
   and the sheet won't close. Never duplicate the gesture logic locally.
1. **Error states:** Every API call needs a loading state and an error state.
   Never show a blank screen. If an API call fails, show a message and a retry button.
1. **Theme toggle:** Stored in `localStorage` key `dynastyedge_theme`.
   Default to `dark` if no preference is stored. Apply theme class to `<html>` element.
   All theme logic lives in the `useTheme` hook — never duplicate it.
1. **localStorage / sessionStorage keys** (all prefixed `dynastyedge_`):
   `dynastyedge_identity_v1` (signed-in roster — see Feature 18) ·
   `dynastyedge_theme` (theme) · `dynastyedge_watchlist_v1` (starred players) ·
   `dynastyedge_action_dismissals` (roster action items) ·
   `dynastyedge_edge_last_visit` (The Edge's last-visit timestamp) ·
   `dynastyedge_draft_*` (manual draft tracker) ·
   `dynastyedge_board_order` / `dynastyedge_prospect_notes` /
   `dynastyedge_csv_rankings` (draft board — see Feature 10) ·
   sessionStorage `dynastyedge_league_sort` / `dynastyedge_league_pos` /
   `dynastyedge_league_tier` (League tab filters, preserved across drill-downs) ·
   sessionStorage `dynastyedge_trade_draft` (in-progress trade) ·
   sessionStorage `dynastyedge_targets_team` (Trade › Targets team filter) ·
   sessionStorage `dynastyedge_version_reload` (app-version reload loop guard).
   **Roster-scoped keys** — `dynastyedge_action_dismissals`,
   `dynastyedge_trade_draft`, and `dynastyedge_targets_team` — are wiped by
   `useIdentity` on any identity change; league-wide caches are not. Add a
   new key to that wipe list if it is tied to *which team you are*.
1. **Shared components:** `ErrorState`, `SectionHeader`, and `SectionContents`
   live in `src/components/shared/` — import them, never redefine them locally.
   Within-section navigation is always `SectionContents` (pass it a section key;
   it reads that section's views from `src/navigation.js`); never hand-roll a
   section nav row. Primary navigation is `TabBar`, which reads the same map.
   **Never add a destination to a component — add it to `src/navigation.js`**,
   the one place the tab bar, the contents rails, the Index and global search
   all read.
1. **Design System library:** All new UI comes from `src/components/ui`
   (`Button`, `IconButton`, `Card`, `Mark`, `PositionBand`, `Magnitude`,
   `RuledList`, `Row`, `Lede`, `NavRow`, `Sheet`/`SheetHeader`, `Modal`, `Chip`,
   `Badge`, `Input`/`SearchInput`, `Textarea`, `Select`, `cn`, plus the re-exported shared
   primitives) — import from the
   `'../ui'` barrel. Never reintroduce a hand-rolled button, card, bottom
   sheet, filter chip, badge, band, value figure, row list, or input inline;
   extend a primitive instead. Four Matchday laws bind here specifically:
   **colour is a
   field, never a left-edge rail** (that is what `Card`'s deleted `accent` prop
   was); **magnitude is type size, never a progress bar** (`Magnitude`); a
   `Mark` **never takes a position hue**; and **a block is a ruled row, a
   `Lede`, or a `NavRow` before it is a `Card`** (law 5 — a stack of identical
   bordered rectangles is the failure, and an enumeration built from `Lede`s is
   the same failure inverted). Run `/design-review` on the CONSUMERS
   before committing component work — not on `src/components/ui` while the
   primitives themselves are being edited.
   **Run its judgement pass, not only its nine greps.** On the step-4 diff the
   detectors passed 955 added lines clean while eleven hand-rolled copies of one
   row had drifted apart on `.focus-ring`. And **audit for the SHAPE, not the
   API**: `Card`'s banned accent rail was deleted in step 3, yet a raw
   `border-l-[3px]` survived every step-4 sweep because nothing looking for the
   prop could find the pattern.
1. **Lint gate:** `npm run lint` (ESLint 9 flat config: recommended +
   react-hooks rules at error severity, scoped to `src/` + `scripts/`) must
   exit 0 before any commit, alongside `npm test` and `npm run build`. CI
   enforces all three on every branch push (`ci.yml`) and before the build
   step of every `main` deploy (`deploy.yml`). Never fix a
   `react-hooks/exhaustive-deps` error by deleting the dependency array or
   blanket-disabling the rule — either add the dependency or
   disable-with-comment on the one line, stating why the value is stable.
1. **The app name is DynastyEdge.** Use it in the page `<title>`,
   the header, and any loading/splash screen.
1. **The MCP server (`mcp/`) imports `src/utils` — it never copies it, and
   `src/` never imports from `mcp/`.** A tool is orchestration only; any math
   it needs is written in `src/utils` so the app gets the same number. Every
   tool response carries an as-of stamp, is bounded (never a raw payload), and
   takes `leagueId` / `rosterId` as parameters rather than reading the
   constants. Rate-limit and retry logic lives in `mcp/limit.js`, never in
   `fetchJSON`. See **The MCP Server**.

-----


