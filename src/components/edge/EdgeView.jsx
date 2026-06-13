import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ClipboardList, CalendarClock, ArrowLeftRight, TrendingDown, TrendingUp,
  Star, Users, ChevronRight, DollarSign, UserPlus, Gavel, Trophy,
} from 'lucide-react'
import { useLeagueContext } from '../../context/LeagueContext'
import { useTransactions } from '../../hooks/useTransactions'
import { useWatchlist } from '../../hooks/useWatchlist'
import { useValueHistory } from '../../hooks/useValueHistory'
import { useSleeperDraft } from '../../hooks/useSleeperDraft'
import { usePlayoffOdds } from '../../hooks/usePlayoffOdds'
import { useLastVisit } from '../../hooks/useLastVisit'
import { useLeagueNews } from '../../hooks/useLeagueNews'
import { usePlayerDB } from '../../hooks/usePlayerDB'
import { relativeTime } from '../../hooks/usePlayerIntel'
import { getTeamName } from '../../hooks/useLeague'
import {
  computeEdgeSignals, buildBriefing, buildGmLine, buildTeamValueSeries, trendPct,
} from '../../utils/edgeBriefing'
import { MY_TEAM_NAME, MY_ROSTER_ID } from '../../constants'
import { POS_TEXT } from '../../utils/positionColors'
import { TIER_BADGE, TIER_TEXT } from '../../utils/tierColors'
import LoadingSpinner from '../shared/LoadingSpinner'
import ErrorState from '../shared/ErrorState'
import SectionHeader from '../shared/SectionHeader'
import PlayerProfileDrawer from '../shared/PlayerProfileDrawer'
import NewsArticleSheet from '../shared/NewsArticleSheet'
import Sparkline from '../shared/Sparkline'
import RosterActionItems from '../roster/RosterActionItems'

const BRIEFING_ICONS = {
  draft: ClipboardList,
  deadline: CalendarClock,
  activity: ArrowLeftRight,
  buy: TrendingDown,
  sell: TrendingUp,
  watch: Star,
  team: Users,
  playoffs: Trophy,
}

const BRIEFING_TONES = {
  accent:  { icon: 'text-accent',  bg: 'bg-accent/15',  bar: 'border-l-accent' },
  success: { icon: 'text-success', bg: 'bg-success/15', bar: 'border-l-success' },
  warning: { icon: 'text-warning', bg: 'bg-warning/15', bar: 'border-l-warning' },
}

// Win-window tier dot colors for the hero chip (white-on-gradient context —
// the standard tinted TIER_BADGE doesn't read on the brand gradient).
const TIER_DOT = {
  Contending: 'bg-warning',
  Middle:     'bg-cyan-400',
  Rebuilding: 'bg-indigo-400',
}

const TX_ICONS = {
  trade:        { Icon: ArrowLeftRight, color: 'text-accent' },
  waiver:       { Icon: DollarSign,     color: 'text-warning' },
  free_agent:   { Icon: UserPlus,       color: 'text-success' },
  commissioner: { Icon: Gavel,          color: 'text-text-secondary' },
}

const TIERS = ['Contending', 'Middle', 'Rebuilding']

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function NewBadge() {
  return (
    <span className="shrink-0 font-body text-[9px] font-bold uppercase tracking-wider rounded px-1 py-0.5 bg-accent text-white">
      New
    </span>
  )
}

function TrendChip({ trend, value, onHero = false }) {
  if (trend == null || trend === 0) return null
  const pct = trendPct(trend, value)
  const color = onHero
    ? `bg-white/15 ${trend > 0 ? 'text-emerald-200' : 'text-rose-200'}`
    : trend > 0 ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
  return (
    <span className={`rounded-full px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${color}`}>
      {trend > 0 ? '+' : ''}{Math.round(trend)}
      {pct != null && pct !== 0 && (
        <span className="opacity-80"> ({pct > 0 ? '+' : ''}{pct}%)</span>
      )}
    </span>
  )
}

