import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle as XCircleSmall, Circle, AlertTriangle, LineChart, Target, User, Users, Copy, Check, ArrowRight, Layers, CalendarClock, Scale, History } from 'lucide-react'
import WinWindowBadge from '../shared/WinWindowBadge'
import SectionHeader from '../shared/SectionHeader'
import TheCall from './TheCall'
import PlayerProfileDrawer from '../shared/PlayerProfileDrawer'
import { Card, Button, Badge } from '../ui'
import { POS_TEXT } from '../../utils/positionColors'
import { relativeTime } from '../../hooks/usePlayerIntel'

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

function PlayerNewsCard({ intel, onTap }) {
  const flag = intel.injuryFlag ?? 'green'
  const statusLabel = intel.injuryStatus
    ? intel.injuryDetail ? `${intel.injuryStatus} — ${intel.injuryDetail}` : intel.injuryStatus
    : 'Active'

  const extra   = intel.intel
  const summary = extra?.seasonSummary
  const recent  = (extra?.recentGames ?? []).filter(g => g.pts != null)
  const topNews = extra?.news?.[0]
  const tappable = !!onTap

  return (
    <div className="px-4 py-3 border-b border-border-default dark:border-border-default last:border-b-0">
      <div className="flex items-center justify-between mb-1">
        <p className="font-body text-xs font-semibold text-text-primary dark:text-text-primary">
          {tappable ? (
            <button
              onClick={onTap}
              aria-label={`View ${intel.playerName} profile`}
              className="text-text-primary dark:text-text-primary underline decoration-dotted decoration-text-tertiary/60 underline-offset-2 active:opacity-60 transition-opacity"
            >
              {intel.playerName}
            </button>
          ) : (
            intel.playerName
          )}
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

// The positional depth chart, in whichever direction the piece is moving:
// "Giving Up" (marker `out`, my pre-trade roster) and "Coming In" (marker `in`,
// my post-trade roster). One component, because the question is the same one
// both ways — where does this player actually sit among the others at his
// position, and who starts? The panel used to draw this only for the players
// leaving, so the roster cost was concrete and the roster GAIN was a sentence.
const MARKER_STYLE = {
  out: { row: 'bg-warning/10', chip: 'text-warning', label: 'out' },
  in:  { row: 'bg-success/10', chip: 'text-success', label: 'in' },
}

function DepthChartBlock({ context, title }) {
  if (!context?.length) return null

  return (
    <div className="px-4 py-3 border-b border-border-default dark:border-border-default">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-tertiary dark:text-text-tertiary mb-2">
        {title}
      </p>
      <div className="flex flex-col gap-3">
        {context.map(g => {
          const mk = MARKER_STYLE[g.marker] ?? MARKER_STYLE.out
          return (
            <div key={g.position}>
              {/* Headline: each moving player + their standing at the position */}
              <p className="font-body text-xs text-text-primary dark:text-text-primary mb-1.5 leading-snug">
                {g.marked.map((d, i) => (
                  <span key={d.name}>
                    {i > 0 && <span className="text-text-tertiary">, </span>}
                    <span className="font-semibold">{d.name}</span>
                    {' — your '}
                    <span className={`font-mono font-semibold ${POS_TEXT[g.position] ?? 'text-text-secondary'}`}>
                      {g.position}{d.posRank}
                    </span>
                    <span className="text-text-secondary dark:text-text-secondary">
                      {' of '}{g.count}{' · '}
                      {g.marker === 'in'
                        ? (d.isStarter ? 'starts' : 'bench')
                        : (d.isStarter ? 'starter' : 'depth')}
                    </span>
                  </span>
                ))}
              </p>
              {/* Positional pecking order by dynasty value — moving row highlighted */}
              <div className="flex flex-col gap-px">
                {g.peers.slice(0, 6).map((q, i) => (
                  <div
                    key={q.sleeperId}
                    className={`flex items-center gap-2 px-1.5 py-1 rounded-none ${q.isMarked ? mk.row : ''}`}
                  >
                    <span className="font-mono text-[10px] text-text-tertiary dark:text-text-tertiary w-3 shrink-0">
                      {i + 1}
                    </span>
                    <span className={`font-body text-[11px] truncate flex-1 ${
                      q.isMarked
                        ? 'text-text-primary dark:text-text-primary font-semibold'
                        : 'text-text-secondary dark:text-text-secondary'
                    }`}>
                      {q.name}
                      {q.isStarter && (
                        <span className="ml-1.5 font-mono text-[9px] uppercase tracking-wide text-text-tertiary dark:text-text-tertiary">
                          ST
                        </span>
                      )}
                    </span>
                    {q.isMarked && (
                      <span className={`font-mono text-[9px] uppercase tracking-wide shrink-0 ${mk.chip}`}>
                        {mk.label}
                      </span>
                    )}
                    <span className="font-mono text-[11px] tabular-nums text-text-secondary dark:text-text-secondary shrink-0">
                      {q.unranked ? '—' : q.value.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Where an arriving player lands on a depth chart — one compact row per player.
// The question "does he actually start?" is the one a position tag can't answer,
// so the row leads with the rank and states the slot when he does.
function LandingRow({ spot, possessive }) {
  return (
    <p className="font-body text-[11px] text-text-secondary dark:text-text-secondary leading-snug">
      <span className="font-semibold text-text-primary dark:text-text-primary">{spot.name}</span>
      <ArrowRight size={10} strokeWidth={2.5} className="inline mx-1 -mt-px text-text-tertiary" />
      {possessive}{' '}
      <span className={`font-mono font-semibold ${POS_TEXT[spot.position] ?? 'text-text-secondary'}`}>
        {spot.position}{spot.posRank}
      </span>
      {' of '}{spot.count}
      {spot.starts
        ? <span className="text-success"> · starts{spot.slot ? ` at ${spot.slot}` : ''}</span>
        : <span className="text-text-tertiary dark:text-text-tertiary"> · bench</span>}
    </p>
  )
}

const APPEAL_STYLE = {
  Strong: { text: 'text-success', tone: 'success', dot: 'bg-success' },
  Fair:   { text: 'text-warning', tone: 'warning', dot: 'bg-warning' },
  Weak:   { text: 'text-danger',  tone: 'danger',  dot: 'bg-danger' },
}

// The same graded read, from MY seat — the block that was missing. Every fact
// in it is one the panel already had; what it didn't have was a headline saying
// what the trade is worth to my roster, in the same words used for theirs. It
// is deliberately compact: the acts below ARE the reasons, so this carries the
// verdict-level read plus the one fact that had no home anywhere on screen —
// what the deal does to my own starting lineup, which until now was printed
// only when it was bad enough to downgrade a verdict.
function YourSideBlock({ myFit }) {
  if (!myFit) return null
  const st = APPEAL_STYLE[myFit.appeal] ?? APPEAL_STYLE.Fair

  return (
    <div className="px-4 py-3 border-b border-border-default dark:border-border-default">
      <div className="flex items-center gap-2 mb-2">
        <User size={12} strokeWidth={2} className="text-text-tertiary shrink-0" />
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-tertiary dark:text-text-tertiary">
          Is it good for you?
        </p>
        <Badge tone={st.tone} soft>{myFit.appeal}</Badge>
      </div>

      <p className={`font-body text-xs leading-relaxed flex items-center gap-1.5 ${st.text}`}>
        <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${st.dot}`} />
        {myFit.summary}
      </p>

      {/* The reasons carry the numbers in words, exactly as they do for the
          partner. They restate facts the acts below also carry — deliberately:
          a one-word grade with a lineup gain under it reads as a contradiction
          until you can see that the grade is paying for a 7% overpay. This is
          the executive summary for my seat, and it is what makes a Weak
          legible instead of insulting. */}
      <ul className="flex flex-col gap-1 mt-2">
        {myFit.reasons.map(r => (
          <li key={r} className="font-body text-[11px] text-text-secondary dark:text-text-secondary leading-snug flex items-start gap-1.5">
            <Circle size={9} strokeWidth={2} className="shrink-0 mt-1" />
            <span>{r}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Layer 4 — "would they even want this?", answered from their roster. Everything
// here is deterministic: their post-trade lineup and their standing against
// league average. It is deliberately NOT a prediction that they'll accept —
// behavioral profiling of this league's managers was tested and disconfirmed.
function TheirSideBlock({ partnerFit, partnerName }) {
  if (!partnerFit) return null
  const st = APPEAL_STYLE[partnerFit.appeal] ?? APPEAL_STYLE.Fair
  const who = partnerName ?? 'They'
  const sent = partnerFit.giveContext.flatMap(g =>
    g.marked.map(d => ({ ...d, position: g.position, count: g.count })))

  return (
    <div className="px-4 py-3 border-b border-border-default dark:border-border-default">
      <div className="flex items-center gap-2 mb-2">
        <Users size={12} strokeWidth={2} className="text-text-tertiary shrink-0" />
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-tertiary dark:text-text-tertiary">
          Would they want it?
        </p>
        <Badge tone={st.tone} soft>{partnerFit.appeal}</Badge>
      </div>

      <p className={`font-body text-xs leading-relaxed flex items-center gap-1.5 mb-2 ${st.text}`}>
        <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${st.dot}`} />
        {partnerFit.summary}
      </p>

      {/* What they'd receive, and whether it changes anything for them */}
      {partnerFit.landingSpots.length > 0 && (
        <div className="flex flex-col gap-1 mb-2">
          {partnerFit.landingSpots.map(spot => (
            <LandingRow key={spot.sleeperId} spot={spot} possessive="their" />
          ))}
        </div>
      )}

      {/* What they'd send, and where it currently sits for them */}
      {sent.length > 0 && (
        <p className="font-body text-[11px] text-text-secondary dark:text-text-secondary leading-snug mb-2">
          {who} would send{' '}
          {sent.map((d, i) => (
            <span key={d.name}>
              {i > 0 && <span className="text-text-tertiary">, </span>}
              <span className="font-semibold text-text-primary dark:text-text-primary">{d.name}</span>
              {' — their '}
              <span className={`font-mono font-semibold ${POS_TEXT[d.position] ?? 'text-text-secondary'}`}>
                {d.position}{d.posRank}
              </span>
              {` of ${d.count}`}
            </span>
          ))}
        </p>
      )}

      {/* The reasons carry the numbers in words — including the starting-lineup
          delta, which is the measure the verdict gate quotes — so there is no
          separate stat row repeating it. */}
      <ul className="flex flex-col gap-1">
        {partnerFit.reasons.map(r => (
          <li key={r} className="font-body text-[11px] text-text-secondary dark:text-text-secondary leading-snug flex items-start gap-1.5">
            <Circle size={9} strokeWidth={2} className="shrink-0 mt-1" />
            <span>{r}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// The message you actually send. Written entirely from THEIR side of the table,
// because an argument for why the trade is good for you is not a pitch — and
// every line is a number the app already computed, so it never oversells.
function PitchCard({ pitch }) {
  const [copied, setCopied] = useState(null)

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(null), 2200)
    return () => clearTimeout(t)
  }, [copied])

  if (!pitch) return null

  async function copy() {
    try {
      await navigator.clipboard.writeText(pitch.text)
      setCopied('ok')
    } catch {
      setCopied('fail')
    }
  }

  return (
    <Card padding="none" className="mb-4">
      <div className="px-4 py-2.5 border-b border-border-default dark:border-border-default flex items-center gap-2">
        <p className="flex-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-secondary dark:text-text-secondary">
          Pitch It
        </p>
        <Button
          size="sm"
          variant={copied === 'ok' ? 'tinted' : 'secondary'}
          onClick={copy}
          icon={copied === 'ok' ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} strokeWidth={2} />}
          className="shrink-0 px-2.5 py-1 text-[11px]"
        >
          {copied === 'ok' ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <div className="px-4 py-3">
        <p className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary mb-2 leading-snug">
          Written from their side of the table — paste it into the league chat.
        </p>
        <div className="font-body text-[11px] text-text-primary dark:text-text-primary leading-relaxed whitespace-pre-wrap select-text">
          {pitch.text}
        </div>
        {copied === 'fail' && (
          <p className="font-body text-[10px] text-warning mt-2">
            Copy was blocked — select the text above and copy it manually.
          </p>
        )}
      </div>
    </Card>
  )
}


// Roster space. Over the cap is a NORMAL post-draft state in this league — nine
// of ten teams were at or over it the week after the rookie draft — so this
// never says "illegal". It says how many active slots move, who is owed drops,
// and when a trade pays that debt down (which is a selling point, not a cost).
function RosterSpaceBlock({ space, who, icon: Icon = Layers }) {
  if (!space) return null
  const arrow = space.net === 0 ? 'no change' : `${space.net > 0 ? '+' : ''}${space.net}`
  return (
    <div className="px-4 py-3 border-b border-border-default dark:border-border-default">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={12} strokeWidth={2} className="text-text-tertiary shrink-0" />
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-tertiary dark:text-text-tertiary">
          Roster space
        </p>
      </div>
      <p className="font-body text-xs text-text-secondary dark:text-text-secondary leading-snug">
        {who}{' '}
        <span className="font-mono font-semibold tabular-nums text-text-primary dark:text-text-primary">
          {space.before} → {space.after}
        </span>
        {' of '}{space.cap} active slots ({arrow})
      </p>
      {space.overAfter > 0 ? (
        <p className="font-body text-[11px] text-warning leading-snug mt-1">
          {space.overAfter} over the cap afterwards — {space.overAfter === 1 ? 'a drop is' : 'drops are'} owed before the season.
        </p>
      ) : space.headroomAfter === 0 ? (
        <p className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary leading-snug mt-1">
          Full afterwards — no room to add without dropping.
        </p>
      ) : (
        <p className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary leading-snug mt-1">
          {space.headroomAfter} spot{space.headroomAfter > 1 ? 's' : ''} open afterwards.
        </p>
      )}
      {space.relievesCrunch && (
        <p className="font-body text-[11px] text-success leading-snug mt-1">
          This pays down a roster-crunch debt — worth naming in the pitch.
        </p>
      )}
    </div>
  )
}

// The same roster-fit question in the other currency. A dynasty trade is not
// decided on one week, which is exactly why this is a note and never a score —
// it answers "what does this cost me on Sunday?"
function WeeklyImpactRow({ side, label }) {
  if (!side) return null
  const up = side.delta > 0
  const flat = side.delta === 0
  return (
    <p className="font-body text-[11px] text-text-secondary dark:text-text-secondary leading-snug">
      {label}{' '}
      <span className="font-mono tabular-nums">{side.before} → {side.after}</span>{' '}
      <span className={`font-mono font-semibold tabular-nums ${flat ? 'text-text-tertiary' : up ? 'text-success' : 'text-danger'}`}>
        ({up ? '+' : ''}{side.delta})
      </span>
    </p>
  )
}

// What the partner has been doing lately — descriptive context, never a score.
// A TE surplus they just went out and bought is not spare depth.
function PartnerActivityBlock({ activity }) {
  if (!activity?.summary) return null
  return (
    <div className="px-4 py-3 border-b border-border-default dark:border-border-default">
      <div className="flex items-center gap-2 mb-1.5">
        <History size={12} strokeWidth={2} className="text-text-tertiary shrink-0" />
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-tertiary dark:text-text-tertiary">
          Recent moves
        </p>
      </div>
      <p className="font-body text-[11px] text-text-secondary dark:text-text-secondary leading-snug">
        {activity.summary}
      </p>
      {activity.positionsAdded.length > 0 && (
        <p className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary leading-snug mt-1">
          They've been adding {activity.positionsAdded.join(' / ')} — read their surplus there as bought, not spare.
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
  pitch,
  partnerName,
}) {
  const [selectedPlayer, setSelectedPlayer] = useState(null)

  if (!analysis || (giveCount === 0 && getCount === 0)) {
    return (
      <Card padding="none" className="px-4 py-8 text-center mb-4">
        <p className="font-body text-sm text-text-tertiary dark:text-text-tertiary">
          Add players from both rosters to see analysis.
        </p>
      </Card>
    )
  }

  const {
    giveTotal, getTotal, filledNeeds, hurtStrengths, windowScore, windowNote, windowBasis, myTier,
    benchNote, starterLossNote, giveContext, getContext, myLandingSpots, partnerFit, myFit,
    playoffPct, oddsStance, oddsNote, oddsTone,
    partnerTrajectoryNote, partnerTrajectoryTone,
    myTrajectoryNote, myTrajectoryTone,
    draftNote, draftTone,
    scarcity, myRosterSpace, theirRosterSpace, weeklyImpact,
  } = analysis
  const ODDS_TONE_TEXT = { success: 'text-success', warning: 'text-warning', danger: 'text-danger' }
  // Same three tones, as Badge props — the playoff stance badge that replaces
  // the tier badge whenever odds are what scored this layer.
  const ODDS_BADGE_TONE = { success: 'success', warning: 'warning', danger: 'danger' }
  const bothSides = giveCount > 0 && getCount > 0

  const injuredWarnings = liveIntelligence
    ? liveIntelligence.filter(i => i.injuryFlag === 'red')
    : []

  return (
    <div>
      {/* What's Fair callout */}
      {whatsFairTarget && fairPackage && (
        <div className="mb-4 rounded-none bg-warning/10 border border-warning/30 px-4 py-3 relative">
          <button
            onClick={onClearWhatsFair}
            className="absolute top-2 right-3 text-warning text-base font-bold leading-none"
            aria-label="Dismiss"
          >
            ×
          </button>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-warning mb-2 pr-5">
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

      {/* The answer, first — then the evidence in three acts below. */}
      <TheCall
        analysis={analysis}
        verdict={verdict}
        bothSides={bothSides}
        counterSuggestion={counterSuggestion}
        onApplyCounter={onApplyCounter}
      />

      {/* Injury alerts ride directly under the call — they're a "verify before
          you send this" flag, not a section you should have to scroll for. */}
      {injuredWarnings.length > 0 && (
        <Card padding="none" className="mb-4 bg-danger/5">
          <div className="px-4 py-3">
            {injuredWarnings.map(p => (
              <div key={p.playerName} className="flex items-start gap-2 mb-1 last:mb-0">
                <AlertTriangle size={13} className="text-danger shrink-0 mt-0.5" strokeWidth={2} />
                <p className="font-body text-xs text-danger leading-relaxed">
                  {p.playerName} is currently injured — verify status before accepting
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ─────────────── ACT 1 — YOUR SIDE ─────────────── */}
      <div id="act-yours" className="scroll-mt-28">
        <SectionHeader label="Your side" />
        <Card padding="none" className="mb-4">
          {/* The graded my-side read — the mirror of "Would they want it?" */}
          <YourSideBlock myFit={myFit} />

          {/* Layer 1: Raw value */}
          <div className="px-4 py-3 border-b border-border-default dark:border-border-default">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-tertiary dark:text-text-tertiary mb-2">
              Raw Value
            </p>
            <ValueSummary giveTotal={giveTotal} getTotal={getTotal} bothSides={bothSides} />
            {/* Scarcity speaks ONLY when it disagrees with the raw totals — a
                second number that agrees is noise, and FantasyCalc stays the
                headline so the pitch quotes something they can look up. */}
            {scarcity && (
              <p className="font-body text-[11px] leading-relaxed mt-2 pt-2 border-t border-border-default dark:border-border-default flex items-start gap-1.5 text-text-secondary dark:text-text-secondary">
                <Scale size={12} strokeWidth={2} className={`shrink-0 mt-0.5 ${ODDS_TONE_TEXT[scarcity.tone] ?? 'text-text-tertiary'}`} />
                <span>{scarcity.note}</span>
              </p>
            )}
          </div>

          {/* Layer 2: Roster fit */}
          <div className="px-4 py-3 border-b border-border-default dark:border-border-default">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-tertiary dark:text-text-tertiary mb-2">
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
                  <span key={`need-${pos}`} className="inline-flex items-center gap-1 font-body text-xs text-success bg-success/10 rounded-md px-2 py-0.5">
                    <CheckCircle2 size={10} strokeWidth={2.5} />
                    Fills {pos} need
                  </span>
                ))}
                {hurtStrengths.map(pos => (
                  <span key={`hurt-${pos}`} className="inline-flex items-center gap-1 font-body text-xs text-danger bg-danger/10 rounded-md px-2 py-0.5">
                    <XCircleSmall size={10} strokeWidth={2.5} />
                    Weakens {pos} depth
                  </span>
                ))}
              </div>
            )}
            {benchNote && (
              <p className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary leading-relaxed mt-2 flex items-start gap-1.5">
                <Circle size={10} strokeWidth={2} className="text-text-tertiary shrink-0 mt-0.5" />
                <span>{benchNote}</span>
              </p>
            )}
            {starterLossNote && (
              <p className="font-body text-[11px] text-warning leading-relaxed mt-1.5 flex items-start gap-1.5">
                <AlertTriangle size={11} strokeWidth={2} className="shrink-0 mt-0.5" />
                <span>{starterLossNote}</span>
              </p>
            )}
            {/* Where each acquired player lands on MY post-trade depth chart —
                the "fills WR need" chip names the position, this names the spot. */}
            {myLandingSpots?.length > 0 && (
              <div className="flex flex-col gap-1 mt-2 pt-2 border-t border-border-default dark:border-border-default">
                {myLandingSpots.map(spot => (
                  <LandingRow key={spot.sleeperId} spot={spot} possessive="your" />
                ))}
              </div>
            )}
            {/* The same question in weekly points (in-season only). */}
            {weeklyImpact && (
              <div className="mt-2 pt-2 border-t border-border-default dark:border-border-default">
                <div className="flex items-center gap-1.5 mb-1">
                  <CalendarClock size={11} strokeWidth={2} className="text-text-tertiary shrink-0" />
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-text-tertiary dark:text-text-tertiary">
                    Week {weeklyImpact.week} lineup
                  </p>
                </div>
                <WeeklyImpactRow side={weeklyImpact.mine} label="Your projected starters" />
                <p className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary leading-snug mt-1">
                  One week of Sleeper projections — context for a dynasty call, never the reason for one.
                </p>
              </div>
            )}
          </div>

          {/* The two depth charts: what arrives, then what leaves. The gain
              used to be one sentence while the cost got the whole chart. */}
          <DepthChartBlock context={getContext} title="Coming In" />
          <DepthChartBlock context={giveContext} title="Giving Up" />

          <RosterSpaceBlock space={myRosterSpace} who="You" />

          {/* Layer 3: Win window */}
          <div className="px-4 py-3">
            {/* The badge names WHAT DECIDED this layer. In season that is the
                live playoff stance (Buyer / On the bubble / Seller); in the
                offseason there are no odds and the win-window tier stands in.
                Showing the tier badge while odds drive the score would put two
                different answers side by side with no way to tell which one
                the verdict used. */}
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-tertiary dark:text-text-tertiary">
                Win Window
              </p>
              {windowBasis === 'odds' && oddsStance ? (
                <Badge tone={ODDS_BADGE_TONE[oddsTone] ?? 'neutral'} soft>
                  {oddsStance}
                </Badge>
              ) : (
                <WinWindowBadge tier={myTier} />
              )}
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
            {/* The basis line. In season this is what the layer was scored ON,
                so it reads as the reason rather than as a footnote, and it
                still carries the win-window tier for context — the tier is what
                the rest of the app (partner cards, keep-scores) reasons with. */}
            {playoffPct != null && (
              <p className="font-body text-[11px] text-text-secondary dark:text-text-secondary leading-relaxed mt-1.5">
                Scored on live playoff odds:{' '}
                <span className="font-mono font-semibold tabular-nums text-text-primary dark:text-text-primary">{Math.round(playoffPct * 100)}%</span>
                {' · '}
                <span className={`font-semibold ${ODDS_TONE_TEXT[oddsTone] ?? 'text-text-secondary'}`}>{oddsStance}</span>
                {oddsNote ? ` — ${oddsNote}` : ''}
                {myTier ? <span className="text-text-tertiary dark:text-text-tertiary"> (roster tier: {myTier})</span> : null}
              </p>
            )}
            {/* Deliberately does NOT say "offseason": odds are also null while the
                simulation is still loading, and asserting the wrong reason is
                worse than naming the basis and leaving it there. */}
            {playoffPct == null && (
              <p className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary leading-relaxed mt-1.5">
                No live playoff odds — scored on your roster tier. Odds take over whenever the season is running.
              </p>
            )}
            {myTrajectoryNote && (
              <p className="font-body text-[11px] text-text-secondary dark:text-text-secondary leading-relaxed mt-1.5 flex items-start gap-1.5">
                <LineChart size={12} strokeWidth={2} className={`shrink-0 mt-0.5 ${ODDS_TONE_TEXT[myTrajectoryTone] ?? 'text-text-tertiary'}`} />
                <span>{myTrajectoryNote}</span>
              </p>
            )}
            {draftNote && (
              <p className="font-body text-[11px] text-text-secondary dark:text-text-secondary leading-relaxed mt-1.5 flex items-start gap-1.5">
                <Target size={12} strokeWidth={2} className={`shrink-0 mt-0.5 ${ODDS_TONE_TEXT[draftTone] ?? 'text-text-tertiary'}`} />
                <span>{draftNote}</span>
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* ─────────────── ACT 2 — THEIR SIDE ─────────────── */}
      {giveCount > 0 && partnerFit && (
        <div id="act-theirs" className="scroll-mt-28">
          <SectionHeader label="Their side" />
          <Card padding="none" className="mb-4">
            <TheirSideBlock partnerFit={partnerFit} partnerName={partnerName} />
            <RosterSpaceBlock space={theirRosterSpace} who={partnerName ?? 'They'} />
            <PartnerActivityBlock activity={partnerFit.activity} />
            {/* Their multi-year direction belongs with the rest of the read on
                them, not buried under MY win window where it used to sit. */}
            {(partnerTrajectoryNote || weeklyImpact) && (
              <div className="px-4 py-3">
                {weeklyImpact && (
                  <>
                    <div className="flex items-center gap-1.5 mb-1">
                      <CalendarClock size={11} strokeWidth={2} className="text-text-tertiary shrink-0" />
                      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-text-tertiary dark:text-text-tertiary">
                        Week {weeklyImpact.week} lineup
                      </p>
                    </div>
                    <WeeklyImpactRow side={weeklyImpact.theirs} label="Their projected starters" />
                  </>
                )}
                {partnerTrajectoryNote && (
                  <p className="font-body text-[11px] text-text-secondary dark:text-text-secondary leading-relaxed mt-1.5 flex items-start gap-1.5">
                    <LineChart size={12} strokeWidth={2} className={`shrink-0 mt-0.5 ${ODDS_TONE_TEXT[partnerTrajectoryTone] ?? 'text-text-tertiary'}`} />
                    <span>{partnerTrajectoryNote}</span>
                  </p>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ─────────────── ACT 3 — CLOSING IT ─────────────── */}
      {(bothSides || (liveIntelligence?.length ?? 0) > 0 || intelligenceLoading) && (
        <div id="act-closing" className="scroll-mt-28">
          <SectionHeader label="Closing it" />

          {bothSides && <PitchCard pitch={pitch} />}

          {intelligenceLoading && (
            <Card padding="none" className="flex items-center justify-center gap-2 py-3 mb-4">
              <div className="h-3.5 w-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
              <span className="font-body text-xs text-text-secondary dark:text-text-secondary">
                Loading player news…
              </span>
            </Card>
          )}

          {liveIntelligence && liveIntelligence.length > 0 && (
            <Card padding="none" className="mb-4">
              <div className="px-4 py-2.5 border-b border-border-default dark:border-border-default flex items-center gap-2">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-secondary dark:text-text-secondary">
                  Live Intelligence
                </p>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              </div>
              {liveIntelligence.map(intel => (
                <PlayerNewsCard
                  key={intel.playerName}
                  intel={intel}
                  onTap={intel.player?.sleeperId ? () => setSelectedPlayer(intel.player) : undefined}
                />
              ))}
            </Card>
          )}
        </div>
      )}

      {selectedPlayer && (
        <PlayerProfileDrawer
          player={selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  )
}
