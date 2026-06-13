import { NavLink, Outlet } from 'react-router-dom'

const SUB_TABS = [
  { label: 'My Roster',    to: '/roster/my-team',     end: false },
  { label: 'All Teams',    to: '/roster/teams',       end: false },
  { label: 'Free Agents',  to: '/roster/free-agents', end: false },
  { label: 'Trajectory',   to: '/roster/trajectory',  end: false },
]

export default function RosterLayout() {
  return (
    <>
      <div className="sticky top-0 z-[5] flex bg-bg-secondary dark:bg-bg-secondary border-b border-border-default dark:border-border-default">
        {SUB_TABS.map(({ label, to, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex-1 py-2.5 text-center font-body text-xs font-semibold uppercase tracking-wider transition-colors
              ${isActive
                ? 'text-accent border-b-2 border-accent'
                : 'text-text-secondary dark:text-text-secondary'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </>
  )
}
