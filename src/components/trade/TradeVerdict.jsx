import { CheckCircle2, XCircle, RefreshCw, CheckCircle, XCircle as XCircleSmall, Circle, AlertTriangle } from 'lucide-react'
import WinWindowBadge from '../shared/WinWindowBadge'
import { relativeTime } from '../../hooks/usePlayerIntel'

const VERDICT_STYLES = {
  Accept:  { Icon: CheckCircle2, color: 'text-success', bg: 'bg-gradient-to-br from-success/20 via-success/10 to-transparent' },
  Decline: { Icon: XCircle,      color: 'text-danger',  bg: 'bg-gradient-to-br from-danger/20 via-danger/10 to-transparent' },
  Counter: { Icon: RefreshCw,    color: 'text-warning', bg: 'bg-gradient-to-br from-warning/20 via-warning/10 to-transparent' },
}

const FLAG_DOT = { red: 'bg-danger', yellow: 'bg-warning', green: 'bg-success' }
const FLAG_LABEL = { red: 'Injured', yellow: 'Questionable', green: 'Active' }
const FLAG_TEXT  = { red: 'text-danger', yellow: 'text-warning', green: 'text-success' }


function ValueSummary({ giveTotal, getTotal, bothSides }) {
  const diff    = getTotal - giveTotal
  const maxVal  = Math.max(giveTotal, getTotal, 1)
  const pct     = Math.round(Math.abs(diff) / maxVal * 100)
  const isEven  = pct <= 5

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-body text-xs text-text-secondary dark:text-text-secondary">
          Give <span className="font-mono text-text-primary dark:text-text-primary tabular-nums">{giveTotal.toLocaleString()}</span>
        </span>
        <span className="font-body text-xs text-text-secondary dark:text-text-secondary">
          Get <span className="font-mono text-text-primary dark:text-text-primary tabular-nums">{getTotal.toLocaleString()}</span>
        </span>
      </div>
      {bothSides ? (
        <p className={`font-body text-xs ${
          isEven ? 'text-text-secondary dark:text-text-secondary'
                 : diff > 0 ? 'text-success' : 'text-danger'
        }`}>
          {isEven
            ? '≈ Even value exchange'
            : diff > 0
              ? `▲ You're getting ${pct}% more value`
              : `▼ You're giving ${pct}% more value`}
        </p>
      ) : (
        <p className="font-body text-xs text-text-tertiary dark:text-text-tertiary">
          Add assets to both sides to compare value
        </p>
      )}
    </div>
  )
}

