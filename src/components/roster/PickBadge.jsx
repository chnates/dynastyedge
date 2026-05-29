// Round colors per CLAUDE.md design system.
// Light: Tailwind palette equivalents. Dark: arbitrary values matching spec.
const ROUND_CLASSES = {
  1: 'bg-amber-100  dark:bg-[#3D2E00] text-amber-800  dark:text-amber-500',
  2: 'bg-blue-100   dark:bg-[#0C2A4A] text-blue-800   dark:text-blue-400',
  3: 'bg-violet-100 dark:bg-[#2A1A4A] text-violet-800 dark:text-violet-400',
  4: 'bg-gray-100   dark:bg-[#1F1F25] text-gray-700   dark:text-gray-400',
}

const ROUND_LABEL = ['', '1st', '2nd', '3rd', '4th']

export default function PickBadge({ pick, originalTeamName }) {
  const cls   = ROUND_CLASSES[pick.round] ?? ROUND_CLASSES[4]
  const isOwn = pick.originalOwner === pick.currentOwner
  const label = ROUND_LABEL[pick.round] ?? `R${pick.round}`

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
