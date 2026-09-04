import { useState } from 'react'
import { ArrowDown, ArrowUp, CheckCircle2, AlertTriangle, Wand2, RotateCcw, ChevronDown, Scale } from 'lucide-react'
import { Card, Button, Badge, cn } from '../ui'
import { POS_TEXT } from '../../utils/positionColors'
import { MIN_MEANINGFUL_GAIN } from '../../utils/lineupConfidence'

// THE answer to "what should I do this week?" — the summary the Optimizer
// never had. The headline is the number every comparable tool leads with:
// projected points sitting on your bench. Every move card below it carries its
// own gain, and those gains sum EXACTLY to the headline (see lineupMoves.js).

function MoveSide({ icon, verb, entry, tone }) {
  const player = entry?.player
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className={cn('shrink-0 flex items-center justify-center w-4', tone)}>{icon}</span>
      <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-text-tertiary w-7 shrink-0">
        {verb}
      </span>
      <span className={cn(
        'font-body text-sm font-medium truncate min-w-0',
        player ? 'text-text-primary' : 'text-text-tertiary italic',
      )}>
        {player?.name ?? 'nobody'}
      </span>
      {player && (
        <span className={cn('font-body text-[10px] font-semibold uppercase shrink-0', POS_TEXT[player.position] ?? 'text-text-tertiary')}>
          {player.position}
        </span>
      )}
      <span className="font-mono text-xs text-text-secondary shrink-0 ml-auto tabular-nums">
        {entry ? entry.effPts.toFixed(1) : '—'}
      </span>
    </div>
  )
}

// One move card. The confidence line is the point of this whole feature: a
// "+2.3" presented alone reads as certain, and it is not — the measured curve
// says a 2-point edge is right 61% of the time (utils/lineupConfidence.js).
function MoveCard({ move: m }) {
  return (
    <Card cut accent={m.mustFix ? 'bg-danger' : 'bg-warning'} padding="p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <Badge tone={m.mustFix ? 'danger' : 'warning'} soft>
          {m.mustFix ? 'Must fix' : 'Upgrade'}
        </Badge>
        <span className={cn(
          'font-mono text-sm font-semibold tabular-nums',
          m.gain > 0 ? 'text-success' : 'text-text-tertiary',
        )}>
          {m.gain > 0 ? '+' : ''}{m.gain.toFixed(1)}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <MoveSide icon={<ArrowDown size={13} strokeWidth={2.5} />} verb="Sit" entry={m.out} tone="text-danger" />
        <MoveSide icon={<ArrowUp size={13} strokeWidth={2.5} />} verb="Start" entry={m.in} tone="text-success" />
      </div>

      {m.confidence != null && (
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-accent mt-2">
          {m.confidence.toFixed(0)}% likely to be the right call
        </p>
      )}

      <p className="font-body text-[11px] text-text-secondary leading-snug mt-2">
        {m.reason}
        {!m.direct && (
          <span className="text-text-tertiary">
            {' '}· part of a multi-player reshuffle — apply the moves to see the full lineup.
          </span>
        )}
      </p>
    </Card>
  )
}

