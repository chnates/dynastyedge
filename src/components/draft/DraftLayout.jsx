import { Outlet } from 'react-router-dom'
import SubTabBar from '../shared/SubTabBar'

const SUB_TABS = [
  { label: 'Board',   to: '/draft/board',   end: false },
  { label: 'Tracker', to: '/draft/tracker', end: false },
]

export default function DraftLayout() {
  return (
    <>
      <SubTabBar tabs={SUB_TABS} />
      <Outlet />
    </>
  )
}
