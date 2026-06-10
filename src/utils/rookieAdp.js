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