// One-line summary of a transaction for the compact activity rows.
function txSummary(tx, teamName, resolveName) {
  if (tx.type === 'trade') {
    const teams = (tx.roster_ids ?? []).map(teamName)
    const assetCount = Object.keys(tx.adds ?? {}).length + (tx.draft_picks?.length ?? 0)
    return {
      title: teams.join(' ⇄ '),
      detail: `${assetCount} asset${assetCount === 1 ? '' : 's'} moved`,
    }
  }
  const who = teamName(tx.roster_ids?.[0])
  const adds = Object.keys(tx.adds ?? {})
  const drops = Object.keys(tx.drops ?? {})
  const bid = tx.settings?.waiver_bid
  if (adds.length > 0) {
    return {
      title: `${who} added ${resolveName(adds[0])}`,
      detail: bid != null
        ? `$${bid} FAAB`
        : drops.length > 0 ? `dropped ${resolveName(drops[0])}` : null,
    }
  }
  if (drops.length > 0) return { title: `${who} dropped ${resolveName(drops[0])}`, detail: null }
  return { title: who, detail: null }
}

export default function EdgeView() {
  const {
    league, values, nflState, isOffseason, tradeDeadline, loading, error, retry,
  } = useLeagueContext()
  const { transactions } = useTransactions()
  const { watchlist } = useWatchlist()
  const { history, getSeries } = useValueHistory()
  const { data: draftData } = useSleeperDraft()
  const { myOdds } = usePlayoffOdds()
  const { playerDB } = usePlayerDB()
  const lastVisit = useLastVisit()
  const navigate = useNavigate()
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [openArticle, setOpenArticle] = useState(null)

  const signals = useMemo(
    () => computeEdgeSignals({ league, values, watchlist }),
    [league, values, watchlist]
  )

  // My roster + watchlist players — the set whose news matters to me.
  const myPlayers = useMemo(() => {
    if (!league?.myRoster) return []
    const out = [...league.myRoster.players]
    const have = new Set(out.map(p => String(p.sleeperId)))
    watchlist.forEach(id => {
      const p = values?.playerMap?.[String(id)]
      if (p && !have.has(String(id))) out.push(p)
    })
    return out
  }, [league, values, watchlist])

  const news = useLeagueNews(myPlayers)

  const briefing = useMemo(
    () => buildBriefing({
      signals,
      transactions,
      lastVisit,
      draft: draftData?.draft ?? null,
      isOffseason,
      nflState,
      tradeDeadline,
      myPlayoffPct: myOdds?.playoffPct ?? null,
    }),
    [signals, transactions, lastVisit, draftData, isOffseason, nflState, tradeDeadline, myOdds]
  )

  const teamSeries = useMemo(
    () => buildTeamValueSeries(history, league?.myRoster),
    [history, league]
  )

  if (loading && !league) return <LoadingSpinner message="Preparing your briefing…" />
  if (error && !league)   return <ErrorState message={error} onRetry={retry} />
  if (!league?.myRoster || !signals) return <ErrorState message="Could not load your briefing." onRetry={retry} />

  const myRoster = league.myRoster
  const teamName = rosterId => getTeamName(league.userMap[rosterId])
  const resolveName = pid =>
    values?.playerMap?.[pid]?.name ?? playerDB?.[pid]?.name ?? `Player #${pid}`

  const freshTx = lastVisit && transactions
    ? transactions.filter(tx => (tx.status_updated ?? 0) > lastVisit)
    : []
  const recentTx = (freshTx.length > 0 ? freshTx : transactions ?? []).slice(0, 3)

  const newsItems = news.slice(0, 5)
  const freshNewsCount = lastVisit
    ? newsItems.filter(n => n.published && new Date(n.published).getTime() > lastVisit).length
    : 0

  const gmLine = buildGmLine({
    briefingCount: briefing.length,
    newsCount: freshNewsCount,
    freshTxCount: freshTx.length,
    isOffseason,
  })

  const radar = signals.radar.slice(0, 5)

  function runAction(action) {
    if (!action) return
    if (action.type === 'player') setSelectedPlayer(action.player)
    else navigate(action.to, action.state ? { state: action.state } : undefined)
  }

  // Staggered entrance — each top-level block rises in sequence.
  let riseIndex = 0
  const rise = (extra = '') => ({
    className: `edge-rise ${extra}`.trim(),
    style: { animationDelay: `${Math.min(riseIndex++ * 60, 360)}ms` },
  })

  const dateline = new Date().toLocaleDateString([], {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  return (
    <div className="px-4 pb-6">

      {/* ── Hero: greeting + franchise pulse, full brand gradient ── */}
      <div {...rise('hero-card mt-4 rounded-xl px-4 pt-3.5 pb-3.5')}>
        <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-white/60">
          {dateline}
        </p>
        <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-white mt-0.5 leading-tight">
          {greeting()}, {MY_TEAM_NAME}
        </h1>
        <p className="font-body text-sm text-white/80 mt-1 leading-snug">
          {gmLine}
        </p>

        <button
          onClick={() => navigate('/roster/my-team')}
          className="w-full flex items-end justify-between gap-3 mt-3 pt-3 border-t border-white/20 text-left active:opacity-70 transition-opacity"
        >
          <div>
            <div className="flex items-baseline gap-2">
              <span className="hero-value font-mono text-3xl font-medium tabular-nums text-white">
                {myRoster.totalValue.toLocaleString()}
              </span>
              <TrendChip trend={signals.teamTrend} value={signals.playerValue} onHero />
            </div>
            <p className="font-body text-[10px] text-white/55 mt-0.5">
              Team value · 30-day trend
            </p>
          </div>
          {teamSeries && <Sparkline data={teamSeries} width={96} height={28} />}
        </button>

        <div className="flex items-center gap-1.5 mt-3 flex-wrap">
          <button
            onClick={() => navigate('/league')}
            className="flex items-center gap-1 rounded-full bg-white/15 border border-white/20 px-2.5 py-1 active:opacity-70 transition-opacity"
          >
            <span className={`font-mono text-xs font-bold tabular-nums ${signals.valueRank <= 3 ? 'text-amber-300' : 'text-white'}`}>
              #{signals.valueRank}
            </span>
            <span className="font-body text-[10px] text-white/70">in value</span>
          </button>
          <button
            onClick={() => navigate('/league')}
            className="flex items-center gap-1.5 rounded-full bg-white/15 border border-white/20 px-2.5 py-1 font-body text-[10px] font-semibold uppercase tracking-wider text-white active:opacity-70 transition-opacity"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${TIER_DOT[signals.myTier] ?? 'bg-cyan-400'}`} />
            {signals.myTier}
          </button>
          {myRoster.hasRecord && (
            <span className="rounded-full bg-white/15 border border-white/20 px-2.5 py-1 font-mono text-xs tabular-nums text-white">
              {myRoster.record.wins}-{myRoster.record.losses}{myRoster.record.ties ? `-${myRoster.record.ties}` : ''}
            </span>
          )}
          <span className="rounded-full bg-white/15 border border-white/20 px-2.5 py-1 font-mono text-xs tabular-nums text-white">
            ${myRoster.faabRemaining} <span className="font-body text-[10px] text-white/60">FAAB</span>
          </span>
        </div>
      </div>

      {/* ── Roster action items (shared component, dismissible) ── */}
      <div {...rise()}>
        <RosterActionItems myRoster={myRoster} nflState={nflState} />
      </div>

      {/* ── Your Briefing — prioritized, every row goes somewhere ── */}
      {briefing.length > 0 && (
        <section {...rise()}>
          <SectionHeader label="Your Briefing" count={briefing.length} />
          <div className="flex flex-col gap-2">
            {briefing.map(item => {
              const Icon = BRIEFING_ICONS[item.icon] ?? ArrowLeftRight
              const tone = BRIEFING_TONES[item.tone] ?? BRIEFING_TONES.accent
              return (
                <button
                  key={item.id}
                  onClick={() => runAction(item.action)}
                  className={`w-full flex items-start gap-2.5 px-3 py-3 rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default border-l-[3px] ${tone.bar} text-left active:opacity-60 transition-opacity`}
                >
                  <span className={`shrink-0 mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center ${tone.bg}`}>
                    <Icon size={15} strokeWidth={2} className={tone.icon} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-body text-sm font-semibold text-text-primary dark:text-text-primary leading-snug">
                      {item.title}
                    </span>
                    <span className="block font-body text-xs text-text-secondary dark:text-text-secondary leading-snug mt-0.5">
                      {item.body}
                    </span>
                  </span>
                  <ChevronRight size={15} strokeWidth={2} className="shrink-0 mt-1 text-text-tertiary" />
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Headlines on my players + watchlist ── */}
      {newsItems.length > 0 && (
        <section {...rise()}>
          <SectionHeader label="Headlines" count={newsItems.length} />
          <div className="rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-3">
            {newsItems.map((n, i) => {
              const isFresh = lastVisit && n.published &&
                new Date(n.published).getTime() > lastVisit
              return (
                <button
                  key={i}
                  onClick={() => setOpenArticle(n)}
                  className="w-full py-2.5 border-b border-border-default dark:border-border-default last:border-0 text-left active:opacity-60 transition-opacity"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-body text-xs font-semibold text-text-primary dark:text-text-primary truncate">
                      {n.player.name}
                    </span>
                    {n.player.position && (
                      <span className={`font-body text-[10px] font-semibold uppercase shrink-0 ${POS_TEXT[n.player.position] ?? 'text-text-tertiary'}`}>
                        {n.player.position}
                      </span>
                    )}
                    {isFresh && <NewBadge />}
                    <span className="flex-1" />
                    <span className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary shrink-0">
                      {[n.source, relativeTime(n.published)].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <p
                    className="font-body text-xs text-text-secondary dark:text-text-secondary leading-snug mt-0.5"
                    style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                  >
                    {n.headline}
                  </p>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Market radar: watchlist + my roster movers ── */}
      <section {...rise()}>
        <SectionHeader label="Market Radar" count={radar.length || undefined} />
        {radar.length === 0 ? (
          <p className="font-body text-xs text-text-tertiary dark:text-text-tertiary px-1 pb-1">
            {watchlist.length === 0
              ? 'Star players from any profile — your watchlist and roster movers will show up here.'
              : 'No meaningful value moves on your players or watchlist right now.'}
          </p>
        ) : (
          <div className="rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-3">
            {radar.map(p => (
              <button
                key={p.sleeperId}
                onClick={() => setSelectedPlayer(p)}
                className="w-full py-2.5 border-b border-border-default dark:border-border-default last:border-0 text-left active:opacity-60 transition-opacity"
              >
                <div className="flex items-center gap-2">
                  <span className="flex-1 font-body font-medium text-sm text-text-primary dark:text-text-primary truncate min-w-0">
                    {p.name}
                  </span>
                  <span className={`font-body text-[10px] font-semibold shrink-0 uppercase ${POS_TEXT[p.position] ?? 'text-text-tertiary'}`}>
                    {p.position}
                  </span>
                  <span className="font-mono text-sm font-medium text-text-primary dark:text-text-primary shrink-0 tabular-nums">
                    {(p.value ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {p.isWatched && (
                    <Star size={10} strokeWidth={2} className="shrink-0 text-accent fill-accent" />
                  )}
                  <span className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary truncate">
                    {p.isMine ? 'Your roster' : p.ownerRoster ? getTeamName(p.ownerRoster.owner) : 'Free agent'}
                  </span>
                  <span className="flex-1" />
                  {getSeries(p.sleeperId) && <Sparkline data={getSeries(p.sleeperId)} />}
                  <TrendChip trend={p.trend30Day} value={p.value} />
                </div>
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => navigate('/league/movers')}
          className="mt-2 w-full py-2 rounded-xl border border-accent/25 bg-accent/5 font-body text-xs font-semibold text-accent active:opacity-70 transition-opacity"
        >
          All market movers →
        </button>
      </section>

      {/* ── Around the league: latest moves ── */}
      {recentTx.length > 0 && (
        <section {...rise()}>
          <SectionHeader
            label="Around the League"
            count={freshTx.length > 0 ? `${freshTx.length} new` : undefined}
          />
          <div className="rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-3">
            {recentTx.map(tx => {
              const { Icon, color } = TX_ICONS[tx.type] ?? TX_ICONS.commissioner
              const { title, detail } = txSummary(tx, teamName, resolveName)
              const involvesMe = (tx.roster_ids ?? []).includes(MY_ROSTER_ID)
              const isFresh = lastVisit && (tx.status_updated ?? 0) > lastVisit
              return (
                <button
                  key={tx.transaction_id}
                  onClick={() => navigate('/league/activity')}
                  className="w-full flex items-center gap-2.5 py-2.5 border-b border-border-default dark:border-border-default last:border-0 text-left active:opacity-60 transition-opacity"
                >
                  <Icon size={14} strokeWidth={2} className={`shrink-0 ${color}`} />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="font-body text-xs font-medium text-text-primary dark:text-text-primary truncate">
                        {title}
                      </span>
                      {involvesMe && (
                        <span className="shrink-0 font-body text-[9px] font-bold uppercase tracking-wider rounded px-1 py-0.5 bg-accent text-white">
                          You
                        </span>
                      )}
                      {isFresh && <NewBadge />}
                    </span>
                    {detail && (
                      <span className="block font-body text-[10px] text-text-tertiary dark:text-text-tertiary truncate mt-0.5">
                        {detail}
                      </span>
                    )}
                  </span>
                  <span className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary shrink-0">
                    {relativeTime(tx.status_updated)}
                  </span>
                </button>
              )
            })}
          </div>
          <button
            onClick={() => navigate('/league/activity')}
            className="mt-2 w-full py-2 rounded-xl border border-accent/25 bg-accent/5 font-body text-xs font-semibold text-accent active:opacity-70 transition-opacity"
          >
            Full activity feed →
          </button>
        </section>
      )}

      {/* ── League pulse footer — chips open the Overview pre-filtered ── */}
      <div {...rise('flex items-center gap-1.5 mt-5')}>
        {TIERS.map(tier => (
          <button
            key={tier}
            onClick={() => {
              try { sessionStorage.setItem('dynastyedge_league_tier', tier) } catch { /* private mode */ }
              navigate('/league')
            }}
            className={`px-2.5 py-1 rounded-full font-body text-xs font-medium border active:opacity-70 transition-opacity ${TIER_BADGE[tier]}`}
          >
            {signals.tierCounts[tier]} {tier}
          </button>
        ))}
        <span className="flex-1" />
        <span className="font-body text-[11px] text-text-secondary dark:text-text-secondary">
          You: <span className={`font-semibold ${TIER_TEXT[signals.myTier]}`}>{signals.myTier}</span>
        </span>
      </div>

      {selectedPlayer && (
        <PlayerProfileDrawer
          player={selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
        />
      )}

      {openArticle && (
        <NewsArticleSheet
          article={openArticle}
          onClose={() => setOpenArticle(null)}
          onViewPlayer={p => {
            setOpenArticle(null)
            setSelectedPlayer(p)
          }}
        />
      )}
    </div>
  )
}
