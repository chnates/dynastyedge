// Rookie ADP derivation.
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
