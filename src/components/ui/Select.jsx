import { forwardRef } from 'react'
import { cn } from './cn'

// THE dropdown field — a native <select> in the Input field voice, with the
// mono micro-label and the ▾ affordance. Native is deliberate: iOS renders it
// as the system wheel picker, which beats any custom sheet for a one-of-N
// choice, and <optgroup> gives grouped options for free.
//
//   <Select label="Team" hint="Sorted by fit" value={id} onChange={…}>
//     <option value="">All teams</option>
//     <optgroup label="Priority">…</optgroup>
//   </Select>

const Select = forwardRef(function Select({ label, hint, className, children, ...rest }, ref) {
  return (
    <div>
      {label && (
        <label className="block font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-secondary mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            'w-full rounded-none bg-bg-card border border-border-default',
            'px-3 pr-8 py-2.5 font-body text-sm text-text-primary appearance-none',
            'focus:outline-none focus:border-accent transition-colors',
            className,
          )}
          {...rest}
        >
          {children}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary text-xs">
          ▾
        </span>
      </div>
      {hint && (
        <p className="font-body text-[10px] text-text-tertiary mt-1">{hint}</p>
      )}
    </div>
  )
})

export default Select
