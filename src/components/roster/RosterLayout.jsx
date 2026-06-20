import { Outlet } from 'react-router-dom'
import SubTabBar from '../shared/SubTabBar'

const SUB_TABS = [
  { label: 'My Roster',     to: '/my-team',               end: true  },
  { label: 'Lineup',        to: '/my-team/lineup',        end: false },
  { label: 'Season Review', to: '/my-team/season-review', end: false },
  { label: 'Trajectory',    to: '/my-team/trajectory',    end: false },
]

export default function RosterLayout() {
  return (
    <>
      <SubTabBar tabs={SUB_TABS} />
      <Outlet />
    </>
  )
}
