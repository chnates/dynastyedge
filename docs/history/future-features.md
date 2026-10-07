# History — Future Features (Do Not Build Yet)

> **Verbatim text of this CLAUDE.md section as it stood at `8c25d03` (2026-10-07), before CLEANUP-2 slimmed it.**
> Nothing here was edited. The live rules, contracts and traps are in CLAUDE.md; this file keeps the
> measurements, dated rulings and narratives that explain them. When the two disagree, CLAUDE.md is current.

## Future Features (Do Not Build Yet)

> **"What's next?" is answered by `docs/open-items.md` §0**, which is titled
> "read this first" and carries the current plan in priority order. It is the
> living backlog of deferred work, each item with the trigger condition that
> makes it ready, and **an item carrying a `Kickoff prompt` block is
> ready-to-run work with the owner's sign-off already on it.**
> `docs/archive/build-plan-2026-09.md` was the active queue through 2026-09; **all four
> of its phases are now resolved** (1 shipped · 2 shipped-with-a-recorded-miss ·
> 3 partial, 3b/3c null · 4 cut), so it is archived history. Its still-cited
> §0/§8 standing rules now live in `open-items.md` §0, and Phase 4b–d's spec in
> its PHASE-4BCD entry.
> Read it before proposing next steps. Some items are **not** ready work and
> say so explicitly (rolling `PICK_YEARS` before the rookie draft runs actively
> breaks the Draft Tracker). The list below is the longer-horizon feature
> backlog; `open-items.md` is the near-term one.

These are noted so the codebase is structured to support them later.
Do not implement them until explicitly asked.

- Push notifications for trade offers (requires backend — out of scope for v1;
  note Sleeper's API is read-only and may not even expose *pending* trade
  offers, so this is blocked on data availability, not just architecture)

### Already built (formerly future features)

- Rookie draft board and ADP tracker → Draft section
- Injury-status player news → PlayerProfileDrawer + trade analysis
- Player intelligence panel (production, depth chart, peak window, ESPN news)
  → PlayerProfileDrawer + trade Live Intelligence (`usePlayerIntel`)
- League transaction feed with FAAB bids → League › Activity
- Market movers / buy-low / sell-high → League › Movers
- Watchlist (star players, surfaced in Trade Partners) → `useWatchlist`
- Lineup efficiency season review → Squad › Season Review
- Playoff odds / rest-of-season simulator (engine + page) → League › Playoffs
  (Feature 14); strength-of-schedule outlook is subsumed by it. Odds feed
  Trade Analyzer Layer 3, Trade Partner Finder (buyer/seller flags), and The
  Edge (briefing item)
- League-wide news feed page → News section (Feature 15)
- FAAB bid recommender → League › Free Agents (beside each Recommended
  Pickup) and the MCP server's `recommend_free_agents`, from one util,
  `utils/faabBid.js` (OPEN-3, shipped 2026-10-07; see the recommendation
  engine). Graded at Weeks 13–15 against the bars pre-registered in
  `docs/analysis/faab-bid-corpus-2026-08.md` §10
- Claude Design visual refresh → the "Primetime Blackout" rebrand
  (Navigation Refactor Phase 3, shipped 2026-07-20) — see Design System

