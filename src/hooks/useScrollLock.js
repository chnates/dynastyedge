import { useEffect } from 'react'

// The app's scroll container is <main> (see App.jsx) — the body never
// scrolls. iOS chains touch scrolling to the nearest scrollable ancestor
// when an inner scroller hits its boundary, which made the page scroll
// behind open bottom sheets. Every bottom sheet must call this hook while
// mounted to freeze the background scroller.
export function useScrollLock() {
  useEffect(() => {
    const main = document.querySelector('main')
    if (!main) return undefined
    const prev = main.style.overflowY
    main.style.overflowY = 'hidden'
    return () => { main.style.overflowY = prev }
  }, [])
}
