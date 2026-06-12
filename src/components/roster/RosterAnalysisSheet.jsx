import { useEffect, useMemo, useRef, useState } from 'react'
import { X, ChevronDown, ChevronUp } from 'lucide-react'
import { PEAK_WINDOWS } from '../../utils/peakWindows'
import { useScrollLock } from '../../hooks/useScrollLock'
import { POS_SVG as POS_COLORS } from '../../utils/positionColors'

const LANE_ORDER = ['QB', 'RB', 'WR', 'TE']
const POS_FILTERS = ['ALL', ...LANE_ORDER]

const AGE_MIN = 20
const AGE_MAX = 38
const TICK_AGES = [20, 23, 26, 29, 32, 35, 38]

const SVG_W = 360
const PAD_L = 34
const PAD_R = 12
const PAD_T = 6
const AXIS_H = 22

function ageToX(age) {
  const clamped = Math.max(AGE_MIN, Math.min(AGE_MAX, age))
  return PAD_L + ((clamped - AGE_MIN) / (AGE_MAX - AGE_MIN)) * (SVG_W - PAD_L - PAD_R)
}

function getWinWindow(avgAge, year) {
  if (avgAge == null) return null
  if (avgAge < 24) return { start: year + 2, end: year + 5, direction: 'Ascending' }
  if (avgAge < 26) return { start: year + 1, end: year + 4, direction: 'Ascending' }
  if (avgAge < 28) return { start: year, end: year + 3, direction: 'At Peak' }
  if (avgAge < 30) return { start: year, end: year + 2, direction: 'At Peak' }
  return { start: year, end: year + 1, direction: 'Declining' }
}

const DIRECTION_STYLES = {
  Ascending:  'text-success',
  'At Peak':  'text-warning',
  Declining:  'text-danger',
}

// Greedy vertical stacking: dots whose x positions collide fan out
// above/below the lane center so every player stays individually tappable.
function layoutLaneDots(laneDots, r, maxOffset) {
  const stepY = r * 2 + 2.5
  const minGapX = r * 2 + 1.5
  const placed = []
  return [...laneDots]
    .sort((a, b) => a.x - b.x)
    .map(d => {
      const level = placed.filter(p => Math.abs(p.x - d.x) < minGapX).length
      placed.push(d)
      const raw = Math.ceil(level / 2) * stepY * (level % 2 === 1 ? -1 : 1)
      return { ...d, dy: Math.max(-maxOffset, Math.min(maxOffset, raw)) }
    })
}

function starterAvg(players, position = null) {
  const pool = players.filter(p =>
    p.isStarter && !p.isIR && !p.isTaxi && p.age != null && !p.unranked &&
    (position == null || p.position === position)
  )
  if (!pool.length) return null
  return pool.reduce((s, p) => s + p.age, 0) / pool.length
}

function StatCard({ label, value, valueClass = 'text-text-primary' }) {
  return (
    <div className="rounded-xl bg-bg-card border border-border-default px-3 py-2.5">
      <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-1">
        {label}
      </p>
      <p className={`font-mono text-lg font-semibold tabular-nums leading-none ${valueClass}`}>
        {value}
      </p>
    </div>
  )
}

