import { getTeamName } from '../../hooks/useLeague'
import { getPositionalStrength } from '../../utils/rosterAnalysis'
import WinWindowBadge from '../shared/WinWindowBadge'
import { POSITIONS, PICK_YEARS, MY_ROSTER_ID } from '../../constants'

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

const ROUND_CLASSES = {
  1: { badge: 'bg-amber-100  dark:bg-[#3D2E00] text-amber-800  dark:text-amber-500', text: 'text-amber-800  dark:text-amber-500' },
  2: { badge: 'bg-blue-100   dark:bg-[#0C2A4A] text-blue-800   dark:text-blue-400',  text: 'text-blue-800   dark:text-blue-400'  },
  3: { badge: 'bg-violet-100 dark:bg-[#2A1A4A] text-violet-800 dark:text-violet-400', text: 'text-violet-800 dark:text-violet-400' },
  4: { badge: 'bg-gray-100   dark:bg-[#1F1F25] text-gray-700   dark:text-gray-400',  text: 'text-gray-700   dark:text-gray-400'  },
}
const ROUND_LABELS = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' }

function formatRecord({ wins, losses, ties }) {
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`
}

const DIVERGENCE_META = {
  under: { label: 'Underperforming', cls: 'bg-warning/15 text-warning' },
  over:  { label: 'Overachieving',   cls: 'bg-accent/15 text-accent' },
}

export default function TeamCard({ roster, rank, divergence, leagueAverages, winWindowTiers, sortMode = 'value', onTap }) {
  const teamName = getTeamName(roster.owner)
  const username = roster.owner?.username ?? ''
  const tier = winWindowTiers?.[roster.rosterId] ?? 'Middle'
  const isMyTeam = roster.rosterId === MY_ROSTER_ID
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
      className={`w-full text-left rounded-xl bg-bg-card dark:bg-bg-card border px-3 py-3 active:opacity-70 transition-opacity ${
        isMyTeam ? 'border-accent/60' : 'border-border-default dark:border-border-default'
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        {rank != null && (
          <span className="font-mono text-lg font-bold text-text-tertiary dark:text-text-tertiary tabular-nums w-6 shrink-0 leading-tight">
            {rank}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-body text-sm font-semibold text-text-primary dark:text-text-primary truncate leading-tight">
              {teamName}
            </p>
            {isMyTeam && (
              <span className="shrink-0 font-body text-[9px] font-bold uppercase tracking-wider rounded px-1 py-0.5 bg-accent/15 text-accent">
                You
              </span>
            )}
          </div>
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
        <div className="flex flex-col items-end gap-1 shrink-0">
          <WinWindowBadge tier={tier} />
          {divergenceMeta && (
            <span className={`font-body text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 ${divergenceMeta.cls}`}>
              {divergenceMeta.label}
            </span>
          )}
        </div>
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
              const { badge, text } = ROUND_CLASSES[r] ?? ROUND_CLASSES[4]
              return (
                <div key={r} className="flex items-center">
                  <div className="w-10 shrink-0">
                    <span className={`font-body text-[10px] font-bold rounded px-1.5 py-0.5 ${badge}`}>
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
              <div className="flex gap-1.5 mb-2.5">
                {POSITIONS.map(pos => {
                  const strength = getPositionalStrength(roster)
                  const avg = leagueAverages?.[pos] ?? 1
                  const fillPct = Math.min(100, Math.round((strength[pos] / (avg * 2)) * 100))
                  const above = strength[pos] >= avg
                  const trend = posTrend[pos]
                  const arrow = trend > 50 ? '↑' : trend < -50 ? '↓' : '→'
                  const trendColor = trend > 50
                    ? 'text-success'
                    : trend < -50
                      ? (isMyTeam ? 'text-warning' : 'text-danger')
                      : 'text-text-tertiary'
                  return (
                    <div key={pos} className="flex flex-col items-center gap-0.5">
                      <div className="h-1.5 w-8 rounded-full bg-border-default dark:bg-border-default overflow-hidden">
                        <div
                          className={`h-full rounded-full ${above ? 'bg-accent' : 'bg-text-tertiary dark:bg-text-tertiary'}`}
                          style={{ width: `${fillPct}%` }}
                        />
                      </div>
                      <span className={`font-body text-[9px] font-semibold uppercase tracking-wide ${above ? 'text-accent' : 'text-text-tertiary dark:text-text-tertiary'}`}>
                        {pos}
                      </span>
                      <span className={`font-body text-[8px] leading-none ${trendColor}`}>
                        {arrow}
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
    </button>
  )
}
