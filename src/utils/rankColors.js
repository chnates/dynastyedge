// Medal colors for ranking ordinals — gold / silver / bronze for the top 3,
// muted for everyone else. Used anywhere teams are ranked 1–10.

const RANK_MEDAL = {
  1: 'text-amber-500 dark:text-amber-400',
  2: 'text-slate-400 dark:text-slate-300',
  3: 'text-orange-700 dark:text-orange-400',
}

export function rankClass(rank) {
  return RANK_MEDAL[rank] ?? 'text-text-tertiary dark:text-text-tertiary'
}
