import { cn } from './cn'

// THE filter chip — the QB/RB/WR/TE/All/Picks toggle pill repeated across Free
// Agents, Movers, the trade builder, What's Fair, League Overview, News, etc.
// Inactive chips are quiet; active chips default to the solid accent style.
// For position-colored active states, pass `activeClass={POS_CHIP_ACTIVE[pos]}`
// (the tinted identity treatment) — All/Picks keep the default accent.
//
//   <Chip active={pos === 'QB'} activeClass={POS_CHIP_ACTIVE.QB}
//         onClick={() => setPos('QB')}>QB</Chip>

export default function Chip({
  active = false,
  // Solid silver active state carries near-black text (silver score-bug rule).
  activeClass = 'bg-accent text-bg-primary border border-transparent',
  size = 'md',
  className,
  children,
  ...rest
}) {
  const sizeClass = size === 'sm'
    ? 'text-[10px] px-2.5 py-1'
    : 'text-[11px] px-3 py-1.5'
  return (
    <button
      className={cn(
        'shrink-0 rounded-none font-mono font-medium uppercase tracking-wider whitespace-nowrap transition-colors',
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
