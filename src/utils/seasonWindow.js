// Where the league sits in the rookie-draft calendar.
//
// Pick capital, the Draft Tracker and the Pick Trade Calculator all hinge on
// one question: has this season's rookie draft happened yet? Before 2026-09
// the answer was a hand-maintained constant (`PICK_YEARS`), which had to be
// rolled by hand every September — and until it was, the app kept generating
// a full slate of already-spent picks (which FantasyCalc retires the moment a
// draft completes, so they priced at 0) and never surfaced the new third year.
//
// Both inputs are already in the `useSleeper` payload, so this costs no extra
// request: `/state/nfl` gives the season, `/league/{id}/drafts` gives every
// draft with its status.

const PICK_ROUNDS_AHEAD = 3

// Sleeper's draft `status` values; only `complete` means the picks are spent.
const COMPLETE = 'complete'

// A league's rookie drafts, newest first. Auctions are excluded everywhere in
// the app (they are startup formats, not rookie drafts).
export function rookieDrafts(drafts) {
  return (drafts ?? [])
    .filter(d => d && d.type !== 'auction' && d.season != null)
    .sort((a, b) => String(b.season).localeCompare(String(a.season)))
}

// The season whose rookie draft has NOT yet been held — the one whose picks
// are still tradable capital.
//
// It is the current NFL season until that season's draft completes, then the
// next one. A draft that exists but is `pre_draft`/`drafting`/`paused` keeps
// the season current, which is what makes the Tracker work on draft day.
// Without an NFL state we cannot tell, so the caller's fallback stands.
export function upcomingDraftSeason(nflState, drafts) {
  const season = nflState?.season != null ? String(nflState.season) : null
  if (!season) return null

  const held = rookieDrafts(drafts).find(d => String(d.season) === season)
  return held?.status === COMPLETE ? String(Number(season) + 1) : season
}

// The three-season pick window, newest first: the upcoming rookie draft plus
// the two after it. Falls back to the caller's seed (constants' PICK_YEARS)
// when NFL state hasn't resolved — never returns an empty window, since every
// pick surface in the app is built from it.
export function resolvePickYears(nflState, drafts, fallback) {
  const first = upcomingDraftSeason(nflState, drafts)
  if (!first) return fallback
  return Array.from(
    { length: PICK_ROUNDS_AHEAD },
    (_, i) => String(Number(first) + i)
  )
}

// Which draft the Draft Tracker should show.
//
// The upcoming one whenever it exists in Sleeper — that is the whole point of
// the Tracker on draft day. Once it completes there is nothing ahead to track
// (the league creates next year's draft months later), so the most recent
// completed draft stays on screen as its recap rather than the tab collapsing
// to an empty "no draft yet" placeholder for most of a year.
export function selectTrackedDraft(drafts, upcomingSeason) {
  const list = rookieDrafts(drafts)
  if (!list.length) return null

  if (upcomingSeason) {
    const ahead = list.find(d => String(d.season) === String(upcomingSeason))
    if (ahead) return ahead
  }

  const pending = list.find(d => d.status !== COMPLETE)
  return pending ?? list[0]
}
