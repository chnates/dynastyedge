import { cn } from './cn'

// THE small status/label badge — the solid "New"/"You" badges, plus tinted tone
// variants and a neutral outline. For win-window tiers use WinWindowBadge; for
// position tags use POS_TAG; for an emphasis inside a sentence use <Mark>.
//
//   <Badge>New</Badge>                       // solid ink
//   <Badge tone="success" soft>Hit</Badge>   // tinted fill
//   <Badge tone="neutral" soft>NFL</Badge>
//
// `accent` is the INK field — under Matchday the structural colour is ink, not
// a metal, so a "New" badge is the same block as the band and the CTA.
// `brand` stays the rationed crimson, reserved for "you" treatments.
//
// `pill` is retained for callers that still pass it, but square is the default
// and the direction: `rounded-full` on every small label is a named marker.

const SOLID = {
  accent:  'bg-text-primary text-bg-primary',
  brand:   'bg-brand text-white',
  alt:     'bg-alt text-bg-primary',
  success: 'bg-success text-bg-primary',
  warning: 'bg-warning text-bg-primary',
  danger:  'bg-danger text-bg-primary',
}

const SOFT = {
  accent:  'bg-accent/15 text-text-primary',
  brand:   'bg-brand/15 text-brand-bright',
  alt:     'bg-alt/15 text-alt',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger:  'bg-danger/15 text-danger',
  neutral: 'bg-text-tertiary/15 text-text-secondary',
}

export default function Badge({ tone = 'accent', soft = false, pill = false, className, children, ...rest }) {
  const palette = soft ? (SOFT[tone] ?? SOFT.accent) : (SOLID[tone] ?? SOLID.accent)
  return (
    <span
      className={cn(
        'inline-flex items-center shrink-0 font-mono text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5',
        pill ? 'rounded-full' : 'rounded-none',
        palette,
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  )
}
