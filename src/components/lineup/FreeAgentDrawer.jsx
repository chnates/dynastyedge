import { useMemo } from 'react'
import { Sheet, SheetHeader } from '../ui'

import { buildWaiverOptions } from '../../utils/freeAgents'
import { POS_TAG as POS_COLORS } from '../../utils/positionColors'

// Waiver options for one armed lineup slot, ranked by this week's Sleeper
// projection.
//
// This list used to be gated on FantasyCalc (`if (!fc) return null`), which
// silently emptied the DEF slot entirely: FantasyCalc ranks ZERO defenses
// (473 entries, RB/WR/QB/TE/PICK only — verified 2026-09-04), so the one row
// the Optimizer marks "Tap to fill" opened onto "No free agents with
// projections this week" while Sleeper was publishing projections for 14
// available defenses. Unranked players are now resolved from the shared player
// DB and show `—` for value, exactly as rule 7 requires everywhere else.
//
// The list itself is built by utils/freeAgents.js — pure, tested, and carrying
// the `TEAM_*` guard every defense-touching surface needs.
export default function FreeAgentDrawer({ slot, projMap, allRosters, fcPlayerMap, playerDB, onClose }) {
  const faList = useMemo(() => buildWaiverOptions({
    projMap,
    rosteredIds: new Set((allRosters ?? []).flatMap(r => r.players.map(p => p.sleeperId))),
    fcPlayerMap,
    playerDB,
    eligible: slot.eligible,
  }), [projMap, allRosters, fcPlayerMap, playerDB, slot])

  const slotLabel = slot.label
  const posLabel  = slot.eligible.join(' / ')
  const isDefSlot = slot.eligible.length === 1 && slot.eligible[0] === 'DEF'

  return (
    <Sheet onClose={onClose} surface="bg-bg-card" maxHeight="max-h-[75vh]" label={`${slotLabel} free agents`}>
      <SheetHeader
        eyebrow={`${slotLabel} Free Agents`}
        subtitle={`${posLabel} · sorted by projected pts`}
        onClose={onClose}
        closeLabel="Close"
      />

      <div className="px-4">
        {/* Say what this list is FOR. Streaming defenses on Sleeper's weekly
            projection was measured across 408 team-weeks (2023–25) and is
            worth −0.00 pts/wk — so this is "fill the slot", not an edge. */}
        {isDefSlot && (
          <p className="font-body text-[11px] text-text-tertiary leading-snug pt-1 pb-2">
            For filling an empty slot or covering a bye. Swapping defenses week to week
            on projection alone measured worth nothing over three seasons — if yours is
            playing, keep it.
          </p>
        )}

        {/* Column headers */}
        <div className="flex items-center gap-2 py-1.5 border-b border-border-default dark:border-border-default">
          <span className="w-7 shrink-0" />
          <span className="flex-1 font-body text-[10px] uppercase tracking-wide text-text-tertiary dark:text-text-tertiary">Player</span>
          <span className="font-body text-[10px] uppercase tracking-wide text-text-tertiary dark:text-text-tertiary shrink-0 w-8 text-right">Team</span>
          <span className="font-mono text-[10px] uppercase tracking-wide text-text-tertiary dark:text-text-tertiary shrink-0 w-14 text-right">Proj</span>
          <span className="font-mono text-[10px] uppercase tracking-wide text-text-tertiary dark:text-text-tertiary shrink-0 w-14 text-right">Value</span>
        </div>

        {/* FA list */}
        <div>
          {faList.length === 0 ? (
            <p className="text-text-tertiary dark:text-text-tertiary font-body text-sm py-6 text-center">
              No free agents with projections this week.
            </p>
          ) : (
            faList.map(fa => (
              <div
                key={fa.sleeperId}
                className="flex items-center gap-2 py-2.5 border-b border-border-default dark:border-border-default last:border-0"
              >
                {/* Position badge */}
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 font-body text-[9px] font-semibold uppercase tracking-wide w-7 text-center ${POS_COLORS[fa.position] ?? 'text-text-secondary'}`}>
                  {fa.position}
                </span>

                {/* Name */}
                <span className="flex-1 font-body font-medium text-sm text-text-primary dark:text-text-primary truncate min-w-0">
                  {fa.name}
                </span>

                {/* Team */}
                <span className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary shrink-0 w-8 text-right uppercase tracking-wide">
                  {fa.team}
                </span>

                {/* Projected pts */}
                <span className="font-mono text-sm font-semibold text-text-primary dark:text-text-primary shrink-0 w-14 text-right tabular-nums">
                  {fa.projPts > 0 ? fa.projPts.toFixed(1) : '—'}
                </span>

                {/* Dynasty value */}
                <span className="font-mono text-[11px] text-text-secondary dark:text-text-secondary shrink-0 w-14 text-right tabular-nums">
                  {fa.value > 0 ? fa.value.toLocaleString() : '—'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </Sheet>
  )
}
