import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getTeamName } from '../../hooks/useLeague'
import { useLeagueContext } from '../../context/LeagueContext'
import { assignWinWindowTiers } from '../../utils/rosterAnalysis'
import LoadingSpinner from '../shared/LoadingSpinner'
import ErrorState from '../shared/ErrorState'
import WinWindowBadge from '../shared/WinWindowBadge'
import TeamAvatar from '../shared/TeamAvatar'
import { rankClass } from '../../utils/rankColors'

function formatRecord({ wins, losses, ties }) {
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`
}

export default function AllTeamsView() {
  const { league, loading, error, retry, myRosterId } = useLeagueContext()
  const navigate = useNavigate()

  const teams = useMemo(() => {
    if (!league?.allRosters?.length) return null
    const tiers = assignWinWindowTiers(league.allRosters)
    return [...league.allRosters]
      .sort((a, b) => b.totalValue - a.totalValue)
      .map(r => ({ roster: r, tier: tiers[r.rosterId] ?? 'Middle' }))
  }, [league])

  if (loading && !league) return <LoadingSpinner message="Loading teams…" />
  if (error && !league)   return <ErrorState message={error} onRetry={retry} />
  if (!teams) return <ErrorState message="Could not load league data." onRetry={retry} />

  return (
    <div className="px-4 pb-4">
      <div className="pt-4 pb-3 border-b border-border-default dark:border-border-default">
        <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary dark:text-text-secondary mb-0.5">
          All Teams
        </p>
        <p className="font-body text-sm text-text-secondary dark:text-text-secondary">
          Tap any team for the full roster and pick capital.
        </p>
      </div>

      <div className="flex flex-col gap-2 pt-3">
        {teams.map(({ roster, tier }, i) => (
          <button
            key={roster.rosterId}
            onClick={() => navigate(`/roster/teams/${roster.rosterId}`)}
            className="w-full text-left rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-3 py-3 active:opacity-70 transition-opacity"
          >
            <div className="flex items-center gap-2.5">
              <span className={`font-mono text-base font-bold tabular-nums w-6 shrink-0 ${rankClass(i + 1)}`}>
                {i + 1}
              </span>
              <TeamAvatar owner={roster.owner} size={30} />
              <div className="flex-1 min-w-0">
                <p className="font-body text-sm font-semibold text-text-primary dark:text-text-primary truncate leading-tight">
                  {getTeamName(roster.owner)}
                  {roster.rosterId === myRosterId && (
                    <span className="ml-1.5 font-body text-[10px] font-bold text-accent uppercase">You</span>
                  )}
                </p>
                <p className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary truncate mt-0.5">
                  {roster.owner?.username ? `@${roster.owner.username}` : ''}
                  {roster.hasRecord && (
                    <span>{roster.owner?.username ? ' · ' : ''}{formatRecord(roster.record)}</span>
                  )}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="font-mono text-sm font-semibold text-accent tabular-nums">
                  {roster.totalValue.toLocaleString()}
                </span>
                <WinWindowBadge tier={tier} />
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
