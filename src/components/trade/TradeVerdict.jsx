import { CheckCircle2, XCircle, RefreshCw, CheckCircle, XCircle as XCircleSmall, Circle } from 'lucide-react'
import WinWindowBadge from '../shared/WinWindowBadge'

const VERDICT_STYLES = {
  Accept:  { Icon: CheckCircle2, color: 'text-success',  bg: 'bg-success/10 border-success/30' },
  Decline: { Icon: XCircle,      color: 'text-danger',   bg: 'bg-danger/10 border-danger/30' },
  Counter: { Icon: RefreshCw,    color: 'text-warning',  bg: 'bg-warning/10 border-warning/30' },
}

function ValueSummary({ giveTotal, getTotal }) {
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
    </div>
  )
}

export default function TradeVerdict({ analysis, verdict, counterSuggestion, fairPackage, whatsFairTarget }) {
  if (!analysis || (analysis.giveTotal === 0 && analysis.getTotal === 0)) {
    return (
      <div className="rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-4 py-8 text-center mb-4">
        <p className="font-body text-sm text-text-tertiary dark:text-text-tertiary">
          Add players from both rosters to see analysis.
        </p>
      </div>
    )
  }

  const { giveTotal, getTotal, filledNeeds, hurtStrengths, windowScore, windowNote, myTier } = analysis
  const vs = verdict ? VERDICT_STYLES[verdict.verdict] : null

  return (
    <div>
      {/* What's Fair callout */}
      {whatsFairTarget && fairPackage && (
        <div className="mb-4 rounded-xl bg-warning/10 border border-warning/30 px-4 py-3">
          <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-warning mb-2">
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
          <ValueSummary giveTotal={giveTotal} getTotal={getTotal} />
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
        </div>

        {/* Verdict */}
        {verdict && vs && (
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
              <p className="font-body text-xs text-text-secondary dark:text-text-secondary mt-2 leading-relaxed border-t border-current/20 pt-2">
                Counter: {counterSuggestion}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
