import { forwardRef } from 'react'
import { Search } from 'lucide-react'
import { cn } from './cn'

// THE text input + the search-box variant. Consistent field styling across the
// app's many search/filter boxes (Free Agents, Draft, Trade add sheet, News,
// global search). Font-size is forced to 16px on touch by the global iOS
// focus-zoom guard in index.css — keep inputs at text-sm here.
//
//   <Input value={q} onChange={e => setQ(e.target.value)} placeholder="…" />
//   <SearchInput value={q} onChange={…} placeholder="Search players" />

export const Input = forwardRef(function Input({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        'w-full rounded-none bg-bg-card border border-border-default',
        'px-3 py-2.5 font-body text-sm text-text-primary placeholder:text-text-tertiary',
        'focus:outline-none focus:border-accent transition-colors',
        className,
      )}
      {...rest}
    />
  )
})

export const SearchInput = forwardRef(function SearchInput({ className, ...rest }, ref) {
  return (
    <div className="relative">
      <Search
        size={16}
        strokeWidth={2}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none"
      />
      <Input ref={ref} className={cn('pl-9', className)} {...rest} />
    </div>
  )
})

export default Input
