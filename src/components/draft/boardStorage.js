// Shared localStorage keys + safe reader for the Draft section.
// The Board owns the board order and CSV rankings; prospect notes are
// read/written by both the Board and the Tracker so draft-day views
// stay in sync.
export const BOARD_ORDER_KEY = 'dynastyedge_board_order'
export const NOTES_KEY       = 'dynastyedge_prospect_notes'
export const CSV_KEY         = 'dynastyedge_csv_rankings'

export function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}
