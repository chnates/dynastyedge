import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { useLeagueContext } from '../../context/LeagueContext'
import { getTeamName } from '../../hooks/useLeague'
import { analyzeTrade, getTradeVerdict, suggestFairPackage, getCounterSuggestion, adjustVerdictForInjuries } from '../../utils/tradeAnalysis'
import { fetchPlayerNews } from '../../hooks/usePlayerNews'
import TradeBuilder from './TradeBuilder'
import TradeVerdict from './TradeVerdict'
import LoadingSpinner from '../shared/LoadingSpinner'

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

  const initId     = location.state?.opponentRosterId
  const initTarget = location.state?.whatsFairTarget

  const [selectedOpponentId, setSelectedOpponentId] = useState(
    initId !== undefined && initId !== null ? Number(initId) : null
  )
  const [giveAssets, setGiveAssets]       = useState([])
  const [getAssets,  setGetAssets]        = useState([])
  const [whatsFairMode, setWhatsFairMode] = useState(!!initTarget)
  const [whatsFairTarget, setWhatsFairTarget] = useState(
    initTarget ? { ...initTarget, type: 'player', id: String(initTarget.sleeperId) } : null
  )

  const [liveIntelligence, setLiveIntelligence]     = useState(null)
  const [intelligenceLoading, setIntelligenceLoading] = useState(false)

  const opponentRoster = useMemo(
    () => league?.allRosters?.find(r => r.rosterId === selectedOpponentId) ?? null,
    [league, selectedOpponentId]
  )

  const analysis = useMemo(
    () => analyzeTrade(giveAssets, getAssets, league?.myRoster, opponentRoster, league?.allRosters),
    [giveAssets, getAssets, league, opponentRoster]
  )

  const verdict = useMemo(() => getTradeVerdict(analysis), [analysis])

  // adjustedVerdict must be declared before counterSuggestion since counterSuggestion depends on it
  const adjustedVerdict = useMemo(
    () => adjustVerdictForInjuries(verdict, liveIntelligence, giveAssets, getAssets),
    [verdict, liveIntelligence, giveAssets, getAssets]
  )

  const counterSuggestion = useMemo(() => {
    if (adjustedVerdict?.verdict !== 'Counter') return null
    return getCounterSuggestion(analysis, league?.myRoster, opponentRoster)
  }, [adjustedVerdict, analysis, league, opponentRoster])

  const fairPackage = useMemo(
    () => whatsFairTarget ? suggestFairPackage(whatsFairTarget, league?.myRoster) : null,
    [whatsFairTarget, league]
  )

  // Fetch Sleeper news for all non-pick players in the trade
  useEffect(() => {
    const allPlayers = [
      ...giveAssets.filter(a => a.type === 'player').slice(0, 3).map(p => ({ ...p, side: 'give' })),
      ...getAssets.filter(a => a.type === 'player').slice(0, 3).map(p => ({ ...p, side: 'get' })),
    ]

    if (!allPlayers.length) {
      setLiveIntelligence(null)
      setIntelligenceLoading(false)
      return
    }

    let cancelled = false
    setLiveIntelligence(null)
    setIntelligenceLoading(true)

    Promise.all(
      allPlayers.map(p =>
        fetchPlayerNews(p.sleeperId).then(r => ({ ...r, playerName: p.name, side: p.side }))
      )
    )
      .then(results => {
        if (!cancelled) {
          setLiveIntelligence(results)
          setIntelligenceLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setIntelligenceLoading(false)
      })

    return () => { cancelled = true }
  }, [giveAssets, getAssets])

  function handleOpponentChange(rawValue) {
    const id = rawValue ? Number(rawValue) : null
    setSelectedOpponentId(id)
    setGiveAssets([])
    setGetAssets([])
    setWhatsFairMode(false)
    setWhatsFairTarget(null)
    setLiveIntelligence(null)
    setIntelligenceLoading(false)
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
        <p className="flex-1 font-display text-base font-bold uppercase tracking-wide text-text-primary dark:text-text-primary">
          Trade Analyzer
        </p>
        <button
          onClick={handleWhatsFairToggle}
          disabled={!opponentRoster}
          className={`font-body text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors shrink-0 disabled:opacity-40
            ${whatsFairMode
              ? 'bg-accent/15 border-accent text-accent'
              : 'bg-bg-secondary dark:bg-bg-secondary border-border-default dark:border-border-default text-text-tertiary dark:text-text-tertiary'
            }`}
        >
          {whatsFairMode ? '● What\'s Fair?' : 'What\'s Fair?'}
        </button>
      </div>

      {/* What's Fair instruction banner */}
      {whatsFairMode && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-accent/10 border border-accent/30 flex items-center justify-between gap-2">
          <span className="font-body text-xs text-accent leading-tight">
            {whatsFairTarget
              ? `Target: ${whatsFairTarget.name} — fair package shown below`
              : 'What\'s Fair? mode active — tap a player from their roster to see a fair package'}
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
            verdict={adjustedVerdict}
            counterSuggestion={counterSuggestion}
            fairPackage={fairPackage}
            whatsFairTarget={whatsFairTarget}
            liveIntelligence={liveIntelligence}
            intelligenceLoading={intelligenceLoading}
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
