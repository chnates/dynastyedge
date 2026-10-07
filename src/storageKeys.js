// THE storage keys — every localStorage / sessionStorage name the app uses,
// in one place (CLAUDE.md rule 20; CODE-REVIEW-1 #12, 2026-10-07). Before this
// file a key could be written as a string in two places — The Edge wrote
// League's tier filter by literal, the identity wipe list repeated three keys
// owned elsewhere, main.jsx read the theme key outside useTheme — so renaming
// one copy silently broke the other. tests/storageKeys.test.mjs fails if a
// `dynastyedge_` literal appears anywhere else in src/.

export const STORAGE_KEYS = {
  // localStorage
  identity:          'dynastyedge_identity_v1',        // signed-in roster (Feature 18)
  theme:             'dynastyedge_theme',
  watchlist:         'dynastyedge_watchlist_v1',
  actionDismissals:  'dynastyedge_action_dismissals',
  edgeLastVisit:     'dynastyedge_edge_last_visit',
  boardOrder:        'dynastyedge_board_order',        // Feature 10
  prospectNotes:     'dynastyedge_prospect_notes',
  csvRankings:       'dynastyedge_csv_rankings',
  // sessionStorage
  leagueSort:        'dynastyedge_league_sort',
  leaguePos:         'dynastyedge_league_pos',
  leagueTier:        'dynastyedge_league_tier',
  tradeDraft:        'dynastyedge_trade_draft',
  targetsTeam:       'dynastyedge_targets_team',
  versionReload:     'dynastyedge_version_reload',     // self-heal loop guard
}

// The manual draft tracker, one key per season so a draft can't leak into the next.
export const draftTrackerKey = season => `dynastyedge_draft_tracker_${season}`

// Keys tied to WHICH TEAM YOU ARE — wiped by useIdentity on any identity
// change. A new key that depends on the signed-in roster goes here.
export const ROSTER_SCOPED_LOCAL = [STORAGE_KEYS.actionDismissals]
export const ROSTER_SCOPED_SESSION = [STORAGE_KEYS.tradeDraft, STORAGE_KEYS.targetsTeam]
