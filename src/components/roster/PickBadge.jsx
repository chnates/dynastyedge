import { ROUND_CLASSES, ROUND_LABELS } from '../../utils/roundColors'

export default function PickBadge({ pick, originalTeamName }) {
  const cls   = ROUND_CLASSES[pick.round] ?? ROUND_CLASSES[4]
  const isOwn = pick.originalOwner === pick.currentOwner
  const label = ROUND_LABELS[pick.round] ?? `R${pick.round}`

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
