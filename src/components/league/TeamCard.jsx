import { getTeamName } from '../../hooks/useLeague'
import { useLeagueContext } from '../../context/LeagueContext'
import { getPositionalStrength } from '../../utils/rosterAnalysis'
import { TIER_TEXT } from '../../utils/tierColors'
import { POSITIONS, PICK_YEARS } from '../../constants'
import { POS_TEXT, POS_BAR, POS_BAR_DIM } from '../../utils/positionColors'
import { ROUND_CLASSES, ROUND_TEXT, ROUND_LABELS } from '../../utils/roundColors'
import { rankClass } from '../../utils/rankColors'
import TeamAvatar from '../shared/TeamAvatar'
import { Badge } from '../ui'

const POSITION_DEPTH = { QB: 3, RB: 5, WR: 5, TE: 3 }

function getPositionalTrend(roster) {
  const result = {}
  POSITIONS.forEach(pos => {
    const players = roster.players
      .filter(p => p.position === pos && !p.isIR)
      .sort((a, b) => b.value - a.value)
      .slice(0, POSITION_DEPTH[pos])
    result[pos] = players.reduce((s, p) => s + (p.trend30Day ?? 0), 0)
  })
  return result
}

function formatRecord({ wins, losses, ties }) {
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`
}

const DIVERGENCE_META = {
  under: { label: 'Underperforming', cls: 'bg-warning/15 text-warning' },
  over:  { label: 'Overachieving',   cls: 'bg-accent/15 text-accent' },
}

export default function TeamCard({ roster, rank, divergence, leagueAverages, winWindowTiers, sortMode = 'value', onTap }) {
  const { myRosterId } = useLeagueContext()
  const teamName = getTeamName(roster.owner)
  const username = roster.owner?.username ?? ''
  const tier = winWindowTiers?.[roster.rosterId] ?? 'Middle'
  const isMyTeam = roster.rosterId === myRosterId
  const divergenceMeta = divergence ? DIVERGENCE_META[divergence] : null

  const totalPicks = roster.picks.length

  const pickCountByYear = {}
  PICK_YEARS.forEach(yr => {
    pickCountByYear[yr] = roster.picks.filter(p => p.season === yr).length
  })

  // Grid: pickGrid[round][year] = count
  const pickGrid = {}
  ;[1, 2, 3, 4].forEach(r => {
    pickGrid[r] = {}
    PICK_YEARS.forEach(yr => {
      pickGrid[r][yr] = roster.picks.filter(p => p.round === r && p.season === yr).length
    })
  })
  const activeRounds = [1, 2, 3, 4].filter(r => PICK_YEARS.some(yr => pickGrid[r][yr] > 0))

  return (
    <button
      onClick={() => onTap(roster.rosterId)}
      className={`w-full text-left rounded-none bg-bg-card dark:bg-bg-card border active:opacity-70 transition-opacity overflow-hidden ${
        isMyTeam ? 'border-brand/60' : 'border-border-default dark:border-border-default'
      }`}
    >
      {/* Score-bug caption bar — the my-team card's cap goes silver */}
      <div
        className={`flex items-center gap-2 px-3 py-1.5 ${
          isMyTeam
            ? 'bug-silver'
            : 'bg-black/5 dark:bg-white/5 border-b border-border-default dark:border-border-default'
        }`}
      >
        {rank != null && (
          <span className={`font-mono text-[11px] font-semibold tabular-nums shrink-0 leading-none ${isMyTeam ? 'text-[#3E444C]' : rankClass(rank)}`}>
            {String(rank).padStart(2, '0')}
          </span>
        )}
        <span className={`font-display text-[11px] uppercase tracking-[0.1em] leading-none truncate min-w-0 ${isMyTeam ? '' : 'text-text-primary dark:text-text-primary'}`}>
          {teamName}
        </span>
        {isMyTeam && <Badge tone="brand" className="shrink-0">You</Badge>}
        <span className={`ml-auto font-mono text-[10px] font-semibold uppercase tracking-wider shrink-0 leading-none ${isMyTeam ? 'text-[#3E444C]' : TIER_TEXT[tier] ?? ''}`}>
          {tier}
        </span>
      </div>

      <div className="px-3 py-3">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <TeamAvatar owner={roster.owner} size={30} />
        <div className="flex-1 min-w-0">
          <p className="font-body text-sm font-semibold text-text-primary dark:text-text-primary truncate leading-tight">
            {teamName}
          </p>
          {(username || roster.hasRecord) && (
            <p className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary truncate leading-tight mt-0.5">
              {username ? `@${username}` : ''}
              {roster.hasRecord && (
                <span className="font-mono tabular-nums">
                  {username ? ' · ' : ''}{formatRecord(roster.record)}
                </span>
              )}
            </p>
          )}
        </div>
        {divergenceMeta && (
          <span className={`shrink-0 font-mono text-[9px] font-semibold uppercase tracking-wider rounded-none px-1.5 py-0.5 ${divergenceMeta.cls}`}>
            {divergenceMeta.label}
          </span>
        )}
      </div>

      {sortMode === 'picks' ? (
        <div className="flex flex-col gap-2">
          {/* Total */}
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-xl font-semibold text-accent tabular-nums">{totalPicks}</span>
            <span className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary">picks total</span>
          </div>
          {/* Round × Year grid */}
          <div className="flex flex-col gap-1">
            {/* Year header row */}
            <div className="flex items-center">
              <div className="w-10 shrink-0" />
              {PICK_YEARS.map(yr => (
                <div key={yr} className="flex-1 text-center">
                  <span className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary">'{yr.slice(2)}</span>
                </div>
              ))}
            </div>
            {/* One row per active round */}
            {activeRounds.map(r => {
              const badge = ROUND_CLASSES[r] ?? ROUND_CLASSES[4]
              const text  = ROUND_TEXT[r] ?? ROUND_TEXT[4]
              return (
                <div key={r} className="flex items-center">
                  <div className="w-10 shrink-0">
                    <span className={`font-body text-[10px] font-bold rounded-none px-1.5 py-0.5 ${badge}`}>
                      {ROUND_LABELS[r]}
                    </span>
                  </div>
                  {PICK_YEARS.map(yr => {
                    const count = pickGrid[r][yr]
                    return (
                      <div key={yr} className="flex-1 text-center">
                        <span className={`font-mono text-sm font-semibold tabular-nums ${count > 0 ? text : 'text-text-tertiary'}`}>
                          {count > 0 ? count : '—'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      ) : sortMode === 'record' ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-xl font-semibold text-accent tabular-nums">
              {roster.hasRecord ? formatRecord(roster.record) : '—'}
            </span>
            <span className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary">
              record
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-sm font-medium text-text-secondary dark:text-text-secondary tabular-nums">
                {Math.round(roster.pointsFor).toLocaleString()}
              </span>
              <span className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary">PF</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-sm font-medium text-text-secondary dark:text-text-secondary tabular-nums">
                {Math.round(roster.pointsAgainst).toLocaleString()}
              </span>
              <span className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary">PA</span>
            </div>
          </div>
        </div>
      ) : sortMode === 'faab' ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-xl font-semibold text-accent tabular-nums">
              ${roster.faabRemaining}
            </span>
            <span className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary">
              FAAB remaining · spent ${roster.faabSpent} of ${roster.faabBudget}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-sm font-medium text-text-secondary dark:text-text-secondary tabular-nums">
                {roster.totalValue.toLocaleString()}
              </span>
              <span className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary">dynasty pts</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-sm font-medium text-text-secondary dark:text-text-secondary tabular-nums">
                {roster.picks.length}
              </span>
              <span className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary">picks</span>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5 mb-2.5">
            <span className="font-mono text-xl font-semibold text-accent tabular-nums">
              {roster.totalValue.toLocaleString()}
            </span>
            <span className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary">
              dynasty pts
            </span>
          </div>

          {/* Positional strength bars */}
          {(() => {
            const posTrend = getPositionalTrend(roster)
            return (
              <div className="flex gap-2.5 mb-2.5">
                {POSITIONS.map(pos => {
                  const strength = getPositionalStrength(roster)
                  const avg = leagueAverages?.[pos] ?? 1
                  const fillPct = Math.min(100, Math.round((strength[pos] / (avg * 2)) * 100))
                  const above = strength[pos] >= avg
                  const trend = posTrend[pos]
                  // A plain text → rotated with CSS, NOT the ↗/↘ codepoints:
                  // iOS gives U+2197/U+2198 default emoji presentation (color
                  // glyph, ignores our text color), while U+2192 stays text.
                  const arrowRotate = trend > 50 ? '-rotate-45' : trend < -50 ? 'rotate-45' : ''
                  const trendColor = trend > 50
                    ? 'text-success'
                    : trend < -50
                      ? (isMyTeam ? 'text-warning' : 'text-danger')
                      : 'text-text-tertiary'
                  return (
                    <div key={pos} className="flex flex-col items-center gap-1">
                      <div className="relative h-2.5 w-12 rounded-full bg-border-default dark:bg-border-default overflow-hidden">
                        <div
                          className={`h-full rounded-full ${above ? POS_BAR[pos] : POS_BAR_DIM[pos]}`}
                          style={{ width: `${fillPct}%` }}
                        />
                        {/* league-average marker — the 50% midpoint of the track */}
                        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-black/40 dark:bg-white/50" />
                      </div>
                      <span className={`font-body text-[10px] font-semibold uppercase tracking-wide ${above ? POS_TEXT[pos] : 'text-text-tertiary dark:text-text-tertiary'}`}>
                        {pos}
                      </span>
                      <span className={`font-body text-[10px] leading-none inline-block ${arrowRotate} ${trendColor}`}>
                        →
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          })()}

          {/* Footer: pick counts + FAAB */}
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {PICK_YEARS.map(yr => (
                <div key={yr} className="flex items-center gap-0.5">
                  <span className="font-mono text-xs font-medium text-text-secondary dark:text-text-secondary tabular-nums">
                    {pickCountByYear[yr]}
                  </span>
                  <span className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary">
                    '{yr.slice(2)}
                  </span>
                </div>
              ))}
            </div>
            <span className="font-mono text-xs font-medium text-text-secondary dark:text-text-secondary tabular-nums">
              ${roster.faabRemaining}
            </span>
          </div>
        </>
      )}
      </div>
    </button>
  )
}
