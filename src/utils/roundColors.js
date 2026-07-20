// Pick round colors per CLAUDE.md design system — the single source of truth.
// Primetime Blackout re-tune: 1st round is silver-on-charcoal (the old
// gold-amber collided with the warning color); 2nd/3rd/4th keep their hue
// families, tuned to the new palette. Used by PickBadge (roster) and
// TeamCard (league) — never redefine locally.

export const ROUND_CLASSES = {
  1: 'bg-[#E4E6EA] dark:bg-[#26262C] text-[#3E444C] dark:text-[#C9CDD1]',
  2: 'bg-blue-100   dark:bg-[#10263C] text-blue-800   dark:text-[#5FA8E8]',
  3: 'bg-violet-100 dark:bg-[#252047] text-violet-800 dark:text-[#8F9BF2]',
  4: 'bg-gray-100   dark:bg-[#1A1A1E] text-gray-700   dark:text-[#8A9096]',
}

export const ROUND_TEXT = {
  1: 'text-[#3E444C] dark:text-[#C9CDD1]',
  2: 'text-blue-800   dark:text-[#5FA8E8]',
  3: 'text-violet-800 dark:text-[#8F9BF2]',
  4: 'text-gray-700   dark:text-[#8A9096]',
}

export const ROUND_LABELS = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' }
