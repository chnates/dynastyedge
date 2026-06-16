import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { useLeagueContext } from '../../context/LeagueContext'
import { useSleeperDraft, buildDraftOrder, DRAFT_SEASON } from '../../hooks/useSleeperDraft'
import { useSleeperRookies } from '../../hooks/useSleeperRookies'
import { getTeamName } from '../../hooks/useLeague'
import {
  buildPickMarket, buildPriceBoard, makePickPricer, pickRoundLabel, suggestPickPackages,
} from '../../utils/pickTrades'
import { buildRookieProspects } from '../../utils/rookieAdp'
import { ROUND_TEXT, ROUND_LABELS } from '../../utils/roundColors'
import SectionHeader from '../shared/SectionHeader'
import LoadingSpinner from '../shared/LoadingSpinner'
import ErrorState from '../shared/ErrorState'

const MODES = [
  { id: 'up',   label: 'Move Up' },
  { id: 'down', label: 'Move Down' },
]

function marketPickKey(p) {
  return `${p.season}-${p.round}-${p.rosterPick.originalOwner}-${p.slot ?? 'r'}`
}

// Roster pick → analyzer asset: the add sheet's object (same dedupe id) but
// priced at slot precision so the analyzer math matches the suggestion.
function toAsset(marketPick) {
  return {
    ...marketPick.rosterPick,
    value: marketPick.value,
    slotLabel: marketPick.slotLabel,
    type: 'pick',
  }
}

function PackageRow({ pkg, actionLabel, onBuild }) {
  const names = pkg.picks.map(p => p.slotLabel ?? p.label).join(' + ')
  const diffCls = Math.abs(pkg.diffPct) <= 5
    ? 'text-text-tertiary dark:text-text-tertiary'
    : pkg.diffPct > 0 ? 'text-warning' : 'text-success'
  return (
    <div className="flex items-center gap-2 py-1.5 border-t border-border-default/60 dark:border-border-default/60 first:border-t-0">
      <span className="flex-1 font-body text-xs text-text-primary dark:text-text-primary truncate min-w-0">
        {names}
      </span>
      <span className="font-mono text-xs text-text-secondary dark:text-text-secondary shrink-0 tabular-nums">
        {pkg.total.toLocaleString()}
      </span>
      <span className={`font-mono text-[10px] font-semibold shrink-0 tabular-nums ${diffCls}`}>
        {pkg.diffPct === 0 ? 'even' : `${pkg.diffPct > 0 ? '+' : ''}${pkg.diffPct}%`}
      </span>
      <button
        onClick={onBuild}
        className="shrink-0 px-2 py-1 rounded-lg border border-accent/25 bg-accent/5 font-body text-[10px] font-semibold text-accent"
      >
        {actionLabel}
      </button>
    </div>
  )
}

function PickHeaderRow({ pick, subtitle, expanded, onTap }) {
  const Chevron = expanded ? ChevronDown : ChevronRight
  return (
    <button onClick={onTap} className="w-full flex items-center gap-2 py-2.5 text-left active:opacity-60 transition-opacity">
      <span className={`font-mono text-sm font-bold tabular-nums shrink-0 w-12 ${ROUND_TEXT[pick.round] ?? 'text-text-primary'}`}>
        {pick.slotLabel ?? ROUND_LABELS[pick.round] ?? `R${pick.round}`}
      </span>
      <span className="flex-1 font-body text-sm text-text-primary dark:text-text-primary truncate min-w-0">
        {subtitle}
      </span>
      <span className="font-mono text-sm text-text-primary dark:text-text-primary shrink-0 tabular-nums">
        {pick.value > 0 ? pick.value.toLocaleString() : '—'}
      </span>
      <Chevron size={14} strokeWidth={2} className="shrink-0 text-text-tertiary" />
    </button>
  )
}

