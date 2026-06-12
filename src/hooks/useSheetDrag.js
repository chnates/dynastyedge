import { useEffect, useRef } from 'react'

// Swipe-down-to-dismiss for bottom sheets.
//
// Attach `sheetRef` to the sheet panel (the rounded card) and `scrollRef`
// to its scrollable content container. The drag only arms when the content
// is scrolled to the top and the finger moves downward, so normal in-sheet
// scrolling is untouched. Past 120px (or a quick flick) the sheet closes;
// otherwise it springs back.
//
// Native (non-passive) listeners are required: React's synthetic touchmove
// is passive, so preventDefault() there is a no-op and iOS rubber-bands the
// content instead of moving the sheet.
export function useSheetDrag(onClose) {
  const sheetRef = useRef(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    const el = sheetRef.current
    if (!el) return

    let startY = 0
    let startTime = 0
    let isDragging = false
    let currentDragY = 0

    function onTouchStart(e) {
      startY = e.touches[0].clientY
      startTime = Date.now()
      isDragging = false
      currentDragY = 0
      el.style.transition = 'none'
    }

    function onTouchMove(e) {
      const dy = e.touches[0].clientY - startY

      if (isDragging) {
        e.preventDefault()
        currentDragY = Math.max(0, dy)
        el.style.transform = `translateY(${currentDragY}px)`
        return
      }

      // Start drag only when at scroll top and moving downward
      const scrollTop = scrollRef.current?.scrollTop ?? 0
      if (scrollTop === 0 && dy > 8) {
        isDragging = true
        e.preventDefault()
        currentDragY = Math.max(0, dy)
        el.style.transform = `translateY(${currentDragY}px)`
      }
    }

    function onTouchEnd() {
      if (!isDragging) return
      const elapsed = Math.max(1, Date.now() - startTime)
      const velocity = currentDragY / elapsed // px/ms

      if (currentDragY > 120 || velocity > 0.4) {
        onClose()
      } else {
        el.style.transition = 'transform 0.25s ease-out'
        el.style.transform = 'translateY(0)'
      }
      isDragging = false
      currentDragY = 0
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove',  onTouchMove,  { passive: false })
    el.addEventListener('touchend',   onTouchEnd,   { passive: true })

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove',  onTouchMove)
      el.removeEventListener('touchend',   onTouchEnd)
    }
  }, [onClose])

  return { sheetRef, scrollRef }
}
