import { useMemo, useState } from 'react'
import TrendArrow from '../shared/TrendArrow'
import PickBadge from '../roster/PickBadge'

const POS_TAGS = {
  QB: 'bg-accent/20 text-accent',
  RB: 'bg-success/20 text-success',
  WR: 'bg-warning/20 text-warning',
  TE: 'bg-danger/20 text-danger',
}

const FILTER_TABS = ['All', 'QB', 'RB', 'WR', 'TE', 'Picks']

const ROUND_SUFFIXES = ['', '1st', '2nd', '3rd', '4th']

function pickLabel(pick) {
  const suffix = ROUND_SUFFIXES[pick.round] ?? `R${pick.round}`
  return `${pick.season} ${suffix}`
}

function pickShortLabel(pick) {
  const suffix = ROUND_SUFFIXES[pick.round] ?? `R${pick.round}`
  return `'${String(pick.season).slice(2)} ${suffix}`
}

function AssetChip({ asset, onRemove }) {
  const isPick      = asset.type === 'pick'
  const displayName = isPick
    ? pickShortLabel(asset)
    : (asset.name?.split(' ').slice(1).join(' ') || asset.name || '—')

  return (
    <div className="flex items-center gap-1 py-1 min-w-0">
      {!isPick && asset.position && (
        <span className={`shrink-0 text-[8px] font-bold font-body px-1 py-0.5 rounded leading-none ${POS_TAGS[asset.position] ?? 'bg-bg-secondary text-text-secondary'}`}>
          {asset.position}
        </span>
      )}
      <span className="flex-1 font-body text-xs text-text-primary dark:text-text-primary truncate min-w-0 leading-tight">
        {displayName}
      </span>
      <span className="font-mono text-[10px] text-text-secondary dark:text-text-secondary shrink-0 tabular-nums">
        {(asset.value || 0).toLocaleString()}
      </span>
      <button
        onClick={onRemove}
        className="shrink-0 w-4 text-center text-text-tertiary dark:text-text-tertiary text-base leading-none font-medium"
        aria-label="Remove"
      >
        ×
      </button>
    </div>
  )
}

function TradeColumn({ label, assets, total, onRemove, emptyHint }) {
  return (
    <div className="flex-1 min-w-0">
      <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-secondary dark:text-text-secondary mb-1">
        {label}
      </p>
      <p className="font-mono text-xl font-medium text-accent tabular-nums mb-2">
        {total.toLocaleString()}
      </p>
      <div className="min-h-[44px]">
        {assets.length === 0 ? (
          <p className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary italic leading-tight pt-0.5">
            {emptyHint}
          </p>
        ) : (
          assets.map(a => (
            <AssetChip key={a.id} asset={a} onRemove={() => onRemove(a)} />
          ))
        )}
      </div>
    </div>
  )
}

function PlayerRow({ player, isSelected, isWhatsFairTarget, onTap }) {
  const posTag = POS_TAGS[player.position] ?? 'bg-bg-secondary text-text-secondary'
  return (
    <button
      onClick={onTap}
      className={`w-full flex items-center gap-1.5 py-2.5 border-b border-border-default dark:border-border-default last:border-0 transition-opacity active:opacity-60 text-left
        ${isSelected ? 'bg-accent/5' : ''}
        ${isWhatsFairTarget ? 'bg-warning/8' : ''}`}
    >
      {/* State indicator */}
      <span className="w-3.5 shrink-0 flex justify-center text-[10px]">
        {isWhatsFairTarget ? (
          <span className="text-warning">◎</span>
        ) : isSelected ? (
          <span className="text-success">✓</span>
        ) : null}
      </span>

      {/* Position badge */}
      <span className={`shrink-0 text-[9px] font-bold font-body px-1.5 py-0.5 rounded leading-none ${posTag}`}>
        {player.position}
      </span>

      {/* Name */}
      <span className="flex-1 font-body text-sm text-text-primary dark:text-text-primary truncate min-w-0">
        {player.name}
      </span>

      {/* Team */}
      <span className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary shrink-0 w-6 text-right uppercase tracking-wide">
        {player.team}
      </span>

      {/* Value */}
      <span className="font-mono text-sm text-text-primary dark:text-text-primary shrink-0 w-12 text-right tabular-nums">
        {player.value > 0 ? player.value.toLocaleString() : '—'}
      </span>

      {/* Trend */}
      <span className="shrink-0 w-4 text-center">
        <TrendArrow trend={player.trend30Day} />
      </span>
    </button>
  )
}

function PickRow({ pick, isSelected, onTap }) {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  return (
    <button
      onClick={onTap}
      className={`w-full flex items-center gap-3 py-2.5 border-b border-border-default dark:border-border-default last:border-0 transition-opacity active:opacity-60 text-left
        ${isSelected ? 'bg-accent/5' : ''}`}
    >
      <span className="w-3.5 shrink-0 flex justify-center text-[10px]">
        {isSelected && <span className="text-success">✓</span>}
      </span>
      <PickBadge pick={pick} isDark={isDark} />
      <span className="flex-1 font-body text-sm text-text-primary dark:text-text-primary">
        {pickLabel(pick)}
      </span>
      <span className="font-mono text-sm text-text-secondary dark:text-text-secondary shrink-0 tabular-nums">
        {(pick.value ?? 0) > 0 ? `~${(pick.value).toLocaleString()}` : '—'}
      </span>
    </button>
  )
}

