// Shared localStorage keys + safe reader for the Draft section.
// The Board owns the board order and CSV rankings; prospect notes are
// read/written by both the Board and the Tracker so draft-day views
// stay in sync.
import { STORAGE_KEYS } from '../../storageKeys'
export const BOARD_ORDER_KEY = STORAGE_KEYS.boardOrder
export const NOTES_KEY       = STORAGE_KEYS.prospectNotes
export const CSV_KEY         = STORAGE_KEYS.csvRankings

export function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}
