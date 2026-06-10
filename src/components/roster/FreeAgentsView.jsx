import { useCallback, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useLeagueContext } from '../../context/LeagueContext'
import { useSleeperRookies } from '../../hooks/useSleeperRookies'
import { getPositionalDeltas, computeLeagueAverages } from '../../utils/rosterAnalysis'
import LoadingSpinner from '../shared/LoadingSpinner'
import ErrorState from '../shared/ErrorState'
import TrendArrow from '../shared/TrendArrow'
import PlayerProfileDrawer from '../shared/PlayerProfileDrawer'

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE']
const SORT_OPTIONS = [
  { id: 'value', label: 'Value' },
  { id: 'age',   label: 'Age'   },
]

function FillsNeedBadge() {
  return (
    <span className="font-body text-[9px] font-bold uppercase tracking-wider text-success bg-success/15 border border-success/30 rounded px-1.5 py-0.5 flex-shrink-0">
      Need
    </span>
  )
}

function RookieBadge() {
  return (
    <span className="font-body text-[9px] font-bold uppercase tracking-wider text-warning bg-warning/15 border border-warning/30 rounded px-1.5 py-0.5 flex-shrink-0">
      Rookie
    </span>
  )
}

export default function FreeAgentsView() {
  const { league, loading, error, retry, values } = useLeagueContext()
  const { sleeperRookieMap } = useSleeperRookies()

  const [posFilter, setPosFilter]     = useState('ALL')
  const [sortMode, setSortMode]       = useState('value')
  const [search, setSearch]           = useState('')
  const [upgradesOnly, setUpgradesOnly] = useState(false)
  const [hideRookies, setHideRookies] = useState(false)
  const [selected, setSelected]       = useState(null)

  // Same rookie detection used by the Rookie badge — Sleeper years_exp===0,
  // with the age heuristic as fallback when experience data is missing
  const isRookie = useCallback(p =>
    !!sleeperRookieMap?.[p.sleeperId]
      || p.experience === 0
      || (p.experience == null && p.age != null && p.age <= 25),
  [sleeperRookieMap])

  const myNeeds = useMemo(() => {
    if (!league) return {}
    const avgs = computeLeagueAverages(league.allRosters)
    return getPositionalDeltas(league.myRoster, avgs)
  }, [league])

  const needPositions = useMemo(() =>
    Object.entries(myNeeds)
      .filter(([, delta]) => delta < 0)
      .map(([pos]) => pos),
  [myNeeds])

  // Lowest dynasty value per position on my roster (for Upgrades Only filter)
  const myWorstByPosition = useMemo(() => {
    if (!league?.myRoster) return {}
    const worst = {}
    league.myRoster.players.forEach(p => {
      if (!['QB', 'RB', 'WR', 'TE'].includes(p.position)) return
      if (worst[p.position] == null || (p.value ?? 0) < worst[p.position]) {
        worst[p.position] = p.value ?? 0
      }
    })
    return worst
  }, [league])

  // My rostered players grouped by position, sorted by value desc (for drawer comparison)
  const myPlayersByPosition = useMemo(() => {
    if (!league?.myRoster) return {}
    const byPos = {}
    league.myRoster.players.forEach(p => {
      if (!['QB', 'RB', 'WR', 'TE'].includes(p.position)) return
      if (!byPos[p.position]) byPos[p.position] = []
      byPos[p.position].push(p)
    })
    Object.values(byPos).forEach(arr => arr.sort((a, b) => (b.value ?? 0) - (a.value ?? 0)))
    return byPos
  }, [league])

  const freeAgents = useMemo(() => {
    if (!league || !values?.playerMap) return []

    const rostered = new Set()
    league.allRosters.forEach(r =>
      r.players.forEach(p => rostered.add(p.sleeperId))
    )

    return Object.values(values.playerMap)
      .filter(p =>
        !rostered.has(p.sleeperId) &&
        ['QB', 'RB', 'WR', 'TE'].includes(p.position) &&
        (p.value ?? 0) > 0
      )
  }, [league, values])

  const filtered = useMemo(() => {
    let list = freeAgents

    if (posFilter !== 'ALL') list = list.filter(p => p.position === posFilter)

    if (upgradesOnly) {
      list = list.filter(p => (p.value ?? 0) > (myWorstByPosition[p.position] ?? 0))
    }

    if (hideRookies) {
      list = list.filter(p => !isRookie(p))
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(p => p.name?.toLowerCase().includes(q))
    }

    if (sortMode === 'value') list = [...list].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    else list = [...list].sort((a, b) => (a.age ?? 99) - (b.age ?? 99))

    return list
  }, [freeAgents, posFilter, upgradesOnly, hideRookies, isRookie, search, sortMode, myWorstByPosition])

  if (loading && !league) return <LoadingSpinner message="Loading league data…" />
  if (error && !league)   return <ErrorState message={error} onRetry={retry} />

  return (
    <>
      <div className="px-4 pb-4">
        {/* Search bar */}
        <div className="pt-4 pb-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" strokeWidth={1.75} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search free agents…"
              className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-bg-card border border-border-default font-body text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent"
            />
          </div>
        </div>

        {/* Position filter */}
        <div className="flex gap-1.5 mb-3 overflow-x-auto pb-0.5">
          {POSITIONS.map(pos => (
            <button
              key={pos}
              onClick={() => setPosFilter(pos)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg font-body text-xs font-semibold uppercase tracking-wide transition-colors ${
                posFilter === pos
                  ? 'bg-accent text-white'
                  : 'bg-bg-card border border-border-default text-text-secondary'
              }`}
            >
              {pos}
            </button>
          ))}
        </div>

        {/* Filter toggles */}
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setUpgradesOnly(o => !o)}
              className={`px-3 py-1.5 rounded-lg font-body text-xs font-semibold uppercase tracking-wide transition-colors ${
                upgradesOnly
                  ? 'bg-success/20 text-success border border-success/30'
                  : 'bg-bg-card border border-border-default text-text-secondary'
              }`}
            >
              Upgrades Only
            </button>
            <button
              onClick={() => setHideRookies(h => !h)}
              className={`px-3 py-1.5 rounded-lg font-body text-xs font-semibold uppercase tracking-wide transition-colors ${
                hideRookies
                  ? 'bg-warning/20 text-warning border border-warning/30'
                  : 'bg-bg-card border border-border-default text-text-secondary'
              }`}
            >
              Hide Rookies
            </button>
          </div>
          {upgradesOnly && (
            <p className="font-body text-[10px] text-text-tertiary leading-tight mt-1.5">
              Better than my worst {posFilter === 'ALL' ? 'at each position' : posFilter}
            </p>
          )}
        </div>

        {/* Sort + count row */}
        <div className="flex items-center justify-between mb-3">
          <span className="font-body text-[11px] text-text-tertiary">
            {filtered.length} available
          </span>
          <div className="flex gap-1">
            {SORT_OPTIONS.map(o => (
              <button
                key={o.id}
                onClick={() => setSortMode(o.id)}
                className={`px-2.5 py-1 rounded font-body text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                  sortMode === o.id
                    ? 'bg-accent text-white'
                    : 'bg-bg-card border border-border-default text-text-secondary'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Player list */}
        {filtered.length === 0 ? (
          <p className="text-center text-text-tertiary font-body text-sm py-10">
            {search
              ? 'No players match your search.'
              : upgradesOnly
                ? 'No free agents upgrade your roster at this position.'
                : 'No free agents at this position.'
            }
          </p>
        ) : (
          <div className="rounded-xl bg-bg-card border border-border-default px-3">
            {filtered.map((player, i) => {
              const fillsNeed = needPositions.includes(player.position)
              const rookie = isRookie(player)
              return (
                <button
                  key={player.sleeperId}
                  onClick={() => setSelected(player)}
                  className={`w-full text-left py-3 flex flex-col gap-1 active:opacity-60 transition-opacity ${
                    i < filtered.length - 1 ? 'border-b border-border-default' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-body text-sm font-medium text-text-primary flex-1 truncate leading-tight">
                      {player.name}
                    </span>
                    {rookie && <RookieBadge />}
                    {fillsNeed && <FillsNeedBadge />}
                    <span className="font-mono text-sm font-medium text-accent tabular-nums flex-shrink-0">
                      {(player.value ?? 0).toLocaleString()}
                    </span>
                    <TrendArrow trend={player.trend30Day ?? 0} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-body text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
                      {player.position}
                    </span>
                    <span className="text-text-tertiary text-[10px]">·</span>
                    <span className="font-body text-[10px] text-text-tertiary">{player.team || 'FA'}</span>
                    {player.age != null && (
                      <>
                        <span className="text-text-tertiary text-[10px]">·</span>
                        <span className="font-body text-[10px] text-text-tertiary">Age {Math.floor(player.age)}</span>
                      </>
                    )}
                    {player.overallRank != null && (
                      <>
                        <span className="text-text-tertiary text-[10px]">·</span>
                        <span className="font-body text-[10px] text-text-tertiary">#{player.overallRank} OVR</span>
                      </>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {selected && (
        <PlayerProfileDrawer
          player={selected}
          playerMap={values?.playerMap ?? {}}
          rosterComparison={myPlayersByPosition[selected.position] ?? []}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}
