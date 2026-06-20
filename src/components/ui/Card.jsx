import { cn } from './cn'

// THE surface container — never hand-roll `rounded-xl bg-bg-card border
// border-border-default` inline. Optional left edge bar (the "stadium lights"
// accent treatment from CLAUDE.md → Design System): pass `accent` a color class
// like 'bg-accent', POS_BG[pos], or BRAND_TICK's gradient.
//
//   <Card>…</Card>
//   <Card accent="bg-accent" as="button" onClick={open}>…</Card>
//   <Card padding="p-4" interactive onClick={…}>…</Card>

const PADDINGS = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
}

export default function Card({
  accent = null,
  padding = 'md',
  interactive = false,
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
        'relative w-full rounded-xl bg-bg-card border border-border-default overflow-hidden',
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
