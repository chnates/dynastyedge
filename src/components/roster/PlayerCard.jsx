import TrendArrow from '../shared/TrendArrow'
import { Magnitude } from '../ui'
import { POS_TEXT } from '../../utils/positionColors'

export default function PlayerCard({ player, onClick }) {
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
            <span className="block w-1.5 h-1.5 bg-accent" />
          )}
        </span>

        {/* Name. NOT truncated: a player's name is the one field on this row
            that must never elide (CLAUDE.md -> "Truncation is not a layout
            strategy for a load-bearing value"), and the value column beside it
            is now variable-width, so a long name wraps instead. */}
        <span className="flex-1 font-body font-medium text-sm text-text-primary dark:text-text-primary min-w-0 text-balance">
          {name}
        </span>

        {/* NFL team */}
        <span className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary shrink-0 w-8 text-right uppercase tracking-wide">
          {team}
        </span>

        {/* Dynasty value — SIZE IS THE QUANTITY (finding B2). This row is where
            the finding was measured: "Bo Nix (4,867) and Xavier Legette (365) —
            a 13x spread — are visually indistinguishable". The column keeps a
            minimum width and stays right-aligned so the figures still line up
            down the list while their sizes differ. */}
        <span className="shrink-0 min-w-[80px] text-right">
          <Magnitude value={value > 0 ? value : null} />
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
          <span className={`text-[10px] font-body font-semibold ${POS_TEXT[position] ?? 'text-text-tertiary dark:text-text-tertiary'}`}>
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
