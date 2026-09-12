import { NavLink } from 'react-router-dom'
import { SECTIONS } from '../../navigation'
import { cn } from '../ui'

// THE within-section navigation — a publication's contents line, not a tab row.
// Never hand-roll a section nav; pass a section key and this renders it from
// the one navigation map.
//
// It replaces `SubTabBar`, and the two differences are the point:
//
// 1. It is no longer a duplicate. Every one of the old bar's 17 entries was a
//    byte-identical label→route pair with a row in the side drawer's tree
//    (findings.md A2). The drawer no longer carries destinations, so this is
//    the only place a section's views are listed on a content screen.
// 2. It WRAPS instead of scrolling. The old bar was `overflow-x-auto` with a
//    right fade, which put "Pick Trades" — a real destination — off-screen at
//    390px until you scrolled a nav bar sideways (findings.md A4). A wrapping
//    left-aligned line cannot hide an entry: a label that doesn't fit moves to a
//    second line and stays readable. Items are not `flex-1` here, which is what
//    made the old row wrap badly before it was made to clip instead.
//
// Each item is a real 44px touch target (findings.md X3). `.tap-target` is
// deliberately NOT used: it grows the hit area beyond the ink, and on a row that
// WRAPS that would let vertically adjacent items steal each other's taps — the
// same reason index.css keeps it off `Chip`.
export default function SectionContents({ sectionKey }) {
  const section = SECTIONS.find(s => s.key === sectionKey)
  if (!section || section.views.length === 0) return null

  return (
    <nav
      aria-label={`${section.label} contents`}
      className="sticky top-0 z-[5] bg-bg-secondary border-b-2 border-text-primary px-4"
    >
      <ul className="flex flex-wrap items-center gap-x-4">
        {section.views.map(({ label, to, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'focus-ring flex items-center min-h-[44px] font-display font-extrabold text-[12px]',
                  'uppercase tracking-[0.08em] whitespace-nowrap transition-colors',
                  isActive ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary',
                )
              }
              style={{ touchAction: 'manipulation' }}
            >
              {({ isActive }) => (
                // The underline hugs the text rather than the 44px box, so the
                // marker reads as part of the word.
                <span
                  className={cn(
                    'border-b-2 pb-0.5',
                    // Brand red on the active item — the sub-tab underline is
                    // one of red's three sanctioned surfaces, inherited here.
                    isActive ? 'border-brand' : 'border-transparent',
                  )}
                >
                  {label}
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
