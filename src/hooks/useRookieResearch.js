import { useMemo } from 'react'
import { useLeagueContext } from '../context/LeagueContext'
import { useRookieADP } from './useRookieADP'
import { useRookieIntel } from './useRookieIntel'
import { buildRookieProspects } from '../utils/rookieAdp'
import { buildRookieResearch, buildTeamFit } from '../utils/rookieResearch'
import { getDeficitPositions } from '../utils/recommendations'
import { getWinWindowTier } from '../utils/rosterAnalysis'

// THE rookie research board, composed once for the whole app.
//
// Draft › Research owns the page that displays it, but the read it produces —
// "is this rookie going to play?" — is exactly what the profile drawer is
// missing wherever else a rookie is opened (Free Agents, Roster, Movers,
// search). That question is not answerable from a dynasty value: a #212
// overall stash and a #212 overall rookie with a starting job read identically
// on price and nothing alike on opportunity. So the composition lives here
// rather than inside the view, and both consumers share one build.
//
// Zero new data sources: the rookie map comes from the shared player DB cache
// (usePlayerDB, already loaded at app start) and the intel feed is the same
// lazy once-per-session fetch — see useRookieIntel's Class B contract.

const EMPTY = { rows: [], byId: new Map(), deficits: new Set(), tier: null }

// Module-level memo keyed by input IDENTITY (not deep equality). All four
// inputs are session-stable references, so two consumers mounted on the same
// data re-rank the ~240-player class once between them instead of once each.
let boardCache = { key: null, board: EMPTY }

function buildBoard(rookieMap, playerMap, intel, league) {
  const myRoster = league?.myRoster
  const allRosters = league?.allRosters
  // The same helpers every other recommendation surface uses, so "you need a
  // TE" means here what it means in Free Agents and the Trade Analyzer.
  const deficits = myRoster && allRosters?.length
    ? getDeficitPositions(myRoster, allRosters)
    : new Set()
  const tier = myRoster && allRosters?.length
    ? getWinWindowTier(myRoster.rosterId, allRosters)
    : null

  const prospects = buildRookieProspects(rookieMap, playerMap)
  const rows = buildTeamFit(buildRookieResearch(prospects, intel), { deficits, tier })
  // deficits/tier ride along: Draft › Research states them in plain English
  // above its shortlist, and they are already computed here.
  return { rows, byId: new Map(rows.map(r => [r.sleeperId, r])), deficits, tier }
}

function getBoard(rookieMap, playerMap, intel, league) {
  if (!rookieMap) return EMPTY
  const key = { rookieMap, playerMap, intel, league }
  const prev = boardCache.key
  if (
    prev && prev.rookieMap === key.rookieMap && prev.playerMap === key.playerMap &&
    prev.intel === key.intel && prev.league === key.league
  ) return boardCache.board
  boardCache = { key, board: buildBoard(rookieMap, playerMap, intel, league) }
  return boardCache.board
}

// `enabled: false` keeps the intel feed unfetched — the drawer opens on
// veterans far more often than rookies, and a card that will never render
// should not cost a request.
export function useRookieResearch({ enabled = true } = {}) {
  const ctx = useLeagueContext()
  const league = ctx?.league
  const values = ctx?.values
  const { rookieMap, loading: rookiesLoading, error, retry } = useRookieADP()
  const { intel, loading: intelLoading } = useRookieIntel(enabled)

  const board = useMemo(
    () => (enabled ? getBoard(rookieMap, values?.playerMap, intel, league) : EMPTY),
    [enabled, rookieMap, values, intel, league]
  )

  return {
    rows: board.rows,
    byId: board.byId,
    deficits: board.deficits,
    tier: board.tier,
    intel,
    loading: enabled && (rookiesLoading || intelLoading),
    error,
    retry,
  }
}

// One player's research row, for the profile drawer. Returns null for anyone
// who is not a rookie — and for a rookie the feed carries no entry for, so an
// empty "no draft record" card never appears on every deep stash in the app.
// (Draft › Research still passes its own row explicitly and keeps rendering
// that no-data state, where the player is on screen because you tapped him.)
export function useRookieResearchFor(sleeperId) {
  const { rookieMap } = useRookieADP()
  const id = sleeperId != null ? String(sleeperId) : null
  const isRookie = !!(id && rookieMap?.[id])
  const { byId } = useRookieResearch({ enabled: isRookie })
  if (!isRookie) return null
  const row = byId.get(id) ?? null
  return row?.score != null ? row : null
}
