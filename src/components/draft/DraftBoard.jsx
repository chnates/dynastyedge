import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import {
  Upload, Save, ChevronUp, ChevronDown,
  FileText, GripVertical, RotateCcw, Trash2, Search, RefreshCw,
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
import { buildRookieProspects } from '../../utils/rookieAdp'
import { useSleeperDraft, buildDraftOrder } from '../../hooks/useSleeperDraft'
import { getPositionalDeltas, computeLeagueAverages } from '../../utils/rosterAnalysis'
import { BOARD_ORDER_KEY, NOTES_KEY, CSV_KEY } from './boardStorage'
import LoadingSpinner from '../shared/LoadingSpinner'
import ErrorState from '../shared/ErrorState'
import PlayerProfileDrawer from '../shared/PlayerProfileDrawer'
import { POS_CHIP_ACTIVE, POS_TEXT } from '../../utils/positionColors'

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
  5: 'text-text-tertiary',
  6: 'text-text-tertiary',
  99: 'text-text-tertiary',
}

const COL_LABELS = { value: 'Value', adp: 'Rk ADP' }

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

// ── FantasyPros CSV parsing ───────────────────────────────────────────────────

function parseCsvLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

function parseFantasyProsCsv(text) {
  const lines = text.split(/\r?\n/)
  if (lines.length < 2) return []
  const entries = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const cols = parseCsvLine(lines[i])
    const rank = parseInt(cols[0], 10)
    const tier = parseInt(cols[1], 10)
    const fpName = cols[2]?.trim()
    const team = cols[3]?.trim()
    const pos = cols[4]?.trim().replace(/\d+$/, '') // "RB1" → "RB"
    const age = cols[5]?.trim()
    const notes = cols[6]?.trim() ?? ''
    if (!fpName || isNaN(rank)) continue
    entries.push({ rank, tier: isNaN(tier) ? 99 : tier, fpName, team, pos, age, notes })
  }
  return entries
}

function fuzzyMatchFPName(fpName, sleeperName) {
  const fp = fpName.toLowerCase().trim()
  const sl = sleeperName.toLowerCase().trim()
  if (fp === sl) return true
  // Handle "j. love" → "jeremiyah love"
  const abbrev = fp.match(/^([a-z])\.\s+(.+)$/)
  if (abbrev) {
    const [, initial, lastName] = abbrev
    const parts = sl.split(' ')
    if (parts.length >= 2) {
      const sleeperLast = parts.slice(1).join(' ')
      if (parts[0][0] === initial && sleeperLast === lastName) return true
    }
  }
  return false
}

