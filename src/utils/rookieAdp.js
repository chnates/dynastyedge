// Rookie ADP derivation.
//
// Also THE rookie-class definition (`buildRookieMap`), which used to live
// inside the useSleeperRookies hook. It moved here so the MCP server's rookie
// research tool builds the class from the same rule the phone does; the hook
// keeps only its memo.

const ROOKIE_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE'])

// The rookie class, from the trimmed player DB (usePlayerDB's trim, mirrored by
// mcp/snapshot.js). years_exp===0 is definitive; years_exp==null with age<=25
// catches freshly drafted players whose Sleeper data hasn't updated post-draft
// yet.
export function buildRookieMap(playerDB) {
  const map = {}
  Object.entries(playerDB ?? {}).forEach(([player_id, p]) => {
    const isRookie = p.years_exp === 0 || (p.years_exp == null && p.age != null && p.age <= 25)
    if (!isRookie) return
    if (!ROOKIE_POSITIONS.has(p.position)) return
    if (!p.name) return
    map[player_id] = {
      sleeperId: player_id,
      name: p.name,
      position: p.position,
      team: p.team,
      age: p.age,
      value: 0,
    }
  })
  return map
}

//
// FantasyCalc's /values/current has no rookie-specific ADP field, and its
// rookiesOnly endpoint returns non-rookies (see useRookieADP.js) — so rookie
// ADP is derived locally: rank the rookie class (Sleeper years_exp===0)
// among themselves by FantasyCalc overall dynasty rank, 1..N.
//
// Prospects with no FantasyCalc rank get adp=null — they display as "—"
// and sort to the bottom (null → Infinity in the existing sort logic).
export function assignRookieAdp(prospects) {
  const adpById = new Map(
    prospects
      .filter(p => p.overallRank != null)
      .sort((a, b) => a.overallRank - b.overallRank)
      .map((p, i) => [p.sleeperId, i + 1])
  )
  return prospects.map(p => ({ ...p, adp: adpById.get(p.sleeperId) ?? null }))
}

// Shared prospect builder for the Draft section (Board + Tracker): enrich the
// Sleeper rookie map with FantasyCalc data (by sleeperId, falling back to
// name match) and assign derived rookie ADP.
export function buildRookieProspects(rookieMap, playerMap) {
  if (!rookieMap) return []
  const nameToFC = {}
  if (playerMap) {
    Object.values(playerMap).forEach(e => {
      if (e.name) nameToFC[e.name.toLowerCase()] = e
    })
  }
  return assignRookieAdp(Object.values(rookieMap).map(rookieEntry => {
    const mainEntry = playerMap?.[rookieEntry.sleeperId]
    if (mainEntry) return { ...mainEntry }
    const nameMatch = nameToFC[rookieEntry.name?.toLowerCase()]
    if (nameMatch) return { ...nameMatch, sleeperId: rookieEntry.sleeperId }
    return { ...rookieEntry, adpOnly: true }
  }))
}
