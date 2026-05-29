const TIER_STYLES = {
  Contending: 'text-warning bg-warning/10 border-warning/30',
  Middle:     'text-text-tertiary bg-bg-card border-border-default dark:border-border-default',
  Rebuilding: 'text-text-secondary bg-bg-secondary border-border-default dark:border-border-default',
}

export default function WinWindowBadge({ tier }) {
  const styles = TIER_STYLES[tier] ?? TIER_STYLES.Middle
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-body text-[10px] font-semibold uppercase tracking-wider border ${styles}`}>
      {tier ?? 'Middle'}
    </span>
  )
}
