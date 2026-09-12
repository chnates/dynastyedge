import { Link, useLocation } from 'react-router-dom'
import { WEEKLY_SECTIONS, INDEX_ROUTE, INDEX_LABEL, activeTabFor } from '../../navigation'
import { cn } from '../ui'

// THE app's primary navigation — a bottom tab bar, replacing the side drawer.
//
// Why it exists: the drawer hid all 21 destinations behind a top-left tap on a
// one-handed 390px phone, and NN/g measures hidden navigation at a 20%+
// discoverability drop, used in 57% of cases against 86%, and 15% slower on
// mobile. Four weekly sections plus the Index fit the 2–5 visible tabs Apple's
// HIG and the iOS 26 tab bar assume.
//
// Matchday's house rule is that navigation is TEXT — no icon set anywhere — so
// there are no glyphs here by design and the label does all the work. The bar
// is an INK FIELD — the same material as the hero poster, the section band, the
// active chip and the CTA — and it inverts with the theme by construction
// (`bg-text-primary` / `text-bg-primary`): a cream slab in dark, an ink one in
// light. That is the mock's masthead-strip treatment and it is what the owner
// chose when asked (2026-09-11): inverted in BOTH themes rather than sitting on
// the page ground at night. It carries no top border — the inversion is the
// separation, and a hairline in the page's border colour would read as grime on
// the cream edge.
//
// Active state is computed from the route family (`activeTabFor`), not from
// NavLink's own matching, because Draft and News have no tab of their own — they
// live under Index, which is how you reach them, so Index reads as current
// while you are in one.
//
// LAYOUT CONTRACT (CLAUDE.md rule 15, failure-archaeology §2b/§2d): this bar is
// fixed at `bottom: 0` and carries the home-indicator inset as its OWN bottom
// padding. `<main>` must keep `bottom: 0` and reserve the room as
// `paddingBottom` INSIDE its scroll container — never as a bottom offset, which
// re-creates the dead bar above the home indicator that was fixed twice.
export const TAB_BAR_HEIGHT = '3.25rem' // 52px of ink; the inset is added on top

export default function TabBar() {
  const location = useLocation()
  const current = activeTabFor(location.pathname)

  const tabs = [
    ...WEEKLY_SECTIONS.map(s => ({ key: s.key, label: s.label, to: s.to })),
    { key: 'index', label: INDEX_LABEL, to: INDEX_ROUTE },
  ]

  return (
    <nav
      aria-label="Primary"
      className="fixed left-0 right-0 bottom-0 z-30 flex bg-text-primary text-bg-primary"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {tabs.map(({ key, label, to }) => {
        const isCurrent = current === key
        return (
          <Link
            key={key}
            to={to}
            aria-current={isCurrent ? 'page' : undefined}
            className={cn(
              'tap-target focus-ring flex-1 min-w-0 flex flex-col items-center justify-center',
              'font-display font-extrabold text-[10px] uppercase tracking-[0.1em] leading-none whitespace-nowrap',
              'transition-opacity duration-mark',
              isCurrent ? 'opacity-100' : 'opacity-55 hover:opacity-80',
            )}
            style={{ height: TAB_BAR_HEIGHT }}
          >
            <span>{label}</span>
            {/* The active marker is ink in the bar's own text colour — red stays
                rationed to the hero cap, "you" accents and the contents rail. */}
            <span
              aria-hidden="true"
              className={cn('block h-[2px] w-5 mt-1.5', isCurrent ? 'bg-bg-primary' : 'bg-transparent')}
            />
          </Link>
        )
      })}
    </nav>
  )
}
