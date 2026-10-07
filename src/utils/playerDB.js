// THE trim of Sleeper's full player DB (/players/nfl, ~5–8MB raw) — the one
// list of fields the app (usePlayerDB) and the MCP server (mcp/snapshot.js)
// keep. Until 2026-10-07 each kept its own list and they had drifted: the app
// lacked the injury detail, the server the depth-chart fields
// (CODE-REVIEW-1 #9). A consumer that needs another field adds it HERE —
// never a second fetch of /players/nfl (rule 6). Pure.

export function trimPlayerRow(p) {
  return {
    name: [p.first_name, p.last_name].filter(Boolean).join(' ') || null,
    position: p.position ?? null,
    team: p.team || '',
    age: p.age ?? null,
    years_exp: p.years_exp ?? null,
    injury_status: p.injury_status ?? null,
    // The detail behind the status — "Out — Knee - ACL, surgery" rather than a
    // bare label (the player card, the trade cards, the MCP injury fields).
    injury_body_part: p.injury_body_part ?? null,
    injury_notes: p.injury_notes || null,
    // ESPN's athlete id: the secondary join into the news feed.
    espn_id: p.espn_id ?? null,
    // Depth room and news freshness (the player drawer).
    depth_chart_position: p.depth_chart_position ?? null,
    depth_chart_order: p.depth_chart_order ?? null,
    news_updated: p.news_updated ?? null,
  }
}

export function trimPlayerDB(data) {
  const meta = {}
  Object.entries(data ?? {}).forEach(([id, p]) => { meta[id] = trimPlayerRow(p ?? {}) })
  return meta
}