export default function LineupMovesCard({
  week, currentTotal, optimalTotal, pointsLeft, moves,
  mustFixCount, upgradeCount, coinFlipCount = 0, dirty, onApplyAll, onReset,
}) {
  const optimal = moves.length === 0
  const [showCoinFlips, setShowCoinFlips] = useState(false)

  // Sub-1-point swaps are 52/48 (lineupConfidence.js), so they are demoted out
  // of the move list rather than presented as things to do. They are NOT
  // dropped: the headline is optimal − current, and hiding a move outright
  // would leave points in that number with nothing on screen explaining them.
  const listed = moves.filter(m => m.meaningful)
  const coinFlips = moves.filter(m => !m.meaningful)

  return (
    <>
      {/* ── Hero: the one loud moment on this screen ── */}
      <div className="mt-4">
        <div className="bug-red flex items-center justify-between gap-2 px-3 py-1.5">
          <span className="font-display text-[12px] uppercase tracking-[0.1em] leading-none truncate">
            Week {week} · Start / Sit
          </span>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] leading-none shrink-0">
            {dirty ? 'Edited' : 'Live'}
          </span>
        </div>

        <div className="hero-card border-t-0 px-4 pt-3 pb-3.5">
          {optimal ? (
            <div className="flex items-center gap-2.5">
              <CheckCircle2 size={26} strokeWidth={1.75} className="text-success shrink-0" />
              <div className="min-w-0">
                <p className="font-body text-sm font-semibold text-white leading-snug">
                  Lineup is optimal — no changes needed.
                </p>
                <p className="font-body text-xs text-white/60 leading-snug mt-0.5">
                  Nothing on your bench outprojects a starter.
                </p>
              </div>
              <span className="ml-auto text-right shrink-0">
                <span className="block font-mono text-2xl font-medium tabular-nums text-white leading-none">
                  {currentTotal.toFixed(1)}
                </span>
                <span className="block font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-white/50 mt-1.5">
                  Projected
                </span>
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <span className="flex items-baseline gap-1.5">
                    <span className="font-mono text-4xl font-medium tabular-nums text-white leading-none">
                      {pointsLeft.toFixed(1)}
                    </span>
                    <span className="font-body text-sm text-white/60">pts</span>
                  </span>
                  <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-white/50 mt-2">
                    Sitting on your bench
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-mono text-sm tabular-nums text-white/55 leading-none">
                    {currentTotal.toFixed(1)}
                  </span>
                  <span className="font-body text-white/35 mx-1">→</span>
                  <span className="font-mono text-lg font-semibold tabular-nums text-white leading-none">
                    {optimalTotal.toFixed(1)}
                  </span>
                  <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-white/50 mt-2">
                    Now → Optimal
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/10">
                {mustFixCount > 0 && (
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle size={13} strokeWidth={2.25} className="text-danger shrink-0" />
                    <span className="font-body text-xs text-white/80">
                      {mustFixCount} must fix
                    </span>
                  </span>
                )}
                {upgradeCount > 0 && (
                  <span className="flex items-center gap-1.5">
                    <ArrowUp size={13} strokeWidth={2.5} className="text-warning shrink-0" />
                    <span className="font-body text-xs text-white/80">
                      {upgradeCount} upgrade{upgradeCount > 1 ? 's' : ''}
                    </span>
                  </span>
                )}
                {coinFlipCount > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Scale size={13} strokeWidth={2.25} className="text-white/45 shrink-0" />
                    <span className="font-body text-xs text-white/60">
                      {coinFlipCount} coin flip{coinFlipCount > 1 ? 's' : ''}
                    </span>
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Actions ── */}
      {(moves.length > 0 || dirty) && (
        <div className="flex gap-2 mt-2">
          {moves.length > 0 && (
            <Button
              variant="primary"
              size="sm"
              fullWidth
              icon={<Wand2 size={14} strokeWidth={2.25} />}
              onClick={onApplyAll}
            >
              Apply {moves.length} move{moves.length > 1 ? 's' : ''}
            </Button>
          )}
          {dirty && (
            <Button
              variant="secondary"
              size="sm"
              fullWidth={moves.length === 0}
              icon={<RotateCcw size={14} strokeWidth={2.25} />}
              onClick={onReset}
            >
              Reset
            </Button>
          )}
        </div>
      )}

      {/* Sleeper's API is read-only — we can never write a lineup back, and
          pretending otherwise would be the worst possible failure here. */}
      {dirty && (
        <p className="font-body text-[11px] text-text-tertiary leading-snug mt-2">
          This is a local preview — Sleeper's API is read-only, so set the final
          lineup in the Sleeper app.
        </p>
      )}

      {/* ── The move list ── */}
      {listed.length > 0 && (
        <div className="flex flex-col gap-2 mt-3">
          {listed.map(m => <MoveCard key={m.key} move={m} />)}
        </div>
      )}

      {/* Demoted: swaps inside the noise. Collapsed by default, never hidden —
          they still count toward the headline above. */}
      {coinFlips.length > 0 && (
        <div className="mt-3">
          <Button
            variant="ghost"
            size="sm"
            fullWidth
            icon={
              <ChevronDown
                size={14}
                strokeWidth={2.25}
                className={cn('transition-transform', showCoinFlips && 'rotate-180')}
              />
            }
            iconRight
            onClick={() => setShowCoinFlips(v => !v)}
          >
            {coinFlips.length} swap{coinFlips.length > 1 ? 's' : ''} with no meaningful edge
          </Button>
          <p className="font-body text-[11px] text-text-tertiary leading-snug mt-1.5">
            Under {MIN_MEANINGFUL_GAIN} projected point. Across 124,433 measured pairs the
            higher-projected player won only 52% of the time at this gap — a coin flip, so
            these are not presented as moves.
          </p>
          {showCoinFlips && (
            <div className="flex flex-col gap-2 mt-2 opacity-75">
              {coinFlips.map(m => <MoveCard key={m.key} move={m} />)}
            </div>
          )}
        </div>
      )}

    </>
  )
}
