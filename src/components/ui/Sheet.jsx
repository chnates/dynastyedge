import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useScrollLock } from '../../hooks/useScrollLock'
import { useSheetDrag } from '../../hooks/useSheetDrag'
import IconButton from './IconButton'
import { cn } from './cn'

// THE bottom sheet — never re-implement the overlay/handle/scroll-lock/drag
// boilerplate that used to live in every sheet (PlayerProfileDrawer,
// RosterAnalysisSheet, NewsArticleSheet, FreeAgentDrawer, the trade add sheet,
// ManagerScoutingSheet, DraftTracker's sheet…). This one component owns the
// whole sheet contract from CLAUDE.md → "Bottom sheets":
//   • useScrollLock() while mounted (no iOS scroll chaining)
//   • useSheetDrag(onClose) wired to panel + scroll container (swipe-to-dismiss)
//   • overscroll-behavior: contain + safe-area bottom padding
//   • Escape key + overlay-tap to close, a drag handle, rounded top
//
//   <Sheet onClose={close} zIndex="z-[60]" label="News article">
//     <SheetHeader title={headline} eyebrow={meta} onClose={close} />
//     <div className="px-4 pb-6 pt-3">…</div>
//   </Sheet>
//
// `zIndex` is a Tailwind z class so sheets can stack (a profile drawer at z-50
// with a news sheet at z-[60] on top — same trick The Edge uses).
export default function Sheet({
  onClose,
  zIndex = 'z-50',
  surface = 'bg-bg-secondary',
  maxHeight = 'max-h-[85vh]',
  label,
  className,
  children,
}) {
  const overlayRef = useRef(null)
  const { sheetRef, scrollRef } = useSheetDrag(onClose)

  useScrollLock()

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose()
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className={cn('fixed inset-0 flex items-end bg-black/60', zIndex)}
    >
      <div
        ref={sheetRef}
        className={cn('w-full rounded-t-2xl border-t border-border-default', surface, className)}
      >
        <div
          ref={scrollRef}
          className={cn('overflow-y-auto', maxHeight)}
          style={{ overscrollBehavior: 'contain', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-border-default" />
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}

// Standard sheet header: optional eyebrow (source/meta line), title, optional
// subtitle/children, and the close affordance. Pass `onClose` to render the X.
export function SheetHeader({ title, eyebrow, subtitle, onClose, closeLabel = 'Close', children }) {
  return (
    <div className="flex items-start justify-between px-4 pt-2 pb-3 border-b border-border-default">
      <div className="flex-1 min-w-0 pr-3">
        {eyebrow && (
          <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
            {eyebrow}
          </p>
        )}
        {title && (
          <h2 className="font-display text-xl font-bold uppercase tracking-wide text-text-primary mt-1 leading-tight">
            {title}
          </h2>
        )}
        {subtitle && (
          <p className="font-body text-xs text-text-secondary mt-1.5">{subtitle}</p>
        )}
        {children}
      </div>
      {onClose && (
        <IconButton label={closeLabel} onClick={onClose}>
          <X size={18} strokeWidth={1.75} />
        </IconButton>
      )}
    </div>
  )
}
