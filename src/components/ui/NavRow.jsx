import { Link } from 'react-router-dom'
import { cn } from './cn'

// THE DOOR — a row that takes you somewhere, in Matchday's text-only idiom.
//
// It is the third thing a block on a screen can be, after RuledList (many
// things you scan) and Lede (one thing you act on): a way OUT of this screen.
// The Index (`/index`) established the shape in step 2 — display title, a small
// detail line, an optional mono hint, a hairline, and NO ICON — and step 4
// extracts it so the roster shortcuts and The Edge's analysis shortcut stop
// being `Card`s with a lucide medallion and a chevron.
//
// Those medallions are two slop markers at once ("lucide icons throughout" and
// "identical cards in the icon + title + one-line-description pattern",
// slop-checklist.md -> Components), and a chevron pointing right is the least
// informative pixel on a row whose whole job is already "tap me". What replaces
// them is the title set in display type — the same thing the Index does.
//
//   <NavRow to="/my-team/trajectory" title="Dynasty Trajectory"
//           detail="Where your value is headed · when your window peaks" />
//   <NavRow onClick={open} title="Roster Analysis" detail="Age curve · win window" />
//
// `to` renders a <Link>, `onClick` a <button>; exactly one is expected.

export default function NavRow({
  to = null,
  onClick = null,
  title,
  detail = null,
  hint = null,
  size = 'md',
  className,
  ...rest
}) {
  const Tag = to ? Link : 'button'
  const tagProps = to ? { to } : { type: 'button', onClick: onClick ?? undefined }
  return (
    <Tag
      {...tagProps}
      className={cn(
        'focus-ring flex w-full items-baseline gap-3 py-4 text-left border-b border-border-default',
        'hover:bg-bg-secondary active:opacity-60 transition-colors',
        className,
      )}
      style={{ touchAction: 'manipulation' }}
      {...rest}
    >
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block font-display font-extrabold uppercase tracking-[-0.03em]',
            'text-text-primary leading-none text-balance',
            size === 'sm' ? 'text-lg' : 'text-xl',
          )}
        >
          {title}
        </span>
        {detail && (
          <span className="block font-body text-[12px] text-text-tertiary mt-1.5 leading-snug">
            {detail}
          </span>
        )}
      </span>
      {hint && (
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-text-tertiary">
          {hint}
        </span>
      )}
    </Tag>
  )
}
