const DARK_STYLES = {
  1: { bg: '#3D2E00', text: '#F59E0B' },
  2: { bg: '#0C2A4A', text: '#60A5FA' },
  3: { bg: '#2A1A4A', text: '#A78BFA' },
  4: { bg: '#1F1F25', text: '#9CA3AF' },
}

const LIGHT_STYLES = {
  1: { bg: '#FEF3C7', text: '#92400E' },
  2: { bg: '#DBEAFE', text: '#1E40AF' },
  3: { bg: '#EDE9FE', text: '#5B21B6' },
  4: { bg: '#F3F4F6', text: '#374151' },
}

const ROUND_LABEL = ['', '1st', '2nd', '3rd', '4th']

export default function PickBadge({ pick, originalTeamName, isDark = true }) {
  const styles = isDark
    ? (DARK_STYLES[pick.round] ?? DARK_STYLES[4])
    : (LIGHT_STYLES[pick.round] ?? LIGHT_STYLES[4])

  const isOwn = pick.originalOwner === pick.currentOwner
  const label = ROUND_LABEL[pick.round] ?? `R${pick.round}`

  return (
    <div
      className="inline-flex flex-col items-center rounded-lg px-2.5 py-1.5 shrink-0"
      style={{ backgroundColor: styles.bg }}
    >
      <span
        className="text-[11px] font-body font-bold leading-tight"
        style={{ color: styles.text }}
      >
        {label}
      </span>
      {!isOwn && originalTeamName && (
        <span
          className="text-[9px] font-body leading-tight mt-0.5 opacity-80"
          style={{ color: styles.text }}
        >
          via {originalTeamName}
        </span>
      )}
    </div>
  )
}
