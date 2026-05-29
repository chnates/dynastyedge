import { createContext, useContext } from 'react'

export const LeagueContext = createContext(null)

export function useLeagueContext() {
  return useContext(LeagueContext)
}
