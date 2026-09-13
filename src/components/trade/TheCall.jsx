import { Card, Button, cn, scrollToTopOf } from '../ui'

// THE CALL — the Analyzer's hero.
//
// The verdict used to sit at the BOTTOM of ~7 sections of evidence, which made
// the Analyzer the only surface in the app that doesn't lead with its answer
// (the Optimizer's moves card, The Edge's hero and Playoff Odds all do). With
// twelve signals now feeding the panel, reading to the end to find out what to
// do stopped being viable at 390px.
//
// So: the call, the negotiating room, and one line per act — then the acts
// below carry the evidence. Nothing is hidden; the summaries just tell you
// whether you need to scroll.

// The verdict carried a lucide glyph beside its word. The word IS the verdict —
// "Accept" needs no tick to explain it — so the map keeps only the colour.
const VERDICT_STYLES = {
  Accept:  { color: 'text-success', bg: 'bg-success/10' },
  Decline: { color: 'text-danger',  bg: 'bg-danger/10' },
  Counter: { color: 'text-warning', bg: 'bg-warning/10' },
}

// The fair band rendered as a track: the ±5% window you're aiming at, and where
// this offer actually sits. A point estimate says the offer is wrong; the band
// says how much room you have, which is what you need mid-negotiation.
function FairBand({ band }) {
  if (!band) return null
  const span = Math.max(1, band.axisHigh - band.axisLow)
  const pct = v => Math.max(0, Math.min(100, ((v - band.axisLow) / span) * 100))
  const left = pct(band.low)
  const width = Math.max(2, pct(band.high) - left)
  const marker = pct(band.current)

  return (
    <div className="mt-3 pt-3 border-t border-current/15">
      <div className="flex items-baseline justify-between mb-1.5">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-tertiary dark:text-text-tertiary">
          Fair range
        </p>
        <p className="font-mono text-[10px] tabular-nums text-text-secondary dark:text-text-secondary">
          {band.low.toLocaleString()}–{band.high.toLocaleString()}
        </p>
      </div>

      <div className="relative h-2 bg-bg-secondary dark:bg-bg-secondary border border-border-default dark:border-border-default">
        <div
          className="absolute inset-y-0 bg-success/30 border-x border-success/50"
          style={{ left: `${left}%`, width: `${width}%` }}
        />
        <div
          className={cn(
            'absolute -inset-y-1 w-0.5',
            band.inside ? 'bg-text-primary dark:bg-text-primary' : 'bg-warning',
          )}
          style={{ left: `calc(${marker}% - 1px)` }}
        />
      </div>

      <p className="font-body text-[11px] text-text-secondary dark:text-text-secondary mt-1.5 leading-snug">
        You're sending{' '}
        <span className="font-mono font-semibold tabular-nums text-text-primary dark:text-text-primary">
          {band.current.toLocaleString()}
        </span>
        {band.inside
          ? ' — inside the fair window.'
          : band.current < band.low
            ? <> — <span className="text-warning font-semibold">{band.gapToBand.toLocaleString()} light</span> of fair.</>
            : <> — <span className="text-warning font-semibold">{band.gapToBand.toLocaleString()} over</span> fair; ask for more back.</>}
      </p>
    </div>
  )
}

function SummaryRow({ label, tone, text, onJump }) {
  return (
    <button
      onClick={onJump}
      className="w-full flex items-center gap-2 px-4 py-2.5 text-left border-t border-border-default dark:border-border-default active:bg-bg-secondary/60 transition-colors"
    >
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-tertiary dark:text-text-tertiary w-[68px] shrink-0">
        {label}
      </span>
      <span className={cn('flex-1 font-body text-[11px] leading-snug', tone)}>{text}</span>
      <span className="shrink-0 font-mono text-[11px] leading-none text-text-tertiary" aria-hidden="true">→</span>
    </button>
  )
}

const jump = id => scrollToTopOf(document.getElementById(id))

