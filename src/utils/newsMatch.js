// THE news-feed matcher — how a feed item is tied to a player — for every app
// surface that reads news.json: the player drawer (usePlayerIntel), The Edge's
// Headlines (useLeagueNews) and the News section (useNewsFeed). Until
// 2026-10-07 each wrote its own copy (CODE-REVIEW-1 #10); CLAUDE.md even listed
// all three by name. The feed script (scripts/fetch-news.mjs) shares
// `normalizeName`, so the client normalises names exactly as the feed did.
//
// The order is the contract (CLAUDE.md, "playerIds is the join"):
//   1. `playerIds` — the feed's own server-side resolution, and the only join
//      that reaches most rostered players (espn_id is null for most of them);
//   2. `athleteIds` — ESPN ids, via the player DB's espn_id;
//   3. a normalized FULL name in the headline, longest first, so a more
//      specific name wins and short fragments never match.
// The MCP server's matcher (mcp/news.js) is deliberately different: no
// headline fallback at all (the two DJ Moores). Pure.

export function normalizeName(s) {
  return (s ?? '').toLowerCase().replace(/[.'’-]/g, '').replace(/\s+/g, ' ').trim()
}

// A name usable for a headline match, or null — full names only.
export function headlineName(name) {
  const n = normalizeName(name)
  return n.length >= 6 && n.includes(' ') ? n : null
}

function espnOf(espnId) {
  const n = espnId != null ? Number(espnId) : null
  return n != null && !Number.isNaN(n) ? n : null
}

// Index a set of players for matching. `playerDB` supplies espn_id; an explicit
// `espnId` on a player wins (the drawer passes one).
export function buildNewsIndex(players, playerDB) {
  const bySleeper = new Map()
  const byEspn = new Map()
  const byName = []
  ;(players ?? []).forEach(p => {
    if (!p) return
    const sid = String(p.sleeperId)
    bySleeper.set(sid, p)
    const espn = espnOf(p.espnId ?? playerDB?.[sid]?.espn_id)
    if (espn != null && !byEspn.has(espn)) byEspn.set(espn, p)
    const n = headlineName(p.name)
    if (n) byName.push({ n, player: p })
  })
  byName.sort((a, b) => b.n.length - a.n.length)
  return { bySleeper, byEspn, byName }
}

// The player an item is about, by the contract order above, or null.
export function resolveItemPlayer(item, index) {
  if (!item || !index) return null
  for (const id of item.playerIds ?? []) {
    const hit = index.bySleeper.get(String(id))
    if (hit) return hit
  }
  for (const id of item.athleteIds ?? []) {
    const hit = index.byEspn.get(Number(id))
    if (hit) return hit
  }
  const headline = normalizeName(item.headline)
  return index.byName.find(({ n }) => headline.includes(n))?.player ?? null
}

// The item fields every news surface renders.
export function feedItemView(item) {
  return {
    headline: item.headline,
    story: item.story ?? '',
    published: item.published ?? null,
    source: item.source ?? null,
    link: item.link ?? null,
    athleteIds: item.athleteIds ?? [],
    playerIds: item.playerIds ?? [],
  }
}

export const byNewestFirst = (a, b) => new Date(b.published ?? 0) - new Date(a.published ?? 0)
