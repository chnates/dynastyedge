// Brand-gradient tick — the default accent bar on every section header.
// Pass accentBar={null} to render a bare header, or a color class (e.g.
// POS_BG[pos]) to override the identity color.
export const BRAND_TICK = 'bg-gradient-to-b from-accent to-pos-def'

export default function SectionHeader({ label, count, accentBar = BRAND_TICK, accentText }) {
  return (
    <div className="flex items-center justify-between pt-4 pb-1.5">
      <span className="flex items-center gap-1.5">
        {accentBar && (
          <span className={`block w-1 h-3 rounded-full ${accentBar}`} />
        )}
        <span className={`font-body text-[11px] font-semibold uppercase tracking-[0.08em] ${accentText ?? 'text-text-secondary dark:text-text-secondary'}`}>
          {label}
        </span>
      </span>
      {count != null && (
        <span className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary">
          {count}
        </span>
      )}
    </div>
  )
}
