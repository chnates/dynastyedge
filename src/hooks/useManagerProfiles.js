import { useMemo } from 'react'
import { useLeagueContext } from '../context/LeagueContext'
import { useTransactions } from './useTransactions'
import { useLeagueHistory } from './useLeagueHistory'
import { usePlayerDB } from './usePlayerDB'
import { buildManagerProfiles } from '../utils/managerAnalysis'
import { ledgerCoverage } from '../utils/leagueHistory'
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
    // Which seasons' trades were actually read — the screens say so, and a
    // manager is never called a non-trader over a season we could not read.
    const rs = history.readState ?? {}
    const coverage = ledgerCoverage({
      currentSeason: String(leagueInfo?.season ?? history.currentSeason),
      currentRead: true,   // useTransactions rejects (ErrorState) on a total outage
      historyRead: true,
      ledgerSeasons: rs.ledgerSeasons ?? (history.pastSeasons ?? []).map(ps => ps.season),
      failedSeasons: rs.failedSeasons ?? [],
      chainBroken: rs.chainBroken ?? null,
    })
    const analysis = buildManagerProfiles({
      history,
      currentLeague: {
        season: String(leagueInfo?.season ?? history.currentSeason),
        // Read the budget from league settings, never assumed — it went
        // $100 -> $1000 for 2026 and FAAB is aggregated as percent of it.
        faabBudget: leagueInfo?.settings?.waiver_budget,
        allRosters: league.allRosters,
        transactions,
      },
      playerMap: values.playerMap,
      pickEntries: values.pickEntries,
      playerDB,
      myOwnerId,
      coverage,
    })
    return {
      ...analysis,
      readState: {
        partialSeasons: rs.partialSeasons ?? [],
        draftGaps: rs.draftGaps ?? [],
        chainBroken: rs.chainBroken ?? null,
      },
    }
  }, [league, values, leagueInfo, transactions, history, playerDB, myRosterId])

  const loading = (leagueLoading && !league) || (txLoading && !transactions) || (historyLoading && !history)
  const error = leagueError ?? txError ?? historyError ?? null

  function retry() {
    if (leagueError) leagueRetry()
    if (txError) txRetry()
    if (historyError) historyRetry()
  }

  // Re-walk the history (used by the Managers screen's gap notice).
  function retryHistory() { historyRetry() }

  return { analysis, loading, error, retry, retryHistory }
}
