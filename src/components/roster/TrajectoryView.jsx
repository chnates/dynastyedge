import { useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ChevronDown, ChevronUp, TrendingUp } from 'lucide-react'
import { getTeamName } from '../../hooks/useLeague'
import { useLeagueContext } from '../../context/LeagueContext'
import LoadingSpinner from '../shared/LoadingSpinner'
import ErrorState from '../shared/ErrorState'
import SectionHeader from '../shared/SectionHeader'
import PlayerProfileDrawer from '../shared/PlayerProfileDrawer'
import Sparkline from '../shared/Sparkline'
import TeamAvatar from '../shared/TeamAvatar'
import { POS_TEXT, POS_SVG } from '../../utils/positionColors'
import {
  buildAgeCurves,
  buildRosterTrajectory,
  projectPlayerSeries,
  getTrajectoryVerdict,
  seriesDirection,
  peakStatusShort,
  TRAJECTORY_HORIZON,
} from '../../utils/dynastyTrajectory'

const POSITIONS = ['QB', 'RB', 'WR', 'TE']

const TONE_TEXT = {
  ascending: 'text-success',
  declining: 'text-danger',
  stable: 'text-warning',
}
const DIR_LABEL = { ascending: 'Rising', declining: 'Falling', stable: 'Holding' }

// ── Forward value chart ──────────────────────────────────────────────────
const SVG_W = 360
const SVG_H = 156
const PAD_L = 10
const PAD_R = 10
const PAD_T = 26
const PAD_B = 20

