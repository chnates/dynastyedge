import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Target, CheckCircle2, Circle, AlertTriangle } from 'lucide-react'
import { getTeamName } from '../../hooks/useLeague'
import { useLeagueContext } from '../../context/LeagueContext'
import { rankTradePartners } from '../../utils/rosterAnalysis'
import WinWindowBadge from '../shared/WinWindowBadge'
import LoadingSpinner from '../shared/LoadingSpinner'

const FILTER_TABS = ['All', 'QB', 'RB', 'WR', 'TE', 'Picks']

const FIT_BADGE = {
  'Priority': { Icon: Target,       textClass: 'text-accent' },
  'Good Fit': { Icon: CheckCircle2, textClass: 'text-success' },
  'Poor Fit': { Icon: Circle,       textClass: 'text-text-tertiary dark:text-text-tertiary' },
}

const PICK_CAP_STYLES = {
  Rich:     'text-success bg-success/10',
  Neutral:  'text-text-secondary dark:text-text-secondary bg-bg-secondary dark:bg-bg-secondary',
  Depleted: 'text-danger bg-danger/10',
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

function PositionChip({ position, variant }) {
  const base = 'inline-flex items-center rounded px-1.5 py-0.5 font-body text-[10px] font-bold uppercase'
  const color = variant === 'need' ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'
  return <span className={`${base} ${color}`}>{position}</span>
}

function TradePartnerCard({ partner, onClick }) {
  const { owner, fitBadge, winWindowTier, mismatchWarning, theirNeeds, theirHaves, pickCapStatus } = partner
  const badge = FIT_BADGE[fitBadge] ?? FIT_BADGE['Poor Fit']

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-3 py-3 flex flex-col gap-2 active:opacity-80 transition-opacity"
    >
      {/* Row 1: fit icon + team name + win window badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <badge.Icon size={14} strokeWidth={2} className={`shrink-0 ${badge.textClass}`} />
          <span className="font-display text-base font-bold uppercase tracking-wide text-text-primary dark:text-text-primary truncate">
            {getTeamName(owner)}
          </span>
        </div>
        <WinWindowBadge tier={winWindowTier} />
      </div>

      {/* Row 2: fit badge label */}
      <span className={`font-body text-[11px] font-semibold uppercase tracking-wider ${badge.textClass}`}>
        {fitBadge}
      </span>

      {/* Row 3: needs + haves chips */}
      <div className="flex items-center gap-3 flex-wrap">
        {theirNeeds.length > 0 && (
          <div className="flex items-center gap-1">
            <span className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary">Needs:</span>
            {theirNeeds.map(pos => <PositionChip key={pos} position={pos} variant="need" />)}
          </div>
        )}
        {theirHaves.length > 0 && (
          <div className="flex items-center gap-1">
            <span className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary">Has:</span>
            {theirHaves.map(pos => <PositionChip key={pos} position={pos} variant="have" />)}
          </div>
        )}
        {theirNeeds.length === 0 && theirHaves.length === 0 && (
          <span className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary">Balanced roster</span>
        )}
      </div>

      {/* Row 4: pick capital */}
      <div className="flex items-center gap-2">
        <span className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary">Picks:</span>
        <span className={`font-body text-[11px] font-semibold rounded-full px-2 py-0.5 ${PICK_CAP_STYLES[pickCapStatus]}`}>
          {pickCapStatus}
        </span>
      </div>

      {/* Row 5: win window mismatch warning */}
      {mismatchWarning && (
        <div className="flex items-start gap-1.5">
          <AlertTriangle size={12} strokeWidth={2} className="text-warning shrink-0 mt-0.5" />
          <span className="font-body text-[11px] text-warning leading-tight">{mismatchWarning}</span>
        </div>
      )}
    </button>
  )
}

export default function TradePartnerFinder() {
  const { league, loading, error, retry } = useLeagueContext()
  const [activeFilter, setActiveFilter] = useState('All')
  const navigate = useNavigate()

  const analysis = useMemo(() => {
    if (!league?.myRoster || !league?.allRosters?.length) return null
    return rankTradePartners(league.myRoster, league.allRosters)
  }, [league])

  const displayedPartners = useMemo(() => {
    if (!analysis) return []
    const { partners } = analysis
    if (activeFilter === 'All') return partners
    if (activeFilter === 'Picks') {
      return [...partners].sort((a, b) => b.pickCapitalScore - a.pickCapitalScore)
    }
    return [...partners].sort((a, b) => b.positionalDeltas[activeFilter] - a.positionalDeltas[activeFilter])
  }, [analysis, activeFilter])

  if (loading) return <LoadingSpinner message="Analyzing trade partners…" />
  if (error)   return <ErrorState message={error} onRetry={retry} />
  if (!league?.myRoster) return <ErrorState message="Could not load league data." onRetry={retry} />

  const myTeamName = getTeamName(league.myRoster.owner)

  return (
    <div className="px-4 pb-4">
      {/* Header */}
      {analysis && (
        <div className="pt-4 pb-3 border-b border-border-default dark:border-border-default">
          <div className="flex items-center gap-2">
            <span className="font-body text-sm text-text-secondary dark:text-text-secondary">{myTeamName}</span>
            <WinWindowBadge tier={analysis.myTier} />
          </div>
        </div>
      )}

      {/* Position filter bar */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none py-3 -mx-4 px-4">
        {FILTER_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveFilter(tab)}
            className={`shrink-0 px-3 py-1 rounded-full font-body text-xs font-semibold uppercase tracking-wider transition-colors
              ${activeFilter === tab
                ? 'bg-accent text-white'
                : 'bg-bg-card dark:bg-bg-card text-text-secondary dark:text-text-secondary border border-border-default dark:border-border-default'
              }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Partner list */}
      {displayedPartners.length === 0 ? (
        <p className="font-body text-sm text-text-tertiary dark:text-text-tertiary py-8 text-center">
          No trade partners found.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {displayedPartners.map(partner => (
            <TradePartnerCard
              key={partner.rosterId}
              partner={partner}
              onClick={() => navigate('/trade/analyze', { state: { opponentRosterId: partner.rosterId } })}
            />
          ))}
        </div>
      )}
    </div>
  )
}
