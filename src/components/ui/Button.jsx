import { cn } from './cn'

// THE button — never hand-roll `bg-accent text-white rounded-xl ...` inline.
// Variants encode the app's established button idioms (see CLAUDE.md → Design
// System): the solid accent CTA, the bordered secondary, the accent-tinted
// footer/link button, a quiet ghost, and the danger action.
//
//   <Button onClick={...}>Retry</Button>                  // primary, md
//   <Button variant="secondary" fullWidth>View</Button>
//   <Button variant="tinted" size="sm" icon={<X/>}>Clear</Button>
//   <Button as="a" href={url} target="_blank">Open</Button>
//
// Class strings are kept literal (no runtime interpolation of color names) so
// Tailwind's content scan always picks them up.

const VARIANTS = {
  primary:   'bg-accent text-white',
  secondary: 'border border-border-default text-text-primary',
  tinted:    'border border-accent/25 bg-accent/5 text-accent',
  ghost:     'text-text-secondary hover:text-text-primary',
  danger:    'bg-danger text-white',
}

const SIZES = {
  sm: 'text-xs px-3 py-1.5 rounded-lg',
  md: 'text-sm px-4 py-2 rounded-lg',
  lg: 'text-sm px-4 py-3 rounded-xl',
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
    'inline-flex items-center justify-center gap-2 font-body font-semibold whitespace-nowrap',
    'transition-opacity active:opacity-80 disabled:opacity-50 disabled:pointer-events-none',
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
