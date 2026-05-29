import { useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useLeagueContext } from '../../context/LeagueContext'
import { getTeamName } from '../../hooks/useLeague'
import { analyzeTrade, getTradeVerdict, suggestFairPackage, getCounterSuggestion } from '../../utils/tradeAnalysis'
import TradeBuilder from './TradeBuilder'
import TradeVerdict from './TradeVerdict'
import LoadingSpinner from '../shared/LoadingSpinner'

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

function makeAsset(item, type) {
  if (type === 'player') {
    return { ...item, type: 'player', id: String(item.sleeperId) }
  }
  return {
    ...item,
    type: 'pick',
    id: `${item.season}-${item.round}-${item.originalOwner}`,
  }
}

export default function TradeAnalyzer() {
  const { league, loading, error, retry } = useLeagueContext()
  const location = useLocation()
  const navigate  = useNavigate()

  const initId = location.state?.opponentRosterId
  const [selectedOpponentId, setSelectedOpponentId] = useState(
    initId !== undefined && initId !== null ? Number(initId) : null
  )
  const [giveAssets, setGiveAssets]       = useState([])
  const [getAssets,  setGetAssets]        = useState([])
  const [whatsFairMode, setWhatsFairMode] = useState(false)
  const [whatsFairTarget, setWhatsFairTarget] = useState(null)

  const opponentRoster = useMemo(
    () => league?.allRosters?.find(r => r.rosterId === selectedOpponentId) ?? null,
    [league, selectedOpponentId]
  )

  const analysis = useMemo(
    () => analyzeTrade(giveAssets, getAssets, league?.myRoster, opponentRoster, league?.allRosters),
    [giveAssets, getAssets, league, opponentRoster]
  )

  const verdict = useMemo(() => getTradeVerdict(analysis), [analysis])

  const counterSuggestion = useMemo(() => {
    if (verdict?.verdict !== 'Counter') return null
    return getCounterSuggestion(analysis, league?.myRoster, opponentRoster)
  }, [verdict, analysis, league, opponentRoster])

  const fairPackage = useMemo(
    () => whatsFairTarget ? suggestFairPackage(whatsFairTarget, league?.myRoster) : null,
    [whatsFairTarget, league]
  )

  function handleOpponentChange(rawValue) {
    const id = rawValue ? Number(rawValue) : null
    setSelectedOpponentId(id)
    setGiveAssets([])
    setGetAssets([])
    setWhatsFairMode(false)
    setWhatsFairTarget(null)
  }

  function toggleGive(item, type) {
    const asset = makeAsset(item, type)
    setGiveAssets(prev =>
      prev.some(a => a.id === asset.id)
        ? prev.filter(a => a.id !== asset.id)
        : [...prev, asset]
    )
  }

  function toggleGet(item, type) {
    const asset = makeAsset(item, type)
    setGetAssets(prev =>
      prev.some(a => a.id === asset.id)
        ? prev.filter(a => a.id !== asset.id)
        : [...prev, asset]
    )
  }

  function handleWhatsFairSelect(player) {
    const asset = makeAsset(player, 'player')
    setWhatsFairTarget(prev => (prev?.id === asset.id ? null : asset))
  }

  function handleWhatsFairToggle() {
    if (whatsFairMode) {
      setWhatsFairMode(false)
      setWhatsFairTarget(null)
    } else {
      setWhatsFairMode(true)
    }
  }

  if (loading) return <LoadingSpinner message="Loading trade data…" />
  if (error)   return <ErrorState message={error} onRetry={retry} />
  if (!league?.myRoster) return <ErrorState message="Could not load league data." onRetry={retry} />

  const opponents = league.allRosters.filter(r => r.rosterId !== league.myRoster.rosterId)

  return (
    <div className="px-4 pb-4">
      {/* Header */}
      <div className="pt-4 pb-3 flex items-center gap-2">
        <button
          onClick={() => navigate('/trade')}
          className="font-body text-sm text-accent font-medium shrink-0"
        >
          ← Back
        </button>
        <p className="flex-1 text-center font-display text-base font-bold uppercase tracking-wide text-text-primary dark:text-text-primary">
          Trade Analyzer
        </p>
        <button
          onClick={handleWhatsFairToggle}
          disabled={!opponentRoster}
          className={`font-body text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors shrink-0 disabled:opacity-40
            ${whatsFairMode
              ? 'bg-accent text-white border-accent'
              : 'border-border-default dark:border-border-default text-text-secondary dark:text-text-secondary'
            }`}
        >
          What's Fair?
        </button>
      </div>

      {/* What's Fair instruction banner */}
      {whatsFairMode && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-accent/10 border border-accent/30 flex items-center justify-between gap-2">
          <span className="font-body text-xs text-accent leading-tight">
            {whatsFairTarget
              ? `Target: ${whatsFairTarget.name} — fair package shown below`
              : 'Tap any player from their roster'}
          </span>
          {whatsFairTarget && (
            <button
              onClick={() => setWhatsFairTarget(null)}
              className="text-accent text-base font-bold shrink-0 leading-none"
            >
              ×
            </button>
          )}
        </div>
      )}

      {/* Opponent selector */}
      <div className="mb-4">
        <label className="block font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary dark:text-text-secondary mb-1.5">
          Opponent
        </label>
        <div className="relative">
          <select
            value={selectedOpponentId ?? ''}
            onChange={e => handleOpponentChange(e.target.value)}
            className="w-full bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default rounded-xl px-3 py-2.5 font-body text-sm text-text-primary dark:text-text-primary appearance-none focus:outline-none focus:border-accent pr-8"
          >
            <option value="">Select a team…</option>
            {opponents.map(r => (
              <option key={r.rosterId} value={r.rosterId}>
                {getTeamName(r.owner)}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary text-xs">
            ▾
          </span>
        </div>
      </div>

      {opponentRoster ? (
        <>
          <TradeBuilder
            myRoster={league.myRoster}
            opponentRoster={opponentRoster}
            giveAssets={giveAssets}
            getAssets={getAssets}
            onToggleGive={toggleGive}
            onToggleGet={toggleGet}
            whatsFairMode={whatsFairMode}
            whatsFairTarget={whatsFairTarget}
            onWhatsFairSelect={handleWhatsFairSelect}
          />
          <TradeVerdict
            analysis={analysis}
            verdict={verdict}
            counterSuggestion={counterSuggestion}
            fairPackage={fairPackage}
            whatsFairTarget={whatsFairTarget}
          />
        </>
      ) : (
        <div className="py-12 text-center">
          <p className="font-body text-sm text-text-tertiary dark:text-text-tertiary">
            Select a team above to start building a trade.
          </p>
        </div>
      )}
    </div>
  )
}