export default function RosterAnalysisSheet({ players, avgStarterAge, allRosters, nflState, onClose }) {
  const overlayRef = useRef(null)
  const [posFilter, setPosFilter] = useState('ALL')
  const [selectedId, setSelectedId] = useState(null)
  const [howToOpen, setHowToOpen] = useState(false)

  useScrollLock()

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const currentYear = Number(nflState?.season) || new Date().getFullYear()

  const chartPlayers = useMemo(() =>
    players.filter(p => p.age != null && p.age > 0 && LANE_ORDER.includes(p.position)),
  [players])

  const lanes = useMemo(() => posFilter === 'ALL' ? LANE_ORDER : [posFilter], [posFilter])
  const laneH = posFilter === 'ALL' ? 44 : 116
  const dotR = posFilter === 'ALL' ? 4.5 : 6
  const svgH = PAD_T + lanes.length * laneH + AXIS_H
  const axisY = PAD_T + lanes.length * laneH

  const laneDots = useMemo(() => {
    const maxOffset = laneH / 2 - dotR - 2
    return lanes.map((pos, laneIdx) => {
      const centerY = PAD_T + laneIdx * laneH + laneH / 2
      const dots = chartPlayers
        .filter(p => p.position === pos)
        .map(p => ({ x: ageToX(p.age), player: p }))
      return { pos, centerY, laneTop: PAD_T + laneIdx * laneH, dots: layoutLaneDots(dots, dotR, maxOffset) }
    })
  }, [chartPlayers, lanes, laneH, dotR])

  const selectedPlayer = useMemo(
    () => chartPlayers.find(p => p.sleeperId === selectedId) ?? null,
    [chartPlayers, selectedId]
  )

  const leagueAvgAge = useMemo(() => {
    if (!allRosters?.length) return null
    const valid = allRosters.map(r => r.avgStarterAge).filter(a => a != null && a > 0)
    if (!valid.length) return null
    return valid.reduce((s, a) => s + a, 0) / valid.length
  }, [allRosters])

  const positionBreakdown = useMemo(() =>
    LANE_ORDER.map(pos => {
      const mine = starterAvg(players, pos)
      const leagueAvgs = (allRosters ?? [])
        .map(r => starterAvg(r.players, pos))
        .filter(a => a != null)
      const league = leagueAvgs.length
        ? leagueAvgs.reduce((s, a) => s + a, 0) / leagueAvgs.length
        : null
      return { pos, mine, league, delta: mine != null && league != null ? mine - league : null }
    }),
  [players, allRosters])

  const window_ = getWinWindow(avgStarterAge, currentYear)

  function handlePosFilter(pos) {
    setPosFilter(pos)
    setSelectedId(null)
  }

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose()
  }

  function selectedSlotLabel(p) {
    if (p.isIR) return 'IR'
    if (p.isTaxi) return 'Taxi'
    return p.isStarter ? 'Starter' : 'Bench'
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-end bg-black/60"
    >
      <div className="w-full bg-bg-secondary rounded-t-2xl border-t border-border-default">
        <div className="max-h-[85vh] overflow-y-auto" style={{ overscrollBehavior: 'contain', paddingBottom: 'env(safe-area-inset-bottom)' }}>

          {/* Handle bar */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-border-default" />
          </div>

          {/* Header */}
          <div className="flex items-start justify-between px-4 pt-2 pb-3 border-b border-border-default">
            <div>
              <h2 className="font-display text-xl font-bold uppercase tracking-wide text-text-primary leading-tight">
                Roster Analysis
              </h2>
              <p className="font-body text-xs text-text-secondary mt-0.5">
                Age curve · win window
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex-shrink-0"
            >
              <X size={18} strokeWidth={1.75} />
            </button>
          </div>

          <div className="px-4 pb-6 pt-3 flex flex-col gap-4">

            {/* Position filter */}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {POS_FILTERS.map(pos => (
                <button
                  key={pos}
                  onClick={() => handlePosFilter(pos)}
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

            {/* Age chart */}
            <div className="rounded-xl bg-bg-card border border-border-default px-2 py-3">
              <svg
                viewBox={`0 0 ${SVG_W} ${svgH}`}
                width="100%"
                style={{ display: 'block', overflow: 'visible' }}
              >
                {/* Tap background to clear selection */}
                <rect
                  x="0" y="0" width={SVG_W} height={svgH}
                  fill="transparent"
                  onClick={() => setSelectedId(null)}
                />

                {laneDots.map(lane => {
                  const [peakStart, peakEnd] = PEAK_WINDOWS[lane.pos]
                  const bandX = ageToX(peakStart)
                  const bandW = ageToX(peakEnd) - bandX
                  return (
                    <g key={lane.pos}>
                      {/* Position-specific peak window band */}
                      <rect
                        x={bandX} y={lane.laneTop + 2}
                        width={bandW} height={laneH - 4}
                        rx="3"
                        fill={POS_COLORS[lane.pos]}
                        opacity="0.1"
                        pointerEvents="none"
                      />
                      {/* Lane baseline */}
                      <line
                        x1={PAD_L} y1={lane.centerY}
                        x2={SVG_W - PAD_R} y2={lane.centerY}
                        stroke="currentColor" strokeWidth="0.5"
                        className="text-border-default"
                        pointerEvents="none"
                      />
                      {/* Lane label */}
                      <text
                        x={4} y={lane.centerY + 3}
                        fontSize="10" fontWeight="700"
                        fill={POS_COLORS[lane.pos]}
                        fontFamily="'IBM Plex Sans', system-ui, sans-serif"
                        pointerEvents="none"
                      >{lane.pos}</text>

                      {/* Dots — bench behind starters, selected ringed */}
                      {[...lane.dots].sort((a, b) =>
                        (a.player.isStarter ? 1 : 0) - (b.player.isStarter ? 1 : 0)
                      ).map(d => {
                        const isSelected = d.player.sleeperId === selectedId
                        return (
                          <g
                            key={d.player.sleeperId}
                            onClick={e => { e.stopPropagation(); setSelectedId(isSelected ? null : d.player.sleeperId) }}
                            style={{ cursor: 'pointer' }}
                          >
                            {/* Invisible enlarged tap target */}
                            <circle cx={d.x} cy={lane.centerY + d.dy} r={13} fill="transparent" />
                            {isSelected && (
                              <circle
                                cx={d.x} cy={lane.centerY + d.dy} r={dotR + 3}
                                fill="none" stroke="currentColor" strokeWidth="1.5"
                                className="text-text-primary"
                              />
                            )}
                            <circle
                              cx={d.x} cy={lane.centerY + d.dy} r={dotR}
                              fill={POS_COLORS[lane.pos]}
                              opacity={d.player.isStarter ? 0.95 : 0.35}
                            />
                          </g>
                        )
                      })}
                    </g>
                  )
                })}

                {/* Age axis */}
                <line
                  x1={PAD_L} y1={axisY}
                  x2={SVG_W - PAD_R} y2={axisY}
                  stroke="currentColor" strokeWidth="0.75"
                  className="text-border-default"
                  pointerEvents="none"
                />
                {TICK_AGES.map(age => {
                  const x = ageToX(age)
                  return (
                    <g key={age} pointerEvents="none">
                      <line
                        x1={x} y1={axisY} x2={x} y2={axisY + 4}
                        stroke="currentColor" strokeWidth="0.75"
                        className="text-border-default"
                      />
                      <text
                        x={x} y={axisY + 14}
                        textAnchor="middle" fontSize="9"
                        fill="currentColor" className="text-text-tertiary"
                        fontFamily="'IBM Plex Sans', system-ui, sans-serif"
                      >{age}</text>
                    </g>
                  )
                })}
              </svg>

              {/* Selected player detail */}
              {selectedPlayer && (
                <div className="mt-2 mx-1 px-3 py-2 rounded-lg bg-bg-secondary border border-border-default flex items-center gap-2">
                  <span
                    className="block w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: POS_COLORS[selectedPlayer.position] }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-body text-sm font-medium text-text-primary truncate leading-tight">
                      {selectedPlayer.name}
                    </p>
                    <p className="font-body text-[10px] text-text-tertiary">
                      {selectedPlayer.position} · {selectedPlayer.team || 'FA'} · Age {selectedPlayer.age.toFixed(1)} · {selectedSlotLabel(selectedPlayer)}
                    </p>
                  </div>
                  <span className="font-mono text-sm font-medium text-accent tabular-nums flex-shrink-0">
                    {selectedPlayer.value ? selectedPlayer.value.toLocaleString() : '—'}
                  </span>
                </div>
              )}

              {/* Legend */}
              <div className="mt-2.5 mx-1 flex items-center justify-between">
                <div className="flex gap-3">
                  {LANE_ORDER.map(pos => (
                    <div key={pos} className="flex items-center gap-1">
                      <span className="block w-2 h-2 rounded-full" style={{ backgroundColor: POS_COLORS[pos] }} />
                      <span className="font-body text-[9px] font-semibold uppercase text-text-tertiary tracking-wide">{pos}</span>
                    </div>
                  ))}
                </div>
                <span className="font-body text-[9px] text-text-tertiary">
                  Solid = starter · Faded = bench
                </span>
              </div>
            </div>

            {/* Summary stat cards */}
            <div className="grid grid-cols-2 gap-2">
              <StatCard
                label="Avg Starter Age"
                value={avgStarterAge != null ? avgStarterAge.toFixed(1) : '—'}
              />
              <StatCard
                label="League Avg"
                value={leagueAvgAge != null ? leagueAvgAge.toFixed(1) : '—'}
              />
              <StatCard
                label="Core Win Window"
                value={window_ ? `${window_.start}–${window_.end}` : '—'}
              />
              <StatCard
                label="Direction"
                value={window_?.direction ?? '—'}
                valueClass={`font-body uppercase tracking-wide text-base ${DIRECTION_STYLES[window_?.direction] ?? 'text-text-primary'}`}
              />
            </div>

            {/* Position breakdown */}
            <div className="rounded-xl bg-bg-card border border-border-default px-3 py-3">
              <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-2">
                Avg Starter Age by Position
              </p>
              <div className="flex flex-col">
                {positionBreakdown.map((row, i) => (
                  <div
                    key={row.pos}
                    className={`flex items-center py-2 ${i < positionBreakdown.length - 1 ? 'border-b border-border-default' : ''}`}
                  >
                    <span
                      className="font-body text-xs font-bold uppercase tracking-wide w-10"
                      style={{ color: POS_COLORS[row.pos] }}
                    >
                      {row.pos}
                    </span>
                    <span className="font-mono text-sm text-text-primary tabular-nums flex-1">
                      {row.mine != null ? row.mine.toFixed(1) : '—'}
                    </span>
                    <span className="font-body text-[10px] text-text-tertiary mr-2">
                      lg {row.league != null ? row.league.toFixed(1) : '—'}
                    </span>
                    {row.delta != null && (
                      <span className={`font-mono text-xs font-semibold tabular-nums w-12 text-right ${
                        row.delta < -0.2 ? 'text-success' : row.delta > 0.2 ? 'text-danger' : 'text-text-tertiary'
                      }`}>
                        {row.delta > 0 ? '+' : ''}{row.delta.toFixed(1)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <p className="font-body text-[9px] text-text-tertiary mt-2">
                Green = younger than league average at that position
              </p>
            </div>

            {/* How to read this */}
            <div className="rounded-xl bg-bg-card border border-border-default">
              <button
                onClick={() => setHowToOpen(o => !o)}
                className="w-full flex items-center justify-between px-3 py-3"
              >
                <span className="font-body text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">
                  How to read this
                </span>
                {howToOpen
                  ? <ChevronUp size={15} className="text-text-tertiary" strokeWidth={1.75} />
                  : <ChevronDown size={15} className="text-text-tertiary" strokeWidth={1.75} />}
              </button>
              {howToOpen && (
                <div className="px-3 pb-3 flex flex-col gap-2.5">
                  <p className="font-body text-xs text-text-secondary leading-relaxed">
                    <span className="font-semibold text-text-primary">The shaded band</span> on each
                    lane is that position's typical peak window — the ages where players usually
                    produce their best seasons: RB {PEAK_WINDOWS.RB[0]}–{PEAK_WINDOWS.RB[1]},
                    WR {PEAK_WINDOWS.WR[0]}–{PEAK_WINDOWS.WR[1]},
                    TE {PEAK_WINDOWS.TE[0]}–{PEAK_WINDOWS.TE[1]},
                    QB {PEAK_WINDOWS.QB[0]}–{PEAK_WINDOWS.QB[1]}. RBs peak earliest and decline
                    fastest because of workload; QBs hold value deep into their 30s — especially
                    in Superflex.
                  </p>
                  <p className="font-body text-xs text-text-secondary leading-relaxed">
                    <span className="font-semibold text-text-primary">Why it matters:</span> dynasty
                    trade value peaks <em>before</em> production does. Players left of the band are
                    appreciating assets; players right of it lose value every month even while
                    producing. Ideally you acquire players entering the band and move them before
                    they exit it.
                  </p>
                  <p className="font-body text-xs text-text-secondary leading-relaxed">
                    <span className="font-semibold text-text-primary">Direction:</span>{' '}
                    <span className="text-success font-semibold">Ascending</span> means your core is
                    young and your best seasons are ahead — hold youth and picks.{' '}
                    <span className="text-warning font-semibold">At Peak</span> means your window is
                    open now — trade future picks for proven help.{' '}
                    <span className="text-danger font-semibold">Declining</span> means your core is
                    aging out — sell veterans for picks and youth before their value drops.
                  </p>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
