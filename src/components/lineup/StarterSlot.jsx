import { POS_TEXT } from '../../utils/positionColors'

const MATCHUP_CONFIG = {
  Easy:    { label: 'Easy',    className: 'text-success bg-success/10' },
  Neutral: { label: 'Ntrl',   className: 'text-text-secondary bg-bg-secondary dark:bg-bg-secondary' },
  Tough:   { label: 'Tough',  className: 'text-danger bg-danger/10' },
}

const FLAG_DOT = {
  red:    <span className="inline-block w-2 h-2 rounded-full bg-danger" />,
  yellow: <span className="inline-block w-2 h-2 rounded-full bg-warning" />,
  green:  <span className="inline-block w-2 h-2 rounded-full bg-success" />,
}

const FLAG_BG = {
  red:    'bg-danger/5',
  yellow: 'bg-warning/5',
  green:  '',
}

export default function StarterSlot({ slotLabel, player, flag, projPts, matchupQuality, bestBenchPts, onClick }) {
  const mqCfg    = MATCHUP_CONFIG[matchupQuality] ?? MATCHUP_CONFIG.Neutral
  const tappable = flag === 'red' || flag === 'yellow'
  const gap      = bestBenchPts > projPts ? (bestBenchPts - projPts).toFixed(1) : null

  return (
    <div
      role={tappable ? 'button' : undefined}
      tabIndex={tappable ? 0 : undefined}
      onClick={tappable ? onClick : undefined}
      onKeyDown={tappable ? e => e.key === 'Enter' && onClick?.() : undefined}
      className={[
        'py-2.5 border-b border-border-default dark:border-border-default last:border-0',
        FLAG_BG[flag] ?? '',
        tappable ? 'cursor-pointer active:opacity-70' : '',
      ].join(' ')}
    >
      {/* Main row */}
      <div className="flex items-center gap-2">
        {/* Slot label — position slots use position colors, FLEX/SF keep accent */}
        <span className={`shrink-0 w-9 font-body text-[10px] font-semibold uppercase tracking-wider ${
          POS_TEXT[String(slotLabel ?? '').replace(/[0-9]/g, '')] ?? 'text-accent'
        }`}>
          {slotLabel}
        </span>

        {/* Player name */}
        <span className="flex-1 font-body font-medium text-sm text-text-primary dark:text-text-primary truncate min-w-0">
          {player?.name ?? '—'}
        </span>

        {/* NFL team */}
        <span className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary shrink-0 w-8 text-right uppercase tracking-wide">
          {player?.team ?? ''}
        </span>

        {/* Projected pts */}
        <span className="font-mono text-sm font-semibold text-text-primary dark:text-text-primary shrink-0 w-10 text-right tabular-nums">
          {projPts > 0 ? projPts.toFixed(1) : '—'}
        </span>

        {/* Matchup quality pill */}
        <span className={`shrink-0 rounded-full px-1.5 py-0.5 font-body text-[9px] font-semibold uppercase tracking-wide ${mqCfg.className}`}>
          {mqCfg.label}
        </span>

        {/* Flag dot */}
        <span className="shrink-0 flex items-center justify-center w-4">
          {FLAG_DOT[flag] ?? FLAG_DOT.green}
        </span>
      </div>

      {/* Bench upgrade hint */}
      {gap && (
        <div className="pl-11 mt-0.5">
          <span className="font-body text-[10px] text-warning">
            Bench upgrade available +{gap} pts
          </span>
        </div>
      )}
    </div>
  )
}
