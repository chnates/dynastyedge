import { NavLink, Outlet } from 'react-router-dom'
import { CalendarClock } from 'lucide-react'
import { useLeagueContext } from '../../context/LeagueContext'

const SUB_TABS = [
  { label: 'Partners',    to: '/trade',            end: true  },
  { label: 'Analyzer',   to: '/trade/analyze',    end: false },
  { label: "What's Fair", to: '/trade/whats-fair', end: false },
]

function DeadlineBanner() {
  const { nflState, isOffseason, tradeDeadline } = useLeagueContext()
  if (isOffseason || !tradeDeadline || !nflState?.week) return null

  const week = nflState.week
  const weeksLeft = tradeDeadline - week

  if (weeksLeft < 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-bg-secondary dark:bg-bg-secondary border-b border-border-default dark:border-border-default">
        <CalendarClock size={14} strokeWidth={2} className="text-text-tertiary shrink-0" />
        <span className="font-body text-xs text-text-tertiary dark:text-text-tertiary">
          Trade deadline passed (Week {tradeDeadline}) — trades resume next season
        </span>
      </div>
    )
  }

  const urgent = weeksLeft <= 2
  const label = weeksLeft === 0
    ? `Trade deadline is THIS WEEK (Week ${tradeDeadline})`
    : `Trade deadline: Week ${tradeDeadline} · ${weeksLeft} week${weeksLeft === 1 ? '' : 's'} away`

  return (
    <div className={`flex items-center gap-2 px-4 py-2 border-b border-border-default dark:border-border-default ${urgent ? 'bg-warning/10' : 'bg-bg-secondary dark:bg-bg-secondary'}`}>
      <CalendarClock size={14} strokeWidth={2} className={`shrink-0 ${urgent ? 'text-warning' : 'text-text-secondary'}`} />
      <span className={`font-body text-xs font-medium ${urgent ? 'text-warning' : 'text-text-secondary dark:text-text-secondary'}`}>
        {label}
      </span>
    </div>
  )
}

export default function TradeLayout() {
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
      <DeadlineBanner />
      <Outlet />
    </>
  )
}
