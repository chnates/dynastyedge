import { cn } from './cn'

// THE icon-only button — the close/affordance control repeated in every sheet
// and drawer header (`w-9 h-9 rounded-lg ... hover:bg-black/5 dark:hover:bg-white/5`).
// Always pass `label` for accessibility (becomes aria-label).
//
//   <IconButton label="Close" onClick={onClose}><X size={18} /></IconButton>

const SIZES = {
  sm: 'w-8 h-8',
  md: 'w-9 h-9',
}

export default function IconButton({ label, size = 'md', className, children, ...rest }) {
  return (
    <button
      aria-label={label}
      className={cn(
        'flex-shrink-0 flex items-center justify-center rounded-lg',
        'text-text-secondary hover:text-text-primary',
        'hover:bg-black/5 dark:hover:bg-white/5 transition-colors',
        SIZES[size] ?? SIZES.md,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
