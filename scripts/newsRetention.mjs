// THE news feed's retention policy — pure, so tests/newsRetention.test.mjs can
// pin it. Imported by scripts/fetch-news.mjs; nothing in src/ reads it (the
// app consumes the published feed, never this).
//
// The policy exists because eviction used to be recency-only, which let the
// ITEM cap bind long before the 7-day time window ever did: measured
// 2026-09-12, `playerItems` sat pinned at exactly its 240 cap while the oldest
// retained item was 29.7h old, so the documented 7-day window had never once
// bound and the feed's depth had silently collapsed from 159h to 27.5h.
//
// The fix is to stop spending the cap on redundancy. Those 240 items resolved
// to only 97 distinct players — 3.14 items each, one player carrying 23 — and
// the acceptance metric counts DISTINCT players resolved. Capping items per
// player holds the same 97 players in 152 items, freeing 37% of the cap for
// older items about players nobody else covered.
//
// See docs/analysis/news-retention-2026-09.md.

// Newest-first, admit an item while ANY player it names still has room — so a
// 24th headline about the most newsworthy player in the league is dropped
// BEFORE an older item about an uncovered player.
//
// An item resolving to no Sleeper id rides on recency exactly as before: it is
// player news by ESPN athlete id alone (3 of 240 on the live feed) and there is
// no player to charge a quota against. Quota is charged to EVERY player an item
// names, so a roundup pays for all of them.
//
// `sorted` must already be newest-first — the caller sorts, because it also
// applies the time window.
export function retainDiverse(sorted, perPlayer, cap) {
  const held = new Map()
  const out = []
  for (const item of sorted) {
    if (out.length >= cap) break
    const ids = item.playerIds ?? []
    if (ids.length === 0) { out.push(item); continue }
    if (!ids.some(id => (held.get(id) ?? 0) < perPlayer)) continue
    out.push(item)
    for (const id of ids) held.set(id, (held.get(id) ?? 0) + 1)
  }
  return out
}
