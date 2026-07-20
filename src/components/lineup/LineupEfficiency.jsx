import { useMemo } from 'react'
import { useLeagueContext } from '../../context/LeagueContext'
import { usePlayerDB } from '../../hooks/usePlayerDB'
import { useLineupHistory } from '../../hooks/useLineupHistory'
import { computeOptimalPoints } from '../../utils/lineupHistory'
import SectionHeader from '../shared/SectionHeader'

function Page({ children }) {
  return (
    <div className="px-4 pb-6">
      <div className="pt-4 pb-3 border-b border-border-default dark:border-border-default mb-1">
        <h1 className="font-display text-2xl uppercase tracking-wide text-text-primary dark:text-text-primary leading-tight">
          Season Review
        </h1>
        <p className="font-body text-xs text-text-secondary dark:text-text-secondary mt-0.5">
          Actual vs. optimal lineup — points left on your bench, week by week.
        </p>
      </div>
      {children}
    </div>
  )
}

// Season review: actual points vs the best possible lineup each week —
// "how many points did I leave on the bench?"
export default function LineupEfficiency() {
  const { nflState, values } = useLeagueContext()
  const { playerDB } = usePlayerDB()
  const { byWeek, loading, error, retry } = useLineupHistory(nflState)

  const review = useMemo(() => {
    if (!byWeek?.length) return null
    if (!playerDB && !values?.playerMap) return null

    const getPosition = id =>
      playerDB?.[id]?.position ?? values?.playerMap?.[id]?.position ?? null

    const rows = byWeek.map(entry => {
      const actual = entry.points
      // Clamp: missing position data can only make the computed optimal too
      // low — a real optimal lineup is never worse than what was started.
      const optimal = Math.max(
        computeOptimalPoints(entry.players, entry.playersPoints, getPosition),
        actual
      )
      return { week: entry.week, actual, optimal, delta: optimal - actual }
    })

    const totalActual = rows.reduce((s, r) => s + r.actual, 0)
    const totalOptimal = rows.reduce((s, r) => s + r.optimal, 0)
    const totalLeft = totalOptimal - totalActual
    const efficiency = totalOptimal > 0 ? (totalActual / totalOptimal) * 100 : 100

    return { rows, totalLeft, efficiency }
  }, [byWeek, playerDB, values])

  if (loading) {
    return (
      <Page>
        <p className="font-body text-sm text-text-tertiary dark:text-text-tertiary py-2">
          Crunching past lineups…
        </p>
      </Page>
    )
  }

  if (error) {
    return (
      <Page>
        <p className="font-body text-sm text-text-tertiary dark:text-text-tertiary py-2">
          Couldn't load lineup history.{' '}
          <button onClick={retry} className="text-accent font-medium">Retry</button>
        </p>
      </Page>
    )
  }

  if (!review) {
    return (
      <Page>
        <p className="font-body text-sm text-text-tertiary dark:text-text-tertiary py-2">
          No completed weeks yet — efficiency tracking starts after Week 1.
        </p>
      </Page>
    )
  }

  const { rows, totalLeft, efficiency } = review

  return (
    <Page>
      <section>
        <SectionHeader label="Efficiency" count={`${rows.length} wks`} />

        <div className="rounded-none bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-4 py-3 mb-2">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-semibold text-accent tabular-nums">
              {efficiency.toFixed(1)}%
            </span>
            <span className="font-body text-xs text-text-secondary dark:text-text-secondary">
              lineup efficiency
            </span>
          </div>
          <p className="font-body text-xs text-text-secondary dark:text-text-secondary mt-1">
            {totalLeft.toFixed(1)} points left on the bench across {rows.length} week{rows.length === 1 ? '' : 's'}.
          </p>
        </div>

        <div className="rounded-none bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-3">
          {rows.map(({ week, actual, optimal, delta }) => {
            const deltaColor = delta < 1 ? 'text-success' : delta < 10 ? 'text-warning' : 'text-danger'
            return (
              <div
                key={week}
                className="flex items-center gap-2 py-2 border-b border-border-default dark:border-border-default last:border-0"
              >
                <span className="font-body text-[11px] font-semibold text-text-secondary dark:text-text-secondary w-8 shrink-0">
                  W{week}
                </span>
                <span className="font-mono text-sm text-text-primary dark:text-text-primary tabular-nums flex-1 text-right">
                  {actual.toFixed(1)}
                </span>
                <span className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary shrink-0">
                  of
                </span>
                <span className="font-mono text-sm text-text-secondary dark:text-text-secondary tabular-nums w-14 text-right">
                  {optimal.toFixed(1)}
                </span>
                <span className={`font-mono text-xs font-semibold tabular-nums w-12 text-right ${deltaColor}`}>
                  {delta < 0.05 ? '✓' : `−${delta.toFixed(1)}`}
                </span>
              </div>
            )
          })}
        </div>
      </section>
    </Page>
  )
}
