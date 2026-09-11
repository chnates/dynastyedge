# Destination inventory

Every reachable view, measured from source (`src/App.jsx` routes, `SideDrawer.jsx`
`NAV_TREE`, `PlayerSearchSheet.jsx` `DESTINATIONS`, and all 25 `navigate(` call
sites plus `edgeBriefing.js`'s `action.to` set).

**Taps** = from `/edge`, the default route. The always-expanded drawer means
*every* destination is exactly 2 taps (hamburger → row). Depth is not the
problem; see finding A4.

| # | Destination | Route | Taps | In drawer | In search | Other entry points |
|---|---|---|---|---|---|---|
| 1 | The Edge | `/edge` | 0 | ✅ leaf | ✅ | default route |
| 2 | My Roster | `/my-team` | 2 | ✅ | ✅ | Edge hero value tap |
| 3 | Lineup Optimizer | `/my-team/lineup` | 2 | ✅ | ✅ | sub-tab only |
| 4 | Season Review | `/my-team/season-review` | 2 | ✅ | ✅ | **none** |
| 5 | Dynasty Trajectory (mine) | `/my-team/trajectory` | 2 | ✅ | ✅ | **none** |
| 6 | Trade Partners | `/trade` | 2 | ✅ | ✅ | Edge briefing (deadline ≤2wk); Action Items |
| 7 | Trade Analyzer | `/trade/analyze` | 2 | ✅ | ✅ | **7 inbound** — Partners, Targets, Movers, Profile drawer, Pick Trades, Action Items, Edge briefing |
| 8 | Trade Targets | `/trade/whats-fair` | 2 | ✅ | ✅ | Partners "See their targets →" |
| 9 | Manager Scouting | `/trade/managers` | 2 | ✅ | ✅ | **none** |
| 10 | Pick Trade Calculator | `/trade/pick-trades` | 2 | ✅ | ✅ | Partners footer button |
| 11 | League Overview | `/league` | 2 | ✅ | ✅ | Edge rank/window/pulse cells (×4) |
| 12 | Free Agents | `/league/free-agents` | 2 | ✅ | ✅ | Edge briefing (`pickup`, conditional) |
| 13 | League Activity | `/league/activity` | 2 | ✅ | ✅ | Edge "Full activity feed →" + briefing |
| 14 | Market Movers | `/league/movers` | 2 | ✅ | ✅ | Edge "All market movers →" |
| 15 | Playoff Odds | `/league/playoffs` | 2 | ✅ | ✅ | Edge briefing (in-season only) |
| 16 | Team drill-down | `/league/teams/:id` | 3 | ➖ param | ➖ | League Overview card; Edge briefing |
| 17 | Opponent trajectory | `/league/trajectory/:id` | 4 | ➖ param | ➖ | RosterView card; Edge briefing |
| 18 | Draft Board | `/draft/board` | 2 | ✅ | ✅ | Edge briefing (`pre_draft` only) |
| 19 | **Rookie Research** | `/draft/research` | 2 | ✅ | ❌ **missing** | **none** |
| 20 | Draft Tracker | `/draft/tracker` | 2 | ✅ | ✅ | Edge briefing (draft live/complete only) |
| 21 | News | `/news` | 2 | ✅ leaf | ✅ | Edge "All headlines →" |

**Non-routed surfaces** (contextual, correctly so): PlayerProfileDrawer ·
NewsArticleSheet · PlayerSearchSheet · RosterAnalysisSheet · FreeAgentDrawer ·
ManagerScoutingSheet · TradeBuilder add sheet.

## Reachable only through navigation itself

Four destinations have **zero** content-level inbound links — nothing anywhere
in the app points at them. You reach them by already knowing they exist:

- **Season Review** (#4) — "how many points did I leave on the bench?"
- **Dynasty Trajectory, mine** (#5) — the app's only forward-looking view. The
  *opponent* version is linked from `RosterView.jsx:124`; your own is not.
- **Manager Scouting** (#9) — multi-season behavioral profiles on all 9 owners.
- **Rookie Research** (#19) — and it is also missing from global search, so it
  is the one view in the app that **cannot be found by searching for it**.

Two more are seasonally orphaned: Draft Board and Draft Tracker have inbound
links only from Edge briefing items that fire on draft-season conditions
(`edgeBriefing.js:200,243,253`). Out of season they are drawer-only.

## Entry-point concentration

Of 25 `navigate(` call sites in the app, **7 point at the Trade Analyzer** and
4 at League Overview. Nine destinations share the remaining 14. The app links
richly to the two places you already know about and not at all to the four you
don't.