export default function TradeBuilder({
  myRoster,
  opponentRoster,
  giveAssets,
  getAssets,
  onToggleGive,
  onToggleGet,
  whatsFairMode,
  whatsFairTarget,
  onWhatsFairSelect,
}) {
  const [activeTab, setActiveTab]   = useState('opponent')
  const [searchQuery, setSearchQuery] = useState('')
  const [posFilter, setPosFilter]   = useState('All')

  const giveIds = useMemo(() => new Set(giveAssets.map(a => a.id)), [giveAssets])
  const getIds  = useMemo(() => new Set(getAssets.map(a => a.id)),  [getAssets])

  const currentRoster = activeTab === 'mine' ? myRoster : opponentRoster

  const visiblePlayers = useMemo(() => {
    if (posFilter === 'Picks') return []
    const q = searchQuery.trim().toLowerCase()
    return currentRoster.players
      .filter(p => !p.isIR)
      .filter(p => {
        const matchPos    = posFilter === 'All' || p.position === posFilter
        const matchSearch = !q || p.name.toLowerCase().includes(q)
        return matchPos && matchSearch
      })
      .sort((a, b) => b.value - a.value)
  }, [currentRoster, posFilter, searchQuery])

  const visiblePicks = useMemo(() => {
    if (posFilter !== 'All' && posFilter !== 'Picks') return []
    const q = searchQuery.trim().toLowerCase()
    return currentRoster.picks
      .filter(p => !q || pickLabel(p).toLowerCase().includes(q))
      .sort((a, b) => a.season !== b.season ? a.season - b.season : a.round - b.round)
  }, [currentRoster, posFilter, searchQuery])

  const giveTotal = giveAssets.reduce((s, a) => s + (a.value || 0), 0)
  const getTotal  = getAssets.reduce((s, a)  => s + (a.value || 0), 0)

  function getPlayerId(player) { return String(player.sleeperId) }
  function getPickId(pick)     { return `${pick.season}-${pick.round}-${pick.originalOwner}` }

  function handlePlayerTap(player) {
    if (activeTab === 'opponent' && whatsFairMode) {
      onWhatsFairSelect(player)
      return
    }
    if (activeTab === 'mine') onToggleGive(player, 'player')
    else                      onToggleGet(player, 'player')
  }

  function handlePickTap(pick) {
    if (whatsFairMode) return
    if (activeTab === 'mine') onToggleGive(pick, 'pick')
    else                      onToggleGet(pick, 'pick')
  }

  function handleTabChange(tab) {
    setActiveTab(tab)
    setSearchQuery('')
    setPosFilter('All')
  }

  return (
    <div className="mb-4">
      {/* Trade columns */}
      <div className="flex gap-3 mb-4 pb-4 border-b border-border-default dark:border-border-default">
        <TradeColumn
          label="You Give"
          assets={giveAssets}
          total={giveTotal}
          onRemove={a => onToggleGive(a, a.type)}
          emptyHint="Browse My Roster ↓"
        />
        <div className="w-px bg-border-default dark:bg-border-default shrink-0" />
        <TradeColumn
          label="You Get"
          assets={getAssets}
          total={getTotal}
          onRemove={a => onToggleGet(a, a.type)}
          emptyHint="Browse Their Roster ↓"
        />
      </div>

      {/* Roster browser */}
      <div className="rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-border-default dark:border-border-default">
          {[
            { id: 'opponent', label: 'Their Roster' },
            { id: 'mine',     label: 'My Roster' },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => handleTabChange(id)}
              className={`flex-1 py-2.5 font-body text-xs font-semibold uppercase tracking-wider transition-colors
                ${activeTab === id
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-text-secondary dark:text-text-secondary'
                }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-border-default dark:border-border-default">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search players…"
            className="w-full bg-bg-secondary dark:bg-bg-secondary rounded-lg px-3 py-1.5 font-body text-sm text-text-primary dark:text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        {/* Position filter */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none px-3 py-2 border-b border-border-default dark:border-border-default">
          {FILTER_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setPosFilter(tab)}
              className={`shrink-0 px-2.5 py-1 rounded-full font-body text-[11px] font-semibold uppercase tracking-wider transition-colors
                ${posFilter === tab
                  ? 'bg-accent text-white'
                  : 'bg-bg-secondary dark:bg-bg-secondary text-text-secondary dark:text-text-secondary border border-border-default dark:border-border-default'
                }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Player / pick rows */}
        <div className="px-3">
          {visiblePlayers.length === 0 && visiblePicks.length === 0 ? (
            <p className="font-body text-sm text-text-tertiary dark:text-text-tertiary py-6 text-center">
              {searchQuery ? 'No players match your search.' : 'No players at this position.'}
            </p>
          ) : (
            <>
              {visiblePlayers.map(player => {
                const pid      = getPlayerId(player)
                const selected = giveIds.has(pid) || getIds.has(pid)
                const isTarget = whatsFairTarget?.id === pid
                return (
                  <PlayerRow
                    key={pid}
                    player={player}
                    isSelected={selected}
                    isWhatsFairTarget={isTarget}
                    onTap={() => handlePlayerTap(player)}
                  />
                )
              })}
              {visiblePicks.map(pick => {
                const pid      = getPickId(pick)
                const selected = giveIds.has(pid) || getIds.has(pid)
                return (
                  <PickRow
                    key={pid}
                    pick={pick}
                    isSelected={selected}
                    onTap={() => handlePickTap(pick)}
                  />
                )
              })}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
