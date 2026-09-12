import { ROUND_CLASSES, ROUND_LABELS } from '../../utils/roundColors'

export default function PickBadge({ pick, originalTeamName }) {
  const cls   = ROUND_CLASSES[pick.round] ?? ROUND_CLASSES[4]
  const isOwn = pick.originalOwner === pick.currentOwner
  // Show the exact slot ("1.09") once the draft order is known; otherwise the
  // round label ("1st").
  const label = pick.slotLabel ?? ROUND_LABELS[pick.round] ?? `R${pick.round}`

  return (
    <div className={`inline-flex flex-col items-center px-2.5 py-1.5 shrink-0 ${cls}`}>
      <span className="font-mono text-[11px] font-bold uppercase tracking-[0.06em] leading-tight tabular-nums">
        {label}
      </span>
      {!isOwn && originalTeamName && (
        <span className="text-[9px] font-body leading-tight mt-0.5 opacity-80">
          via {originalTeamName}
        </span>
      )}
    </div>
  )
}
