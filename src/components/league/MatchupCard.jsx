export default function MatchupCard({ pair }) {
  if (!pair || pair.length !== 2) return null
  const [home, away] = pair
  const hasScores = home.points > 0 || away.points > 0

  return (
    <div className="rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-body text-sm font-medium text-text-primary dark:text-text-primary truncate flex-1">
          {home.teamName}
        </span>
        {hasScores && (
          <span className="font-mono text-sm font-semibold text-accent tabular-nums shrink-0">
            {home.points.toFixed(2)}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 mt-1.5">
        <span className="font-body text-sm font-medium text-text-primary dark:text-text-primary truncate flex-1">
          {away.teamName}
        </span>
        {hasScores && (
          <span className="font-mono text-sm font-semibold text-text-secondary dark:text-text-secondary tabular-nums shrink-0">
            {away.points.toFixed(2)}
          </span>
        )}
      </div>
    </div>
  )
}
