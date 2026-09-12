import { cn } from './cn'

// THE button — never hand-roll `bg-accent text-bg-primary ...` inline.
//
//   <Button onClick={...}>Retry</Button>                  // primary, md
//   <Button variant="secondary" fullWidth>View</Button>
//   <Button variant="tinted" size="sm" icon={<X/>}>Clear</Button>
//   <Button as="a" href={url} target="_blank">Open</Button>
//
// MATCHDAY'S BUTTON IS SET IN MONO, UPPERCASE AND TRACKED, not in body text.
// That is the mock's `.cta` and it is the same voice as every other small label
// in the app — the eyebrows, the chips, the band meta. Under the old system the
// button was the only small control set in the body face, which is why a CTA
// and a paragraph read at the same pitch.
//
// `primary` is the INK FIELD: the same solid block as the hero poster, the
// section band and the tab bar, so "the thing to press" is made of the same
// material as "the thing that matters". `tinted` (the footer/link idiom) drops
// its 5% wash for a rule — Matchday separates with lines, not fills.
//
// Labels WRAP rather than overflow. The old `whitespace-nowrap` did not stop a
// long label ("Planning a pick swap? Open the Pick Trade Calculator") from
// running past the viewport at 390px; it only stopped it from wrapping
// gracefully. `text-balance` splits it evenly instead.
//
// Class strings are kept literal (no runtime interpolation of color names) so
// Tailwind's content scan always picks them up.

const VARIANTS = {
  primary:   'bg-text-primary text-bg-primary',
  secondary: 'border border-border-strong text-text-primary',
  tinted:    'border border-accent/40 text-text-primary',
  ghost:     'text-text-secondary hover:text-text-primary',
  danger:    'bg-danger text-bg-primary',
}

// Square corners. `sm` and `md` render under the 44px touch minimum;
// `tap-target` (index.css) grows the HIT area to 44px without moving the ink,
// so the density these sizes exist for survives. `lg` already clears it and
// carries the class only so every button shares one behaviour.
const SIZES = {
  sm: 'text-[9.5px] tracking-[0.14em] px-3 py-2 rounded-none',
  md: 'text-[10.5px] tracking-[0.13em] px-4 py-2.5 rounded-none',
  lg: 'text-[11px] tracking-[0.12em] px-4 py-3.5 rounded-none',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  icon = null,
  iconRight = false,
  as,
  className,
  children,
  ...rest
}) {
  const Tag = as ?? (rest.href ? 'a' : 'button')
  const classes = cn(
    'inline-flex items-center justify-center gap-2 text-balance text-center',
    'font-mono font-semibold uppercase leading-none',
    'press disabled:opacity-50 disabled:pointer-events-none',
    'tap-target focus-ring',
    VARIANTS[variant] ?? VARIANTS.primary,
    SIZES[size] ?? SIZES.md,
    fullWidth && 'w-full',
    className,
  )
  return (
    <Tag className={classes} {...rest}>
      {icon && !iconRight && icon}
      {children}
      {icon && iconRight && icon}
    </Tag>
  )
}
