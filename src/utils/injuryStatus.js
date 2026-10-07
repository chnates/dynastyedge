// THE injury-status rule — the one place that decides what a Sleeper
// `injury_status` means. The Lineup Optimizer, the player card, the Trade
// Analyzer's injury check, the IR action item and the MCP tools all read it.
//
// Until 2026-10-07 there were three lists (projections.js, usePlayerNews.js,
// RosterActionItems.jsx) and they disagreed on live players: Sleeper sends
// `Sus`, which the Optimizer's list spelled `Suspended`/`SUSP` and so never
// blocked; `NA` blocked a starter but read "Active" on his card; `DNR` and
// `COV` were healthy everywhere; `Doubtful` was startable in the Optimizer and
// "currently out" in the trade verdict. (docs/analysis/code-review-2026-10.md
// finding 1.) tests/injuryStatus.test.mjs fails if a second list appears.
//
// The grouping is the owner's call (2026-10-07):
//   OUT          — he is not playing this week. Blocks a lineup slot; in a
//                  trade, the "currently out" warning and Accept → Counter.
//   QUESTIONABLE — a real doubt, but he can play. Startable, flagged; in a
//                  trade, a caution note and nothing more. Doubtful lives here
//                  because a one-week tag barely moves a multi-year asset.
//
// Values measured on the live /players/nfl payload 2026-10-07: Questionable,
// IR, Out, NA, PUP, Sus, DNR, COV (plus null and ''). The older spellings
// (Suspended, SUSP, NFI, NFI-R) are kept so a payload that still uses them
// keeps blocking.

const OUT = new Set([
  'Out', 'IR', 'PUP', 'Sus', 'Suspended', 'SUSP', 'NFI', 'NFI-R', 'NA', 'DNR', 'COV',
])
const QUESTIONABLE = new Set(['Questionable', 'Doubtful'])

// Sleeper sends these exact casings; matching case-insensitively costs nothing
// and means a casing change upstream cannot quietly turn a status healthy.
const OUT_LC = new Set([...OUT].map(s => s.toLowerCase()))
const QUESTIONABLE_LC = new Set([...QUESTIONABLE].map(s => s.toLowerCase()))

// 'out' | 'questionable' | 'ok'.
//
// A status this list has never seen is 'questionable', never 'ok': it is shown
// and flagged, but it does not block a slot. Treating an unknown code as healthy
// is exactly how DNR and COV slipped through; treating it as out could bench a
// player who is fine. The middle answer surfaces it without guessing.
export function classifyInjuryStatus(status) {
  if (status == null) return 'ok'
  const s = String(status).trim().toLowerCase()
  if (!s) return 'ok'
  if (OUT_LC.has(s)) return 'out'
  if (QUESTIONABLE_LC.has(s)) return 'questionable'
  return 'questionable'
}

// The three-colour flag the player card and the trade cards draw.
export const INJURY_FLAG = { out: 'red', questionable: 'yellow', ok: 'green' }

export function injuryFlag(status) {
  return INJURY_FLAG[classifyInjuryStatus(status)]
}

// The chip text on a 390px lineup row. A full-width "QUESTIONABLE" badge
// squeezes the player's own name down to "Rach…".
const SHORT_LABEL = {
  Questionable: 'Q', Doubtful: 'D', Suspended: 'SUSP', 'NFI-R': 'NFI',
}

export function injuryShortLabel(status) {
  return status ? (SHORT_LABEL[status] ?? status) : null
}

// May this player go in an IR slot? This is the LEAGUE's rule, not the out
// list: Sleeper's league settings carry `reserve_allow_out`, `_doubtful`,
// `_sus`, `_na`, `_dnr`, `_cov`. IR and PUP are always eligible (they are the
// designations the slot exists for). Live 2026-10-07 this league allows Out
// and COV only.
const RESERVE_SETTING = {
  out: 'reserve_allow_out',
  doubtful: 'reserve_allow_doubtful',
  sus: 'reserve_allow_sus',
  suspended: 'reserve_allow_sus',
  susp: 'reserve_allow_sus',
  na: 'reserve_allow_na',
  dnr: 'reserve_allow_dnr',
  cov: 'reserve_allow_cov',
}

export function isIrEligible(status, leagueSettings) {
  if (status == null) return false
  const s = String(status).trim().toLowerCase()
  if (s === 'ir' || s === 'pup') return true
  const key = RESERVE_SETTING[s]
  return !!(key && Number(leagueSettings?.[key]) === 1)
}

// IR CAPACITY — one home (owner, 2026-10-07: "I only have 2 IR spots. Once
// those are full, people have to stay on the bench injured."). Eligibility
// alone is not advice: with every slot taken, "move him to IR" cannot be
// followed, and an injured player the league WOULD let onto IR occupies a
// bench spot instead. Read by The Edge / My Roster's IR action item and the
// MCP server's get_roster, so the two can never disagree about room.
//   slots           settings.reserve_slots (0 when the league has none)
//   used            players currently in an IR slot
//   open            slots − used, never below 0
//   full            every slot taken (and the league has at least one)
//   eligibleWaiting active (not IR, not taxi) players the league would allow
//                   onto IR — on the bench or starting, taking an active spot
//   canMove         how many of them actually fit right now
// `statusOf(player)` returns the Sleeper injury_status; taxi players are left
// out because taxi sits outside the active roster, so moving one frees nothing.
export function buildIrCapacity(players, leagueSettings, statusOf) {
  const slots = Math.max(0, Number(leagueSettings?.reserve_slots) || 0)
  const list = players ?? []
  const used = list.filter(p => p.isIR).length
  const open = Math.max(0, slots - used)
  const eligibleWaiting = list.filter(p =>
    !p.isIR && !p.isTaxi && isIrEligible(statusOf(p), leagueSettings))
  return {
    slots, used, open,
    full: slots > 0 && open === 0,
    eligibleWaiting,
    canMove: Math.min(open, eligibleWaiting.length),
  }
}

// One player's status as the player card and the trade cards consume it,
// read off a trimmed player-DB row. Pure, so the hook and the MCP server build
// the same row. `meta` undefined (the player is not in the DB) reads as no
// status, exactly as the Optimizer treats him.
export function injuryFromMeta(meta) {
  const status = meta?.injury_status || null
  return {
    injuryFlag:   injuryFlag(status),
    injuryKind:   classifyInjuryStatus(status),
    injuryStatus: status,
    injuryDetail: meta?.injury_body_part ?? null,
    injuryNotes:  meta?.injury_notes ?? null,
    unavailable:  false,
  }
}

// The row when the player DB itself could not be read: no flag, and the
// trade verdict says the check was not possible. Never a fabricated "Active".
export const INJURY_UNAVAILABLE = Object.freeze({
  injuryFlag: null, injuryKind: null, injuryStatus: null,
  injuryDetail: null, injuryNotes: null, unavailable: true,
})
