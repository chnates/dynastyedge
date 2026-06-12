// "Since your last visit" anchor for The Edge. The previous visit timestamp
// is read once per session and stays stable for the whole session — bouncing
// between tabs and back doesn't reset the diff mid-coffee. The stored value
// is bumped to "now" on that first read, so tomorrow's open diffs against
// today's session.
const KEY = 'dynastyedge_edge_last_visit'

let sessionPrev // undefined until first read; null = first visit ever

export function useLastVisit() {
  if (sessionPrev === undefined) {
    try {
      sessionPrev = Number(localStorage.getItem(KEY)) || null
    } catch {
      sessionPrev = null
    }
    try {
      localStorage.setItem(KEY, String(Date.now()))
    } catch {
      // private mode — the diff just won't persist across sessions
    }
  }
  return sessionPrev
}
