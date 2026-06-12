// Pick round colors per CLAUDE.md design system — the single source of truth.
// Light: Tailwind palette equivalents. Dark: arbitrary values matching spec.
// Used by PickBadge (roster) and TeamCard (league) — never redefine locally.

export const ROUND_CLASSES = {
  1: 'bg-amber-100  dark:bg-[#3D2E00] text-amber-800  dark:text-amber-500',
  2: 'bg-blue-100   dark:bg-[#0C2A4A] text-blue-800   dark:text-blue-400',
  3: 'bg-violet-100 dark:bg-[#2A1A4A] text-violet-800 dark:text-violet-400',
  4: 'bg-gray-100   dark:bg-[#1F1F25] text-gray-700   dark:text-gray-400',
}

export const ROUND_TEXT = {
  1: 'text-amber-800  dark:text-amber-500',
  2: 'text-blue-800   dark:text-blue-400',
  3: 'text-violet-800 dark:text-violet-400',
  4: 'text-gray-700   dark:text-gray-400',
}

export const ROUND_LABELS = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' }
