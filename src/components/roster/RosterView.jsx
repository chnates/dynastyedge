import { useMemo } from 'react'
import { useLeague, getTeamName } from '../../hooks/useLeague'
import LoadingSpinner from '../shared/LoadingSpinner'
import PlayerCard from './PlayerCard'
import PickBadge from './PickBadge'

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE']

function SectionHeader({ label, count }) {
  return (
    <div className="flex items-center justify-between pt-4 pb-1.5">
      <span className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary dark:text-text-secondary">
        {label}
      </span>
      {count != null && (
        <span className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary">
          {count}
        </span>
      )}
    </div>
  )
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 px-4 text-center">
      <span className="text-2xl">⚠️</span>
      <p className="text-text-secondary dark:text-text-secondary font-body text-sm">{message}</p>
      <button
        onClick={onRetry}
        className="mt-1 px-4 py-2 rounded-lg bg-accent text-white font-body font-medium text-sm"
      >
        Retry
      </button>
    </div>
  )
}

export default function RosterView() {
  const { league, loading, error, retry } = useLeague()

  const isDark = document.documentElement.classList.contains('dark')

  const grouped = useMemo(() => {
    if (!league?.myRoster) return null
    const { players, picks } = league.myRoster

    const active = players.filter(p => !p.isTaxi && !p.isIR)
    const taxi = players.filter(p => p.isTaxi)
    const ir = players.filter(p => p.isIR)

    const byPosition = {}
    POSITION_ORDER.forEach(pos => {
      byPosition[pos] = active
        .filter(p => p.position === pos)
        .sort((a, b) => b.value - a.value)
    })

    const picksByYear = {}
    picks.forEach(pk => {
      if (!picksByYear[pk.season]) picksByYear[pk.season] = []
      picksByYear[pk.season].push(pk)
    })

    return { byPosition, taxi, ir, picksByYear }
  }, [league])

  if (loading) return <LoadingSpinner message="Loading roster data…" />
  if (error) return <ErrorState message={error} onRetry={retry} />
  if (!league?.myRoster) return <ErrorState message="Could not load roster." onRetry={retry} />

  const { myRoster, userMap } = league
  const teamName = getTeamName(myRoster.owner)
  const { byPosition, taxi, ir, picksByYear } = grouped

  function getOriginalTeamName(rosterId) {
    return getTeamName(userMap[rosterId])
  }

  return (
    <div className="px-4 pb-4">
      {/* ── Header ── */}
      <div className="pt-4 pb-3 border-b border-border-default dark:border-border-default">
        <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary dark:text-text-secondary mb-0.5">
          Dynasty Roster
        </p>
        <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-text-primary dark:text-text-primary leading-tight">
          {teamName}
        </h1>
        <div className="flex items-baseline gap-2 mt-1.5">
          <span className="font-mono text-3xl font-medium text-accent tabular-nums">
            {myRoster.totalValue.toLocaleString()}
          </span>
          <span className="font-body text-xs text-text-secondary dark:text-text-secondary">
            dynasty pts
          </span>
        </div>
      </div>

      {/* ── Position groups ── */}
      {POSITION_ORDER.map(pos => {
        const group = byPosition[pos]
        if (!group?.length) return null
        return (
          <section key={pos}>
            <SectionHeader label={pos} count={group.length} />
            <div className="rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-3">
              {group.map(player => (
                <PlayerCard key={player.sleeperId} player={player} />
              ))}
            </div>
          </section>
        )
      })}

      {/* ── Taxi Squad ── */}
      {taxi.length > 0 && (
        <section>
          <SectionHeader label="Taxi Squad" count={taxi.length} />
          <div className="rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-3">
            {taxi
              .sort((a, b) => b.value - a.value)
              .map(player => (
                <PlayerCard key={player.sleeperId} player={player} />
              ))}
          </div>
        </section>
      )}

      {/* ── IR ── */}
      {ir.length > 0 && (
        <section>
          <SectionHeader label="IR" count={ir.length} />
          <div className="rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-3">
            {ir
              .sort((a, b) => b.value - a.value)
              .map(player => (
                <PlayerCard key={player.sleeperId} player={player} />
              ))}
          </div>
        </section>
      )}

      {/* ── Pick Capital ── */}
      <section>
        <SectionHeader label="Pick Capital" />
        {Object.keys(picksByYear).length === 0 ? (
          <p className="text-text-tertiary dark:text-text-tertiary font-body text-sm py-2">
            No future picks
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {Object.entries(picksByYear)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([year, yearPicks]) => (
                <div key={year}>
                  <p className="font-mono text-xs text-text-secondary dark:text-text-secondary mb-2">
                    {year}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {yearPicks.map((pk, i) => (
                      <PickBadge
                        key={`${pk.season}-${pk.round}-${pk.originalOwner}-${i}`}
                        pick={pk}
                        originalTeamName={
                          pk.originalOwner !== pk.currentOwner
                            ? getOriginalTeamName(pk.originalOwner)
                            : null
                        }
                        isDark={isDark}
                      />
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>
    </div>
  )
}