function TrajectoryChart({ seasons, team, league, peakIdx }) {
  const all = [...team, ...league].filter(v => v > 0)
  const min = all.length ? Math.min(...all) : 0
  const max = all.length ? Math.max(...all) : 1
  const span = max - min || 1
  const lo = min - span * 0.12
  const hi = max + span * 0.12

  const plotW = SVG_W - PAD_L - PAD_R
  const plotH = SVG_H - PAD_T - PAD_B
  const x = i => PAD_L + (i / (team.length - 1)) * plotW
  const y = v => PAD_T + plotH - ((v - lo) / (hi - lo)) * plotH

  const teamPts = team.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const leaguePts = league.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const areaPath = `M ${x(0)},${y(team[0])} ${team
    .map((v, i) => `L ${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ')} L ${x(team.length - 1)},${PAD_T + plotH} L ${x(0)},${PAD_T + plotH} Z`

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id="trajFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity="0.28" />
          <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0" />
        </linearGradient>
      </defs>

      <path d={areaPath} fill="url(#trajFill)" />

      {/* League-average reference line */}
      <polyline
        points={leaguePts}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeDasharray="3 3"
        className="text-text-tertiary"
      />

      {/* Team line */}
      <polyline
        points={teamPts}
        fill="none"
        stroke="rgb(var(--accent))"
        strokeWidth="2.25"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {team.map((v, i) => {
        const isPeak = i === peakIdx
        const isEnd = i === 0 || i === team.length - 1
        return (
          <g key={i}>
            {isPeak && (
              <circle cx={x(i)} cy={y(v)} r="6" fill="none" stroke="rgb(var(--accent))" strokeWidth="1.5" opacity="0.5" />
            )}
            <circle cx={x(i)} cy={y(v)} r="3.25" fill="rgb(var(--accent))" />
            {(isPeak || isEnd) && (
              <text
                x={x(i)}
                y={y(v) - 9}
                textAnchor={i === 0 ? 'start' : i === team.length - 1 ? 'end' : 'middle'}
                fontSize="10"
                fontWeight="600"
                fill="currentColor"
                className="text-text-primary"
                fontFamily="'IBM Plex Mono', monospace"
              >
                {Math.round(v).toLocaleString()}
              </text>
            )}
            <text
              x={x(i)}
              y={SVG_H - 5}
              textAnchor="middle"
              fontSize="10"
              fill="currentColor"
              className="text-text-tertiary"
              fontFamily="'Archivo', system-ui, sans-serif"
            >
              {seasons[i]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function StatCard({ label, value, valueClass = 'text-text-primary' }) {
  return (
    <div className="rounded-none bg-bg-card border border-border-default px-3 py-2.5">
      <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-1">
        {label}
      </p>
      <p className={`font-mono text-lg font-semibold tabular-nums leading-none ${valueClass}`}>
        {value}
      </p>
    </div>
  )
}

function deltaPct(series) {
  if (!series[0]) return 0
  return (series[series.length - 1] - series[0]) / series[0]
}

function fmtPct(p) {
  const v = Math.round(p * 100)
  return `${v > 0 ? '+' : ''}${v}%`
}

export default function TrajectoryView() {
  const { league, values, loading, error, retry, nflState } = useLeagueContext()
  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams()
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [howToOpen, setHowToOpen] = useState(false)

  const selectedRosterId = params.rosterId
    ? Number(params.rosterId)
    : location.state?.selectedRosterId

  const currentSeason = Number(nflState?.season) || new Date().getFullYear()

  const roster = useMemo(() => {
    if (!league) return null
    if (selectedRosterId) {
      return league.allRosters?.find(r => r.rosterId === selectedRosterId) ?? league.myRoster
    }
    return league.myRoster
  }, [league, selectedRosterId])

  const model = useMemo(() => {
    if (!league || !values?.playerMap || !roster) return null
    const { curves, generic } = buildAgeCurves(values.playerMap)

    const trajectory = buildRosterTrajectory(roster, currentSeason, curves, generic)

    // League-average team curve for context (built once across all rosters).
    const allSeries = league.allRosters.map(r =>
      buildRosterTrajectory(r, currentSeason, curves, generic).totalByYear
    )
    const leagueAvg = trajectory.totalByYear.map((_, i) =>
      allSeries.reduce((s, ser) => s + ser[i], 0) / (allSeries.length || 1)
    )

    let peakIdx = 0
    trajectory.totalByYear.forEach((v, i) => { if (v > trajectory.totalByYear[peakIdx]) peakIdx = i })

    const players = roster.players
      .filter(p => (p.value || 0) > 0 && !p.unranked)
      .map(p => ({ player: p, series: projectPlayerSeries(p, curves) }))
      .sort((a, b) => b.series[0] - a.series[0])

    return { curves, trajectory, leagueAvg, peakIdx, players, verdict: getTrajectoryVerdict(trajectory) }
  }, [league, values, roster, currentSeason])

  if (loading && !league) return <LoadingSpinner message="Projecting trajectory…" />
  if (error && !league) return <ErrorState message={error} onRetry={retry} />
  if (!roster || !model) return <ErrorState message="Could not build trajectory." onRetry={retry} />

  const { trajectory, leagueAvg, peakIdx, players, verdict } = model
  const teamName = getTeamName(roster.owner)
  const lastSeason = trajectory.seasons[trajectory.seasons.length - 1]
  const overallPct = deltaPct(trajectory.totalByYear)

  return (
    <div className="px-4 pb-6">
      {selectedRosterId && (
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 pt-4 pb-1 text-accent font-body text-sm"
        >
          ← Back
        </button>
      )}

      {/* Header */}
      <div className={`${selectedRosterId ? 'mt-1' : 'mt-4'} flex items-center gap-2.5`}>
        <TeamAvatar owner={roster.owner} size={32} />
        <div className="min-w-0">
          <h1 className="font-display text-xl uppercase tracking-wide text-text-primary leading-tight truncate">
            {teamName}
          </h1>
          <p className="font-body text-[11px] text-text-secondary">
            Dynasty Trajectory · {currentSeason}–{lastSeason}
          </p>
        </div>
      </div>

      {/* Verdict */}
      <div className={`mt-3 rounded-none bg-bg-card border border-border-default border-l-[3px] px-3 py-3 ${
        verdict.tone === 'ascending' ? 'border-l-success' : verdict.tone === 'declining' ? 'border-l-danger' : 'border-l-warning'
      }`}>
        <div className="flex items-center gap-1.5 mb-1">
          <TrendingUp size={13} strokeWidth={2} className={TONE_TEXT[verdict.tone]} />
          <span className={`font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ${TONE_TEXT[verdict.tone]}`}>
            Window peaks {verdict.peakSeason}
          </span>
        </div>
        <p className="font-body text-sm text-text-primary leading-snug">
          {verdict.headline}
        </p>
      </div>

      {/* Forward value chart */}
      <SectionHeader label="Projected Team Value" />
      <div className="rounded-none bg-bg-card border border-border-default px-2 py-3">
        <TrajectoryChart
          seasons={trajectory.seasons}
          team={trajectory.totalByYear}
          league={leagueAvg}
          peakIdx={peakIdx}
        />
        <div className="mt-2 mx-1 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="block w-3 h-0.5 rounded-full bg-accent" />
              <span className="font-body text-[9px] font-semibold uppercase tracking-wide text-text-tertiary">This team</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="block w-3 h-px border-t border-dashed border-text-tertiary" />
              <span className="font-body text-[9px] font-semibold uppercase tracking-wide text-text-tertiary">League avg</span>
            </span>
          </div>
          <span className="font-body text-[9px] text-text-tertiary">Includes picks maturing in</span>
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 gap-2 mt-3">
        <StatCard label="Value Now" value={trajectory.totalByYear[0].toLocaleString()} />
        <StatCard
          label={`Projected ${lastSeason}`}
          value={trajectory.totalByYear[TRAJECTORY_HORIZON].toLocaleString()}
          valueClass={overallPct > 0.05 ? 'text-success' : overallPct < -0.05 ? 'text-danger' : 'text-text-primary'}
        />
        <StatCard label="Peak Season" value={trajectory.seasons[peakIdx]} />
        <StatCard
          label={`3-Yr Change`}
          value={fmtPct(overallPct)}
          valueClass={overallPct > 0.05 ? 'text-success' : overallPct < -0.05 ? 'text-danger' : 'text-text-secondary'}
        />
      </div>

      {/* Per-position trajectory */}
      <SectionHeader label="By Position" />
      <div className="rounded-none bg-bg-card border border-border-default px-3">
        {POSITIONS.map((pos, i) => {
          const series = trajectory.byPosition[pos]
          if (!series[0]) return null
          const dir = seriesDirection(series)
          const pct = deltaPct(series)
          return (
            <div
              key={pos}
              className={`flex items-center gap-3 py-2.5 ${i < POSITIONS.length - 1 ? 'border-b border-border-default' : ''}`}
            >
              <span className="font-body text-xs font-bold uppercase tracking-wide w-8" style={{ color: POS_SVG[pos] }}>
                {pos}
              </span>
              <span className="font-mono text-xs text-text-secondary tabular-nums w-28">
                {Math.round(series[0]).toLocaleString()} → {Math.round(series[TRAJECTORY_HORIZON]).toLocaleString()}
              </span>
              <Sparkline data={series} width={48} height={16} />
              <span className="flex-1" />
              <span className={`font-body text-[10px] font-semibold uppercase tracking-wide ${TONE_TEXT[dir]}`}>
                {DIR_LABEL[dir]}
              </span>
              <span className={`font-mono text-xs font-semibold tabular-nums w-12 text-right ${TONE_TEXT[dir]}`}>
                {fmtPct(pct)}
              </span>
            </div>
          )
        })}
      </div>

      {/* Per-player projections */}
      <SectionHeader label="Player Projections" count={players.length} />
      <div className="rounded-none bg-bg-card border border-border-default px-3">
        {players.map(({ player, series }, i) => {
          const pct = deltaPct(series)
          const peak = peakStatusShort(player.position, player.age)
          const tone = pct > 0.05 ? 'text-success' : pct < -0.05 ? 'text-danger' : 'text-text-secondary'
          return (
            <button
              key={player.sleeperId}
              onClick={() => setSelectedPlayer(player)}
              className={`w-full flex items-center gap-2.5 py-2.5 text-left active:opacity-60 transition-opacity ${
                i < players.length - 1 ? 'border-b border-border-default' : ''
              }`}
            >
              <span className="block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: POS_SVG[player.position] }} />
              <div className="flex-1 min-w-0">
                <p className="font-body text-sm font-medium text-text-primary truncate leading-tight">
                  {player.name}
                </p>
                <p className="font-body text-[10px] text-text-tertiary">
                  <span style={{ color: POS_SVG[player.position] }}>{player.position}</span>
                  {player.age != null ? ` · ${player.age.toFixed(1)}` : ''}
                  {peak ? ` · ${peak}` : ''}
                </p>
              </div>
              <Sparkline data={series} width={44} height={16} />
              <div className="w-20 text-right flex-shrink-0">
                <p className="font-mono text-xs text-text-primary tabular-nums leading-tight">
                  {series[0].toLocaleString()} → {series[TRAJECTORY_HORIZON].toLocaleString()}
                </p>
                <p className={`font-mono text-[11px] font-semibold tabular-nums ${tone}`}>
                  {fmtPct(pct)}
                </p>
              </div>
            </button>
          )
        })}
        {players.length === 0 && (
          <p className="font-body text-sm text-text-tertiary py-3">
            No market-valued players to project on this roster.
          </p>
        )}
      </div>

      {/* How this works */}
      <div className="rounded-none bg-bg-card border border-border-default mt-4">
        <button onClick={() => setHowToOpen(o => !o)} className="w-full flex items-center justify-between px-3 py-3">
          <span className="font-body text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">
            How this works
          </span>
          {howToOpen
            ? <ChevronUp size={15} className="text-text-tertiary" strokeWidth={1.75} />
            : <ChevronDown size={15} className="text-text-tertiary" strokeWidth={1.75} />}
        </button>
        {howToOpen && (
          <div className="px-3 pb-3 flex flex-col gap-2.5">
            <p className="font-body text-xs text-text-secondary leading-relaxed">
              <span className="font-semibold text-text-primary">The model</span> learns, for each
              position, what the dynasty market pays at every age — straight from today's FantasyCalc
              values, smoothed and shaped by the same peak windows the Roster Analysis uses. Each
              player is then aged forward along that curve, so a 27-year-old RB sheds value faster
              than a 24-year-old WR.
            </p>
            <p className="font-body text-xs text-text-secondary leading-relaxed">
              <span className="font-semibold text-text-primary">Picks</span> hold at today's value
              until their draft year, then convert into a young rookie-aged asset that ages on a
              blended curve — so a 2027 first starts paying off in your {trajectory.seasons[1]}+ outlook.
            </p>
            <p className="font-body text-xs text-text-secondary leading-relaxed">
              <span className="font-semibold text-text-primary">It's an estimate, not a forecast</span> —
              it can't know breakouts, injuries, or trades. Read the <em>shape</em>: is your window
              opening or closing, and how does it track against the league-average line?
            </p>
          </div>
        )}
      </div>

      {selectedPlayer && (
        <PlayerProfileDrawer player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
      )}
    </div>
  )
}
