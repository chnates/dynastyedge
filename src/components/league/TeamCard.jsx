import { getTeamName } from '../../hooks/useLeague'
import { getPositionalStrength } from '../../utils/rosterAnalysis'
import WinWindowBadge from '../shared/WinWindowBadge'
import { POSITIONS, PICK_YEARS } from '../../constants'

const ROUND_COLORS = {
  1: { bg: '#3D2E00', text: '#F59E0B' },
  2: { bg: '#0C2A4A', text: '#60A5FA' },
  3: { bg: '#2A1A4A', text: '#A78BFA' },
  4: { bg: '#1F1F25', text: '#9CA3AF' },
}
const ROUND_LABELS = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' }

export default function TeamCard({ roster, leagueAverages, winWindowTiers, sortMode = 'value', onTap }) {
  const teamName = getTeamName(roster.owner)
  const username = roster.owner?.username ?? ''
  const tier = winWindowTiers?.[roster.rosterId] ?? 'Middle'

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
      className="w-full text-left rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-3 py-3 active:opacity-70 transition-opacity"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="font-body text-sm font-semibold text-text-primary dark:text-text-primary truncate leading-tight">
            {teamName}
          </p>
          {username && (
            <p className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary truncate leading-tight mt-0.5">
              @{username}
            </p>
          )}
        </div>
        <WinWindowBadge tier={tier} />
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
              const { bg, text } = ROUND_COLORS[r]
              return (
                <div key={r} className="flex items-center">
                  <div className="w-10 shrink-0">
                    <span
                      className="font-body text-[10px] font-bold rounded px-1.5 py-0.5"
                      style={{ backgroundColor: bg, color: text }}
                    >
                      {ROUND_LABELS[r]}
                    </span>
                  </div>
                  {PICK_YEARS.map(yr => {
                    const count = pickGrid[r][yr]
                    return (
                      <div key={yr} className="flex-1 text-center">
                        <span
                          className="font-mono text-sm font-semibold tabular-nums"
                          style={{ color: count > 0 ? text : '#3A3A42' }}
                        >
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
      ) : sortMode === 'faab' ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-xl font-semibold text-accent tabular-nums">
              ${roster.faabRemaining}
            </span>
            <span className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary">
              FAAB remaining
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
          <div className="flex gap-1.5 mb-2.5">
            {POSITIONS.map(pos => {
              const strength = getPositionalStrength(roster)
              const avg = leagueAverages?.[pos] ?? 1
              const fillPct = Math.min(100, Math.round((strength[pos] / (avg * 2)) * 100))
              const above = strength[pos] >= avg
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
                </div>
              )
            })}
          </div>

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
