export const LEAGUE_ID = '1313933520715907072'

// Identity is now runtime state, not a constant: the signed-in roster comes
// from the `useIdentity` store (set on the login screen, persisted in
// localStorage). These remain only as the league's original-owner reference —
// nothing reads them as the source of truth anymore. "Am I this team?" checks
// use `myRosterId` from LeagueContext / useIdentity.
export const MY_ROSTER_ID = 6
export const MY_USERNAME = 'chnates'
export const MY_TEAM_NAME = 'Nix Cage'

export const SLEEPER_BASE = 'https://api.sleeper.app/v1'
export const FANTASYCALC_BASE = 'https://api.fantasycalc.com'
// Unofficial ESPN API — no auth; used only for per-player news, degrades silently
export const ESPN_BASE = 'https://site.api.espn.com'
export const ESPN_WEB_BASE = 'https://site.web.api.espn.com'

// Aggregated news feed published by .github/workflows/news.yml to the
// news-data branch (raw.githubusercontent.com sends CORS headers)
export const NEWS_FEED_URL = 'https://raw.githubusercontent.com/chnates/dynastyedge/news-data/news.json'

// Daily FantasyCalc value snapshots published by
// .github/workflows/values-history.yml to the values-history branch —
// powers sparklines. Best-effort: when missing, sparklines simply hide.
export const VALUES_HISTORY_URL = 'https://raw.githubusercontent.com/chnates/dynastyedge/values-history/values-history.json'

// Trade-time value archive published by the same workflow — records asset
// values within ~a day of each trade, forever. Best-effort: when missing,
// the scouting ledger's "at trade time" line simply hides.
export const TRADE_VALUES_URL = 'https://raw.githubusercontent.com/chnates/dynastyedge/values-history/trade-values.json'

export const FANTASYCALC_PARAMS = {
  isDynasty: true,
  numQbs: 2,
  numTeams: 10,
  ppr: 0.5,
}

export const PICK_YEARS = ['2026', '2027', '2028']
export const POSITIONS = ['QB', 'RB', 'WR', 'TE']

// Ordered roster slots — indices match Sleeper's starters array positions
export const ROSTER_SLOTS = [
  { label: 'QB',   eligible: ['QB'] },
  { label: 'RB',   eligible: ['RB'] },
  { label: 'RB',   eligible: ['RB'] },
  { label: 'WR',   eligible: ['WR'] },
  { label: 'WR',   eligible: ['WR'] },
  { label: 'TE',   eligible: ['TE'] },
  { label: 'FLEX', eligible: ['RB', 'WR', 'TE'] },
  { label: 'FLEX', eligible: ['RB', 'WR', 'TE'] },
  { label: 'FLEX', eligible: ['RB', 'WR', 'TE'] },
  { label: 'SFLX', eligible: ['QB', 'RB', 'WR', 'TE'] },
  { label: 'DEF',  eligible: ['DEF'] },
]
