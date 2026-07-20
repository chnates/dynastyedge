// Win-window tier colors (see CLAUDE.md design system — Primetime Blackout).
// Contending = silver (gold left the system in Phase 3), Middle = cyan,
// Rebuilding = indigo — every tier has an identity color. Values live in the
// --tier-* theme vars (index.css). Shared by WinWindowBadge and the League
// health banner chips.

export const TIER_BADGE = {
  Contending: 'text-tier-contend bg-tier-contend/10 border-tier-contend/30',
  Middle:     'text-tier-middle bg-tier-middle/10 border-tier-middle/30',
  Rebuilding: 'text-tier-rebuild bg-tier-rebuild/10 border-tier-rebuild/30',
}

export const TIER_TEXT = {
  Contending: 'text-tier-contend',
  Middle:     'text-tier-middle',
  Rebuilding: 'text-tier-rebuild',
}
