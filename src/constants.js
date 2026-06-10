export const LEAGUE_ID = '1313933520715907072'
export const MY_ROSTER_ID = 6
export const MY_USERNAME = 'chnates'
export const MY_TEAM_NAME = 'Nix Cage'

export const SLEEPER_BASE = 'https://api.sleeper.app/v1'
export const FANTASYCALC_BASE = 'https://api.fantasycalc.com'
// Unofficial ESPN API — no auth; used only for per-player news, degrades silently
export const ESPN_BASE = 'https://site.api.espn.com'
export const ESPN_WEB_BASE = 'https://site.web.api.espn.com'

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