function PlayerNewsCard({ intel }) {
  const flag = intel.injuryFlag ?? 'green'
  const statusLabel = intel.injuryStatus
    ? intel.injuryDetail ? `${intel.injuryStatus} — ${intel.injuryDetail}` : intel.injuryStatus
    : 'Active'

  const extra   = intel.intel
  const summary = extra?.seasonSummary
  const recent  = (extra?.recentGames ?? []).filter(g => g.pts != null)
  const topNews = extra?.news?.[0]

  return (
    <div className="px-4 py-3 border-b border-border-default dark:border-border-default last:border-b-0">
      <div className="flex items-center justify-between mb-1">
        <p className="font-body text-xs font-semibold text-text-primary dark:text-text-primary">
          {intel.playerName}
          <span className="ml-1.5 font-normal text-[10px] uppercase tracking-wide text-text-tertiary dark:text-text-tertiary">
            {intel.side === 'give' ? 'giving' : 'getting'}
          </span>
        </p>
        <span className={`flex items-center gap-1 font-body text-[11px] shrink-0 ml-2 ${FLAG_TEXT[flag]}`}>
          <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${FLAG_DOT[flag]}`} />
          {FLAG_LABEL[flag]}
        </span>
      </div>
      <p className="font-body text-[11px] text-text-secondary dark:text-text-secondary">
        {statusLabel}
      </p>
      {intel.injuryNotes && (
        <p className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary mt-0.5 leading-snug">
          {intel.injuryNotes}
        </p>
      )}

      {/* Production + role context */}
      {(summary || extra?.depthChart) && (
        <p className="font-body text-[11px] text-text-secondary dark:text-text-secondary mt-1">
          {summary && (
            <>
              {summary.year}: <span className="font-mono tabular-nums">{summary.ppg ?? summary.pts}</span> {summary.ppg != null ? 'PPG' : 'pts'}
              {summary.posRank != null && extra.position ? ` · ${extra.position}${summary.posRank}` : ''}
            </>
          )}
          {summary && extra?.depthChart ? ' · ' : ''}
          {extra?.depthChart ? `${extra.depthChart.slot}${extra.depthChart.order ?? ''} on depth chart` : ''}
        </p>
      )}
      {recent.length > 0 && (
        <p className="font-body text-[11px] text-text-secondary dark:text-text-secondary mt-0.5">
          Last {recent.length} wks: <span className="font-mono tabular-nums">{recent.map(g => g.pts.toFixed(1)).join(' · ')}</span> pts
        </p>
      )}

      {/* Latest headline (hidden when unavailable) */}
      {topNews && (
        <p className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary mt-1 leading-snug">
          {topNews.headline}
          {relativeTime(topNews.published) ? ` — ${relativeTime(topNews.published)}` : ''}
        </p>
      )}
    </div>
  )
}

export default function TradeVerdict({
  analysis,
  verdict,
  giveCount = 0,
  getCount = 0,
  counterSuggestion,
  onApplyCounter,
  fairPackage,
  whatsFairTarget,
  onClearWhatsFair,
  liveIntelligence,
  intelligenceLoading,
}) {
  if (!analysis || (giveCount === 0 && getCount === 0)) {
    return (
      <div className="rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-4 py-8 text-center mb-4">
        <p className="font-body text-sm text-text-tertiary dark:text-text-tertiary">
          Add players from both rosters to see analysis.
        </p>
      </div>
    )
  }

  const { giveTotal, getTotal, filledNeeds, hurtStrengths, windowScore, windowNote, myTier,
    playoffPct, oddsStance, oddsNote, oddsTone } = analysis
  const ODDS_TONE_TEXT = { success: 'text-success', warning: 'text-warning', danger: 'text-danger' }
  const bothSides = giveCount > 0 && getCount > 0
  const vs = verdict ? VERDICT_STYLES[verdict.verdict] : null

  const injuredWarnings = liveIntelligence
    ? liveIntelligence.filter(i => i.injuryFlag === 'red')
    : []

  return (
    <div>
      {/* What's Fair callout */}
      {whatsFairTarget && fairPackage && (
        <div className="mb-4 rounded-xl bg-warning/10 border border-warning/30 px-4 py-3 relative">
          <button
            onClick={onClearWhatsFair}
            className="absolute top-2 right-3 text-warning text-base font-bold leading-none"
            aria-label="Dismiss"
          >
            ×
          </button>
          <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-warning mb-2 pr-5">
            What's fair for {whatsFairTarget.name}?
          </p>
          <p className="font-mono text-sm text-warning mb-0.5">
            {(whatsFairTarget.value || 0).toLocaleString()} pts
          </p>
          <p className="font-body text-[11px] text-text-secondary dark:text-text-secondary mb-1">
            Suggested package from your roster:
          </p>
          <p className="font-body text-sm text-text-primary dark:text-text-primary font-medium leading-snug">
            {fairPackage.assets.map(a => a.name).join(' + ')}
          </p>
          <p className="font-mono text-xs text-text-secondary dark:text-text-secondary mt-1 tabular-nums">
            Total: {fairPackage.totalValue.toLocaleString()}
            {' '}({fairPackage.over ? '+' : '-'}{fairPackage.gapPct}%)
          </p>
        </div>
      )}

      <div className="rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default overflow-hidden mb-4">
        {/* Section label */}
        <div className="px-4 py-2.5 border-b border-border-default dark:border-border-default">
          <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary dark:text-text-secondary">
            Analysis
          </p>
        </div>

        {/* Layer 1: Raw value */}
        <div className="px-4 py-3 border-b border-border-default dark:border-border-default">
          <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary dark:text-text-tertiary mb-2">
            Raw Value
          </p>
          <ValueSummary giveTotal={giveTotal} getTotal={getTotal} bothSides={bothSides} />
        </div>

        {/* Layer 2: Roster fit */}
        <div className="px-4 py-3 border-b border-border-default dark:border-border-default">
          <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary dark:text-text-tertiary mb-2">
            Roster Fit
          </p>
          {filledNeeds.length === 0 && hurtStrengths.length === 0 ? (
            <p className="font-body text-xs text-text-secondary dark:text-text-secondary flex items-center gap-1.5">
              <Circle size={10} strokeWidth={2} className="text-text-tertiary" />
              Neutral positional impact
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {filledNeeds.map(pos => (
                <span
                  key={`need-${pos}`}
                  className="inline-flex items-center gap-1 font-body text-xs text-success bg-success/10 rounded-md px-2 py-0.5"
                >
                  <CheckCircle2 size={10} strokeWidth={2.5} />
                  Fills {pos} need
                </span>
              ))}
              {hurtStrengths.map(pos => (
                <span
                  key={`hurt-${pos}`}
                  className="inline-flex items-center gap-1 font-body text-xs text-danger bg-danger/10 rounded-md px-2 py-0.5"
                >
                  <XCircleSmall size={10} strokeWidth={2.5} />
                  Weakens {pos} depth
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Layer 3: Win window */}
        <div className="px-4 py-3 border-b border-border-default dark:border-border-default">
          <div className="flex items-center gap-2 mb-1.5">
            <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary dark:text-text-tertiary">
              Win Window
            </p>
            <WinWindowBadge tier={myTier} />
          </div>
          <p className={`font-body text-xs leading-relaxed flex items-center gap-1.5 ${
            windowScore > 0 ? 'text-success'
              : windowScore < 0 ? 'text-warning'
              : 'text-text-secondary dark:text-text-secondary'
          }`}>
            <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${
              windowScore > 0 ? 'bg-success' : windowScore < 0 ? 'bg-warning' : 'bg-text-tertiary'
            }`} />
            {windowNote}
          </p>
          {/* Real playoff odds behind the win-window read (in-season only) */}
          {playoffPct != null && (
            <p className="font-body text-[11px] text-text-secondary dark:text-text-secondary leading-relaxed mt-1.5">
              Playoff odds: <span className="font-mono font-semibold tabular-nums text-text-primary dark:text-text-primary">{Math.round(playoffPct * 100)}%</span>
              {' · '}
              <span className={`font-semibold ${ODDS_TONE_TEXT[oddsTone] ?? 'text-text-secondary'}`}>{oddsStance}</span>
              {oddsNote ? ` — ${oddsNote}` : ''}
            </p>
          )}
        </div>

        {/* Injury warning banners — surface above verdict when any player is Out */}
        {injuredWarnings.length > 0 && (
          <div className="px-4 py-3 border-b border-border-default dark:border-border-default bg-danger/5">
            {injuredWarnings.map(p => (
              <div key={p.playerName} className="flex items-start gap-2 mb-1 last:mb-0">
                <AlertTriangle size={13} className="text-danger shrink-0 mt-0.5" strokeWidth={2} />
                <p className="font-body text-xs text-danger leading-relaxed">
                  {p.playerName} is currently injured — verify status before accepting
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Verdict — only once both sides have at least one asset */}
        {bothSides && verdict && vs ? (
          <div className={`px-4 py-3 ${vs.bg}`}>
            <div className="flex items-center gap-2 mb-1.5">
              <vs.Icon size={16} strokeWidth={2} className={vs.color} />
              <span className={`font-display text-base font-bold uppercase tracking-wide ${vs.color}`}>
                {verdict.verdict}
              </span>
            </div>
            <p className="font-body text-sm text-text-primary dark:text-text-primary leading-relaxed">
              {verdict.reasoning}
            </p>
            {counterSuggestion && (
              <div className="flex items-center gap-2 mt-2 border-t border-current/20 pt-2">
                <p className="flex-1 font-body text-xs text-text-secondary dark:text-text-secondary leading-relaxed">
                  Counter: {counterSuggestion.text}
                </p>
                <button
                  onClick={() => onApplyCounter?.(counterSuggestion)}
                  className="shrink-0 px-2.5 py-1 rounded-lg bg-accent text-white font-body text-[11px] font-semibold active:opacity-80 transition-opacity"
                >
                  Apply
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="px-4 py-3">
            <p className="font-body text-xs text-text-tertiary dark:text-text-tertiary">
              Add assets to both sides to get a verdict.
            </p>
          </div>
        )}
      </div>

      {/* Live Intelligence loading state — shown while agents run, non-blocking */}
      {intelligenceLoading && (
        <div className="flex items-center justify-center gap-2 py-3 mb-4 rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default">
          <div className="h-3.5 w-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          <span className="font-body text-xs text-text-secondary dark:text-text-secondary">
            Loading player news…
          </span>
        </div>
      )}

      {/* Live Intelligence section */}
      {liveIntelligence && liveIntelligence.length > 0 && (
        <div className="rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default overflow-hidden mb-4">
          <div className="px-4 py-2.5 border-b border-border-default dark:border-border-default flex items-center gap-2">
            <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary dark:text-text-secondary">
              Live Intelligence
            </p>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          </div>
          {liveIntelligence.map(intel => (
            <PlayerNewsCard key={intel.playerName} intel={intel} />
          ))}
        </div>
      )}
    </div>
  )
}