function PriceBoard({ board, slotLevel }) {
  if (!board.length) return null
  return (
    <div className="rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-3 py-2.5 mb-1">
      <div className="flex items-center gap-2 mb-1.5">
        <p className="flex-1 font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-secondary dark:text-text-secondary">
          {DRAFT_SEASON} pick prices {slotLevel ? '· slot tiers' : '· round medians'}
        </p>
      </div>
      {board.map(row => (
        <div key={row.round} className="flex items-center gap-2 py-1 border-t border-border-default/60 dark:border-border-default/60 first:border-t-0">
          <span className={`w-8 shrink-0 font-mono text-xs font-bold ${ROUND_TEXT[row.round] ?? 'text-text-primary'}`}>
            {ROUND_LABELS[row.round] ?? `R${row.round}`}
          </span>
          {row.early != null || row.mid != null || row.late != null ? (
            <span className="flex-1 font-mono text-[11px] text-text-secondary dark:text-text-secondary tabular-nums">
              E <span className="text-text-primary dark:text-text-primary">{row.early?.toLocaleString() ?? '—'}</span>
              <span className="mx-1.5 text-text-tertiary">·</span>
              M <span className="text-text-primary dark:text-text-primary">{row.mid?.toLocaleString() ?? '—'}</span>
              <span className="mx-1.5 text-text-tertiary">·</span>
              L <span className="text-text-primary dark:text-text-primary">{row.late?.toLocaleString() ?? '—'}</span>
            </span>
          ) : (
            <span className="flex-1 font-mono text-[11px] text-text-primary dark:text-text-primary tabular-nums">
              {row.median > 0 ? `~${row.median.toLocaleString()}` : '—'}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

export default function PickTradeCalculator() {
  const { league, values, loading, error, retry, myRosterId } = useLeagueContext()
  const sleeperDraft = useSleeperDraft()
  const { sleeperRookieMap } = useSleeperRookies()
  const navigate = useNavigate()
  const [mode, setMode] = useState('up')
  const [expandedKey, setExpandedKey] = useState(null)

  const pickEntries = values?.pickEntries ?? []
  const allRosters = league?.allRosters ?? []

  const draftOrder = useMemo(
    () => buildDraftOrder(sleeperDraft.data?.draft, sleeperDraft.data?.tradedPicks ?? []),
    [sleeperDraft.data]
  )

  // Rookie-class pricer: keeps current-season picks valued in the window
  // between the NFL draft (generic pick entries retire) and the league's
  // rookie draft (picks still live). Other seasons fall through to the
  // generic FantasyCalc market price.
  const priceFor = useMemo(() => {
    const prospects = buildRookieProspects(sleeperRookieMap, values?.playerMap)
    return makePickPricer({
      pickEntries, prospects, draftSeason: DRAFT_SEASON, teams: allRosters.length || 10,
    })
  }, [pickEntries, sleeperRookieMap, values, allRosters.length])

  const market = useMemo(
    () => buildPickMarket({ allRosters, draftOrder, priceFor, season: DRAFT_SEASON }),
    [allRosters, draftOrder, priceFor]
  )

  const priceBoard = useMemo(
    () => buildPriceBoard(pickEntries, DRAFT_SEASON, 4, priceFor),
    [pickEntries, priceFor]
  )

  // My package ammo: this season's picks at slot precision (from the market)
  // plus future-year picks at round medians — common sweeteners.
  const myCandidates = useMemo(() => {
    const thisSeason = market.picks.filter(p => p.ownerRosterId === myRosterId)
    const future = (league?.myRoster?.picks ?? [])
      .filter(p => p.season !== DRAFT_SEASON)
      .map(p => ({
        season: p.season, round: p.round, slot: null, slotLabel: null,
        label: pickRoundLabel(p), ownerRosterId: myRosterId,
        rosterPick: p, value: priceFor({ season: p.season, round: p.round }),
      }))
    return [...thisSeason, ...future]
  }, [market, league, priceFor])

  // Same pool per opponent, for move-down return packages
  const candidatesFor = useMemo(() => {
    const cache = {}
    return rosterId => {
      if (cache[rosterId]) return cache[rosterId]
      const thisSeason = market.picks.filter(p => p.ownerRosterId === rosterId)
      const roster = allRosters.find(r => r.rosterId === rosterId)
      const future = (roster?.picks ?? [])
        .filter(p => p.season !== DRAFT_SEASON)
        .map(p => ({
          season: p.season, round: p.round, slot: null, slotLabel: null,
          label: pickRoundLabel(p), ownerRosterId: rosterId,
          rosterPick: p, value: priceFor({ season: p.season, round: p.round }),
        }))
      cache[rosterId] = [...thisSeason, ...future]
      return cache[rosterId]
    }
  }, [market, allRosters, priceFor])

  if (loading && !league) return <LoadingSpinner message="Loading pick market…" />
  if (error && !league) return <ErrorState message={error} onRetry={retry} />
  if (!league) return <ErrorState message="Could not load league data." onRetry={retry} />

  const teamName = rosterId => getTeamName(league.userMap[rosterId])

  function openInAnalyzer(opponentRosterId, give, get) {
    navigate('/trade/analyze', {
      state: { preloadTrade: { opponentRosterId, give, get } },
    })
  }

  const theirPicks = market.picks.filter(p => p.ownerRosterId !== myRosterId)
  const myPicks    = market.picks.filter(p => p.ownerRosterId === myRosterId)

  return (
    <div className="px-4 pb-4">
      <div className="pt-4 pb-3">
        <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary dark:text-text-secondary mb-0.5">
          Pick Trade Calculator
        </p>
        <p className="font-body text-xs text-text-tertiary dark:text-text-tertiary leading-snug">
          What it costs to move up — and what moving down should bring back.
          Tap a pick for suggested packages, then open one in the Analyzer.
        </p>
      </div>

      <PriceBoard board={priceBoard} slotLevel={market.slotLevel} />

      {!market.slotLevel && !sleeperDraft.loading && (
        <p className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary leading-snug mb-2 flex items-start gap-1.5">
          <RefreshCw size={11} strokeWidth={2} className="shrink-0 mt-0.5" />
          Sleeper hasn't set the {DRAFT_SEASON} draft order yet — prices use round
          medians and upgrade to exact slots automatically once the order exists.
        </p>
      )}

      {/* Mode toggle */}
      <div className="flex rounded-lg border border-border-default dark:border-border-default overflow-hidden my-3">
        {MODES.map(m => (
          <button
            key={m.id}
            onClick={() => { setMode(m.id); setExpandedKey(null) }}
            className={`flex-1 py-2 font-body text-xs font-semibold uppercase tracking-wider transition-colors
              ${mode === m.id ? 'bg-accent text-white' : 'text-text-secondary dark:text-text-secondary'}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'up' ? (
        <>
          <SectionHeader label={`${DRAFT_SEASON} picks you could target`} />
          {theirPicks.length === 0 ? (
            <p className="font-body text-xs text-text-tertiary dark:text-text-tertiary py-4">
              No opponent-owned {DRAFT_SEASON} picks found.
            </p>
          ) : theirPicks.map(pick => {
            const key = marketPickKey(pick)
            const expanded = expandedKey === key
            const packages = expanded
              ? suggestPickPackages(pick.value, myCandidates.filter(c => c !== pick))
              : []
            return (
              <div key={key} className="border-b border-border-default dark:border-border-default last:border-0">
                <PickHeaderRow
                  pick={pick}
                  subtitle={teamName(pick.ownerRosterId)}
                  expanded={expanded}
                  onTap={() => setExpandedKey(expanded ? null : key)}
                />
                {expanded && (
                  <div className="pb-2.5 pl-2 border-l-2 border-accent/30 ml-1 mb-2">
                    {packages.length === 0 ? (
                      <p className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary py-1">
                        No pick package from your inventory gets close — add a
                        player in the Analyzer to bridge the gap.
                      </p>
                    ) : packages.map((pkg, i) => (
                      <PackageRow
                        key={i}
                        pkg={pkg}
                        actionLabel="Build →"
                        onBuild={() => openInAnalyzer(
                          pick.ownerRosterId,
                          pkg.picks.map(toAsset),
                          [toAsset(pick)]
                        )}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </>
      ) : (
        <>
          <SectionHeader label={`Your ${DRAFT_SEASON} picks`} />
          {myPicks.length === 0 ? (
            <p className="font-body text-xs text-text-tertiary dark:text-text-tertiary py-4">
              You don't own any {DRAFT_SEASON} picks to move down from.
            </p>
          ) : myPicks.map(pick => {
            const key = marketPickKey(pick)
            const expanded = expandedKey === key
            // Best return package from each opponent, closest matches first
            const offers = expanded
              ? allRosters
                  .filter(r => r.rosterId !== myRosterId)
                  .map(r => ({
                    rosterId: r.rosterId,
                    pkg: suggestPickPackages(pick.value, candidatesFor(r.rosterId), { count: 1 })[0] ?? null,
                  }))
                  .filter(o => o.pkg)
                  .sort((a, b) => a.pkg.score - b.pkg.score)
                  .slice(0, 4)
              : []
            return (
              <div key={key} className="border-b border-border-default dark:border-border-default last:border-0">
                <PickHeaderRow
                  pick={pick}
                  subtitle="Yours"
                  expanded={expanded}
                  onTap={() => setExpandedKey(expanded ? null : key)}
                />
                {expanded && (
                  <div className="pb-2.5 pl-2 border-l-2 border-accent/30 ml-1 mb-2">
                    {offers.length === 0 ? (
                      <p className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary py-1">
                        No team's pick inventory adds up to fair value for this
                        pick — ask for a player instead.
                      </p>
                    ) : offers.map(o => (
                      <div key={o.rosterId}>
                        <p className="font-body text-[10px] font-semibold uppercase tracking-wide text-text-tertiary dark:text-text-tertiary pt-1.5">
                          {teamName(o.rosterId)}
                        </p>
                        <PackageRow
                          pkg={o.pkg}
                          actionLabel="Build →"
                          onBuild={() => openInAnalyzer(
                            o.rosterId,
                            [toAsset(pick)],
                            o.pkg.picks.map(toAsset)
                          )}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
