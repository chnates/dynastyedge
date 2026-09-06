// partnerActivity.js — what has this partner been doing lately?
//
// The Analyzer knows a partner's roster shape but nothing about their intent.
// "They traded for a tight end last week" changes how you read their TE
// surplus: it isn't spare, it's the thing they just went and bought. The
// transaction feed is already cached for League › Activity, so this costs no
// fetch — it's a different question asked of data the app holds.
//
// Descriptive only. This is behavioral context for a human to weigh, not an
// input to any score: modelling manager behavior was tested on this league's
// full corpus and disconfirmed (docs/analysis/trade-structure-stability-2026-08.md).

const DAY = 86400000
export const ACTIVITY_WINDOW_DAYS = 21

// Sleeper stamps `status_updated` in ms. `adds` / `drops` map playerId →
// rosterId, so "what did THIS roster take on" is a filter over the values.
export function buildPartnerActivity(transactions, rosterId, { playerMap, playerDB, now = Date.now(), windowDays = ACTIVITY_WINDOW_DAYS } = {}) {
  if (!transactions?.length || rosterId == null) return null

  const cutoff = now - windowDays * DAY
  const rid = Number(rosterId)

  const resolve = id => {
    const fc = playerMap?.get?.(String(id)) ?? playerMap?.[String(id)]
    if (fc) return { name: fc.name, position: fc.position }
    const db = playerDB?.[String(id)]
    if (db) return { name: db.full_name ?? `${db.first_name ?? ''} ${db.last_name ?? ''}`.trim(), position: db.position }
    return null
  }

  const recent = transactions.filter(tx =>
    (tx.status_updated ?? 0) >= cutoff && (tx.roster_ids ?? []).map(Number).includes(rid))

  if (!recent.length) return { count: 0, windowDays, acquired: [], trades: 0, positionsAdded: [], summary: null }

  const acquired = []
  let trades = 0
  recent.forEach(tx => {
    if (tx.type === 'trade') trades += 1
    Object.entries(tx.adds ?? {}).forEach(([playerId, toRoster]) => {
      if (Number(toRoster) !== rid) return
      const p = resolve(playerId)
      if (p?.name) acquired.push({ ...p, via: tx.type, when: tx.status_updated })
    })
  })

  acquired.sort((a, b) => (b.when ?? 0) - (a.when ?? 0))
  const positionsAdded = [...new Set(acquired.map(a => a.position).filter(Boolean))]

  const weeks = Math.max(1, Math.round(windowDays / 7))
  const named = acquired.slice(0, 3)
    .map(a => (a.position ? `${a.name} (${a.position})` : a.name))
  const summary = named.length
    ? `Added ${named.join(', ')}${acquired.length > named.length ? ` +${acquired.length - named.length} more` : ''} in the last ${weeks} weeks.`
    : `${recent.length} move${recent.length > 1 ? 's' : ''} in the last ${weeks} weeks — no additions.`

  return { count: recent.length, windowDays, acquired, trades, positionsAdded, summary }
}
