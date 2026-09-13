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
// IT STAYS `flex-wrap`, AND THE TIGHTENING BELOW IS NOT LICENCE TO DROP IT.
// The 2026-09-13 pass shrank the gap (16px → 10px) and the tracking
// (0.08em → 0.055em) so the rail fits on ONE line where it can — it was
// spending a second 44px row on three of the four multi-view sections, i.e.
// ~16 of the app's 18 content routes, for 140px of chrome before any content.
// A first cut also set `flex-nowrap`, which is wrong and was reverted: nowrap
// does not FIT an over-long rail, it HIDES the overflow — reintroducing exactly
// the A4 failure this component exists to fix. Wrapping is the honest fallback,
// so a future label that doesn't fit costs a row instead of vanishing.
//
// Measured headroom at 390px (358px available inside the gutter), so the next
// person adding a view knows the budget rather than guessing:
//
//   Squad    344px — 14px spare
//   Trade    352px —  6px spare   (after "Pick Trades" → "Picks")
//   League   306px — 52px spare   (after "Free Agents" → railLabel "FA")
//   Draft    196px — 162px spare
//
// All four fit on one line. Trade is the tight one at 6px — a sixth Trade view,
// or a longer label on any of the five, puts it back on two rows. That is the
// honest failure mode and it is why `flex-wrap` stayed: the rail grows a row
// rather than hiding an entry.
//
// "FREE AGENTS" was 90px, the widest label in the app, and League was over by
// exactly 21px; no gap or tracking tightening closes that while staying
// legible, so the label had to shorten. `FA` is not a coinage — it is already
// this app's own vocabulary (League › Activity's filter chips read
// "All / Trades / Waivers / FA / My Moves"). It is a `railLabel`, so the Index
// and global search still say "Free Agents".
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
      <ul className="flex flex-wrap items-center gap-x-2.5">
        {section.views.map(({ label, railLabel, to, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'focus-ring flex items-center min-h-[44px] font-display font-extrabold text-[12px]',
                  'uppercase tracking-[0.055em] whitespace-nowrap press',
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
                  {/* The rail is the ONE consumer that may shorten a label —
                      see `railLabel` in navigation.js. The Index and global
                      search keep the full name. */}
                  {railLabel ?? label}
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
