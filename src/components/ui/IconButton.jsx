import { cn } from './cn'

// THE icon-only button — the close/affordance control repeated in every sheet
// and drawer header (`w-9 h-9 rounded-lg ... hover:bg-black/5 dark:hover:bg-white/5`).
// Always pass `label` for accessibility (becomes aria-label).
//
//   <IconButton label="Close" onClick={onClose}><X size={18} /></IconButton>

// `md` is the close control in every sheet and drawer header, where there is
// room, so it is a REAL 44px box rather than a faked hit area. `sm` exists for
// the one place there isn't room — the swap handle inline in a LineupRow — so
// it keeps a 36px box and borrows `tap-target`'s 44px hit area instead.
const SIZES = {
  sm: 'w-9 h-9',
  md: 'w-11 h-11',
}

export default function IconButton({ label, size = 'md', className, children, ...rest }) {
  return (
    <button
      aria-label={label}
      className={cn(
        // Square: radius is for sheets, modals and the drawer, never for a
        // control on a panel.
        'flex-shrink-0 flex items-center justify-center rounded-none',
        'text-text-secondary hover:text-text-primary',
        'hover:bg-bg-secondary transition-colors',
        'tap-target focus-ring',
        SIZES[size] ?? SIZES.md,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
