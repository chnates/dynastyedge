import { useMemo } from 'react'
import { useLeagueContext } from '../context/LeagueContext'
import { useTransactions } from './useTransactions'
import { useLeagueHistory } from './useLeagueHistory'
import { usePlayerDB } from './usePlayerDB'
import { buildManagerProfiles } from '../utils/managerAnalysis'
import { useIdentity } from './useIdentity'

// Manager scouting profiles: combines current-season league state (context),
// the current-season transaction log (useTransactions cache), and every past
// season walked via useLeagueHistory into per-manager behavioral profiles.
// All inputs are session-cached, so the heavy lifting happens once.
export function useManagerProfiles() {
  const { league, values, leagueInfo, loading: leagueLoading, error: leagueError, retry: leagueRetry } = useLeagueContext()
  const { transactions, loading: txLoading, error: txError, retry: txRetry } = useTransactions()
  const { history, loading: historyLoading, error: historyError, retry: historyRetry } = useLeagueHistory()
  const { playerDB } = usePlayerDB()
  const { rosterId: myRosterId } = useIdentity()

  const analysis = useMemo(() => {
    if (!league?.allRosters?.length || !values?.playerMap || !transactions || !history) return null
    const myOwnerId = league.allRosters.find(r => r.rosterId === myRosterId)?.owner?.user_id ?? null
    return buildManagerProfiles({
      history,
      currentLeague: {
        season: String(leagueInfo?.season ?? history.currentSeason),
        allRosters: league.allRosters,
        transactions,
      },
      playerMap: values.playerMap,
      pickEntries: values.pickEntries,
      playerDB,
      myOwnerId,
    })
  }, [league, values, leagueInfo, transactions, history, playerDB, myRosterId])

  const loading = (leagueLoading && !league) || (txLoading && !transactions) || (historyLoading && !history)
  const error = leagueError ?? txError ?? historyError ?? null

  function retry() {
    if (leagueError) leagueRetry()
    if (txError) txRetry()
    if (historyError) historyRetry()
  }

  return { analysis, loading, error, retry }
}
