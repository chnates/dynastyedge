import { getTeamName } from '../../hooks/useLeague'
import { useLeagueContext } from '../../context/LeagueContext'
import { getPositionalStrength, POSITION_DEPTH } from '../../utils/rosterAnalysis'
import { TIER_TEXT } from '../../utils/tierColors'
import { POSITIONS, PICK_YEARS } from '../../constants'
import { POS_TEXT } from '../../utils/positionColors'
import { rankClass } from '../../utils/rankColors'
import TeamAvatar from '../shared/TeamAvatar'
import { Badge, Magnitude, MAGNITUDE_TEAM_REFERENCE, Mark, cn } from '../ui'

function getPositionalTrend(roster) {
  const result = {}
  POSITIONS.forEach(pos => {
    const players = roster.players
      .filter(p => p.position === pos && !p.isIR)
      .sort((a, b) => b.value - a.value)
      .slice(0, POSITION_DEPTH[pos])
    result[pos] = players.reduce((s, p) => s + (p.trend30Day ?? 0), 0)
  })
  return result
}

function formatRecord({ wins, losses, ties }) {
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`
}

const DIVERGENCE_META = {
  under: { label: 'Underperforming', cls: 'bg-warning/15 text-warning' },
  over:  { label: 'Overachieving',   cls: 'bg-accent/15 text-accent' },
}

// A LEAGUE ROW — ten teams is an enumeration, so this is a ruled row inside a
// <RuledList>, not a bordered card with a caption bar (law 5).
//
// THE POSITIONAL STRENGTH BARS ARE GONE, and not for consistency with law 2.
// They computed `min(100, strength / (leagueAvg * 2) * 100)`, which fails three
// ways that a bar must not:
//
//   1. IT CLAMPED. Anything at twice the league average pinned at 100%, so the
//      two strongest QB rooms in the league rendered identically while
//      differing by thousands of points — finding B2 re-created INSIDE the one
//      encoding that was supposed to fix it. Visible on the live board: the
//      top three teams' bars are near-indistinguishable.
//   2. THE COMPLEMENT WAS MEANINGLESS. Twice-league-average is not a whole that
//      anyone is a fraction of, so the empty track said nothing. (Contrast the
//      Playoff Odds bar, which stays: a probability IS a proportion of a
//      bounded whole, its complement is the chance you miss, it never clamps,
//      and its mapping is absolute.)
//   3. THE REFERENCE MOVED. The denominator is the league average, so a team's
//      own bar changed length when a DIFFERENT team traded — the per-list
//      maximum failure `Magnitude`'s contract exists to prevent.
//
// What replaces it is what CLAUDE.md's Feature 5 always actually specified:
// "each shown relative to league average (above average = filled, below average
// = unfilled)" — a BINARY. The position letter takes its hue when the team is
// above average there and mutes when below, with the 30-day trend beside it.
// Honest, unclampable, and a quarter of the height.
function PositionalRead({ roster, leagueAverages }) {
  const strength = getPositionalStrength(roster)
  const trends = getPositionalTrend(roster)
  return (
    <div className="flex items-center gap-3">
      {POSITIONS.map(pos => {
        const above = strength[pos] >= (leagueAverages?.[pos] ?? Infinity)
        const trend = trends[pos]
        // A plain text arrow rotated with CSS, NOT the ↗/↘ codepoints: iOS
        // gives U+2197/U+2198 default emoji presentation (a colour glyph that
        // ignores our text colour), while U+2192 stays text.
        const rotate = trend > 50 ? '-rotate-45' : trend < -50 ? 'rotate-45' : ''
        const trendColor = trend > 50
          ? 'text-success'
          : trend < -50 ? 'text-danger' : 'text-text-tertiary'
        return (
          <span key={pos} className="flex items-baseline gap-0.5">
            <span
              className={cn(
                'font-mono text-[10px] font-semibold uppercase tracking-[0.1em]',
                above ? POS_TEXT[pos] : 'text-text-tertiary opacity-50',
              )}
            >
              {pos}
            </span>
            <span className={cn('font-body text-[10px] leading-none inline-block', rotate, trendColor)}>
              →
            </span>
          </span>
        )
      })}
    </div>
  )
}

export default function TeamCard({ roster, rank, divergence, leagueAverages, winWindowTiers, sortMode = 'value', onTap }) {
  const { myRosterId, pickYears } = useLeagueContext()
  // The live three-season pick window (see utils/seasonWindow.js); the constant
  // is only the seed used before Sleeper's NFL state resolves.
  const years = pickYears ?? PICK_YEARS
  const teamName = getTeamName(roster.owner)
  const username = roster.owner?.username ?? ''
  const tier = winWindowTiers?.[roster.rosterId] ?? 'Middle'
  const isMyTeam = roster.rosterId === myRosterId
  const divergenceMeta = divergence ? DIVERGENCE_META[divergence] : null

  const totalPicks = roster.picks.length

  const pickCountByYear = {}
  years.forEach(yr => {
    pickCountByYear[yr] = roster.picks.filter(p => p.season === yr).length
  })

  // What the right-hand figure is, by sort mode — the number the list is
  // currently ordered by, so the ordering is always legible from the rows.
  const figure = sortMode === 'faab'
    ? { value: roster.faabRemaining, prefix: '$', label: `spent $${roster.faabSpent} of $${roster.faabBudget}` }
    : sortMode === 'picks'
      ? { count: totalPicks, label: totalPicks === 1 ? 'pick' : 'picks' }
      : sortMode === 'record'
        ? { text: formatRecord(roster.record), label: `${Math.round(roster.pointsFor).toLocaleString()} PF` }
        : { value: roster.totalValue, label: 'dynasty pts' }

  return (
    <button
      onClick={() => onTap(roster.rosterId)}
      className={cn(
        'w-full text-left py-3 border-b border-border-default focus-ring',
        'active:opacity-60 transition-opacity',
        // Red stays rationed to "you". A row, not a whole card, so the accent
        // is a left marker on the rank rather than a border around a box.
        isMyTeam && 'bg-brand/5',
      )}
    >
      <div className="flex items-baseline gap-2">
        {rank != null && (
          <span className={cn(
            'shrink-0 font-mono text-[11px] font-semibold tabular-nums leading-none w-5',
            isMyTeam ? 'text-brand-bright' : rankClass(rank),
          )}>
            {String(rank).padStart(2, '0')}
          </span>
        )}
        <TeamAvatar owner={roster.owner} size={20} />
        {/* Not truncated. The team name is the row's identity and the figure
            column beside it is variable-width, so a long name wraps. */}
        <span className="flex-1 min-w-0 font-body text-sm font-medium text-text-primary text-balance">
          {teamName}
        </span>
        {isMyTeam && <Badge tone="brand" className="shrink-0 self-center">You</Badge>}
        <span className="shrink-0 self-center text-right">
          {figure.text != null ? (
            <span className="font-mono text-base font-bold tabular-nums text-text-primary">
              {figure.text}
            </span>
          ) : figure.count != null ? (
            <span className="font-mono text-base font-bold tabular-nums text-text-primary">
              {figure.count}
            </span>
          ) : (
            <span className="whitespace-nowrap">
              {figure.prefix && (
                <span className="font-mono text-sm font-bold text-text-secondary">{figure.prefix}</span>
              )}
              <Magnitude
                value={figure.value > 0 ? figure.value : null}
                reference={sortMode === 'faab' ? roster.faabBudget : MAGNITUDE_TEAM_REFERENCE}
              />
            </span>
          )}
        </span>
      </div>

      <div className="mt-1 pl-7 flex items-center gap-2 flex-wrap">
        <span className={cn('font-mono text-[9px] font-semibold uppercase tracking-[0.14em]', TIER_TEXT[tier] ?? '')}>
          {tier}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-tertiary">
          {username ? `@${username}` : ''}
          {roster.hasRecord && `${username ? ' · ' : ''}${formatRecord(roster.record)}`}
          {figure.label && ` · ${figure.label}`}
        </span>
        {divergenceMeta && (
          <Mark tone={divergence === 'under' ? 'warning' : 'alt'}
                className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em]">
            {divergenceMeta.label}
          </Mark>
        )}
      </div>

      {/* The positional read only earns its line on the value sort — under a
          FAAB or record ordering it is answering a question nobody asked. */}
      {sortMode === 'value' && (
        <div className="mt-1.5 pl-7 flex items-center justify-between gap-3">
          <PositionalRead roster={roster} leagueAverages={leagueAverages} />
          <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-text-tertiary tabular-nums">
            {years.map(yr => `${pickCountByYear[yr]}`).join('/')} picks · ${roster.faabRemaining}
          </span>
        </div>
      )}
    </button>
  )
}
