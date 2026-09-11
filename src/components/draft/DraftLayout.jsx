import { Outlet } from 'react-router-dom'
import SectionContents from '../shared/SectionContents'

export default function DraftLayout() {
  return (
    <>
      <SectionContents sectionKey="draft" />
      <Outlet />
    </>
  )
}
