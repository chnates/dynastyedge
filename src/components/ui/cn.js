// Tiny className joiner — filters out falsy values so conditional classes
// read cleanly: cn('base', active && 'on', size === 'sm' && 'text-xs').
// The design system's one styling primitive; never pull in a heavier dep.
export function cn(...parts) {
  return parts.filter(Boolean).join(' ')
}
