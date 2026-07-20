import { TIER_BADGE } from '../../utils/tierColors'

export default function WinWindowBadge({ tier }) {
  const styles = TIER_BADGE[tier] ?? TIER_BADGE.Middle
  return (
    <span className={`inline-flex items-center rounded-none px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider border ${styles}`}>
      {tier ?? 'Middle'}
    </span>
  )
}
