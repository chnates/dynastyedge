import { useLeagueContext } from '../../context/LeagueContext'
import TeamAvatar from '../shared/TeamAvatar'
import { cn } from '../ui'

// A week's five games is an enumeration, so a matchup is a RULED PAIR inside a
// <RuledList>, not a bordered box (law 5). The two sides are held together by
// being adjacent and sharing one rule below them; the leader is carried by
// weight rather than by a box around the pair.
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
    <div className="py-2.5 border-b border-border-default">
      {rows.map(side => (
        <div key={side.rosterId} className="flex items-center gap-2 py-0.5">
          <TeamAvatar owner={side.owner} size={20} />
          {/* Not truncated: the value column is fixed-width and short, so a
              long team name wraps rather than eliding. */}
          <span className={cn(
            'flex-1 min-w-0 font-body text-sm text-text-primary text-balance',
            side.leading ? 'font-semibold' : 'font-normal',
          )}>
            {side.teamName}
          </span>
          {hasScores && (
            <span className={cn(
              'shrink-0 font-mono text-sm tabular-nums',
              side.leading ? 'font-bold text-text-primary' : 'font-medium text-text-tertiary',
            )}>
              {side.points.toFixed(2)}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
