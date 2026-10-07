// tradeDeadline.js — THE trade-deadline rule (one home, 2026-10-07).
//
// The deadline WEEK is a league setting (`settings.trade_deadline`, Week 13
// here) and is read, never assumed. What this file owns is the arithmetic on
// top of it — how many weeks are left, and when the deadline counts as
// "soon" — which used to be written out separately by The Edge's briefing
// item and the Trade section's banner, and is now also read by the MCP
// server's league calendar (the scheduled brief, open-items §0 #9).
// `tests/tradeDeadline.test.mjs` fails if a screen does the subtraction again.

// The deadline turns urgent this many weeks out (The Edge item + amber banner).
export const DEADLINE_SOON_WEEKS = 2

// → { week, weeksLeft, status } or null when there is nothing to say:
//   offseason, no deadline configured, or no current week.
// status: 'upcoming' (> SOON weeks out) · 'soon' (1–SOON) · 'this-week' · 'passed'
export function readTradeDeadline({ tradeDeadline, nflState, isOffseason }) {
  const week = Number(tradeDeadline)
  const current = Number(nflState?.week)
  if (isOffseason || !Number.isFinite(week) || week <= 0) return null
  if (!Number.isFinite(current) || current <= 0) return null
  const weeksLeft = week - current
  const status = weeksLeft < 0 ? 'passed'
    : weeksLeft === 0 ? 'this-week'
      : weeksLeft <= DEADLINE_SOON_WEEKS ? 'soon'
        : 'upcoming'
  return { week, weeksLeft, status }
}

// True in the deadline week and the SOON weeks before it — the window The
// Edge raises an item for and the scheduled brief adds its deadline section.
export function isDeadlineWindow(deadline) {
  return deadline?.status === 'this-week' || deadline?.status === 'soon'
}
