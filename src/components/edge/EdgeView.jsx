import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { POS_BG, POS_TEXT } from '../../utils/positionColors'
import { TIER_BADGE, TIER_TEXT } from '../../utils/tierColors'
import {
  Badge, Lede, Magnitude, MAGNITUDE_TEAM_REFERENCE, Mark, NavRow,
  PositionBand, Row, RuledList, markedHeadline, stagger,
} from '../ui'
import LoadingSpinner from '../shared/LoadingSpinner'
import ErrorState from '../shared/ErrorState'
import PlayerProfileDrawer from '../shared/PlayerProfileDrawer'
import NewsArticleSheet from '../shared/NewsArticleSheet'
import Sparkline from '../shared/Sparkline'
import RosterActionItems from '../roster/RosterActionItems'
import RosterAnalysisSheet from '../roster/RosterAnalysisSheet'

// The eyebrow that replaced the icon medallion. A briefing item was a tinted
// lucide glyph in a rounded square beside a title and a one-line description —
// two of the twelve slop markers in one component ("lucide icons throughout"
// and "identical cards in the icon + title + one-line-description pattern",
// slop-checklist.md -> Components), and two of the three the shipped app still
// failed.
//
// The eyebrow does the medallion's job better because it can SAY the thing. A
// downward-trending arrow gestures at "something fell"; "Buy low" is the actual
// instruction, and it is readable at 9px where a 15px glyph was not.
const BRIEFING_EYEBROW = {
  draft:      'Draft',
  deadline:   'Deadline',
  activity:   'League',
  buy:        'Buy low',
  sell:       'Sell high',
  pickup:     'Waiver wire',
  watch:      'Watchlist',
  team:       'Scouting',
  playoffs:   'Standings',
  trajectory: 'Window',
}

// The Mark's tone, from the item's own tone. `accent` maps to plain ink: it is
// the default, and reserving colour for the two items that actually mean
// something keeps the briefing scannable.
const BRIEFING_MARK_TONE = { accent: 'ink', success: 'success', warning: 'warning' }

// Win-window tier dot colors for the hero stat strip. The hero panel is dark
// in BOTH themes, so these are the dark-theme tier identity literals — the
// theme-tracking --tier-* tokens would go near-invisible in light mode.
// The move type, as a word. It was four lucide glyphs; a two-letter mono tag
// fits the same 14px, says which kind of move it was without a legend, and
// carries no icon set.
const TX_KIND = {
  trade:        { label: 'TRD', color: 'text-alt' },
  waiver:       { label: 'WVR', color: 'text-warning' },
  free_agent:   { label: 'FA',  color: 'text-success' },
  commissioner: { label: 'CMR', color: 'text-text-tertiary' },
}

const TIERS = ['Contending', 'Middle', 'Rebuilding']

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function NewBadge() {
  return <Badge>New</Badge>
}

