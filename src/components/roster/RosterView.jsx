import { useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { getTeamName } from '../../hooks/useLeague'
import { useLeagueContext } from '../../context/LeagueContext'
import LoadingSpinner from '../shared/LoadingSpinner'
import ErrorState from '../shared/ErrorState'
import PlayerCard from './PlayerCard'
import PickBadge from './PickBadge'
import PlayerProfileDrawer from '../shared/PlayerProfileDrawer'
import RosterAnalysisSheet from './RosterAnalysisSheet'
import RosterActionItems from './RosterActionItems'
import { PositionBand, RuledList, NavRow } from '../ui'
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
          className="focus-ring press flex items-center gap-1 pt-4 pb-1 text-accent font-body text-sm"
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
            <h1 className="font-display font-extrabold text-2xl uppercase tracking-[-0.025em] text-bg-primary leading-tight min-w-0 text-balance">
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
            <span className="block w-1.5 h-1.5 bg-bg-primary/80 shrink-0" />
            <span className="font-body text-[10px] text-bg-primary/60">
              = starting lineup · — = no market value yet
            </span>
          </div>
        </div>
      </div>

      {/* ── The two doors off this screen ──
          Both were `Card`s carrying a tinted lucide medallion, a title, a
          one-line description and a right chevron — the identical
          icon+title+one-liner pattern the slop research names, twice over
          (slop-checklist.md -> Components). They are now <NavRow>s: the same
          shape the Index uses, in display type, with no icon at all.

          Trajectory renders for BOTH seats. It used to be gated on
          `selectedRosterId`, so my OWN trajectory — the app's one
          forward-looking view — had zero content-level inbound links anywhere
          (findings.md A1/A7). */}
      <RuledList className="mt-5">
        <NavRow
          size="sm"
          to={selectedRosterId ? `/league/trajectory/${selectedRosterId}` : '/my-team/trajectory'}
          title="Dynasty Trajectory"
          detail={selectedRosterId
            ? "Where this team's value is headed · when their window closes"
            : 'Where your value is headed · when your window peaks'}
        />
        {!selectedRosterId && (
          <NavRow
            size="sm"
            onClick={() => setAnalysisOpen(true)}
            title="Roster Analysis"
            detail="Age curve · win window · position breakdown"
          />
        )}
      </RuledList>

      {/* ── Action Items banner (own roster only) ── */}
      {!selectedRosterId && (
        <RosterActionItems myRoster={league.myRoster} nflState={nflState} allRosters={league.allRosters} pickYears={league.pickYears} />
      )}

      {/* ── Position groups ── */}
      {POSITION_ORDER.map(pos => {
        const group = byPosition[pos]
        if (!group?.length) return null
        return (
          <section key={pos}>
            {/* The full-bleed position field — Matchday's signature. Its total
                is how you read WEIGHT ACROSS positions; the per-row type size
                is how you read SHAPE WITHIN one. */}
            <PositionBand
              position={pos}
              count={group.length}
              total={group.reduce((a, p) => a + (p.value > 0 ? p.value : 0), 0)}
              className="mt-5"
            />
            {/* The dense register (finding B7): rows on the page's own ground,
                separated by a hairline. The box that used to wrap them made
                every group another 1px-bordered rectangle — the band above is
                what carries this group's identity now. */}
            <RuledList>
              {group.map(player => (
                <PlayerCard key={player.sleeperId} player={player} onClick={() => setSelectedPlayer(player)} />
              ))}
            </RuledList>
          </section>
        )
      })}

      {/* ── Taxi Squad ── */}
      {taxi.length > 0 && (
        <section>
          {/* Taxi and IR mix positions, so they take the NEUTRAL ink band —
              picking a hue to make a mixed list colourful would lie about
              what is in it (PositionBand's contract). */}
          <PositionBand
            label="Taxi Squad"
            count={taxi.length}
            total={taxi.reduce((a, p) => a + (p.value > 0 ? p.value : 0), 0)}
            className="mt-5"
          />
          <RuledList>
            {taxi
              .sort((a, b) => b.value - a.value)
              .map(player => (
                <PlayerCard key={player.sleeperId} player={player} onClick={() => setSelectedPlayer(player)} />
              ))}
          </RuledList>
        </section>
      )}

      {/* ── IR ── */}
      {ir.length > 0 && (
        <section>
          <PositionBand
            label="Injured Reserve"
            count={ir.length}
            total={ir.reduce((a, p) => a + (p.value > 0 ? p.value : 0), 0)}
            className="mt-5"
          />
          <RuledList>
            {ir
              .sort((a, b) => b.value - a.value)
              .map(player => (
                <PlayerCard key={player.sleeperId} player={player} onClick={() => setSelectedPlayer(player)} />
              ))}
          </RuledList>
        </section>
      )}

      {/* ── Pick Capital ── */}
      <section>
        <PositionBand
          label="Pick Capital"
          count={Object.values(picksByYear).reduce((a, v) => a + v.length, 0) || null}
          className="mt-5 mb-3"
        />
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
