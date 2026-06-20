import { useMemo } from 'react'
import { Sheet, SheetHeader } from '../ui'

import { POS_TAG as POS_COLORS } from '../../utils/positionColors'

export default function FreeAgentDrawer({ slot, projMap, allRosters, fcPlayerMap, onClose }) {
  const faList = useMemo(() => {
    if (!projMap || !fcPlayerMap) return []

    const rosteredIds = new Set(
      (allRosters ?? []).flatMap(r => r.players.map(p => p.sleeperId))
    )

    return Object.entries(projMap)
      .filter(([id]) => !rosteredIds.has(id))
      .map(([id, proj]) => {
        const fc = fcPlayerMap[id]
        if (!fc) return null
        return {
          sleeperId: id,
          projPts: proj.pts_half_ppr ?? 0,
          name: fc.name,
          position: fc.position,
          team: fc.team,
          value: fc.value,
        }
      })
      .filter(fa => fa && fa.position && slot.eligible.includes(fa.position))
      .sort((a, b) => b.projPts - a.projPts)
      .slice(0, 25)
  }, [projMap, allRosters, fcPlayerMap, slot])

  const slotLabel = slot.label
  const posLabel  = slot.eligible.filter(p => p !== 'DEF').join(' / ')

  return (
    <Sheet onClose={onClose} surface="bg-bg-card" maxHeight="max-h-[75vh]" label={`${slotLabel} free agents`}>
      <SheetHeader
        eyebrow={`${slotLabel} Free Agents`}
        subtitle={`${posLabel} · sorted by projected pts`}
        onClose={onClose}
        closeLabel="Close"
      />

      <div className="px-4">
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
