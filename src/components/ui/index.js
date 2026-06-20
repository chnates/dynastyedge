// ─────────────────────────────────────────────────────────────────────────
// DynastyEdge Design System — the single import surface for shared UI.
//
//   import { Button, Card, Sheet, SheetHeader, Chip, Badge, ErrorState }
//     from '../ui'   // (path relative to the importing file)
//
// RULE (CLAUDE.md → Design System): route ALL UI through this library. Never
// re-implement a button, card, bottom sheet, filter chip, badge, or input
// inline — extend a primitive here instead. The /design-review skill enforces
// this on every diff.
// ─────────────────────────────────────────────────────────────────────────

// Core primitives (new in the design system)
export { default as Button } from './Button'
export { default as IconButton } from './IconButton'
export { default as Card } from './Card'
export { default as Sheet, SheetHeader } from './Sheet'
export { default as Modal } from './Modal'
export { default as Chip } from './Chip'
export { default as Badge } from './Badge'
export { Input, SearchInput } from './Input'
export { cn } from './cn'

// Adopted shared primitives (re-exported so the library is the one surface).
// Files stay in components/shared/ — import them from here going forward.
export { default as ErrorState } from '../shared/ErrorState'
export { default as Spinner } from '../shared/LoadingSpinner'
export { default as SectionHeader, BRAND_TICK } from '../shared/SectionHeader'
export { default as SubTabBar } from '../shared/SubTabBar'
export { default as TrendArrow } from '../shared/TrendArrow'
export { default as WinWindowBadge } from '../shared/WinWindowBadge'
export { default as Sparkline } from '../shared/Sparkline'
export { default as TeamAvatar } from '../shared/TeamAvatar'
