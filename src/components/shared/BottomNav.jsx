import { NavLink } from 'react-router-dom'

const TABS = [
  { to: '/roster', label: 'Roster', icon: '🏈' },
  { to: '/trade',  label: 'Trade',  icon: '🔄' },
  { to: '/lineup', label: 'Lineup', icon: '📋' },
  { to: '/league', label: 'League', icon: '🏆' },
]

export default function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-10 bg-bg-secondary dark:bg-bg-secondary border-t border-border-default dark:border-border-default"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex h-16">
        {TABS.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              'flex flex-1 flex-col items-center justify-center gap-0.5 transition-opacity duration-150 ' +
              (isActive
                ? 'text-accent'
                : 'text-text-secondary dark:text-text-secondary')
            }
          >
            <span className="text-xl leading-none">{icon}</span>
            <span className="text-[10px] font-body font-medium uppercase tracking-wider leading-none">
              {label}
            </span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
