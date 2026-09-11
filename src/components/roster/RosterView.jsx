import { useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, ScanSearch, TrendingUp } from 'lucide-react'
import { getTeamName } from '../../hooks/useLeague'
import { useLeagueContext } from '../../context/LeagueContext'
import LoadingSpinner from '../shared/LoadingSpinner'
import ErrorState from '../shared/ErrorState'
import SectionHeader from '../shared/SectionHeader'
import PlayerCard from './PlayerCard'
import PickBadge from './PickBadge'
import PlayerProfileDrawer from '../shared/PlayerProfileDrawer'
import RosterAnalysisSheet from './RosterAnalysisSheet'
import RosterActionItems from './RosterActionItems'
import { Card } from '../ui'
import { POS_BG, POS_TEXT } from '../../utils/positionColors'
import TeamAvatar from '../shared/TeamAvatar'

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'DEF']

export default function RosterView() {
  const { league, loading, error, retry, nflState } = useLeagueContext()
  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams()
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [analysisOpen, setAnalysisOpen] = useState(false)

  const selectedRosterId = params.rosterId
    ? Number(params.rosterId)
    : location.state?.selectedRosterId

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
  }, [displayRoster])

  if (loading && !league) return <LoadingSpinner message="Loading roster data…" />
  if (error && !league) return <ErrorState message={error} onRetry={retry} />
  if (!displayRoster) return <ErrorState message="Could not load roster." onRetry={retry} />

  const { userMap } = league
  const teamName = getTeamName(displayRoster.owner)
  const { byPosition, taxi, ir, picksByYear } = grouped

  function getOriginalTeamName(rosterId) {
    return getTeamName(userMap[rosterId])
  }

  return (
    <div className="px-4 pb-4">
      {/* ── Back button (when drilling down from League / The Edge) ── */}
      {selectedRosterId && (
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 pt-4 pb-1 text-accent font-body text-sm"
        >
          ← Back
        </button>
      )}

      {/* ── Header — red score-bug hero ── */}
      <div className={selectedRosterId ? 'mt-1' : 'mt-4'}>
        <div className="ink-field-cap flex items-center px-3 py-1.5">
          <span className="font-display text-[12px] uppercase tracking-[0.1em] leading-none">
            Dynasty Roster
          </span>
        </div>
        <div className="ink-field px-4 pt-3 pb-3">
          <div className="flex items-center gap-2.5">
            <TeamAvatar owner={displayRoster.owner} size={36} />
            <h1 className="font-display text-2xl uppercase tracking-wide text-bg-primary leading-tight min-w-0 truncate">
              {teamName}
            </h1>
          </div>
          <div className="flex items-baseline gap-2 mt-1.5">
            <span className="font-mono text-3xl font-medium tabular-nums text-bg-primary">
              {displayRoster.totalValue.toLocaleString()}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-bg-primary/60">
              dynasty pts
            </span>
          </div>
          <div className="flex items-center gap-1 mt-1.5">
            <span className="block w-1.5 h-1.5 rounded-full bg-bg-primary/80 shrink-0" />
            <span className="font-body text-[10px] text-bg-primary/60">
              = starting lineup · — = no market value yet
            </span>
          </div>
        </div>
      </div>

      {/* ── Dynasty trajectory ──
          Rendered for BOTH seats. It used to be gated on `selectedRosterId`, so
          the card existed only when scouting somebody else and my OWN
          trajectory — the app's one forward-looking view — had zero
          content-level inbound links anywhere (findings.md A1/A7: "is this
          roster aging out?" is the obvious next question from the roster you're
          looking at, and nothing on the screen answered it). */}
      <Card
        accent="bg-accent"
        padding="px-3 py-3"
        onClick={() => navigate(selectedRosterId ? `/league/trajectory/${selectedRosterId}` : '/my-team/trajectory')}
        className="mt-4 mb-1"
      >
        <div className="flex items-center gap-2.5">
          <span className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-accent/15">
            <TrendingUp size={15} strokeWidth={2} className="text-accent" />
          </span>
          <div className="flex-1 text-left">
            <p className="font-body text-sm font-semibold text-text-primary leading-tight">
              Dynasty Trajectory
            </p>
            <p className="font-body text-[10px] text-text-tertiary mt-0.5">
              {selectedRosterId
                ? "Where this team's value is headed · when their window closes"
                : 'Where your value is headed · when your window peaks'}
            </p>
          </div>
          <ChevronRight size={16} strokeWidth={1.75} className="text-text-tertiary flex-shrink-0" />
        </div>
      </Card>

      {/* ── Action Items banner (own roster only) ── */}
      {!selectedRosterId && (
        <RosterActionItems myRoster={league.myRoster} nflState={nflState} allRosters={league.allRosters} pickYears={league.pickYears} />
      )}

      {/* ── Roster Analysis (own roster only) ── */}
      {!selectedRosterId && (
        <Card
          accent="bg-accent"
          padding="px-3 py-3"
          onClick={() => setAnalysisOpen(true)}
          className="mt-4 mb-1"
        >
          <div className="flex items-center gap-2.5">
            <span className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-accent/15">
              <ScanSearch size={15} strokeWidth={2} className="text-accent" />
            </span>
            <div className="flex-1 text-left">
              <p className="font-body text-sm font-semibold text-text-primary leading-tight">
                Roster Analysis
              </p>
              <p className="font-body text-[10px] text-text-tertiary mt-0.5">
                Age curve · win window · position breakdown
              </p>
            </div>
            <ChevronRight size={16} strokeWidth={1.75} className="text-text-tertiary flex-shrink-0" />
          </div>
        </Card>
      )}

      {/* ── Position groups ── */}
      {POSITION_ORDER.map(pos => {
        const group = byPosition[pos]
        if (!group?.length) return null
        return (
          <section key={pos}>
            <SectionHeader label={pos} count={group.length} accentBar={POS_BG[pos]} accentText={POS_TEXT[pos]} />
            <div className="rounded-none bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-3">
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
          <div className="rounded-none bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-3">
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
          <div className="rounded-none bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-3">
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

      {analysisOpen && (
        <RosterAnalysisSheet
          players={league.myRoster.players}
          avgStarterAge={league.myRoster.avgStarterAge}
          allRosters={league.allRosters}
          nflState={nflState}
          onClose={() => setAnalysisOpen(false)}
        />
      )}
    </div>
  )
}
