import { TIER_BADGE } from '../../utils/tierColors'

export default function WinWindowBadge({ tier }) {
  const styles = TIER_BADGE[tier] ?? TIER_BADGE.Middle
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-body text-[10px] font-semibold uppercase tracking-wider border ${styles}`}>
      {tier ?? 'Middle'}
    </span>
  )
}
