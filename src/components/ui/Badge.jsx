import { cn } from './cn'

// THE small status/label badge — the solid "New"/"You" accent badges, plus
// tinted tone variants (success/warning/danger/accent) and a neutral outline.
// For win-window tiers use the dedicated WinWindowBadge; for position tags use
// POS_TAG. This covers everything else.
//
//   <Badge>New</Badge>                       // solid accent, white text
//   <Badge tone="success" soft>Hit</Badge>   // tinted fill
//   <Badge tone="neutral" soft>NFL</Badge>

const SOLID = {
  // Solid silver carries near-black text (silver score-bug rule). `brand` is
  // the rationed Falcons red — reserved for "you" treatments (You-chip).
  accent:  'bg-accent text-bg-primary',
  brand:   'bg-brand text-white',
  success: 'bg-success text-white',
  warning: 'bg-warning text-white',
  danger:  'bg-danger text-white',
}

const SOFT = {
  accent:  'bg-accent/15 text-accent',
  brand:   'bg-brand/15 text-brand-bright',
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
        'inline-flex items-center shrink-0 font-mono text-[9px] font-semibold uppercase tracking-wider px-1 py-0.5',
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
