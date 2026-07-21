import { useEffect, useMemo, useRef, useState } from 'react'
import { Info, Plus, Scale } from 'lucide-react'
import TrendArrow from '../shared/TrendArrow'
import PickBadge from '../roster/PickBadge'
import PlayerProfileDrawer from '../shared/PlayerProfileDrawer'
import { useScrollLock } from '../../hooks/useScrollLock'
import { useSheetDrag } from '../../hooks/useSheetDrag'
import { Button, Chip, cn } from '../ui'
import { POS_CHIP_ACTIVE, POS_TAG as POS_TAGS } from '../../utils/positionColors'

const FILTER_TABS = ['All', 'QB', 'RB', 'WR', 'TE', 'Picks']

const ROUND_SUFFIXES = ['', '1st', '2nd', '3rd', '4th']

function pickLabel(pick) {
  const suffix = ROUND_SUFFIXES[pick.round] ?? `R${pick.round}`
  // Assets from the Pick Trade Calculator carry an exact slot (e.g. "1.02")
  return pick.slotLabel ? `${pick.season} ${suffix} (${pick.slotLabel})` : `${pick.season} ${suffix}`
}

function pickShortLabel(pick) {
  if (pick.slotLabel) return `'${String(pick.season).slice(2)} ${pick.slotLabel}`
  const suffix = ROUND_SUFFIXES[pick.round] ?? `R${pick.round}`
  return `'${String(pick.season).slice(2)} ${suffix}`
}

