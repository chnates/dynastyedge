import TrendArrow from '../shared/TrendArrow'

export default function PlayerCard({ player, showSlot = false, onClick }) {
  const {
    name,
    position,
    team,
    age,
    value,
    overallRank,
    positionRank,
    trend30Day,
    isStarter,
  } = player

  const Wrapper = onClick ? 'button' : 'div'
  const wrapperProps = onClick
    ? { onClick, className: 'w-full text-left py-2.5 border-b border-border-default dark:border-border-default last:border-0 active:opacity-60 transition-opacity' }
    : { className: 'py-2.5 border-b border-border-default dark:border-border-default last:border-0' }

  return (
    <Wrapper {...wrapperProps}>
      {/* Main row */}
      <div className="flex items-center gap-2">
        {/* Starter indicator */}
        <span className="w-1.5 shrink-0">
          {isStarter && (
            <span className="block w-1.5 h-1.5 rounded-full bg-accent" />
          )}
        </span>

        {/* Name */}
        <span className="flex-1 font-body font-medium text-sm text-text-primary dark:text-text-primary truncate min-w-0">
          {name}
        </span>

        {/* NFL team */}
        <span className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary shrink-0 w-8 text-right uppercase tracking-wide">
          {team}
        </span>

        {/* Dynasty value */}
        <span className="font-mono text-sm font-medium text-text-primary dark:text-text-primary shrink-0 w-14 text-right tabular-nums">
          {value > 0 ? value.toLocaleString() : '—'}
        </span>

        {/* Trend arrow */}
        <span className="shrink-0 w-4 text-center">
          <TrendArrow trend={trend30Day} />
        </span>
      </div>

      {/* Secondary row: ranks + age */}
      <div className="flex items-center gap-1 pl-3.5 mt-0.5">
        {overallRank != null && (
          <span className="text-[10px] text-text-tertiary dark:text-text-tertiary font-body">
            #{overallRank} OVR
          </span>
        )}
        {overallRank != null && positionRank != null && (
          <span className="text-[10px] text-text-tertiary dark:text-text-tertiary">·</span>
        )}
        {positionRank != null && (
          <span className="text-[10px] text-text-tertiary dark:text-text-tertiary font-body">
            #{positionRank} {position}
          </span>
        )}
        {age != null && (
          <>
            <span className="text-[10px] text-text-tertiary dark:text-text-tertiary">·</span>
            <span className="text-[10px] text-text-tertiary dark:text-text-tertiary font-body">
              Age {Math.floor(age)}
            </span>
          </>
        )}
      </div>
    </Wrapper>
  )
}
