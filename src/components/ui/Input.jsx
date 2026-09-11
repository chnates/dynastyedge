import { forwardRef } from 'react'
import { Search } from 'lucide-react'
import { cn } from './cn'

// THE text input + the search-box variant. Consistent field styling across the
// app's many search/filter boxes (Free Agents, Draft, Trade add sheet, News,
// global search). Font-size is forced to 16px on touch by the global iOS
// focus-zoom guard in index.css — keep inputs at text-sm here.
//
// Matchday's field is RULED, not boxed: the mock's Find row is a line under a
// label, which is the print convention and the same separation logic as the
// masthead and the table head. The bottom rule thickens to the strong weight on
// focus, so the affordance is the line getting heavier rather than a box
// changing colour. `.focus-ring` still fires — text fields are always
// focus-visible — so keyboard and VoiceOver focus stay marked.
//
//   <Input value={q} onChange={e => setQ(e.target.value)} placeholder="…" />
//   <SearchInput value={q} onChange={…} placeholder="Search players" />

export const Input = forwardRef(function Input({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        'w-full rounded-none bg-transparent border-0 border-b-2 border-border-default',
        'px-0 py-2.5 font-body text-sm text-text-primary placeholder:text-text-tertiary',
        'focus:border-text-primary transition-colors focus-ring',
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
        size={15}
        strokeWidth={2}
        className="absolute left-0 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none"
      />
      <Input ref={ref} className={cn('pl-6', className)} {...rest} />
    </div>
  )
})

export default Input