function AssetChip({ asset, onRemove, onTap }) {
  const isPick      = asset.type === 'pick'
  const displayName = isPick
    ? pickShortLabel(asset)
    : (asset.name?.split(' ').slice(1).join(' ') || asset.name || '—')
  const posTag   = POS_TAGS[asset.position] ?? 'bg-bg-secondary text-text-secondary'
  const tappable = !isPick && !!onTap

  const inner = (
    <>
      {!isPick && asset.position && (
        <span className={`shrink-0 text-[8px] font-bold font-body px-1 py-0.5 rounded leading-none ${posTag}`}>
          {asset.position}
        </span>
      )}
      <span className={`flex-1 font-body text-xs text-text-primary dark:text-text-primary truncate min-w-0 leading-tight ${
        tappable ? 'underline decoration-dotted decoration-text-tertiary/60 underline-offset-2' : ''
      }`}>
        {displayName}
      </span>
    </>
  )

  return (
    <div className="flex items-center gap-1 py-1 min-w-0">
      {tappable ? (
        <button
          onClick={onTap}
          aria-label={`View ${asset.name} profile`}
          className="flex-1 flex items-center gap-1 min-w-0 text-left active:opacity-60 transition-opacity"
        >
          {inner}
        </button>
      ) : (
        <div className="flex-1 flex items-center gap-1 min-w-0">{inner}</div>
      )}
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

function TradeColumn({ label, assets, total, onRemove, onAdd, addLabel, onTapPlayer }) {
  return (
    <div className="flex-1 min-w-0">
      <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-secondary dark:text-text-secondary mb-1">
        {label}
      </p>
      <p className="font-mono text-xl font-medium text-accent tabular-nums mb-2">
        {total.toLocaleString()}
      </p>
      <div className="min-h-[28px]">
        {assets.length === 0 ? (
          <p className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary italic leading-tight pt-0.5">
            Nothing added yet
          </p>
        ) : (
          assets.map(a => (
            <AssetChip
              key={a.id}
              asset={a}
              onRemove={() => onRemove(a)}
              onTap={a.type === 'player' ? () => onTapPlayer(a) : undefined}
            />
          ))
        )}
      </div>
      <button
        onClick={onAdd}
        className="w-full mt-1.5 flex items-center justify-center gap-1 py-2 rounded-lg border border-dashed border-border-default dark:border-border-default text-text-secondary dark:text-text-secondary font-body text-[11px] font-semibold uppercase tracking-wide active:opacity-60 transition-opacity"
      >
        <Plus size={12} strokeWidth={2.5} />
        {addLabel}
      </button>
    </div>
  )
}

function PlayerRow({ player, isSelected, onTap, onInfo, onWhatsFair }) {
  const posTag = POS_TAGS[player.position] ?? 'bg-bg-secondary text-text-secondary'
  return (
    <div className={`flex items-center border-b border-border-default dark:border-border-default last:border-0
      ${isSelected ? 'bg-accent/5' : ''}`}
    >
      <button
        onClick={onTap}
        className="flex-1 flex items-center gap-1.5 py-2.5 transition-opacity active:opacity-60 text-left min-w-0"
      >
        {/* Selection indicator */}
        <span className="w-3.5 shrink-0 flex justify-center text-[10px]">
          {isSelected && <span className="text-success">✓</span>}
        </span>

        {/* Position badge */}
        <span className={`shrink-0 text-[9px] font-bold font-body px-1.5 py-0.5 rounded leading-none ${posTag}`}>
          {player.position}
        </span>

        {/* Name */}
        <span className="flex-1 font-body text-sm text-text-primary dark:text-text-primary truncate min-w-0">
          {player.name}
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

      {/* What's Fair — opponent roster only: build a fair package for this player */}
      {onWhatsFair && (
        <button
          onClick={e => { e.stopPropagation(); onWhatsFair() }}
          className="shrink-0 px-2 py-2.5 text-text-tertiary dark:text-text-tertiary active:text-warning transition-colors"
          aria-label={`What's fair for ${player.name}?`}
        >
          <Scale size={14} strokeWidth={1.75} />
        </button>
      )}

      {/* Info icon — opens player profile without toggling selection */}
      <button
        onClick={e => { e.stopPropagation(); onInfo() }}
        className="shrink-0 px-2 py-2.5 text-text-tertiary dark:text-text-tertiary active:text-text-secondary transition-colors"
        aria-label={`View ${player.name} profile`}
      >
        <Info size={14} strokeWidth={1.75} />
      </button>
    </div>
  )
}

function PickRow({ pick, isSelected, onTap }) {
  return (
    <button
      onClick={onTap}
      className={`w-full flex items-center gap-3 py-2.5 border-b border-border-default dark:border-border-default last:border-0 transition-opacity active:opacity-60 text-left
        ${isSelected ? 'bg-accent/5' : ''}`}
    >
      <span className="w-3.5 shrink-0 flex justify-center text-[10px]">
        {isSelected && <span className="text-success">✓</span>}
      </span>
      <PickBadge pick={pick} />
      <span className="flex-1 font-body text-sm text-text-primary dark:text-text-primary">
        {pickLabel(pick)}
      </span>
      <span className="font-mono text-sm text-text-secondary dark:text-text-secondary shrink-0 tabular-nums">
        {(pick.value ?? 0) > 0 ? `~${(pick.value).toLocaleString()}` : '—'}
      </span>
    </button>
  )
}

// Bottom-sheet roster browser, pre-pointed at one roster. The header shows the
// live trade totals so adds give instant feedback without leaving the sheet.
function AddAssetSheet({
  title, roster, giveTotal, getTotal,
  isSelected, onTogglePlayer, onTogglePick, onInfo, onWhatsFair, onClose,
}) {
  const overlayRef = useRef(null)
  const { sheetRef, scrollRef } = useSheetDrag(onClose)
  const [searchQuery, setSearchQuery] = useState('')
  const [posFilter, setPosFilter]     = useState('All')
  // Track the visual viewport so the sheet stays within the area above the iOS
  // keyboard. `fixed` + `vh` use the layout viewport, which doesn't shrink when
  // the keyboard opens — without this the result list runs behind the keyboard.
  const [vp, setVp] = useState(() => ({
    height: window.visualViewport?.height ?? window.innerHeight,
    offsetTop: window.visualViewport?.offsetTop ?? 0,
  }))

  useScrollLock()

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return undefined
    const sync = () => setVp({ height: vv.height, offsetTop: vv.offsetTop })
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
    }
  }, [])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const visiblePlayers = useMemo(() => {
    if (posFilter === 'Picks') return []
    const q = searchQuery.trim().toLowerCase()
    return roster.players
      .filter(p => !p.isIR)
      .filter(p => {
        const matchPos    = posFilter === 'All' || p.position === posFilter
        const matchSearch = !q || p.name.toLowerCase().includes(q)
        return matchPos && matchSearch
      })
      .sort((a, b) => b.value - a.value)
  }, [roster, posFilter, searchQuery])

  const visiblePicks = useMemo(() => {
    if (posFilter !== 'All' && posFilter !== 'Picks') return []
    const q = searchQuery.trim().toLowerCase()
    return roster.picks
      .filter(p => !q || pickLabel(p).toLowerCase().includes(q))
      .sort((a, b) => a.season !== b.season ? a.season - b.season : a.round - b.round)
  }, [roster, posFilter, searchQuery])

  const diff   = getTotal - giveTotal
  const pct    = Math.round(Math.abs(diff) / Math.max(giveTotal, getTotal, 1) * 100)
  const isEven = pct <= 5

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose()
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed left-0 right-0 z-50 flex items-end bg-black/60"
      style={{
        top: vp.offsetTop,
        height: vp.height,
        // The fixed app header (z-30, 3rem tall over the safe-area inset) lives
        // in a higher stacking context than this sheet, so it paints on top of
        // anything the sheet pushes up behind it. Pad the top past the header
        // (its height + inset + a small gap) so a long list caps just below the
        // header instead of sliding its own title/Done button under it.
        paddingTop: 'calc(3rem + env(safe-area-inset-top) + 8px)',
      }}
    >
      <div ref={sheetRef} className="w-full bg-bg-secondary dark:bg-bg-secondary rounded-t-2xl border-t border-border-default dark:border-border-default flex flex-col max-h-full min-h-0">

        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-border-default" />
        </div>

        {/* Header: title + live totals + Done */}
        <div className="px-4 pt-1 pb-2.5 border-b border-border-default dark:border-border-default shrink-0">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-base uppercase tracking-wide text-text-primary dark:text-text-primary">
              {title}
            </h2>
            <Button
              size="sm"
              onClick={onClose}
              className="shrink-0 py-1"
            >
              Done
            </Button>
          </div>
          <p className="font-body text-[11px] text-text-secondary dark:text-text-secondary mt-1">
            Give <span className="font-mono text-text-primary dark:text-text-primary tabular-nums">{giveTotal.toLocaleString()}</span>
            <span className="mx-1 text-text-tertiary">⇄</span>
            Get <span className="font-mono text-text-primary dark:text-text-primary tabular-nums">{getTotal.toLocaleString()}</span>
            <span className={`ml-2 font-mono font-semibold tabular-nums ${
              isEven ? 'text-text-tertiary' : diff > 0 ? 'text-success' : 'text-danger'
            }`}>
              {isEven ? '≈ even' : `${diff > 0 ? '+' : '-'}${pct}%`}
            </span>
          </p>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-border-default dark:border-border-default shrink-0">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search players…"
            className="w-full bg-bg-card dark:bg-bg-card rounded-lg px-3 py-1.5 font-body text-sm text-text-primary dark:text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        {/* Position filter */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none px-4 py-2 border-b border-border-default dark:border-border-default shrink-0">
          {FILTER_TABS.map(tab => (
            <Chip
              key={tab}
              size="sm"
              active={posFilter === tab}
              activeClass={POS_CHIP_ACTIVE[tab] ?? 'bg-accent text-bg-primary'}
              onClick={() => setPosFilter(tab)}
              className={cn(posFilter !== tab && 'bg-bg-card dark:bg-bg-card')}
            >
              {tab}
            </Chip>
          ))}
        </div>

        {/* Player / pick rows */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4" style={{ overscrollBehavior: 'contain', paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
          {visiblePlayers.length === 0 && visiblePicks.length === 0 ? (
            <p className="font-body text-sm text-text-tertiary dark:text-text-tertiary py-6 text-center">
              {searchQuery ? 'No players match your search.' : 'No players at this position.'}
            </p>
          ) : (
            <>
              {visiblePlayers.map(player => {
                const pid = String(player.sleeperId)
                return (
                  <PlayerRow
                    key={pid}
                    player={player}
                    isSelected={isSelected(pid)}
                    onTap={() => onTogglePlayer(player)}
                    onInfo={() => onInfo(player)}
                    onWhatsFair={onWhatsFair ? () => onWhatsFair(player) : undefined}
                  />
                )
              })}
              {visiblePicks.length > 0 && (
                <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary dark:text-text-tertiary pt-3 pb-1">
                  Draft Picks
                </p>
              )}
              {visiblePicks.map(pick => {
                const pid = `${pick.season}-${pick.round}-${pick.originalOwner}`
                return (
                  <PickRow
                    key={pid}
                    pick={pick}
                    isSelected={isSelected(pid)}
                    onTap={() => onTogglePick(pick)}
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

export default function TradeBuilder({
  myRoster,
  opponentRoster,
  giveAssets,
  getAssets,
  onToggleGive,
  onToggleGet,
  onWhatsFair,
  onClearTrade,
}) {
  const [sheetSide, setSheetSide]     = useState(null)  // null | 'give' | 'get'
  const [sheetPlayer, setSheetPlayer] = useState(null)

  const giveIds = useMemo(() => new Set(giveAssets.map(a => a.id)), [giveAssets])
  const getIds  = useMemo(() => new Set(getAssets.map(a => a.id)),  [getAssets])

  const giveTotal = giveAssets.reduce((s, a) => s + (a.value || 0), 0)
  const getTotal  = getAssets.reduce((s, a)  => s + (a.value || 0), 0)

  const hasAssets = giveAssets.length > 0 || getAssets.length > 0

  function isSelected(id) {
    return giveIds.has(id) || getIds.has(id)
  }

  function handleWhatsFair(player) {
    onWhatsFair(player)
    setSheetSide(null)
  }

  return (
    <div className="mb-4">
      {/* Trade columns */}
      <div className="flex gap-3 pb-3 border-b border-border-default dark:border-border-default">
        <TradeColumn
          label="You Give"
          assets={giveAssets}
          total={giveTotal}
          onRemove={a => onToggleGive(a, a.type)}
          onAdd={() => setSheetSide('give')}
          addLabel="Add from mine"
          onTapPlayer={setSheetPlayer}
        />
        <div className="w-px bg-border-default dark:bg-border-default shrink-0" />
        <TradeColumn
          label="You Get"
          assets={getAssets}
          total={getTotal}
          onRemove={a => onToggleGet(a, a.type)}
          onAdd={() => setSheetSide('get')}
          addLabel="Add from theirs"
          onTapPlayer={setSheetPlayer}
        />
      </div>

      {/* Clear trade */}
      {hasAssets && (
        <div className="flex justify-center pt-2 pb-1">
          <button
            onClick={onClearTrade}
            className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary active:text-danger transition-colors"
          >
            × Clear trade
          </button>
        </div>
      )}

      {/* Add-asset bottom sheet */}
      {sheetSide && (
        <AddAssetSheet
          title={sheetSide === 'give' ? 'Add From My Roster' : 'Add From Their Roster'}
          roster={sheetSide === 'give' ? myRoster : opponentRoster}
          giveTotal={giveTotal}
          getTotal={getTotal}
          isSelected={isSelected}
          onTogglePlayer={p => (sheetSide === 'give' ? onToggleGive(p, 'player') : onToggleGet(p, 'player'))}
          onTogglePick={p => (sheetSide === 'give' ? onToggleGive(p, 'pick') : onToggleGet(p, 'pick'))}
          onInfo={setSheetPlayer}
          onWhatsFair={sheetSide === 'get' ? handleWhatsFair : null}
          onClose={() => setSheetSide(null)}
        />
      )}

      {sheetPlayer && (
        <PlayerProfileDrawer
          player={sheetPlayer}
          onClose={() => setSheetPlayer(null)}
        />
      )}
    </div>
  )
}
