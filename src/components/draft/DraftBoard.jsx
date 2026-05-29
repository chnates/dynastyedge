import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { Upload, Save, ChevronUp, ChevronDown, AlertTriangle } from 'lucide-react'
import { useLeagueContext } from '../../context/LeagueContext'
import { getPositionalDeltas, computeLeagueAverages } from '../../utils/rosterAnalysis'
import LoadingSpinner from '../shared/LoadingSpinner'
import TrendArrow from '../shared/TrendArrow'
import PlayerProfileDrawer from '../shared/PlayerProfileDrawer'

// ── Constants ────────────────────────────────────────────────────────────────

const POS_FILTERS = ['ALL', 'QB', 'RB', 'WR', 'TE']

const TIERS = [
  { id: 1, label: 'Tier 1 — Elite',     min: 7001, max: Infinity },
  { id: 2, label: 'Tier 2 — Strong',    min: 4001, max: 7000 },
  { id: 3, label: 'Tier 3 — Upside',    min: 2001, max: 4000 },
  { id: 4, label: 'Tier 4 — Deep Stash', min: 0,   max: 2000 },
]

const TIER_COLORS = {
  1: 'text-warning',
  2: 'text-accent',
  3: 'text-success',
  4: 'text-text-tertiary',
}

const SORT_COLS = ['value', 'adp', 'age', 'positionRank']
const COL_LABELS = { value: 'Value', adp: 'ADP', age: 'Age', positionRank: 'Pos Rk' }

// ── CSV parsing ──────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return {}
  const result = {}
  // Skip header row, assume col 0 = name, col 1 = rank
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    const name = cols[0]?.replace(/^"|"$/g, '').trim()
    const rank = parseInt(cols[1]?.replace(/^"|"$/g, '').trim(), 10)
    if (name && !Number.isNaN(rank)) {
      result[name.toLowerCase()] = rank
    }
  }
  return result
}

// ── Pick slot display ─────────────────────────────────────────────────────────

