import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import {
  Upload, Save, ChevronUp, ChevronDown, AlertTriangle,
  FileText, GripVertical, RotateCcw,
} from 'lucide-react'
import {
  DndContext, PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useLeagueContext } from '../../context/LeagueContext'
import { useRookieADP } from '../../hooks/useRookieADP'
import { getPositionalDeltas, computeLeagueAverages } from '../../utils/rosterAnalysis'
import LoadingSpinner from '../shared/LoadingSpinner'
import PlayerProfileDrawer from '../shared/PlayerProfileDrawer'

// ── Constants ────────────────────────────────────────────────────────────────

const POS_FILTERS = ['ALL', 'QB', 'RB', 'WR', 'TE']

const TIERS = [
  { id: 1, label: 'Tier 1 — Elite',      min: 7001, max: Infinity },
  { id: 2, label: 'Tier 2 — Strong',     min: 4001, max: 7000 },
  { id: 3, label: 'Tier 3 — Upside',     min: 2001, max: 4000 },
  { id: 4, label: 'Tier 4 — Deep Stash', min: 0,    max: 2000 },
]

const MY_BOARD_TIERS = [
  { id: 1, label: 'Tier 1 — Elite',      minRank: 1,  maxRank: 10 },
  { id: 2, label: 'Tier 2 — Strong',     minRank: 11, maxRank: 25 },
  { id: 3, label: 'Tier 3 — Upside',     minRank: 26, maxRank: 50 },
  { id: 4, label: 'Tier 4 — Deep Stash', minRank: 51, maxRank: Infinity },
]

const TIER_COLORS = {
  1: 'text-warning',
  2: 'text-accent',
  3: 'text-success',
  4: 'text-text-tertiary',
}

const SORT_COLS = ['value', 'adp', 'age', 'positionRank']
const COL_LABELS = { value: 'Value', adp: 'ADP', age: 'Age', positionRank: 'Pos Rk' }

const BOARD_ORDER_KEY = 'dynastyedge_board_order'
const NOTES_KEY       = 'dynastyedge_prospect_notes'
const CSV_KEY         = 'dynastyedge_csv_rankings'

// ── CSV parsing ──────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return {}
  const result = {}
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    const name = cols[0]?.replace(/^"|"$/g, '').trim()
    const rank = parseInt(cols[1]?.replace(/^"|"$/g, '').trim(), 10)
    if (name && !Number.isNaN(rank)) result[name.toLowerCase()] = rank
  }
  return result
}

// ── Pick slot display ─────────────────────────────────────────────────────────

