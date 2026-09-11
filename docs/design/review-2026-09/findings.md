# DynastyEdge — UX/UI + IA review: findings

Each finding is tagged **[MEASURED]** (verifiable from source or a screenshot)
or **[JUDGMENT]** (my taste, argued but not proven). Ranked within each part by
cost to the owner, not by ease of fix.

---

## Part A — Information architecture

### A1. The sub-tab bar is a byte-identical second copy of the drawer. [MEASURED]
All 17 sub-tab entries across the four multi-view sections are the same
label→route pairs as the drawer's children:

| Section | Sub-tabs (`*Layout.jsx` `SUB_TABS`) | Drawer children (`SideDrawer.jsx` `NAV_TREE`) |
|---|---|---|
| My Team | My Roster · Lineup · Season Review · Trajectory | identical |
| Trade   | Partners · Analyzer · Targets · Managers · Pick Trades | identical |
| League  | Overview · Free Agents · Activity · Movers · Playoffs | identical |
| Draft   | Board · Research · Tracker | identical |

Evidence: `src/components/{roster/RosterLayout,trade/TradeLayout,league/LeagueLayout,draft/DraftLayout}.jsx`
vs `src/components/shared/SideDrawer.jsx:60-104`.

Consequence: the app pays for two navigation systems and the *same*
17 destinations are the payload of both. The drawer's one advantage over a
bottom bar — that it shows children — is spent duplicating a layer that is
already on screen once you arrive.

### A2. Rookie Research is missing from global search. [MEASURED]
`DESTINATIONS` in `src/components/shared/PlayerSearchSheet.jsx:27-46` has 18
entries covering every view **except `/draft/research`** (Feature 19). It is in
`NAV_TREE` and in the Draft sub-tabs, so it is reachable — but the app's one
global accelerant cannot find it. Typing "rookie" or "research" returns
nothing.

### A3. Five destinations have no entry point but navigation itself. [MEASURED]
Grepping every `navigate(` call in `src/` (25 total) plus `edgeBriefing.js`'s
`action.to` set, these views are never linked to from any content:

- `/trade/managers` — Manager Scouting. Zero inbound links. Drawer/sub-tab/search only.
- `/my-team/season-review` — Season Review. Zero inbound links.
- `/draft/research` — Rookie Research. Zero inbound links **and** not in search (A2).
- `/my-team/trajectory` — my own trajectory. The only `navigate` to a trajectory
  route is `RosterView.jsx:124` → `/league/trajectory/:rosterId`, i.e. an
  *opponent's*. Mine is drawer-only.
- `/draft/board`, `/draft/tracker` — linked only from Edge briefing items that
  fire on draft-season conditions (`edgeBriefing.js:200,243,253`). Out of
  season they are drawer-only.

### A4. Tap depth is flat at 2 — the cost is context, not taps. [MEASURED]
The always-expanded drawer puts every one of the ~21 destinations exactly 2
taps from The Edge (hamburger → destination). So "too deep" is the wrong
diagnosis. The real cost is that both taps go through a full-screen overlay
that hides the screen you were reading, and that the drawer is the *only*
map — nothing on any content screen tells you the other 20 views exist.

---

## Part B — Visual design

### B1. The current look lands on two of the three named AI-default aesthetics. [MEASURED against the skill's own calibration]
Anthropic's `frontend-design` skill names three clusters that AI-generated
design defaults to. DynastyEdge is simultaneously:
- **#2** "a near-black background with a single bright acid-green or vermilion
  accent" — `--bg-primary #0B0B0D` with a rationed `--brand #C8102E`.
- **#3** "hairline rules, zero border-radius" — `Card` is literally
  `rounded-none … border border-border-default`.

The Phase 3 brief arrived at the AI default *by following a design law*. That
is why compliance cannot fix it: the law specifies the generic outcome.

### B2. Extraordinary content is rendered at uniform weight. [MEASURED — screenshot]
`.screenshots/audit/myteam-dark.png`: 26 player rows, every one the same row
height, same type size, same layout. **Bo Nix (4,867) and Xavier Legette (365)
— a 13× value difference — are visually identical.** Value is encoded only as
a 4-digit number the eye must read and rank manually; there is no bar, size
ramp, weight ramp, or color ramp anywhere in the roster.

The owner's hypothesis is confirmed on this screen. (Still to test on
Playoffs / Analyzer.)

