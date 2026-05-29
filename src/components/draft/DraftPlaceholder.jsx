import { FileText } from 'lucide-react'

export default function DraftPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-bg-card border border-border-default flex items-center justify-center">
        <FileText size={28} strokeWidth={1.5} className="text-text-tertiary" />
      </div>
      <div>
        <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-text-primary mb-2">
          Draft
        </h2>
        <p className="font-body text-[14px] text-text-secondary leading-relaxed">
          Rookie draft board and ADP tracker — coming next session.
        </p>
      </div>
    </div>
  )
}
