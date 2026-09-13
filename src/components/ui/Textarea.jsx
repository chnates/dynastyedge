import { forwardRef } from 'react'
import { cn } from './cn'

// THE multi-line text field — `Input`'s sibling, and the reason it exists is
// structural rather than visual.
//
// The scout-note field in `PlayerProfileDrawer` was the ONE control in the app
// that could not route through a primitive, because the library had no
// textarea. PR #49 found it with `focus:outline-none` and nothing in its place
// — focus left it completely unmarked — and fixed it by putting `.focus-ring`
// on the call site directly. That is correct and structurally unprotected: the
// accessibility floor says the focus definition lives in the primitives so no
// screen can opt out, and a lone hand-rolled field is exactly how the gap
// recurs (it is the same drift that produced eleven divergent copies of `Row`).
//
// Same contract as `Input`: RULED not boxed, the bottom rule thickens to ink on
// focus, `.focus-ring` still fires (browsers always treat a text field as
// focus-visible), and it stays at `text-sm` — the global iOS focus-zoom guard
// in index.css forces 16px on touch, so never raise it here.
//
// `resize-none` is the default rather than an option: the app's one scroller is
// <main>, and a user-resizable box inside a bottom sheet fights the sheet's
// drag contract (failure-archaeology §2).
//
//   <Textarea rows={3} defaultValue={note} placeholder="Add a note…" />

const Textarea = forwardRef(function Textarea({ className, rows = 3, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        'w-full rounded-none bg-transparent border-0 border-b-2 border-border-default',
        'px-0 py-2 font-body text-sm text-text-primary placeholder:text-text-tertiary',
        'resize-none leading-snug',
        'focus:border-text-primary transition-colors focus-ring',
        className,
      )}
      {...rest}
    />
  )
})

export default Textarea
