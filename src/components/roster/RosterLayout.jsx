import { Outlet } from 'react-router-dom'
import SectionContents from '../shared/SectionContents'

export default function RosterLayout() {
  return (
    <>
      <SectionContents sectionKey="my-team" />
      <Outlet />
    </>
  )
}
