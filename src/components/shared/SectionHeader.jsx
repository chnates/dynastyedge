// Silver lower-third "score-bug" header (Primetime Blackout). The bug itself
// is ALWAYS silver — structure never takes an identity color — and carries
// near-black text via .bug-silver. Identity overrides (accentBar=POS_BG[pos])
// color the small trailing slash instead, keeping position headers
// recognizable without breaking the silver-structure law. Pass
// accentBar={null} for a bare muted label (quiet contexts); accentText only
// applies to that bare form.
export const BRAND_TICK = 'bg-accent'

export default function SectionHeader({ label, count, accentBar = BRAND_TICK, accentText }) {
  return (
    <div className="flex items-center justify-between pt-4 pb-1.5">
      {accentBar ? (
        <span className="flex items-center gap-[5px]">
          <span className="lower-third bug-silver font-display text-[11px] tracking-[0.1em] uppercase leading-none pl-2 pr-3.5 py-[5px]">
            {label}
          </span>
          <span
            className={`block w-1.5 h-[15px] -skew-x-[20deg] ${accentBar === BRAND_TICK ? 'bg-accent' : accentBar}`}
            aria-hidden="true"
          />
        </span>
      ) : (
        <span className={`font-display text-[11px] uppercase tracking-[0.1em] ${accentText ?? 'text-text-secondary dark:text-text-secondary'}`}>
          {label}
        </span>
      )}
      {count != null && (
        <span className="font-mono text-[11px] text-text-tertiary dark:text-text-tertiary">
          {count}
        </span>
      )}
    </div>
  )
}
