// Win-window tier colors (see CLAUDE.md design system).
// Contending = gold, Middle = cyan, Rebuilding = indigo — every tier has an
// identity color. Shared by WinWindowBadge and the League health banner chips.

export const TIER_BADGE = {
  Contending: 'text-warning bg-warning/10 border-warning/30',
  Middle:     'text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
  Rebuilding: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/30',
}

export const TIER_TEXT = {
  Contending: 'text-warning',
  Middle:     'text-cyan-600 dark:text-cyan-400',
  Rebuilding: 'text-indigo-600 dark:text-indigo-400',
}
