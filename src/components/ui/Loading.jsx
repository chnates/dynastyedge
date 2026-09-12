import { cn } from './cn'

// THE loading indicator. There is no spinner in this app — see the `.press-bar`
// note in index.css for why, and for why this one never renders without a
// label: the label is the information, the movement is only liveness.
//
//   <Loading message="Loading rosters…" />          // a whole view
//   <Loading inline message="Loading stats…" />     // a section inside one
//
// `inline` is for a block that is already inside a card or a drawer, where the
// full-width rule would read as a divider and the vertical padding would push
// the content it belongs to off the screen.
//
// The block variant carries the page's own 16px gutter, because nearly every
// caller is an early `return` that REPLACES a view before its padding wrapper
// exists. `padded={false}` is for the one caller that is already inside one
// (the login screen). The predecessor was centred, which is why it never
// exposed this: a centred spinner cannot touch the edge, a full-width rule can.
export default function Loading({ message = 'Loading…', inline = false, padded = true, className }) {
  if (inline) {
    return (
      <div className={cn('flex items-center gap-2 py-1', className)} role="status">
        <span className="press-bar block h-0.5 w-4 shrink-0 bg-text-primary" aria-hidden="true" />
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-tertiary">
          {message}
        </span>
      </div>
    )
  }
  return (
    <div className={cn('py-14', padded && 'px-4', className)} role="status">
      <span className="press-bar block h-0.5 w-full bg-text-primary" aria-hidden="true" />
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-text-secondary mt-2.5">
        {message}
      </p>
    </div>
  )
}
