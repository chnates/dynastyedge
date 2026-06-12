// Position-specific production peak windows — RBs peak (and decline) earliest
// due to workload; QBs hold value deep into their 30s. Shared by the Roster
// Analysis sheet and the player intelligence panel.
export const PEAK_WINDOWS = {
  QB: [26, 33],
  RB: [23, 26],
  WR: [24, 28],
  TE: [25, 29],
}

export function getPeakStatus(position, age) {
  const window = PEAK_WINDOWS[position]
  if (!window || age == null || age <= 0) return null
  const [start, end] = window
  if (age < start) return { phase: 'ascending', label: `Pre-peak — ${position} peak is ${start}–${end}` }
  if (age <= end)  return { phase: 'peak',      label: `In peak window (${position} ${start}–${end})` }
  return { phase: 'declining', label: `Past peak (${position} peak is ${start}–${end})` }
}
