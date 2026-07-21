import { ROUND_CLASSES, ROUND_LABELS } from '../../utils/roundColors'

export default function PickBadge({ pick, originalTeamName }) {
  const cls   = ROUND_CLASSES[pick.round] ?? ROUND_CLASSES[4]
  const isOwn = pick.originalOwner === pick.currentOwner
  // Show the exact slot ("1.09") once the draft order is known; otherwise the
  // round label ("1st").
  const label = pick.slotLabel ?? ROUND_LABELS[pick.round] ?? `R${pick.round}`

  return (
    <div className={`inline-flex flex-col items-center rounded-lg px-2.5 py-1.5 shrink-0 ${cls}`}>
      <span className="text-[11px] font-body font-bold leading-tight">
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
