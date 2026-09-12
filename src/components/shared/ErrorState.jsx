// Direct import (not the barrel) — the barrel re-exports ErrorState, so going
// through it would create a module cycle.
import Button from '../ui/Button'

export default function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 px-4 text-center">
      {/* The triangle said "warning"; the word says which warning, and it is
          the only thing on the screen that has to be read. */}
      <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-warning">
        Could not load
      </span>
      <p className="aside font-body text-sm text-balance">{message}</p>
      <Button onClick={onRetry} className="mt-1">Retry</Button>
    </div>
  )
}
