// ─────────────────────────────────────────────────────────────────────────
// THE navigation map. One tree, every consumer.
//
// Before the Matchday rebuild this payload existed three times: `SideDrawer`'s
// NAV_TREE, four per-section `SUB_TABS` arrays, and `PlayerSearchSheet`'s
// DESTINATIONS. All 17 sub-tab entries were byte-identical label→route pairs
// with the drawer's children — two navigation systems over one payload
// (docs/design/review-2026-09/findings.md A2). Everything now reads from here,
// so a destination can only be added or moved in one place.
//
// Consumers: `TabBar` (weekly sections) · `SectionContents` (a section's
// contents rail) · `IndexView` (the whole map) · `PlayerSearchSheet`
// (jump-to results) · `App` (the header's section name).
// ─────────────────────────────────────────────────────────────────────────

// `label`     — what navigation calls it (Matchday's voice: Today, Squad).
// `searchAka` — older/longer names kept matchable so typing "my team" or
//               "the edge" still finds the section after the rename.
// `weekly`    — true for the four sections you open in a normal week; only
//               these get a tab. Draft and News are seasonal/browse and live
//               under Index (findings.md A5).
// `consulted` — a view with no natural weekly home. It stays in its own
//               section's contents rail AND is listed again on the Index under
//               "Consulted, not daily", because these four had zero
//               content-level inbound links (findings.md A1).
export const SECTIONS = [
  {
    key: 'edge',
    label: 'Today',
    searchAka: 'The Edge home briefing',
    to: '/edge',
    blurb: 'Your desk — what needs you today',
    weekly: true,
    views: [],
  },
  {
    key: 'my-team',
    label: 'Squad',
    searchAka: 'My Team roster',
    to: '/my-team',
    blurb: 'Your roster, your lineup, your window',
    weekly: true,
    views: [
      { label: 'My Roster', to: '/my-team', end: true, searchLabel: 'My Roster' },
      { label: 'Lineup', to: '/my-team/lineup', searchLabel: 'Lineup Optimizer' },
      {
        label: 'Season Review', to: '/my-team/season-review',
        searchLabel: 'Season Review', consulted: true,
        blurb: 'Points left on the bench',
      },
      {
        label: 'Trajectory', to: '/my-team/trajectory',
        searchLabel: 'Dynasty Trajectory', consulted: true,
        blurb: 'Where your window peaks',
      },
    ],
  },
  {
    key: 'trade',
    label: 'Trade',
    searchAka: 'Dealing',
    to: '/trade',
    blurb: 'Who to call, what to offer, what it costs',
    weekly: true,
    views: [
      { label: 'Partners', to: '/trade', end: true, searchLabel: 'Trade Partners' },
      { label: 'Analyzer', to: '/trade/analyze', searchLabel: 'Trade Analyzer' },
      { label: 'Targets', to: '/trade/whats-fair', searchLabel: 'Trade Targets' },
      {
        label: 'Managers', to: '/trade/managers',
        searchLabel: 'Manager Scouting', consulted: true,
        blurb: 'How every owner trades',
      },
      { label: 'Pick Trades', to: '/trade/pick-trades', searchLabel: 'Pick Trade Calculator' },
    ],
  },
  {
    key: 'league',
    label: 'League',
    searchAka: 'Standings market',
    to: '/league',
    blurb: 'Everyone else — and the market',
    weekly: true,
    views: [
      { label: 'Overview', to: '/league', end: true, searchLabel: 'League Overview' },
      { label: 'Free Agents', to: '/league/free-agents', searchLabel: 'Free Agents' },
      { label: 'Activity', to: '/league/activity', searchLabel: 'League Activity' },
      { label: 'Movers', to: '/league/movers', searchLabel: 'Market Movers' },
      { label: 'Playoffs', to: '/league/playoffs', searchLabel: 'Playoff Odds' },
    ],
  },
  {
    key: 'draft',
    label: 'Draft',
    searchAka: 'Rookies',
    to: '/draft/board',
    blurb: 'Rookie board, research and draft day',
    weekly: false,
    views: [
      { label: 'Board', to: '/draft/board', searchLabel: 'Draft Board' },
      {
        label: 'Research', to: '/draft/research',
        searchLabel: 'Rookie Research', consulted: true,
        blurb: 'Opportunity vs market',
      },
      { label: 'Tracker', to: '/draft/tracker', searchLabel: 'Draft Tracker' },
    ],
  },
  {
    key: 'news',
    label: 'News',
    searchAka: 'Wire headlines',
    to: '/news',
    blurb: 'Every headline the feed carries',
    weekly: false,
    views: [],
  },
]

// The Index is a destination in its own right — the 5th tab and the app's
// complete map. It is not in SECTIONS because it has no content of its own.
export const INDEX_ROUTE = '/index'
export const INDEX_LABEL = 'Index'

export const WEEKLY_SECTIONS = SECTIONS.filter(s => s.weekly)

/** Every view flagged `consulted`, with the section it belongs to. */
export const CONSULTED_VIEWS = SECTIONS.flatMap(s =>
  s.views.filter(v => v.consulted).map(v => ({ ...v, section: s })),
)

/** Flat list of every navigable destination, for global search. */
export const SEARCH_DESTINATIONS = SECTIONS.flatMap(s => {
  const own = { label: s.label, section: s.label, to: s.to, aka: s.searchAka }
  const views = s.views.map(v => ({
    label: v.searchLabel ?? v.label,
    section: s.label,
    to: v.to,
    aka: s.searchAka,
  }))
  // A section with no sub-views is its own single destination; one with views
  // is already represented by its first view, so don't list it twice.
  return s.views.length ? views : [own]
})

/**
 * Which section owns a pathname. Prefix match on the section's route family,
 * so the standalone drill-downs (`/league/teams/:id`,
 * `/league/trajectory/:id`) correctly read as League.
 */
export function sectionForPath(pathname) {
  // `/draft/board` is Draft's landing, but the family is `/draft`.
  const families = [
    ['/edge', 'edge'],
    ['/my-team', 'my-team'],
    ['/trade', 'trade'],
    ['/league', 'league'],
    ['/draft', 'draft'],
    ['/news', 'news'],
  ]
  for (const [prefix, key] of families) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      return SECTIONS.find(s => s.key === key) ?? null
    }
  }
  return null
}

/**
 * Which TAB should read as current for a pathname. The four weekly sections
 * own themselves; everything else (Draft, News, the Index itself) belongs to
 * Index, which is how you reach them.
 */
export function activeTabFor(pathname) {
  const section = sectionForPath(pathname)
  if (section?.weekly) return section.key
  return 'index'
}
