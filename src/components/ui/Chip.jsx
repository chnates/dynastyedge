import { cn } from './cn'

// THE filter chip — the QB/RB/WR/TE/All/Picks toggle repeated across Free
// Agents, Movers, the trade builder, What's Fair, League Overview, News, etc.
// Inactive chips are quiet; active chips default to the solid ink style.
// For position-colored active states, pass `activeClass={POS_CHIP_ACTIVE[pos]}`
// (the tinted identity treatment) — All/Picks keep the default.
//
//   <Chip active={pos === 'QB'} activeClass={POS_CHIP_ACTIVE.QB}
//         onClick={() => setPos('QB')}>QB</Chip>

export default function Chip({
  active = false,
  // The active chip is the ink field — the same block as the band, the CTA and
  // the tab bar, so "selected" reads as one material app-wide.
  activeClass = 'bg-text-primary text-bg-primary border border-transparent',
  size = 'md',
  className,
  children,
  ...rest
}) {
  const sizeClass = size === 'sm'
    ? 'text-[9.5px] px-2.5 py-1.5'
    : 'text-[10.5px] px-3 py-2'
  return (
    <button
      className={cn(
        // No `tap-target` here on purpose: chips sit ~8px apart in a scrolling
        // filter row, so a 44px hit area on a 40px chip would let neighbours
        // steal each other's taps. See the note in index.css.
        'shrink-0 rounded-none font-mono font-semibold uppercase tracking-[0.12em] whitespace-nowrap transition-colors',
        'focus-ring',
        sizeClass,
        active
          ? activeClass
          : 'border border-border-default text-text-secondary hover:text-text-primary',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
