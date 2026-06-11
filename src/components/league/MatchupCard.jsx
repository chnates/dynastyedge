import { useLeagueContext } from '../../context/LeagueContext'
import TeamAvatar from '../shared/TeamAvatar'

export default function MatchupCard({ pair }) {
  const { league } = useLeagueContext()
  if (!pair || pair.length !== 2) return null
  const [home, away] = pair
  const hasScores = home.points > 0 || away.points > 0

  const rows = [home, away].map(side => ({
    ...side,
    owner: league?.userMap?.[side.rosterId] ?? null,
    leading: hasScores && side.points >= Math.max(home.points, away.points),
  }))

  return (
    <div className="rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-3 py-2.5 flex flex-col gap-1.5">
      {rows.map(side => (
        <div key={side.rosterId} className="flex items-center gap-2">
          <TeamAvatar owner={side.owner} size={22} />
          <span className="font-body text-sm font-medium text-text-primary dark:text-text-primary truncate flex-1">
            {side.teamName}
          </span>
          {hasScores && (
            <span className={`font-mono text-sm font-semibold tabular-nums shrink-0 ${
              side.leading ? 'text-accent' : 'text-text-secondary dark:text-text-secondary'
            }`}>
              {side.points.toFixed(2)}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
