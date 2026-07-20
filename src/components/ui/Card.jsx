import { cn } from './cn'

// THE surface container — never hand-roll `bg-bg-card border
// border-border-default` inline. Broadcast panels are square (Primetime
// Blackout: radius 0, 1px border). Optional left edge bar: pass `accent` a
// color class like 'bg-accent' or POS_BG[pos]. `cut` clips the bottom-left
// corner (10px) — the action-card angle from the Phase 3 brief.
//
//   <Card>…</Card>
//   <Card accent="bg-accent" as="button" onClick={open}>…</Card>
//   <Card cut accent="bg-warning" padding="p-4" interactive onClick={…}>…</Card>

const PADDINGS = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
}

export default function Card({
  accent = null,
  padding = 'md',
  interactive = false,
  cut = false,
  as,
  className,
  children,
  ...rest
}) {
  const Tag = as ?? (rest.onClick ? 'button' : 'div')
  const pad = PADDINGS[padding] ?? padding // allow a raw class override
  const inner = (
    <Tag
      className={cn(
        'relative w-full rounded-none bg-bg-card border border-border-default overflow-hidden',
        cut && 'corner-cut',
        (interactive || rest.onClick) && 'text-left active:opacity-80 transition-opacity',
        !accent && pad,
        className,
      )}
      {...rest}
    >
      {accent ? (
        <>
          <span className={cn('absolute left-0 top-0 bottom-0 w-1', accent)} aria-hidden="true" />
          <div className={cn(pad, 'pl-4')}>{children}</div>
        </>
      ) : (
        children
      )}
    </Tag>
  )
  return inner
}
