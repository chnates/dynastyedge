import { AlertTriangle } from 'lucide-react'
// Direct import (not the barrel) — the barrel re-exports ErrorState, so going
// through it would create a module cycle.
import Button from '../ui/Button'

export default function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 px-4 text-center">
      <AlertTriangle size={24} className="text-warning" strokeWidth={1.75} />
      <p className="text-text-secondary dark:text-text-secondary font-body text-sm">{message}</p>
      <Button onClick={onRetry} className="mt-1">Retry</Button>
    </div>
  )
}
