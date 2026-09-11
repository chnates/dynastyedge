import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router-dom'
import { SECTIONS, CONSULTED_VIEWS } from '../../navigation'

const PlayerSearchSheet = lazy(() => import('./PlayerSearchSheet'))

// THE app's complete map, and the fifth tab.
//
// It exists because the bottom bar can hold four weekly sections and the app has
// 21 destinations. Three findings land here at once:
//
//   A5 — Draft and News are seasonal/browse, not weekly, and were spending a
//        third of top-level navigation. They keep every route and every existing
//        entry point; this is where you go looking for them.
//   A1 — Season Review, my own Trajectory, Manager Scouting and Rookie Research
//        had ZERO content-level inbound links. They are listed here under
//        "Consulted, not daily" as well as in their own section's contents rail.
//   A3 — the drawer was the only map, and it was a full-screen overlay that hid
//        the screen you were reading. This is a destination, not an overlay.
//
// Matchday's idiom: poster type, rules instead of boxes, no icons and no colour
// swatches (directions.md rev-1 change 5 — a section swatch would collide with
// the position hues, which are load-bearing). These are navigation rows in the
// established `NavLink`/`Link` pattern, not hand-rolled Cards.
function IndexRow({ to, title, detail, hint, small = false }) {
  return (
    <li>
      <Link
        to={to}
        className="focus-ring flex items-baseline gap-3 px-4 py-4 border-b border-border-default
                   hover:bg-bg-secondary transition-colors"
        style={{ touchAction: 'manipulation' }}
      >
        <span className="min-w-0 flex-1">
          <span
            className={`block font-display uppercase tracking-[0.02em] text-text-primary leading-none
                        ${small ? 'text-[17px]' : 'text-[23px]'}`}
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
      </Link>
    </li>
  )
}

export default function IndexView() {
  const [searchOpen, setSearchOpen] = useState(false)

  return (
    <div className="pb-6">
      {/* Find — the one search in the app, not a second one. Opens the same
          PlayerSearchSheet the header icon does, which already jumps to
          sections as well as players (Feature 16). */}
      <button
        onClick={() => setSearchOpen(true)}
        className="focus-ring w-full flex items-baseline gap-3 px-4 py-4 text-left
                   border-b-2 border-text-primary"
        style={{ touchAction: 'manipulation' }}
      >
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-tertiary">
          Find
        </span>
        <span className="font-display text-[19px] uppercase tracking-[0.02em] text-text-tertiary">
          Anyone, anywhere
        </span>
      </button>

      <ul>
        {SECTIONS.map(section => (
          <IndexRow
            key={section.key}
            to={section.to}
            title={section.label}
            detail={
              section.views.length
                ? `${section.views.map(v => v.label).join(' · ')} — ${section.blurb}`
                : section.blurb
            }
          />
        ))}
      </ul>

      {/* The four that nothing else in the app points at. They stay in their own
          section too — this is a second way in, not a relocation. */}
      <h2 className="font-mono text-[9px] uppercase tracking-[0.22em] text-text-tertiary
                     px-4 pt-7 pb-2 border-b border-border-default">
        Consulted, not daily
      </h2>
      <ul>
        {CONSULTED_VIEWS.map(view => (
          <IndexRow
            key={view.to}
            to={view.to}
            title={view.searchLabel ?? view.label}
            detail={view.blurb}
            hint={view.section.label}
            small
          />
        ))}
      </ul>

      {searchOpen && (
        <Suspense fallback={null}>
          <PlayerSearchSheet onClose={() => setSearchOpen(false)} />
        </Suspense>
      )}
    </div>
  )
}
