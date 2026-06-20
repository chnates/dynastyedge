import { Outlet } from 'react-router-dom'
import SubTabBar from '../shared/SubTabBar'

const SUB_TABS = [
  { label: 'Overview',    to: '/league',             end: true  },
  { label: 'Free Agents', to: '/league/free-agents', end: false },
  { label: 'Activity',    to: '/league/activity',    end: false },
  { label: 'Movers',      to: '/league/movers',      end: false },
  { label: 'Playoffs',    to: '/league/playoffs',    end: false },
]

export default function LeagueLayout() {
  return (
    <>
      <SubTabBar tabs={SUB_TABS} />
      <Outlet />
    </>
  )
}
