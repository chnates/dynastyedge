import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from 'lucide-react'
import { useLeagueContext } from '../../context/LeagueContext'
import { getTeamName } from '../../hooks/useLeague'
import { analyzeTrade, getTradeVerdict, suggestFairPackage, getCounterSuggestion, adjustVerdictForInjuries } from '../../utils/tradeAnalysis'
import { rankTradePartners } from '../../utils/rosterAnalysis'
import { buildAgeCurves, buildRosterTrajectory, getTrajectoryRead } from '../../utils/dynastyTrajectory'
import { usePlayoffOdds } from '../../hooks/usePlayoffOdds'
import { fetchPlayerNews } from '../../hooks/usePlayerNews'
import { getPlayerIntel } from '../../hooks/usePlayerIntel'
import TradeBuilder from './TradeBuilder'
import TradeVerdict from './TradeVerdict'
import WinWindowBadge from '../shared/WinWindowBadge'
import LoadingSpinner from '../shared/LoadingSpinner'
import ErrorState from '../shared/ErrorState'

const DRAFT_KEY = 'dynastyedge_trade_draft'

function loadDraft() {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null') }
  catch { return null }
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

// Map a suggestFairPackage result back to full roster asset objects
function mapPackageToAssets(fairPackage, myRoster) {
  if (!fairPackage || !myRoster) return []
  return fairPackage.assets.map(a => {
    if (a.type === 'player') {
      const player = myRoster.players.find(p => p.sleeperId === a.sleeperId)
      return player ? makeAsset(player, 'player') : null
    }
    // pick: match by reconstructed label (season + round suffix)
    const pick = myRoster.picks.find(p => {
      const suffix = ['', '1st', '2nd', '3rd', '4th'][p.round] ?? `R${p.round}`
      return `${p.season} ${suffix}` === a.name
    })
    return pick ? makeAsset(pick, 'pick') : null
  }).filter(Boolean)
}

const VERDICT_CHIP = {
  Accept:  { Icon: CheckCircle2, cls: 'text-success' },
  Decline: { Icon: XCircle,      cls: 'text-danger' },
  Counter: { Icon: RefreshCw,    cls: 'text-warning' },
}

// Pinned below the sub-tab bar so totals + verdict stay visible while
// scrolling the builder and verdict panels.
function StickySummary({ giveTotal, getTotal, verdict }) {
  const diff   = getTotal - giveTotal
  const pct    = Math.round(Math.abs(diff) / Math.max(giveTotal, getTotal, 1) * 100)
  const isEven = pct <= 5
  const chip   = verdict ? VERDICT_CHIP[verdict.verdict] : null

  return (
    <div className="sticky top-[37px] z-[4] -mx-4 mb-3 px-4 py-2 bg-bg-secondary/95 dark:bg-bg-secondary/95 backdrop-blur-sm border-b border-border-default dark:border-border-default flex items-center gap-2">
      <span className="flex-1 font-body text-[11px] text-text-secondary dark:text-text-secondary truncate">
        Give <span className="font-mono text-xs text-text-primary dark:text-text-primary tabular-nums">{giveTotal.toLocaleString()}</span>
        <span className="mx-1 text-text-tertiary">⇄</span>
        Get <span className="font-mono text-xs text-text-primary dark:text-text-primary tabular-nums">{getTotal.toLocaleString()}</span>
      </span>
      <span className={`font-mono text-[11px] font-semibold tabular-nums shrink-0 ${
        isEven ? 'text-text-tertiary' : diff > 0 ? 'text-success' : 'text-danger'
      }`}>
        {isEven ? '≈ even' : `${diff > 0 ? '+' : '-'}${pct}%`}
      </span>
      {chip && (
        <span className={`flex items-center gap-1 font-body text-[11px] font-bold uppercase tracking-wide shrink-0 ${chip.cls}`}>
          <chip.Icon size={13} strokeWidth={2.25} />
          {verdict.verdict}
        </span>
      )}
    </div>
  )
}

// Partner intelligence carried in from the Trade Partner analysis so "what
// should I offer them" is answerable while building.
function OpponentContextStrip({ partner }) {
  return (
    <div className="mb-4 px-3 py-2.5 rounded-none bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default flex flex-col gap-1.5">
      <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap">
        {partner.theirNeeds.length > 0 && (
          <span className="flex items-center gap-1">
            <span className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary">Needs</span>
            {partner.theirNeeds.map(pos => (
              <span key={pos} className="inline-flex items-center rounded-none px-1.5 py-0.5 font-body text-[10px] font-bold uppercase bg-danger/10 text-danger">
                {pos}
              </span>
            ))}
          </span>
        )}
        {partner.theirHaves.length > 0 && (
          <span className="flex items-center gap-1">
            <span className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary">Has</span>
            {partner.theirHaves.map(pos => (
              <span key={pos} className="inline-flex items-center rounded-none px-1.5 py-0.5 font-body text-[10px] font-bold uppercase bg-success/10 text-success">
                {pos}
              </span>
            ))}
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary">Picks</span>
          <span className={`font-body text-[10px] font-semibold ${
            partner.pickCapStatus === 'Rich' ? 'text-success'
              : partner.pickCapStatus === 'Depleted' ? 'text-danger'
              : 'text-text-secondary dark:text-text-secondary'
          }`}>
            {partner.pickCapStatus}
          </span>
        </span>
        <WinWindowBadge tier={partner.winWindowTier} />
      </div>
      {partner.mismatchWarning && (
        <div className="flex items-start gap-1.5">
          <AlertTriangle size={11} strokeWidth={2} className="text-warning shrink-0 mt-0.5" />
          <span className="font-body text-[10px] text-warning leading-tight">{partner.mismatchWarning}</span>
        </div>
      )}
    </div>
  )
}

export default function TradeAnalyzer() {
  const { league, values, loading, error, retry, nflState } = useLeagueContext()
  // My live playoff odds feed Layer 3 (win-window fit). Null in the offseason
  // and until the sim has real games — Layer 3 falls back to the tier read.
  const { myOdds } = usePlayoffOdds()
  const location = useLocation()

  const initId        = location.state?.opponentRosterId
  const initTarget    = location.state?.whatsFairTarget
  const preloadGive   = location.state?.preloadGivePlayer
  // Full two-sided pre-fill (Pick Trade Calculator): { opponentRosterId, give, get }
  const initTrade     = location.state?.preloadTrade

  // Navigation state takes priority; otherwise restore the session draft so
  // hopping to another tab and back doesn't lose a half-built trade.
  const hasNavState = (initId !== undefined && initId !== null) || !!initTarget || !!preloadGive || !!initTrade
  const draftRef = useRef(hasNavState ? null : loadDraft())
  const draft = draftRef.current

  const [selectedOpponentId, setSelectedOpponentId] = useState(() => {
    if (hasNavState) {
      if (initTrade?.opponentRosterId != null) return Number(initTrade.opponentRosterId)
      return initId !== undefined && initId !== null ? Number(initId) : null
    }
    return draft?.opponentId ?? null
  })
  const [giveAssets, setGiveAssets] = useState(() =>
    initTrade?.give?.map(a => makeAsset(a, a.type ?? 'pick')) ?? draft?.giveAssets ?? [])
  const [getAssets,  setGetAssets]  = useState(() =>
    initTrade?.get?.map(a => makeAsset(a, a.type ?? 'pick')) ?? draft?.getAssets ?? [])
  const [whatsFairTarget, setWhatsFairTarget] = useState(() => {
    if (initTarget) return { ...initTarget, type: 'player', id: String(initTarget.sleeperId) }
    return draft?.whatsFairTarget ?? null
  })
  const [assetsPreloaded, setAssetsPreloaded] = useState(false)
  const preloadGiveRef = useRef(preloadGive ? makeAsset(preloadGive, 'player') : null)

  const [liveIntelligence, setLiveIntelligence]       = useState(null)
  const [intelligenceLoading, setIntelligenceLoading] = useState(false)

  const opponentRoster = useMemo(
    () => league?.allRosters?.find(r => r.rosterId === selectedOpponentId) ?? null,
    [league, selectedOpponentId]
  )

  const partnerInfo = useMemo(() => {
    if (!league?.myRoster || !league?.allRosters?.length || !selectedOpponentId) return null
    const { partners } = rankTradePartners(league.myRoster, league.allRosters)
    return partners.find(p => p.rosterId === selectedOpponentId) ?? null
  }, [league, selectedOpponentId])

  // Fit-ranked pick list so the opponent selector isn't a blind list of names —
  // it answers "who do I call?" inline: grouped by fit, each option carrying
  // win-window tier + record. Partners come pre-sorted (best match first).
  const partnerPickList = useMemo(() => {
    if (!league?.myRoster || !league?.allRosters?.length) return []
    const { partners } = rankTradePartners(league.myRoster, league.allRosters)
    const rosterById = Object.fromEntries(league.allRosters.map(r => [r.rosterId, r]))
    return partners.map(p => {
      const r = rosterById[p.rosterId]
      return {
        rosterId: p.rosterId,
        name: getTeamName(p.owner),
        fitBadge: p.fitBadge,
        tier: p.winWindowTier,
        record: r?.hasRecord ? r.record : null,
      }
    })
  }, [league])

  const bothSides = giveAssets.length > 0 && getAssets.length > 0

  // Opponent's multi-year value direction (Dynasty Trajectory) — feeds Layer 3
  // so acquiring off a declining team reads as the buy window it is. No extra
  // fetch; built from the cached FantasyCalc pool.
  const opponentTrajectoryRead = useMemo(() => {
    if (!opponentRoster || !values?.playerMap) return null
    const { curves, generic } = buildAgeCurves(values.playerMap)
    const season = Number(nflState?.season) || new Date().getFullYear()
    return getTrajectoryRead(buildRosterTrajectory(opponentRoster, season, curves, generic))
  }, [opponentRoster, values, nflState])

  const analysis = useMemo(
    () => analyzeTrade(giveAssets, getAssets, league?.myRoster, opponentRoster, league?.allRosters, myOdds?.playoffPct ?? null, opponentTrajectoryRead),
    [giveAssets, getAssets, league, opponentRoster, myOdds, opponentTrajectoryRead]
  )

  const verdict = useMemo(() => getTradeVerdict(analysis), [analysis])

  // adjustedVerdict must be declared before counterSuggestion since counterSuggestion depends on it
  const adjustedVerdict = useMemo(
    () => adjustVerdictForInjuries(verdict, liveIntelligence, giveAssets, getAssets),
    [verdict, liveIntelligence, giveAssets, getAssets]
  )

  const counterSuggestion = useMemo(() => {
    if (!bothSides || adjustedVerdict?.verdict !== 'Counter') return null
    return getCounterSuggestion(analysis, league?.myRoster, opponentRoster, giveAssets, getAssets)
  }, [bothSides, adjustedVerdict, analysis, league, opponentRoster, giveAssets, getAssets])

  const fairPackage = useMemo(
    () => whatsFairTarget
      ? suggestFairPackage(whatsFairTarget, league?.myRoster, league?.allRosters, opponentRoster)
      : null,
    [whatsFairTarget, league, opponentRoster]
  )

  // Persist the in-progress trade for the session
  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
        opponentId: selectedOpponentId,
        giveAssets,
        getAssets,
        whatsFairTarget,
      }))
    } catch { /* storage full or unavailable — draft is best-effort */ }
  }, [selectedOpponentId, giveAssets, getAssets, whatsFairTarget])

  // Pre-populate YOU GET and YOU GIVE when arriving from Targets navigation
  useEffect(() => {
    if (!initTarget || assetsPreloaded) return
    if (!league?.myRoster || !opponentRoster || !fairPackage) return

    const targetPlayer = opponentRoster.players.find(
      p => String(p.sleeperId) === String(initTarget.sleeperId)
    ) ?? { ...initTarget }
    setGetAssets([makeAsset(targetPlayer, 'player')])
    setGiveAssets(mapPackageToAssets(fairPackage, league.myRoster))
    setAssetsPreloaded(true)
  }, [initTarget, assetsPreloaded, league, opponentRoster, fairPackage])

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
        Promise.all([
          fetchPlayerNews(p.sleeperId),
          getPlayerIntel(p.sleeperId, nflState).catch(() => null),
        ]).then(([news, intel]) => ({ ...news, intel, playerName: p.name, side: p.side, player: p }))
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
  }, [giveAssets, getAssets, nflState])

  function handleOpponentChange(rawValue) {
    const id = rawValue ? Number(rawValue) : null
    setSelectedOpponentId(id)
    setGetAssets([])
    setWhatsFairTarget(null)
    setLiveIntelligence(null)
    setIntelligenceLoading(false)
    if (preloadGiveRef.current) {
      setGiveAssets([preloadGiveRef.current])
      preloadGiveRef.current = null
    } else {
      setGiveAssets([])
    }
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

  // Scale icon on an opponent player → pre-fill the trade with a fair package
  function applyWhatsFair(player) {
    const target = makeAsset(player, 'player')
    setWhatsFairTarget(target)
    setGetAssets([target])
    const pkg = suggestFairPackage(player, league.myRoster, league.allRosters, opponentRoster)
    setGiveAssets(mapPackageToAssets(pkg, league.myRoster))
  }

  function applyCounter(suggestion) {
    if (!suggestion?.item) return
    if (suggestion.side === 'get') toggleGet(suggestion.item, suggestion.type)
    else toggleGive(suggestion.item, suggestion.type)
  }

  function clearTrade() {
    setGiveAssets([])
    setGetAssets([])
    setWhatsFairTarget(null)
  }

  if (loading && !league) return <LoadingSpinner message="Loading trade data…" />
  if (error && !league)   return <ErrorState message={error} onRetry={retry} />
  if (!league?.myRoster) return <ErrorState message="Could not load league data." onRetry={retry} />

  const FIT_GROUPS = ['Priority', 'Good Fit', 'Poor Fit']

  return (
    <div className="px-4 pb-4">
      {/* Header */}
      <div className="pt-4 pb-3">
        <p className="font-display text-base uppercase tracking-wide text-text-primary dark:text-text-primary">
          Trade Analyzer
        </p>
      </div>

      {/* Opponent selector — grouped by trade fit, each option carrying tier +
          record so the choice isn't blind. */}
      <div className="mb-3">
        <label className="block font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-secondary dark:text-text-secondary mb-1.5">
          Opponent
        </label>
        <div className="relative">
          <select
            value={selectedOpponentId ?? ''}
            onChange={e => handleOpponentChange(e.target.value)}
            className="w-full bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default rounded-none px-3 py-2.5 font-body text-sm text-text-primary dark:text-text-primary appearance-none focus:outline-none focus:border-accent pr-8"
          >
            <option value="">Select a team…</option>
            {FIT_GROUPS.map(group => {
              const inGroup = partnerPickList.filter(p => p.fitBadge === group)
              if (inGroup.length === 0) return null
              return (
                <optgroup key={group} label={group}>
                  {inGroup.map(p => (
                    <option key={p.rosterId} value={p.rosterId}>
                      {[
                        p.name,
                        p.tier,
                        p.record ? `${p.record.wins}-${p.record.losses}${p.record.ties ? `-${p.record.ties}` : ''}` : null,
                      ].filter(Boolean).join(' · ')}
                    </option>
                  ))}
                </optgroup>
              )
            })}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary text-xs">
            ▾
          </span>
        </div>
        <p className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary mt-1">
          Sorted by fit — Priority targets first
        </p>
      </div>

      {opponentRoster ? (
        <>
          {partnerInfo && <OpponentContextStrip partner={partnerInfo} />}

          {(giveAssets.length > 0 || getAssets.length > 0) && (
            <StickySummary
              giveTotal={analysis?.giveTotal ?? 0}
              getTotal={analysis?.getTotal ?? 0}
              verdict={bothSides ? adjustedVerdict : null}
            />
          )}

          <TradeBuilder
            myRoster={league.myRoster}
            opponentRoster={opponentRoster}
            giveAssets={giveAssets}
            getAssets={getAssets}
            onToggleGive={toggleGive}
            onToggleGet={toggleGet}
            onWhatsFair={applyWhatsFair}
            onClearTrade={clearTrade}
          />
          <TradeVerdict
            analysis={analysis}
            verdict={adjustedVerdict}
            giveCount={giveAssets.length}
            getCount={getAssets.length}
            counterSuggestion={counterSuggestion}
            onApplyCounter={applyCounter}
            fairPackage={fairPackage}
            whatsFairTarget={whatsFairTarget}
            onClearWhatsFair={() => setWhatsFairTarget(null)}
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
