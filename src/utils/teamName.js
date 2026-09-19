// teamName.js — the one definition of a team's display name.
//
// Lives in utils, not hooks, because src/utils must stay React-free: the
// analysis layer runs under plain Node (tests, the model harness, the MCP
// server), and `recommendations.js` / `edgeBriefing.js` both name a team in
// their output. Importing this from `../hooks/useLeague` dragged React — and
// `useIdentity`'s module-scope localStorage read — into the analysis graph.
//
// `useLeague.js` re-exports it so the 22 components that import it from there
// keep working unchanged.

function toTitleCase(str) {
  return str.replace(/\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}

// A Sleeper user's team name, in the app's house casing. Falls back through
// the three fields Sleeper may populate, then to a stable placeholder — never
// undefined, because this feeds headlines and pitch copy.
export function getTeamName(user) {
  const raw = user?.metadata?.team_name || user?.display_name || user?.username || 'Unknown Team'
  return toTitleCase(raw)
}
