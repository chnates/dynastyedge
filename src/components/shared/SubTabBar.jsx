import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

// THE section sub-nav — never hand-roll a sub-tab row locally.
// Adaptive strip: each tab is `flex-1 min-w-max`, so the row fills the width
// when the tabs fit (the old full-width look) but scrolls horizontally when
// they don't — instead of wrapping a long label ("Pick Trades", "Season
// Review") onto a second line and breaking the row's alignment. The active tab
// scrolls into view on navigation, and a right-edge fade appears only while the
// row actually overflows, hinting there's more to scroll.
export default function SubTabBar({ tabs }) {
  const location = useLocation()
  const scrollRef = useRef(null)
  const activeRef = useRef(null)
  const [overflowing, setOverflowing] = useState(false)

  // Keep the active tab visible — on a 390px screen a long 5-tab row overflows,
  // and the tab you're on can sit off-screen after a deep-link or redirect.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [location.pathname])

  // Only show the scroll-hint fade when the row genuinely overflows.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return undefined
    const check = () => setOverflowing(el.scrollWidth > el.clientWidth + 1)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [tabs])

  return (
    <div className="sticky top-0 z-[5] bg-bg-secondary dark:bg-bg-secondary border-b border-border-default dark:border-border-default">
      <div className="relative">
        <div ref={scrollRef} className="flex overflow-x-auto scrollbar-none">
          {tabs.map(({ label, to, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                // Active tab: brand-red underline — one of the three sanctioned
                // red surfaces (phase3-design-brief.md design law 1).
                `flex-1 min-w-max whitespace-nowrap px-4 py-2.5 text-center font-display text-[12px] uppercase tracking-[0.08em] border-b-2 transition-colors
                ${isActive
                  ? 'text-text-primary border-brand'
                  : 'text-text-secondary dark:text-text-secondary border-transparent'
                }`
              }
            >
              {({ isActive }) => <span ref={isActive ? activeRef : null}>{label}</span>}
            </NavLink>
          ))}
        </div>
        {overflowing && (
          <div
            className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-bg-secondary dark:from-bg-secondary to-transparent"
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  )
}