function getMyPickSlot(myRoster) {
  const pick2026R1 = myRoster?.picks?.find(p => p.season === '2026' && p.round === 1)
  if (pick2026R1) {
    // Derive slot from rosterId — standard dynasty draft order (roster 6 = slot 6)
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
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg border border-border-default font-body text-sm text-text-secondary"
          >
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

// ── Main component ────────────────────────────────────────────────────────────

export default function DraftBoard() {
  const { league, loading, error, retry, values } = useLeagueContext()

  const [posFilter, setPosFilter]   = useState('ALL')
  const [sortCol, setSortCol]       = useState('adp')
  const [sortDir, setSortDir]       = useState('asc')
  const [csvColumns, setCsvColumns] = useState([])    // [{ name, data: { lowerName: rank } }]
  const [selected, setSelected]     = useState(null)
  const [pendingFile, setPendingFile] = useState(null) // { file, parsedData }
  const fileInputRef = useRef(null)

  // Load saved rankings.json on mount
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}rankings.json`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (json?.columns?.length) setCsvColumns(json.columns)
      })
      .catch(() => {})
  }, [])

  // My positional needs
  const needPositions = useMemo(() => {
    if (!league) return []
    const avgs = computeLeagueAverages(league.allRosters)
    const deltas = getPositionalDeltas(league.myRoster, avgs)
    return Object.entries(deltas).filter(([, d]) => d < 0).map(([p]) => p)
  }, [league])

  // My 2026 round-1 pick slot for "available at your pick" callout
  const myPickSlot = useMemo(() => {
    if (!league?.myRoster) return null
    return getMyPickSlot(league.myRoster)
  }, [league])

  // Rookie prospects: explicitly marked by FantasyCalc (experience=0) OR
  // not yet on any fantasy roster and young enough to be the 2026 draft class
  const rookies = useMemo(() => {
    if (!values?.playerMap) return []
    const rostered = new Set()
    league?.allRosters?.forEach(r => r.players.forEach(p => rostered.add(p.sleeperId)))
    return Object.values(values.playerMap).filter(p => {
      if (!['QB', 'RB', 'WR', 'TE'].includes(p.position)) return false
      if (p.experience === 0) return true
      // Fallback: not on any dynasty roster + 2026 draft class age window
      return p.experience == null && !rostered.has(p.sleeperId) && p.age != null && p.age <= 23.5
    })
  }, [values, league])

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir(col === 'value' ? 'desc' : 'asc') }
  }

  // Filter + sort
  const sorted = useMemo(() => {
    let list = posFilter === 'ALL' ? rookies : rookies.filter(p => p.position === posFilter)
    return [...list].sort((a, b) => {
      let av = a[sortCol] ?? (sortDir === 'asc' ? Infinity : -Infinity)
      let bv = b[sortCol] ?? (sortDir === 'asc' ? Infinity : -Infinity)
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [rookies, posFilter, sortCol, sortDir])

  // Group by tier
  const byTier = useMemo(() => {
    const groups = {}
    TIERS.forEach(t => { groups[t.id] = [] })
    sorted.forEach(p => {
      const tier = TIERS.find(t => p.value >= t.min && p.value <= t.max)
      if (tier) groups[tier.id].push(p)
    })
    return groups
  }, [sorted])

  // CSV upload handler
  const handleFileChange = useCallback(e => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target.result
      const data = parseCSV(text)
      setPendingFile({ file, data })
    }
    reader.readAsText(file)
  }, [])

  function confirmCsvName(name) {
    if (!pendingFile) return
    setCsvColumns(prev => {
      const filtered = prev.filter(c => c.name !== name)
      return [...filtered, { name, data: pendingFile.data }]
    })
    setPendingFile(null)
  }

  function saveRankings() {
    const json = JSON.stringify({ version: 1, columns: csvColumns }, null, 2)
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
    const adp = player.adp ?? player.overallRank ?? 999
    return adp > myPickSlot.slot
  }

  function getLookupRank(player, col) {
    const rank = col.data?.[player.name?.toLowerCase()]
    return rank ?? null
  }

  if (loading) return <LoadingSpinner message="Loading draft data…" />
  if (error) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 px-4 text-center">
      <AlertTriangle size={24} className="text-warning" strokeWidth={1.75} />
      <p className="text-text-secondary font-body text-sm">{error}</p>
      <button onClick={retry} className="px-4 py-2 rounded-lg bg-accent text-white font-body font-medium text-sm">Retry</button>
    </div>
  )

  return (
    <>
      <div className="pb-4">
        {/* ── Position filter + actions ── */}
        <div className="px-4 pt-4 pb-3 flex items-center gap-2">
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
                  onClick={() => setCsvColumns(prev => prev.filter(c => c.name !== col.name))}
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
          {csvColumns.map(col => (
            <span key={col.name} className="font-body text-[10px] font-semibold uppercase tracking-wider text-text-tertiary w-12 text-right truncate">
              {col.name}
            </span>
          ))}
          <SortHeader col="adp" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} extra="w-10 justify-end" />
          <SortHeader col="value" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} extra="w-12 justify-end" />
          <SortHeader col="age" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} extra="w-8 justify-end" />
        </div>

        {/* ── Tier groups ── */}
        <div className="px-4">
          {sorted.length === 0 && (
            <p className="text-center text-text-tertiary font-body text-sm py-10">
              No rookie prospects loaded yet.
            </p>
          )}
          {TIERS.map(tier => {
            const players = byTier[tier.id]
            if (!players?.length) return null
            return (
              <div key={tier.id}>
                <TierHeader tier={tier} />
                <div className="rounded-xl bg-bg-card border border-border-default px-3">
                  {players.map((player, i) => {
                    const fillsNeed = needPositions.includes(player.position)
                    const avail = isLikelyAvailable(player)
                    return (
                      <button
                        key={player.sleeperId}
                        onClick={() => setSelected(player)}
                        className={`w-full text-left py-2.5 flex items-center gap-2 active:opacity-60 transition-opacity ${
                          i < players.length - 1 ? 'border-b border-border-default' : ''
                        }`}
                      >
                        {/* Name + tags */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center flex-wrap gap-x-1">
                            <span className="font-body text-sm font-medium text-text-primary leading-tight truncate">
                              {player.name}
                            </span>
                            {fillsNeed && <FillsNeedBadge />}
                            {avail && <AvailableBadge />}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="font-body text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
                              {player.position}
                            </span>
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

                        {/* CSV rank columns */}
                        {csvColumns.map(col => {
                          const rank = getLookupRank(player, col)
                          return (
                            <span key={col.name} className="font-mono text-xs text-text-secondary tabular-nums w-12 text-right flex-shrink-0">
                              {rank != null ? `#${rank}` : '—'}
                            </span>
                          )
                        })}

                        {/* ADP */}
                        <span className="font-mono text-xs text-text-secondary tabular-nums w-10 text-right flex-shrink-0">
                          {player.adp != null ? Number(player.adp).toFixed(0) : '—'}
                        </span>

                        {/* Value */}
                        <div className="flex items-center gap-1 w-12 justify-end flex-shrink-0">
                          <span className="font-mono text-xs font-medium text-accent tabular-nums">
                            {(player.value ?? 0).toLocaleString()}
                          </span>
                        </div>

                        {/* Age */}
                        <span className="font-mono text-xs text-text-tertiary tabular-nums w-8 text-right flex-shrink-0">
                          {player.age != null ? Math.floor(player.age) : '—'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Rookie detection note */}
        {rookies.length === 0 && !loading && (
          <p className="px-4 pt-6 text-center font-body text-xs text-text-tertiary">
            Rookie prospects appear here when FantasyCalc marks players as experience 0.
            This updates when the 2026 draft class is finalized.
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

      {/* ── Profile drawer ── */}
      {selected && (
        <PlayerProfileDrawer
          player={selected}
          playerMap={values?.playerMap ?? {}}
          csvColumns={csvColumns}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}