function getMyPickSlot(myRoster) {
  const pick2026R1 = myRoster?.picks?.find(p => p.season === '2026' && p.round === 1)
  if (pick2026R1) {
    const slot = myRoster.rosterId
    return { slot, label: `1.0${slot}` }
  }
  return null
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function TierHeader({ tier }) {
  return (
    <div className="flex items-center gap-2 pt-5 pb-2">
      <span className={`font-display text-sm font-bold uppercase tracking-wider ${TIER_COLORS[tier.id]}`}>
        {tier.label}
      </span>
      <div className="flex-1 h-px bg-border-default" />
    </div>
  )
}

function SortHeader({ col, sortCol, sortDir, onSort, extra = '' }) {
  const active = sortCol === col
  return (
    <button
      onClick={() => onSort(col)}
      className={`flex items-center gap-0.5 font-body text-[10px] font-semibold uppercase tracking-wider select-none ${
        active ? 'text-accent' : 'text-text-tertiary'
      } ${extra}`}
    >
      {COL_LABELS[col]}
      {active && (sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
    </button>
  )
}

function FillsNeedBadge() {
  return (
    <span className="font-body text-[9px] font-bold uppercase tracking-wider text-success bg-success/15 border border-success/30 rounded px-1.5 py-0.5 flex-shrink-0 ml-1">
      Need
    </span>
  )
}

function AvailableBadge() {
  return (
    <span className="font-body text-[9px] font-bold uppercase tracking-wider text-warning bg-warning/15 border border-warning/30 rounded px-1.5 py-0.5 flex-shrink-0 ml-1">
      Avail
    </span>
  )
}

function AdpOnlyBadge() {
  return (
    <span className="font-body text-[9px] font-bold uppercase tracking-wider text-text-tertiary bg-bg-secondary border border-border-default rounded px-1.5 py-0.5 flex-shrink-0 ml-1">
      ADP Only
    </span>
  )
}

function CsvNamingOverlay({ file, onConfirm, onCancel }) {
  const [name, setName] = useState(() => file.name.replace(/\.[^.]+$/, ''))
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm bg-bg-secondary rounded-2xl border border-border-default p-5">
        <h3 className="font-display text-lg font-bold uppercase text-text-primary mb-1">Name this ranking</h3>
        <p className="font-body text-sm text-text-secondary mb-4">{file.name}</p>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg bg-bg-card border border-border-default font-body text-sm text-text-primary focus:outline-none focus:border-accent mb-4"
          autoFocus
        />
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-lg border border-border-default font-body text-sm text-text-secondary">
            Cancel
          </button>
          <button
            onClick={() => name.trim() && onConfirm(name.trim())}
            disabled={!name.trim()}
            className="flex-1 py-2.5 rounded-lg bg-accent text-white font-body text-sm font-medium disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  )
}

function ResetBoardConfirm({ onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-xs bg-bg-secondary rounded-2xl border border-border-default p-5 text-center">
        <h3 className="font-display text-lg font-bold uppercase text-text-primary mb-2">Reset My Board?</h3>
        <p className="font-body text-sm text-text-secondary mb-5">
          This restores the default FantasyCalc order and cannot be undone.
        </p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-lg border border-border-default font-body text-sm text-text-secondary">
            Cancel
          </button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-lg bg-danger text-white font-body text-sm font-medium">
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}

function SortablePlayerRow({
  player, isDraggable, myRank, fcRank,
  fillsNeed, avail, csvColumns, getLookupRank, hasNote, onSelect,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: player.sleeperId, disabled: !isDraggable })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 1 : 'auto',
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center border-b border-border-default last:border-0">
      {isDraggable && (
        <div
          {...attributes}
          {...listeners}
          className="pr-2 py-2.5 text-text-tertiary touch-none cursor-grab active:cursor-grabbing flex-shrink-0"
          aria-label="Drag to reorder"
        >
          <GripVertical size={14} strokeWidth={1.75} />
        </div>
      )}

      {myRank != null && (
        <div className="flex flex-col items-end w-9 flex-shrink-0 mr-1">
          <span className="font-mono text-sm font-bold text-text-primary tabular-nums leading-none">#{myRank}</span>
          {fcRank != null && (
            <span className="font-mono text-[9px] text-text-tertiary tabular-nums leading-none mt-0.5">FC #{fcRank}</span>
          )}
        </div>
      )}

      <button
        onClick={onSelect}
        className="flex-1 text-left py-2.5 flex items-center gap-2 active:opacity-60 transition-opacity min-w-0"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-x-1">
            <span className="font-body text-sm font-medium text-text-primary leading-tight truncate">{player.name}</span>
            {hasNote && <FileText size={11} className="text-accent flex-shrink-0" strokeWidth={1.75} />}
            {fillsNeed && <FillsNeedBadge />}
            {avail && <AvailableBadge />}
            {player.adpOnly && <AdpOnlyBadge />}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="font-body text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">{player.position}</span>
            <span className="text-text-tertiary text-[10px]">·</span>
            <span className="font-body text-[10px] text-text-tertiary">{player.team || 'TBD'}</span>
            {player.age != null && (
              <>
                <span className="text-text-tertiary text-[10px]">·</span>
                <span className="font-body text-[10px] text-text-tertiary">Age {Math.floor(player.age)}</span>
              </>
            )}
          </div>
        </div>

        {csvColumns.map(col => {
          const rank = getLookupRank(player, col)
          return (
            <span key={col.name} className="font-mono text-xs text-text-secondary tabular-nums w-12 text-right flex-shrink-0">
              {rank != null ? `#${rank}` : '—'}
            </span>
          )
        })}

        <span className="font-mono text-xs text-text-secondary tabular-nums w-10 text-right flex-shrink-0">
          {player.adp != null ? Number(player.adp).toFixed(0) : '—'}
        </span>

        <div className="flex items-center gap-1 w-12 justify-end flex-shrink-0">
          <span className="font-mono text-xs font-medium text-accent tabular-nums">
            {(player.value ?? 0).toLocaleString()}
          </span>
        </div>

        <span className="font-mono text-xs text-text-tertiary tabular-nums w-8 text-right flex-shrink-0">
          {player.age != null ? Math.floor(player.age) : '—'}
        </span>
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DraftBoard() {
  const { league, loading, error, retry, values } = useLeagueContext()
  const { rookieMap, loading: rookieLoading, error: rookieError, retry: rookieRetry } = useRookieADP()

  const [posFilter, setPosFilter]     = useState('ALL')
  const [sortCol, setSortCol]         = useState('adp')
  const [sortDir, setSortDir]         = useState('asc')
  const [csvColumns, setCsvColumns]   = useState([])
  const [selected, setSelected]       = useState(null)
  const [pendingFile, setPendingFile] = useState(null)
  const fileInputRef = useRef(null)

  const [boardMode, setBoardMode]       = useState('FantasyCalc')
  const [myBoardOrder, setMyBoardOrder] = useState(() => {
    try {
      const raw = localStorage.getItem(BOARD_ORDER_KEY)
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  })
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  const [prospectNotes, setProspectNotes] = useState(() => {
    try { return JSON.parse(localStorage.getItem(NOTES_KEY) ?? '{}') }
    catch { return {} }
  })

  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  )

  // My positional needs
  const needPositions = useMemo(() => {
    if (!league) return []
    const avgs = computeLeagueAverages(league.allRosters)
    const deltas = getPositionalDeltas(league.myRoster, avgs)
    return Object.entries(deltas).filter(([, d]) => d < 0).map(([p]) => p)
  }, [league])

  // My 2026 round-1 pick slot
  const myPickSlot = useMemo(() => {
    if (!league?.myRoster) return null
    return getMyPickSlot(league.myRoster)
  }, [league])

  // Name→FC entry for fallback matching
  const nameToFCEntry = useMemo(() => {
    if (!values?.playerMap) return {}
    const map = {}
    Object.values(values.playerMap).forEach(e => {
      if (e.name) map[e.name.toLowerCase()] = e
    })
    return map
  }, [values?.playerMap])

  // Rookie prospects enriched from FantasyCalc
  const rookies = useMemo(() => {
    if (!rookieMap) return []
    return Object.values(rookieMap).map(rookieEntry => {
      const mainEntry = values?.playerMap?.[rookieEntry.sleeperId]
      if (mainEntry) return { ...mainEntry }
      const nameMatch = nameToFCEntry[rookieEntry.name?.toLowerCase()]
      if (nameMatch) return { ...nameMatch, sleeperId: rookieEntry.sleeperId }
      return { ...rookieEntry, adpOnly: true }
    })
  }, [rookieMap, values, nameToFCEntry])

  // My Board rank map: sleeperId → 1-based rank position
  const rankMap = useMemo(() => {
    const map = {}
    myBoardOrder.forEach((id, idx) => { map[id] = idx + 1 })
    return map
  }, [myBoardOrder])

  // Filter + sort
  const sorted = useMemo(() => {
    const list = posFilter === 'ALL' ? rookies : rookies.filter(p => p.position === posFilter)

    if (boardMode === 'My Board' && sortCol === 'myOrder') {
      return [...list].sort((a, b) =>
        (rankMap[a.sleeperId] ?? 9999) - (rankMap[b.sleeperId] ?? 9999)
      )
    }

    return [...list].sort((a, b) => {
      const av = a[sortCol] ?? (sortDir === 'asc' ? Infinity : -Infinity)
      const bv = b[sortCol] ?? (sortDir === 'asc' ? Infinity : -Infinity)
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [rookies, posFilter, sortCol, sortDir, boardMode, rankMap])

  // Group by tier
  const byTier = useMemo(() => {
    const useMyTiers = boardMode === 'My Board' && sortCol === 'myOrder'
    const activeTiers = useMyTiers ? MY_BOARD_TIERS : TIERS
    const groups = {}
    activeTiers.forEach(t => { groups[t.id] = [] })
    sorted.forEach(p => {
      if (useMyTiers) {
        const rank = rankMap[p.sleeperId] ?? 9999
        const tier = MY_BOARD_TIERS.find(t => rank >= t.minRank && rank <= t.maxRank)
        if (tier) groups[tier.id].push(p)
      } else {
        const tier = TIERS.find(t => p.value >= t.min && p.value <= t.max)
        if (tier) groups[tier.id].push(p)
      }
    })
    return groups
  }, [sorted, boardMode, sortCol, rankMap])

  // ── Feature 3: CSV two-phase load ─────────────────────────────────────────
  useEffect(() => {
    let localData = null
    try {
      const raw = localStorage.getItem(CSV_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.columns?.length) {
          localData = parsed
          setCsvColumns(parsed.columns)
        }
      }
    } catch {}

    fetch(`${import.meta.env.BASE_URL}rankings.json`)
      .then(r => r.ok ? r.json() : null)
      .then(remote => {
        if (!remote?.columns?.length) return
        const localTime = localData?.savedAt ?? 0
        const remoteTime = remote.savedAt ?? 0
        if (remoteTime > localTime) {
          setCsvColumns(remote.columns)
          localStorage.setItem(CSV_KEY, JSON.stringify({
            version: 1,
            savedAt: remoteTime,
            columns: remote.columns,
          }))
        }
      })
      .catch(() => {})
  }, [])

  // ── Feature 2: Notes persistence ──────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem(NOTES_KEY, JSON.stringify(prospectNotes))
  }, [prospectNotes])

  // ── Feature 1: My Board init + new player merge ────────────────────────────
  useEffect(() => {
    if (rookies.length === 0) return
    setMyBoardOrder(prev => {
      if (prev.length === 0) {
        return [...rookies]
          .sort((a, b) => (a.adp ?? a.overallRank ?? 999) - (b.adp ?? b.overallRank ?? 999))
          .map(p => p.sleeperId)
      }
      const boardSet = new Set(prev)
      const newPlayers = rookies
        .filter(p => !boardSet.has(p.sleeperId))
        .sort((a, b) => (a.adp ?? a.overallRank ?? 999) - (b.adp ?? b.overallRank ?? 999))
      if (newPlayers.length === 0) return prev
      return [...prev, ...newPlayers.map(p => p.sleeperId)]
    })
  }, [rookies])

  // ── Feature 1: My Board persistence ───────────────────────────────────────
  useEffect(() => {
    if (myBoardOrder.length === 0) return
    localStorage.setItem(BOARD_ORDER_KEY, JSON.stringify(myBoardOrder))
  }, [myBoardOrder])

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir(col === 'value' ? 'desc' : 'asc') }
  }

  function handleBoardModeToggle(mode) {
    setBoardMode(mode)
    if (mode === 'My Board') { setSortCol('myOrder'); setSortDir('asc') }
    else { setSortCol('adp'); setSortDir('asc') }
  }

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    setMyBoardOrder(prev => {
      const oldIndex = prev.indexOf(active.id)
      const newIndex = prev.indexOf(over.id)
      if (oldIndex === -1 || newIndex === -1) return prev
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  function resetMyBoard() {
    const initialOrder = [...rookies]
      .sort((a, b) => (a.adp ?? a.overallRank ?? 999) - (b.adp ?? b.overallRank ?? 999))
      .map(p => p.sleeperId)
    setMyBoardOrder(initialOrder)
    setShowResetConfirm(false)
  }

  const handleFileChange = useCallback(e => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = ev => setPendingFile({ file, data: parseCSV(ev.target.result) })
    reader.readAsText(file)
  }, [])

  function confirmCsvName(name) {
    if (!pendingFile) return
    const next = [...csvColumns.filter(c => c.name !== name), { name, data: pendingFile.data }]
    setCsvColumns(next)
    localStorage.setItem(CSV_KEY, JSON.stringify({ version: 1, savedAt: Date.now(), columns: next }))
    setPendingFile(null)
  }

  function removeColumn(name) {
    const next = csvColumns.filter(c => c.name !== name)
    setCsvColumns(next)
    if (next.length > 0) {
      localStorage.setItem(CSV_KEY, JSON.stringify({ version: 1, savedAt: Date.now(), columns: next }))
    } else {
      localStorage.removeItem(CSV_KEY)
    }
  }

  function saveRankings() {
    const json = JSON.stringify({ version: 1, savedAt: Date.now(), columns: csvColumns }, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'rankings.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  function isLikelyAvailable(player) {
    if (!myPickSlot) return false
    return (player.adp ?? player.overallRank ?? 999) > myPickSlot.slot
  }

  function getLookupRank(player, col) {
    return col.data?.[player.name?.toLowerCase()] ?? null
  }

  const updateNote = useCallback((sleeperId, text) => {
    setProspectNotes(prev => {
      const trimmed = text.trim()
      if (!trimmed) {
        const next = { ...prev }
        delete next[sleeperId]
        return next
      }
      return { ...prev, [sleeperId]: trimmed }
    })
  }, [])

  const isDragEnabled = boardMode === 'My Board' && posFilter === 'ALL' && sortCol === 'myOrder'
  const activeTiers   = (boardMode === 'My Board' && sortCol === 'myOrder') ? MY_BOARD_TIERS : TIERS

  function renderTierGroups() {
    return activeTiers.map(tier => {
      const players = byTier[tier.id]
      if (!players?.length) return null
      return (
        <div key={tier.id}>
          <TierHeader tier={tier} />
          <div className="rounded-xl bg-bg-card border border-border-default px-3">
            {players.map(player => (
              <SortablePlayerRow
                key={player.sleeperId}
                player={player}
                isDraggable={isDragEnabled}
                myRank={boardMode === 'My Board' ? (rankMap[player.sleeperId] ?? null) : null}
                fcRank={boardMode === 'My Board' ? (player.overallRank ?? null) : null}
                fillsNeed={needPositions.includes(player.position)}
                avail={isLikelyAvailable(player)}
                csvColumns={csvColumns}
                getLookupRank={getLookupRank}
                hasNote={!!prospectNotes[player.sleeperId]}
                onSelect={() => setSelected(player)}
              />
            ))}
          </div>
        </div>
      )
    })
  }

  if (loading || rookieLoading) return <LoadingSpinner message="Loading draft data…" />
  if (error || rookieError) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 px-4 text-center">
      <AlertTriangle size={24} className="text-warning" strokeWidth={1.75} />
      <p className="text-text-secondary font-body text-sm">{error || rookieError}</p>
      <button onClick={error ? retry : rookieRetry} className="px-4 py-2 rounded-lg bg-accent text-white font-body font-medium text-sm">Retry</button>
    </div>
  )

  return (
    <>
      <div className="pb-4">

        {/* ── Board mode toggle ── */}
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <div className="flex rounded-lg border border-border-default overflow-hidden">
            {['FantasyCalc', 'My Board'].map(mode => (
              <button
                key={mode}
                onClick={() => handleBoardModeToggle(mode)}
                className={`px-3 py-1.5 font-body text-xs font-semibold transition-colors ${
                  boardMode === mode ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
          {boardMode === 'My Board' && (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="flex items-center gap-1 text-text-tertiary hover:text-danger transition-colors"
            >
              <RotateCcw size={13} strokeWidth={1.75} />
              <span className="font-body text-[11px]">Reset to FC</span>
            </button>
          )}
        </div>

        {/* ── Position filter + actions ── */}
        <div className="px-4 pb-3 flex items-center gap-2">
          <div className="flex gap-1.5 flex-1 overflow-x-auto">
            {POS_FILTERS.map(pos => (
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
          <div className="flex gap-1.5 flex-shrink-0">
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Upload CSV rankings"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-bg-card border border-border-default text-text-secondary hover:text-text-primary transition-colors"
            >
              <Upload size={13} strokeWidth={1.75} />
              <span className="font-body text-[11px] font-semibold uppercase tracking-wide">CSV</span>
            </button>
            {csvColumns.length > 0 && (
              <button
                onClick={saveRankings}
                title="Download rankings.json"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-bg-card border border-border-default text-text-secondary hover:text-text-primary transition-colors"
              >
                <Save size={13} strokeWidth={1.75} />
                <span className="font-body text-[11px] font-semibold uppercase tracking-wide">Save</span>
              </button>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
        </div>

        {/* ── My pick callout ── */}
        {myPickSlot && (
          <div className="mx-4 mb-3 px-3 py-2 rounded-lg bg-warning/10 border border-warning/30 flex items-center gap-2">
            <span className="font-mono text-sm font-bold text-warning">{myPickSlot.label}</span>
            <span className="font-body text-xs text-text-secondary">
              Prospects marked <span className="text-warning font-semibold">Avail</span> are projected available at your pick based on ADP
            </span>
          </div>
        )}

        {/* ── CSV column chips ── */}
        {csvColumns.length > 0 && (
          <div className="px-4 mb-3 flex flex-wrap gap-1.5">
            {csvColumns.map(col => (
              <div key={col.name} className="flex items-center gap-1 px-2 py-0.5 rounded bg-bg-card border border-border-default">
                <span className="font-body text-[10px] text-text-secondary">{col.name}</span>
                <button
                  onClick={() => removeColumn(col.name)}
                  className="text-text-tertiary hover:text-danger transition-colors ml-0.5 leading-none text-xs"
                  aria-label={`Remove ${col.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Sort header row ── */}
        <div className="px-4 mb-1 flex items-center gap-3">
          <span className="flex-1 font-body text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">Player</span>
          {boardMode === 'My Board' && (
            <button
              onClick={() => { setSortCol('myOrder'); setSortDir('asc') }}
              className={`flex items-center gap-0.5 font-body text-[10px] font-semibold uppercase tracking-wider select-none w-10 justify-end ${
                sortCol === 'myOrder' ? 'text-accent' : 'text-text-tertiary'
              }`}
            >
              Rank
              {sortCol === 'myOrder' && <ChevronUp size={10} />}
            </button>
          )}
          {csvColumns.map(col => (
            <span key={col.name} className="font-body text-[10px] font-semibold uppercase tracking-wider text-text-tertiary w-12 text-right truncate">
              {col.name}
            </span>
          ))}
          <SortHeader col="adp"   sortCol={sortCol} sortDir={sortDir} onSort={handleSort} extra="w-10 justify-end" />
          <SortHeader col="value" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} extra="w-12 justify-end" />
          <SortHeader col="age"   sortCol={sortCol} sortDir={sortDir} onSort={handleSort} extra="w-8 justify-end" />
        </div>

        {/* ── Tier groups ── */}
        {sorted.length === 0 && (
          <p className="px-4 text-center text-text-tertiary font-body text-sm py-10">
            No rookie prospects loaded yet.
          </p>
        )}
        <DndContext
          sensors={isDragEnabled ? sensors : []}
          collisionDetection={closestCenter}
          onDragEnd={isDragEnabled ? handleDragEnd : undefined}
        >
          <SortableContext
            items={isDragEnabled ? sorted.map(p => p.sleeperId) : []}
            strategy={verticalListSortingStrategy}
          >
            <div className="px-4">
              {renderTierGroups()}
            </div>
          </SortableContext>
        </DndContext>

        {rookies.length === 0 && !loading && !rookieLoading && (
          <p className="px-4 pt-6 text-center font-body text-xs text-text-tertiary">
            No 2026 rookie prospects found. FantasyCalc's rookie endpoint will populate once the draft class is available.
          </p>
        )}
      </div>

      {/* ── CSV name prompt ── */}
      {pendingFile && (
        <CsvNamingOverlay
          file={pendingFile.file}
          onConfirm={confirmCsvName}
          onCancel={() => setPendingFile(null)}
        />
      )}

      {/* ── Reset board confirm ── */}
      {showResetConfirm && (
        <ResetBoardConfirm
          onConfirm={resetMyBoard}
          onCancel={() => setShowResetConfirm(false)}
        />
      )}

      {/* ── Profile drawer ── */}
      {selected && (
        <PlayerProfileDrawer
          player={selected}
          playerMap={values?.playerMap ?? {}}
          csvColumns={csvColumns}
          onClose={() => setSelected(null)}
          isDraftContext
          note={prospectNotes[selected.sleeperId]}
          onNoteChange={updateNote}
        />
      )}
    </>
  )
}