export default function TheCall({ analysis, verdict, bothSides, counterSuggestion, onApplyCounter }) {
  if (!analysis) return null
  const vs = verdict ? VERDICT_STYLES[verdict.verdict] : null

  const { filledNeeds, hurtStrengths, myFit, partnerFit, myRosterSpace, theirRosterSpace } = analysis

  // FOR YOU — the graded my-side read, then the Roster Fit chips as its detail.
  // The row used to carry only the chips, so FOR THEM was the one seat in the
  // panel that got a verdict-shaped answer. Same appeal engine, same words,
  // same tone map as FOR THEM below — the seats read alike by construction.
  const youBits = [
    ...filledNeeds.map(p => `Fills ${p}`),
    ...hurtStrengths.map(p => `Weakens ${p}`),
  ]
  const youDetail = youBits.length ? youBits.join(' · ') : 'Neutral positional impact'
  const youText = myFit ? `${myFit.appeal} for you — ${youDetail}` : youDetail
  const youTone = myFit
    ? (myFit.appeal === 'Strong' ? 'text-success' : myFit.appeal === 'Weak' ? 'text-danger' : 'text-warning')
    : hurtStrengths.length
      ? 'text-warning'
      : filledNeeds.length ? 'text-success' : 'text-text-secondary dark:text-text-secondary'

  // FOR THEM — the appeal band plus its sharpest objection or selling point.
  const themText = partnerFit
    ? `${partnerFit.appeal} for them${partnerFit.concerns?.[0] ? ` — ${partnerFit.concerns[0].replace(/\.$/, '')}` : partnerFit.reasons?.[0] ? ` — ${partnerFit.reasons[0].replace(/\.$/, '')}` : ''}`
    : null
  const themTone = partnerFit?.appeal === 'Strong'
    ? 'text-success'
    : partnerFit?.appeal === 'Weak' ? 'text-danger' : 'text-warning'

  // ROSTER — both sides' active-slot movement. Over the cap is a normal
  // post-draft state here, so this reads as pressure, never as illegality.
  const spaceText = myRosterSpace && theirRosterSpace
    ? `You ${myRosterSpace.before}→${myRosterSpace.after} · Them ${theirRosterSpace.before}→${theirRosterSpace.after} of ${myRosterSpace.cap}${theirRosterSpace.relievesCrunch ? ' · frees their crunch' : ''}`
    : null
  const spaceTone = theirRosterSpace?.relievesCrunch
    ? 'text-success'
    : myRosterSpace?.overAfter > 0 ? 'text-warning' : 'text-text-secondary dark:text-text-secondary'

  if (!bothSides || !verdict || !vs) {
    return (
      <Card padding="none" className="mb-4">
        <div className="px-4 py-3">
          <p className="font-body text-xs text-text-tertiary dark:text-text-tertiary">
            Add assets to both sides to get a verdict.
          </p>
        </div>
        {analysis.fairBand && analysis.getTotal > 0 && (
          <div className="px-4 pb-3"><FairBand band={analysis.fairBand} /></div>
        )}
      </Card>
    )
  }

  return (
    <Card padding="none" className="mb-4">
      <div className={cn('px-4 py-3', vs.bg)}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className={cn('font-display text-base uppercase tracking-wide', vs.color)}>
            {verdict.verdict}
          </span>
        </div>
        <p className="font-body text-sm text-text-primary dark:text-text-primary leading-relaxed">
          {verdict.reasoning}
        </p>

        <FairBand band={analysis.fairBand} />

        {counterSuggestion && (
          <div className="flex items-center gap-2 mt-2.5 border-t border-current/20 pt-2.5">
            <p className="flex-1 font-body text-xs text-text-secondary dark:text-text-secondary leading-relaxed">
              Counter: {counterSuggestion.text}
            </p>
            <Button
              size="sm"
              onClick={() => onApplyCounter?.(counterSuggestion)}
              className="shrink-0 px-2.5 py-1 text-[11px]"
            >
              Apply
            </Button>
          </div>
        )}
      </div>

      <SummaryRow label="For you"  tone={youTone}   text={youText}   onJump={() => jump('act-yours')} />
      {themText && <SummaryRow label="For them" tone={themTone} text={themText} onJump={() => jump('act-theirs')} />}
      {spaceText && <SummaryRow label="Roster" tone={spaceTone} text={spaceText} onJump={() => jump('act-yours')} />}
    </Card>
  )
}
