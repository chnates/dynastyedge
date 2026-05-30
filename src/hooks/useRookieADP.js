import { useSleeperRookies } from './useSleeperRookies'

// Thin alias — delegates entirely to useSleeperRookies.
// Sleeper's years_exp === 0 is the authoritative 2026 rookie filter;
// the former FantasyCalc rookiesOnly endpoint was returning non-rookies.
export function useRookieADP() {
  const { sleeperRookieMap: rookieMap, loading, error, retry } = useSleeperRookies()
  return { rookieMap, loading, error, retry }
}
