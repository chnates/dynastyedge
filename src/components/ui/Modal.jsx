import { useEffect, useRef } from 'react'
import { useScrollLock } from '../../hooks/useScrollLock'
import { cn } from './cn'

// THE centered dialog — confirm prompts and small forms that sit in the middle
// of the screen rather than docking to the bottom (the draft tracker's "Reset
// tracker?" confirm, the draft board's CSV-import dialogs). The bottom-docked
// counterpart is <Sheet>. Owns the overlay, scroll-lock, Escape key, and
// overlay-tap-to-close so callers never re-roll `fixed inset-0 ... bg-black/60`.
//
//   <Modal onClose={cancel} label="Reset tracker">
//     <h3>…</h3>
//     <div className="flex gap-2">
//       <Button variant="secondary" fullWidth onClick={cancel}>Cancel</Button>
//       <Button variant="danger" fullWidth onClick={confirm}>Reset</Button>
//     </div>
//   </Modal>
export default function Modal({
  onClose,
  maxWidth = 'max-w-xs',
  surface = 'bg-bg-secondary',
  label,
  className,
  children,
}) {
  const overlayRef = useRef(null)

  useScrollLock()

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose?.()
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
    >
      <div
        className={cn('w-full rounded-2xl border border-border-default', maxWidth, surface, className)}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {children}
      </div>
    </div>
  )
}
