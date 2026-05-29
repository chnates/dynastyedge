import { getTeamName } from '../../hooks/useLeague'
import { getPositionalStrength } from '../../utils/rosterAnalysis'
import WinWindowBadge from '../shared/WinWindowBadge'
import { POSITIONS, PICK_YEARS } from '../../constants'

export default function TeamCard({ roster, leagueAverages, winWindowTiers, sortMode = 'value', onTap }) {
  const teamName = getTeamName(roster.owner)
  const username = roster.owner?.username ?? ''
  const tier = winWindowTiers?.[roster.rosterId] ?? 'Middle'

  const pickCountByYear = {}
  PICK_YEARS.forEach(yr => {
    pickCountByYear[yr] = roster.picks.filter(p => p.season === yr).length
  })

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
        <div className="flex gap-4">
          {PICK_YEARS.map(yr => (
            <div key={yr} className="flex flex-col items-center gap-0.5">
              <span className="font-mono text-xl font-semibold text-accent tabular-nums">
                {pickCountByYear[yr]}
              </span>
              <span className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary">
                '{yr.slice(2)}
              </span>
            </div>
          ))}
        </div>
      ) : sortMode === 'faab' ? (
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-xl font-semibold text-accent tabular-nums">
            ${roster.faabRemaining}
          </span>
          <span className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary">
            FAAB remaining
          </span>
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
              const above = leagueAverages ? strength[pos] >= leagueAverages[pos] : false
              return (
                <div key={pos} className="flex flex-col items-center gap-0.5">
                  <div className={`h-1.5 w-8 rounded-full ${above ? 'bg-accent' : 'bg-border-default dark:bg-border-default'}`} />
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
