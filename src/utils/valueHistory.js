// valueHistory.js — pure constants for the daily value-snapshot feed.
//
// Lives in utils, not hooks, for the same reason as teamName.js: importing
// this threshold from `../hooks/useValueHistory` pulled React into
// `edgeBriefing.js`'s graph, which is the analysis layer the MCP server and
// the offline model harness import under plain Node.
//
// `useValueHistory.js` re-exports it, so nothing else changed.

// Minimum snapshots before a sparkline is worth drawing. With fewer, the
// "graph" is just a straight segment (the pipeline adds one point per day
// from the day it shipped) — hide it until it has real shape. Shared by
// `getSeries` and by `buildTeamValueSeries` on The Edge, so the per-player
// line and the team line appear on the same day.
export const MIN_SPARKLINE_POINTS = 4
