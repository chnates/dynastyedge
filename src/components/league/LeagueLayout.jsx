import { Outlet } from 'react-router-dom'
import SectionContents from '../shared/SectionContents'

export default function LeagueLayout() {
  return (
    <>
      <SectionContents sectionKey="league" />
      <Outlet />
    </>
  )
}
