import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { getTeamName } from '../../hooks/useLeague'
import { useLeagueContext } from '../../context/LeagueContext'
import LoadingSpinner from '../shared/LoadingSpinner'
import PlayerCard from './PlayerCard'
import PickBadge from './PickBadge'
import PlayerProfileDrawer from '../shared/PlayerProfileDrawer'

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
      <AlertTriangle size={24} className="text-warning" strokeWidth={1.75} />
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
  const { league, loading, error, retry } = useLeagueContext()
  const location = useLocation()
  const navigate = useNavigate()
  const [selectedPlayer, setSelectedPlayer] = useState(null)

  const selectedRosterId = location.state?.selectedRosterId

  const displayRoster = useMemo(() => {
    if (!league) return null
    if (selectedRosterId) {
      return league.allRosters?.find(r => r.rosterId === selectedRosterId) ?? league.myRoster
    }
    return league.myRoster
  }, [league, selectedRosterId])

  const grouped = useMemo(() => {
    if (!displayRoster) return null
    const { players, picks } = displayRoster

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
  if (!displayRoster) return <ErrorState message="Could not load roster." onRetry={retry} />

  const { userMap } = league
  const teamName = getTeamName(displayRoster.owner)
  const { byPosition, taxi, ir, picksByYear } = grouped

  function getOriginalTeamName(rosterId) {
    return getTeamName(userMap[rosterId])
  }

  return (
    <div className="px-4 pb-4">
      {/* ── Back button (when drilling down from League tab) ── */}
      {selectedRosterId && (
        <button
          onClick={() => navigate('/league')}
          className="flex items-center gap-1 pt-4 pb-1 text-accent font-body text-sm"
        >
          ← League
        </button>
      )}

      {/* ── Header ── */}
      <div className={`${selectedRosterId ? 'pt-1' : 'pt-4'} pb-3 border-b border-border-default dark:border-border-default`}>
        <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary dark:text-text-secondary mb-0.5">
          Dynasty Roster
        </p>
        <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-text-primary dark:text-text-primary leading-tight">
          {teamName}
        </h1>
        <div className="flex items-baseline gap-2 mt-1.5">
          <span className="font-mono text-3xl font-medium text-accent tabular-nums">
            {displayRoster.totalValue.toLocaleString()}
          </span>
          <span className="font-body text-xs text-text-secondary dark:text-text-secondary">
            dynasty pts
          </span>
        </div>
        <div className="flex items-center gap-1 mt-1.5">
          <span className="block w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
          <span className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary">
            = starting lineup
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
                <PlayerCard key={player.sleeperId} player={player} onClick={() => setSelectedPlayer(player)} />
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
                <PlayerCard key={player.sleeperId} player={player} onClick={() => setSelectedPlayer(player)} />
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
                <PlayerCard key={player.sleeperId} player={player} onClick={() => setSelectedPlayer(player)} />
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
                      />
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>

      {selectedPlayer && (
        <PlayerProfileDrawer
          player={selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  )
}