function TrendChip({ trend, value, onHero = false }) {
  if (trend == null || trend === 0) return null
  const pct = trendPct(trend, value)
  const color = onHero
    // On an ink field a status hue cannot work: the field inverts with the
    // theme, so emerald-on-cream (dark) and emerald-on-ink (light) can't both
    // clear AA. The sign already carries direction, so the chip is a tint of
    // the field's own ink. Off the field, the status colours stand.
    ? 'bg-bg-primary/15 text-bg-primary'
    : trend > 0 ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
  return (
    <span className={`rounded-none px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${color}`}>
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
    league, values, nflState, isOffseason, tradeDeadline, myRosterId, loading, error, retry,
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
  const [analysisOpen, setAnalysisOpen] = useState(false)

  const signals = useMemo(
    () => computeEdgeSignals({ league, values, watchlist, nflState, myRosterId }),
    [league, values, watchlist, nflState, myRosterId]
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
  const myTeamName = myRoster ? getTeamName(myRoster.owner) : 'Manager'
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

  // Market Radar is The Edge's primary entry to League › Movers, so keep it
  // populated: lead with watchlist + roster movers over the ±50 threshold,
  // then backfill with the roster's biggest remaining movers (any non-zero
  // trend) so the section stays useful even with a thin watchlist.
  const RADAR_MAX = 6
  let radar = signals.radar.slice(0, RADAR_MAX)
  if (radar.length < RADAR_MAX) {
    const seen = new Set(radar.map(p => String(p.sleeperId)))
    const fill = [...myRoster.players]
      .filter(p => !p.unranked && (p.trend30Day ?? 0) !== 0 && !seen.has(String(p.sleeperId)))
      .sort((a, b) => Math.abs(b.trend30Day ?? 0) - Math.abs(a.trend30Day ?? 0))
      .slice(0, RADAR_MAX - radar.length)
      .map(p => ({ ...p, ownerRoster: null, isWatched: false, isMine: true }))
    radar = [...radar, ...fill]
  }

  function runAction(action) {
    if (!action) return
    if (action.type === 'player') setSelectedPlayer(action.player)
    else navigate(action.to, action.state ? { state: action.state } : undefined)
  }

  // THE PRESS RUN — the app's one animated screen entrance (see CLAUDE.md →
  // Motion for why it is only this one). Blocks set under a downward clip in a
  // JITTERED sequence: the old version was `Math.min(riseIndex++ * 60, 360)`,
  // a textbook linear 0/60/120/180 stagger, which is itself a named marker.
  // `stagger()` sums independently-drawn gaps, so the delays advance
  // monotonically but no two gaps match.
  let runIndex = 0
  const run = (extra = '', klass = 'press-set') => ({
    className: `${klass} ${extra}`.trim(),
    style: { animationDelay: `${stagger(runIndex++)}ms` },
  })
  // The hero is the band, so its type has to land BEHIND the wipe rather than
  // with it — the fixed offset is the mock's, and it puts the ink down when the
  // band is roughly a third of the way across.
  const heroDelay = stagger(0)
  const heroInkStyle = { animationDelay: `${heroDelay + 180}ms` }

  const dateline = new Date().toLocaleDateString([], {
    weekday: 'short', month: 'short', day: 'numeric',
  })

  return (
    <div className="px-4 pb-6">

      {/* ── Hero: the red score-bug franchise report ── */}
      <div {...run('mt-4', 'press-band')}>
        <div className="ink-field-cap flex items-center justify-between gap-2 px-3 py-1.5">
          <span className="font-display text-[12px] uppercase tracking-[0.1em] leading-none truncate">
            {myTeamName} · Franchise Report
          </span>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] leading-none shrink-0">
            {dateline}
          </span>
        </div>
        <div className="ink-field px-4 pt-3 pb-3.5">
          <p className="font-body text-sm text-bg-primary/75 leading-snug">
            {greeting()}, {myTeamName}.
          </p>
          <p className="font-body text-sm font-semibold text-bg-primary mt-0.5 leading-snug">
            {gmLine}
          </p>

          <button
            onClick={() => navigate('/my-team')}
            className="w-full flex items-end justify-between gap-3 mt-3 text-left press"
          >
            <div>
              <div className="flex items-baseline gap-2">
                <span
                  style={heroInkStyle}
                  className="press-ink font-mono text-4xl font-medium tabular-nums text-bg-primary leading-none"
                >
                  {myRoster.totalValue.toLocaleString()}
                </span>
                <TrendChip trend={signals.teamTrend} value={signals.playerValue} onHero />
              </div>
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-bg-primary/60 mt-2">
                Team value · 30-day trend
              </p>
            </div>
            {teamSeries && <Sparkline data={teamSeries} width={96} height={28} />}
          </button>

          {/* Score-bug stat strip: rank · record · window · FAAB */}
          <div className="flex mt-3 pt-2.5 border-t border-bg-primary/20 divide-x divide-bg-primary/20">
            <button
              onClick={() => navigate('/league')}
              className="text-left pr-3 press"
            >
              <p className="font-mono text-base font-semibold tabular-nums leading-none text-bg-primary">
                {/* Top 3 reverses a second time — the page ground with the
                    page's ink on it. The gold/silver/bronze medal from
                    rankColors.js cannot be used on a field that inverts with
                    the theme (amber-300 disappears on the cream one). */}
                {signals.valueRank <= 3
                  ? <Mark tone="ground">#{signals.valueRank}</Mark>
                  : <>#{signals.valueRank}</>}
              </p>
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-bg-primary/60 mt-1">Rank</p>
            </button>
            {myRoster.hasRecord && (
              <div className="px-3">
                <p className="font-mono text-base font-semibold tabular-nums leading-none text-bg-primary">
                  {myRoster.record.wins}–{myRoster.record.losses}{myRoster.record.ties ? `–${myRoster.record.ties}` : ''}
                </p>
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-bg-primary/60 mt-1">Record</p>
              </div>
            )}
            <button
              onClick={() => navigate('/league')}
              className="text-left px-3 press"
            >
              <p className="font-display text-[14px] uppercase tracking-[0.02em] leading-none text-bg-primary">
                {signals.myTier}
              </p>
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-bg-primary/60 mt-1">Window</p>
            </button>
            <div className="pl-3">
              <p className="font-mono text-base font-semibold tabular-nums leading-none text-bg-primary">
                ${myRoster.faabRemaining}
              </p>
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-bg-primary/60 mt-1">FAAB</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Roster action items (shared component, dismissible) ── */}
      <div {...run()}>
        <RosterActionItems myRoster={myRoster} nflState={nflState} allRosters={league.allRosters} pickYears={league.pickYears} />
      </div>

      {/* ── Roster Analysis shortcut (opens the same sheet as My Roster) ── */}
      <div {...run()}>
        <NavRow
          size="sm"
          onClick={() => setAnalysisOpen(true)}
          title="Roster Analysis"
          detail="Age curve · win window · position breakdown"
        />
      </div>

      {/* ── Your Briefing — prioritized, every row goes somewhere ── */}
      {briefing.length > 0 && (
        <section {...run()}>
          <PositionBand label="Your Briefing" count={briefing.length} className="mt-5" />
          <RuledList>
            {briefing.map(item => (
              <Lede
                key={item.id}
                eyebrow={BRIEFING_EYEBROW[item.icon] ?? 'Briefing'}
                headline={markedHeadline(
                  item.title,
                  item.mark,
                  BRIEFING_MARK_TONE[item.tone] ?? 'ink',
                )}
                action={item.cta}
                onClick={() => runAction(item.action)}
              >
                {item.body}
              </Lede>
            ))}
          </RuledList>
        </section>
      )}

      {/* ── Headlines on my players + watchlist ── */}
      {newsItems.length > 0 && (
        <section {...run()}>
          <PositionBand label="Headlines" count={newsItems.length} className="mt-5" />
          <RuledList>
            {newsItems.map((n, i) => {
              const isFresh = lastVisit && n.published &&
                new Date(n.published).getTime() > lastVisit
              return (
                <Row key={i} onClick={() => setOpenArticle(n)} padding="sm">
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
                </Row>
              )
            })}
          </RuledList>
          <NavRow size="sm" to="/news" title="All headlines" hint="News" />
        </section>
      )}

      {/* ── Market radar: watchlist + my roster movers ── */}
      <section {...run()}>
        <PositionBand label="Market Radar" count={radar.length || null} className="mt-5" />
        {radar.length === 0 ? (
          <p className="font-body text-xs text-text-tertiary dark:text-text-tertiary px-1 pb-1">
            {watchlist.length === 0
              ? 'Star players from any profile — your watchlist and roster movers will show up here.'
              : 'No meaningful value moves on your players or watchlist right now.'}
          </p>
        ) : (
          <RuledList>
            {radar.map(p => (
              <Row key={p.sleeperId} onClick={() => setSelectedPlayer(p)} padding="sm">
                <div className="flex items-baseline gap-2">
                  <span className={`shrink-0 w-[7px] h-[7px] self-center ${POS_BG[p.position] ?? 'bg-text-tertiary'}`} aria-hidden="true" />
                  <span className="flex-1 min-w-0 font-body font-medium text-sm text-text-primary text-balance">
                    {p.name}
                  </span>
                  <span className="shrink-0 self-center">
                    <Magnitude value={p.value > 0 ? p.value : null} />
                  </span>
                </div>
                <div className="mt-1 pl-[15px] flex items-center gap-1.5">
                  {/* The watch marker was a filled lucide star; it is now the
                      word, which needs no legend. */}
                  {p.isWatched && (
                    <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-brand-bright">
                      Watching
                    </span>
                  )}
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-tertiary truncate">
                    {p.isMine ? 'Your roster' : p.ownerRoster ? getTeamName(p.ownerRoster.owner) : 'Free agent'}
                  </span>
                  <span className="flex-1" />
                  {getSeries(p.sleeperId) && <Sparkline data={getSeries(p.sleeperId)} />}
                  <TrendChip trend={p.trend30Day} value={p.value} />
                </div>
              </Row>
            ))}
          </RuledList>
        )}
        <NavRow size="sm" to="/league/movers" title="All market movers" hint="Movers" />
      </section>

      {/* ── Around the league: latest moves ── */}
      {recentTx.length > 0 && (
        <section {...run()}>
          <PositionBand
            label="Around the League"
            count={freshTx.length > 0 ? `${freshTx.length} new` : recentTx.length}
            className="mt-5"
          />
          <RuledList>
            {recentTx.map(tx => {
              const { label: kind, color } = TX_KIND[tx.type] ?? TX_KIND.commissioner
              const { title, detail } = txSummary(tx, teamName, resolveName)
              const involvesMe = (tx.roster_ids ?? []).includes(myRosterId)
              const isFresh = lastVisit && (tx.status_updated ?? 0) > lastVisit
              return (
                <Row
                  key={tx.transaction_id}
                  onClick={() => navigate('/league/activity')}
                  padding="sm"
                  className="flex items-center gap-2.5"
                >
                  <span className={`shrink-0 w-8 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] ${color}`}>
                    {kind}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="font-body text-xs font-medium text-text-primary dark:text-text-primary truncate">
                        {title}
                      </span>
                      {involvesMe && <Badge tone="brand">You</Badge>}
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
                </Row>
              )
            })}
          </RuledList>
          <NavRow size="sm" to="/league/activity" title="Full activity feed" hint="League" />
        </section>
      )}

      {/* ── League pulse footer — chips open the Overview pre-filtered ── */}
      <div {...run('flex items-center gap-1.5 mt-5')}>
        {TIERS.map(tier => (
          <button
            key={tier}
            onClick={() => {
              try { sessionStorage.setItem('dynastyedge_league_tier', tier) } catch { /* private mode */ }
              navigate('/league')
            }}
            className={`px-2.5 py-1 font-body text-xs font-medium border press ${TIER_BADGE[tier]}`}
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

      {analysisOpen && (
        <RosterAnalysisSheet
          players={myRoster.players}
          avgStarterAge={myRoster.avgStarterAge}
          allRosters={league.allRosters}
          nflState={nflState}
          onClose={() => setAnalysisOpen(false)}
        />
      )}
    </div>
  )
}
