export default function SectionHeader({ label, count }) {
  return (
    <div className="flex items-center justify-between pt-4 pb-1.5">
      <span className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary dark:text-text-secondary">
        {label}
      </span>
      {count != null && (
        <span className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary">
          {count}
        </span>
      )}
    </div>
  )
}