function splitFPNotes(notes) {
  if (!notes) return { scoutingReport: '', dynastyOutlook: '' }
  const idx = notes.indexOf('Dynasty Outlook:')
  if (idx === -1) return { scoutingReport: notes, dynastyOutlook: '' }
  return {
    scoutingReport: notes.slice(0, idx).trim(),
    dynastyOutlook: notes.slice(idx + 'Dynasty Outlook:'.length).trim(),
  }
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

// "Still available at your 2.06" — shows the latest of my remaining picks
// where this prospect is projected available (by derived rookie ADP).
function TargetBadge({ label }) {
  return (
    <span className="font-mono text-[9px] font-bold text-warning bg-warning/15 border border-warning/30 rounded px-1.5 py-0.5 flex-shrink-0 ml-1">
      {label}
    </span>
  )
}

function DraftedChip() {
  return (
    <span className="font-body text-[9px] font-bold uppercase tracking-wider text-text-tertiary bg-bg-secondary border border-border-default rounded px-1.5 py-0.5 flex-shrink-0 ml-1">
      Drafted
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

function FpOnlyBadge() {
  return (
    <span className="font-body text-[9px] font-bold uppercase tracking-wider text-accent bg-accent/15 border border-accent/30 rounded px-1.5 py-0.5 flex-shrink-0 ml-1">
      FP Only
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
  fillsNeed, targetLabel, drafted, csvColumns, getLookupRank, hasNote, onSelect,
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
        className={`flex-1 text-left py-2.5 flex items-center gap-2 active:opacity-60 transition-opacity min-w-0 ${drafted ? 'opacity-50' : ''}`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-x-1">
            <span className={`font-body text-sm font-medium leading-tight truncate ${drafted ? 'text-text-tertiary line-through' : 'text-text-primary'}`}>{player.name}</span>
            {hasNote && <FileText size={11} className="text-accent flex-shrink-0" strokeWidth={1.75} />}
            {drafted && <DraftedChip />}
            {!drafted && fillsNeed && <FillsNeedBadge />}
            {!drafted && targetLabel && <TargetBadge label={targetLabel} />}
            {player.fpOnly && <FpOnlyBadge />}
            {!player.fpOnly && player.adpOnly && <AdpOnlyBadge />}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className={`font-body text-[10px] font-semibold uppercase tracking-wide ${POS_TEXT[player.position] ?? 'text-text-tertiary'}`}>{player.position}</span>
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

        <span className="font-mono text-xs text-text-secondary tabular-nums w-12 text-right flex-shrink-0">
          {player.adp != null ? Number(player.adp).toFixed(0) : '—'}
        </span>

        <div className="flex items-center gap-1 w-12 justify-end flex-shrink-0">
          <span className="font-mono text-xs font-medium text-accent tabular-nums">
            {(player.value ?? 0).toLocaleString()}
          </span>
        </div>
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DraftBoard() {
  const { league, loading, error, retry, values, myRosterId } = useLeagueContext()
  const { rookieMap, loading: rookieLoading, error: rookieError, retry: rookieRetry } = useRookieADP()

  const [posFilter, setPosFilter]     = useState('ALL')
  const [search, setSearch]           = useState('')
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

  const [fpRawEntries, setFpRawEntries] = useState([])

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

  // Live Sleeper draft (session-cached, shared with the Tracker): drafted
  // players grey out and "available at your pick" badges use the real order.
  const sleeperDraft = useSleeperDraft()
  const draftSync = useMemo(() => {
    const draft = sleeperDraft.data?.draft
    if (!draft) return null
    const order = buildDraftOrder(draft, sleeperDraft.data.tradedPicks)
    const picksMade = sleeperDraft.data.picks.length
    const totalPicks = order?.length ?? 0
    const complete = draft.status === 'complete' ||
      (totalPicks > 0 && picksMade >= totalPicks)
    return {
      draft,
      draftedIds: new Set(sleeperDraft.data.picks.map(p => String(p.player_id))),
      myRemaining: order && !complete
        ? order.slice(picksMade).filter(p => p.rosterId === myRosterId)
        : [],
      live: draft.status === 'drafting' || draft.status === 'paused',
    }
  }, [sleeperDraft.data])

  // Rookie prospects enriched from FantasyCalc, with adp = rank within the
  // rookie class (1..N by FantasyCalc overall rank — see utils/rookieAdp.js)
  const rookies = useMemo(
    () => buildRookieProspects(rookieMap, values?.playerMap),
    [rookieMap, values]
  )

  // FantasyPros column, notes map, and FP-only players (matched against Sleeper rookies)
  const { fpColumn, fpNotesMap, fpOnlyPlayers } = useMemo(() => {
    if (!fpRawEntries.length) return { fpColumn: null, fpNotesMap: {}, fpOnlyPlayers: [] }
    const columnData = {}
    const tierData = {}
    const notesMap = {}
    const onlyPlayers = []
    fpRawEntries.forEach((entry, idx) => {
      const match = rookies.find(r => fuzzyMatchFPName(entry.fpName, r.name))
      if (match) {
        const key = match.name.toLowerCase()
        columnData[key] = entry.rank
        tierData[key] = entry.tier
        notesMap[match.sleeperId] = splitFPNotes(entry.notes)
      } else {
        const key = entry.fpName.toLowerCase()
        columnData[key] = entry.rank
        tierData[key] = entry.tier
        const syntheticId = `fp_${idx}`
        notesMap[syntheticId] = splitFPNotes(entry.notes)
        onlyPlayers.push({
          sleeperId: syntheticId,
          name: entry.fpName,
          position: entry.pos,
          team: entry.team || null,
          age: parseFloat(entry.age) || null,
          fpOnly: true,
          adpOnly: true,
          value: undefined, adp: undefined, overallRank: undefined, positionRank: undefined,
        })
      }
    })
    return {
      fpColumn: { name: 'FantasyPros', shortName: 'FP', sortKey: 'fp', data: columnData, tierData, isPreloaded: true },
      fpNotesMap: notesMap,
      fpOnlyPlayers: onlyPlayers,
    }
  }, [fpRawEntries, rookies])

  // All prospects: Sleeper rookies + FP-only players not in Sleeper
  const allProspects = useMemo(() => [...rookies, ...fpOnlyPlayers], [rookies, fpOnlyPlayers])

  // All display columns: pre-loaded FP column first, then user-uploaded CSV columns
  const allColumns = useMemo(
    () => fpColumn ? [fpColumn, ...csvColumns] : csvColumns,
    [fpColumn, csvColumns]
  )

  // My Board rank map: sleeperId → 1-based rank position
  const rankMap = useMemo(() => {
    const map = {}
    myBoardOrder.forEach((id, idx) => { map[id] = idx + 1 })
    return map
  }, [myBoardOrder])

  // Filter + sort
  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = allProspects.filter(p =>
      (posFilter === 'ALL' || p.position === posFilter) &&
      (!q || p.name?.toLowerCase().includes(q))
    )

    if (boardMode === 'My Board' && sortCol === 'myOrder') {
      return [...list].sort((a, b) =>
        (rankMap[a.sleeperId] ?? 9999) - (rankMap[b.sleeperId] ?? 9999)
      )
    }

    if (sortCol === 'fp' && fpColumn) {
      return [...list].sort((a, b) => {
        const av = fpColumn.data?.[a.name?.toLowerCase()] ?? Infinity
        const bv = fpColumn.data?.[b.name?.toLowerCase()] ?? Infinity
        return sortDir === 'asc' ? av - bv : bv - av
      })
    }

    return [...list].sort((a, b) => {
      const av = a[sortCol] ?? (sortDir === 'asc' ? Infinity : -Infinity)
      const bv = b[sortCol] ?? (sortDir === 'asc' ? Infinity : -Infinity)
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [allProspects, posFilter, search, sortCol, sortDir, boardMode, rankMap, fpColumn])

  // Group by tier
  const byTier = useMemo(() => {
    // FP sort: group by FantasyPros TIERS field
    if (sortCol === 'fp' && fpColumn?.tierData) {
      const groups = {}
      sorted.forEach(p => {
        const t = fpColumn.tierData[p.name?.toLowerCase()] ?? 99
        if (!groups[t]) groups[t] = []
        groups[t].push(p)
      })
      return groups
    }

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
        const tier = TIERS.find(t => p.value >= t.min && p.value <= t.max) ?? TIERS[TIERS.length - 1]
        groups[tier.id].push(p)
      }
    })
    return groups
  }, [sorted, boardMode, sortCol, rankMap, fpColumn])

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

  // ── FantasyPros CSV auto-load ──────────────────────────────────────────────
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}FantasyPros_2026_Rookies_OP_Rankings.csv`)
      .then(r => r.ok ? r.text() : null)
      .then(text => { if (text) setFpRawEntries(parseFantasyProsCsv(text)) })
      .catch(() => {})
  }, [])

  // ── Feature 2: Notes persistence ──────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem(NOTES_KEY, JSON.stringify(prospectNotes))
  }, [prospectNotes])

  // ── Feature 1: My Board init + new player merge ────────────────────────────
  useEffect(() => {
    if (allProspects.length === 0) return
    setMyBoardOrder(prev => {
      if (prev.length === 0) {
        return [...allProspects]
          .sort((a, b) => (a.adp ?? 999) - (b.adp ?? 999))
          .map(p => p.sleeperId)
      }
      const boardSet = new Set(prev)
      const newPlayers = allProspects
        .filter(p => !boardSet.has(p.sleeperId))
        .sort((a, b) => (a.adp ?? 999) - (b.adp ?? 999))
      if (newPlayers.length === 0) return prev
      return [...prev, ...newPlayers.map(p => p.sleeperId)]
    })
  }, [allProspects])

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
    const initialOrder = [...allProspects]
      .sort((a, b) => (a.adp ?? 999) - (b.adp ?? 999))
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

  // Latest of my remaining picks where this prospect is still projected
  // available (rookie ADP ≈ overall pick in a rookie-only draft).
  function targetLabelFor(player) {
    const myRemaining = draftSync?.myRemaining
    if (!myRemaining?.length || player.adp == null) return null
    for (let i = myRemaining.length - 1; i >= 0; i--) {
      if (myRemaining[i].overall <= player.adp) return myRemaining[i].label
    }
    return null
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

  const isDragEnabled = boardMode === 'My Board' && posFilter === 'ALL' && !search.trim() && sortCol === 'myOrder'
  const activeTiers = (() => {
    if (sortCol === 'fp' && fpColumn?.tierData) {
      const tierNums = [...new Set(Object.values(fpColumn.tierData))].sort((a, b) => a - b)
      return tierNums.map(t => ({ id: t, label: `FP Tier ${t}` }))
    }
    if (boardMode === 'My Board' && sortCol === 'myOrder') return MY_BOARD_TIERS
    return TIERS
  })()

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
                targetLabel={targetLabelFor(player)}
                drafted={draftSync?.draftedIds.has(player.sleeperId) ?? false}
                csvColumns={allColumns}
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
  if (error || rookieError) {
    return <ErrorState message={error || rookieError} onRetry={error ? retry : rookieRetry} />
  }

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
        {boardMode === 'My Board' && !isDragEnabled && (
          <p className="px-4 pb-2 font-body text-[10px] text-text-tertiary">
            Drag-to-reorder is paused — clear search/position filters and sort by Rank to reorder.
          </p>
        )}

        {/* ── Position filter + actions ── */}
        <div className="px-4 pb-3 flex items-center gap-2">
          <div className="flex gap-1.5 flex-1 overflow-x-auto">
            {POS_FILTERS.map(pos => (
              <button
                key={pos}
                onClick={() => setPosFilter(pos)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg font-body text-xs font-semibold uppercase tracking-wide transition-colors ${
                  posFilter === pos
                    ? POS_CHIP_ACTIVE[pos] ?? 'bg-accent text-white'
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

        {/* ── Search ── */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" strokeWidth={1.75} />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search prospects"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-bg-card border border-border-default font-body text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent"
            />
          </div>
        </div>

        {/* ── My picks callout (real slots from the synced Sleeper draft) ── */}
        {draftSync && draftSync.myRemaining.length > 0 && (
          <div className="mx-4 mb-3 px-3 py-2 rounded-lg bg-warning/10 border border-warning/30">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-body text-[10px] font-semibold uppercase tracking-wider text-text-secondary">Your picks</span>
              {draftSync.myRemaining.map(p => (
                <span key={p.label} className="font-mono text-sm font-bold text-warning">{p.label}</span>
              ))}
              <span className="flex-1" />
              {draftSync.live && (
                <button
                  onClick={sleeperDraft.refresh}
                  aria-label="Refresh draft"
                  className="text-text-tertiary active:opacity-60 transition-opacity"
                >
                  <RefreshCw size={13} strokeWidth={1.75} className={sleeperDraft.refreshing ? 'animate-spin' : ''} />
                </button>
              )}
            </div>
            <p className="font-body text-[10px] text-text-secondary mt-0.5">
              Amber badges mark the latest of your picks each prospect should still be available at, by Rk ADP
            </p>
          </div>
        )}

        {/* ── CSV column chips (user-uploaded only; pre-loaded FP shown via column header) ── */}
        {csvColumns.length > 0 && (
          <div className="px-4 mb-3">
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {csvColumns.map(col => (
                <div key={col.name} className="flex items-center gap-1 px-2 py-0.5 rounded bg-bg-card border border-border-default">
                  <span className="font-body text-[10px] text-text-secondary">{col.name}</span>
                  <button
                    onClick={() => removeColumn(col.name)}
                    className="text-text-tertiary hover:text-danger transition-colors ml-0.5 leading-none"
                    aria-label={`Remove ${col.name}`}
                  >
                    <Trash2 size={11} strokeWidth={1.75} />
                  </button>
                </div>
              ))}
            </div>
            <p className="font-body text-[10px] text-text-tertiary">
              Commit rankings.json to <span className="font-mono">public/rankings.json</span> via Claude Code to sync across devices.
            </p>
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
          {allColumns.map(col =>
            col.sortKey ? (
              <button
                key={col.name}
                onClick={() => handleSort(col.sortKey)}
                title={col.name}
                className={`flex items-center gap-0.5 font-body text-[10px] font-semibold uppercase tracking-wider select-none w-12 justify-end ${
                  sortCol === col.sortKey ? 'text-accent' : 'text-text-tertiary'
                }`}
              >
                {col.shortName ?? col.name}
                {sortCol === col.sortKey && (sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
              </button>
            ) : (
              <span key={col.name} title={col.name} className="font-body text-[10px] font-semibold uppercase tracking-wider text-text-tertiary w-12 text-right truncate">
                {col.shortName ?? col.name}
              </span>
            )
          )}
          <SortHeader col="adp"   sortCol={sortCol} sortDir={sortDir} onSort={handleSort} extra="w-12 justify-end" />
          <SortHeader col="value" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} extra="w-12 justify-end" />
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

        {allProspects.length === 0 && !loading && !rookieLoading && (
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
          csvColumns={allColumns}
          onClose={() => setSelected(null)}
          isDraftContext
          note={prospectNotes[selected.sleeperId]}
          onNoteChange={updateNote}
          fpNotesMap={fpNotesMap}
        />
      )}
    </>
  )
}
