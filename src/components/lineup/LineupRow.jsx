import { ArrowLeftRight, X, Check } from 'lucide-react'
import { IconButton, Badge, cn } from '../ui'
import { POS_TEXT } from '../../utils/positionColors'

// THE lineup row — one component for both starters and bench, so a player
// reads identically wherever he sits and a swap target looks the same on
// either side of the line.
//
// Interaction (settled with the owner): tapping the row BODY opens the player
// profile, like every other player row in the app. The ⇄ handle arms a swap;
// while a swap is armed the whole row becomes the target hit-area, because a
// 24px handle is not a mobile tap target for the action you're mid-way through.

// Only the two ends of the scale are worth a pill — a column of "Neutral"
// badges is noise, and Week 1 has nothing but Neutral (see LineupOptimizer).
const MATCHUP_TONE = {
  Easy:  'success',
  Tough: 'danger',
}

const AVAIL_TONE = {
  bye:          'danger',
  ir:           'danger',
  out:          'danger',
  questionable: 'warning',
}

export default function LineupRow({
  lead,               // slot label ('FLEX') or position ('WR')
  leadIsSlot = false, // slot labels colour FLEX/SFLX with the accent
  entry,              // { player, projPts, effPts, availability } | null
  matchupQuality,     // 'Easy' | 'Neutral' | 'Tough' | null (null ⇒ hide)
  state = 'idle',     // 'idle' | 'armed' | 'target' | 'muted'
  isOptimal = true,
  onOpenProfile,
  onArm,
  onSelectTarget,
  onCancel,
}) {
  const player  = entry?.player
  const avail   = entry?.availability
  const blocked = avail?.blocked
  const isTarget = state === 'target'
  const isArmed  = state === 'armed'

  const leadColor = leadIsSlot && (lead === 'FLEX' || lead === 'SFLX' || lead === 'DEF')
    ? 'text-accent'
    : POS_TEXT[String(lead ?? '').replace(/[0-9]/g, '')] ?? 'text-accent'

  const bodyAction = isTarget
    ? onSelectTarget
    : (player ? onOpenProfile : onArm)

  return (
    <div
      className={cn(
        'flex items-center gap-1 border-b border-border-default last:border-0 transition-colors',
        isTarget && 'bg-accent/10',
        isArmed  && 'bg-brand/10',
        state === 'muted' && 'opacity-35',
        blocked && state === 'idle' && 'bg-danger/5',
      )}
    >
      <button
        type="button"
        onClick={bodyAction}
        disabled={state === 'muted' || (!player && !isTarget && !onArm)}
        className="flex-1 flex items-center gap-2 py-2.5 min-w-0 text-left active:opacity-70 disabled:active:opacity-100"
      >
        {/* Slot / position lead */}
        <span className={cn('shrink-0 w-10 font-body text-[10px] font-semibold uppercase tracking-wider', leadColor)}>
          {lead}
        </span>

        {/* Name + status */}
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5">
            <span className={cn(
              'font-body font-medium text-sm truncate',
              player ? 'text-text-primary' : 'text-text-tertiary italic',
            )}>
              {player?.name ?? 'Empty slot'}
            </span>
            {avail?.short && (
              <Badge tone={AVAIL_TONE[avail.status] ?? 'neutral'} soft title={avail.label}>{avail.short}</Badge>
            )}
          </span>
          {isArmed && (
            <span className="block font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-brand-bright mt-0.5">
              Swapping — pick a replacement
            </span>
          )}
          {isTarget && (
            <span className="block font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-accent mt-0.5">
              Tap to swap in
            </span>
          )}
          {!player && state === 'idle' && (
            <span className="block font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-danger mt-0.5">
              Tap to fill
            </span>
          )}
        </span>

        {/* NFL team */}
        <span className="font-body text-[11px] text-text-tertiary shrink-0 w-8 text-right uppercase tracking-wide">
          {player?.team ?? ''}
        </span>

        {/* Projection — a blocked player shows 0.0, not the projection Sleeper
            still carries for him, because 0 is what he will actually score. */}
        <span className={cn(
          'font-mono text-sm font-semibold shrink-0 w-10 text-right tabular-nums',
          blocked ? 'text-text-tertiary' : 'text-text-primary',
        )}>
          {player ? (entry.effPts > 0 ? entry.effPts.toFixed(1) : '0.0') : '—'}
        </span>

        {/* Matchup — hidden entirely when rankings don't exist yet (Week 1) */}
        {matchupQuality && MATCHUP_TONE[matchupQuality] && (
          <Badge tone={MATCHUP_TONE[matchupQuality]} soft pill title={`${matchupQuality} matchup`}>
            {matchupQuality}
          </Badge>
        )}

        {/* Optimal tick */}
        <span className="shrink-0 w-4 flex items-center justify-center">
          {isOptimal && !blocked && player && (
            <Check size={13} strokeWidth={2.5} className="text-success/70" aria-label="Optimal" />
          )}
        </span>
      </button>

      {/* Swap handle */}
      <span className="shrink-0 pr-1">
        {isArmed ? (
          <IconButton size="sm" label="Cancel swap" onClick={onCancel}>
            <X size={15} strokeWidth={2.25} className="text-brand-bright" />
          </IconButton>
        ) : state === 'idle' && player ? (
          <IconButton size="sm" label={`Swap ${player.name}`} onClick={onArm}>
            <ArrowLeftRight size={15} strokeWidth={2} className="text-text-tertiary" />
          </IconButton>
        ) : (
          <span className="block w-8" />
        )}
      </span>
    </div>
  )
}
