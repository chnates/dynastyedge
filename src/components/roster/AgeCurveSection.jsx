import { useMemo } from 'react'

const POS_COLORS = {
  QB: '#4F7FFF',
  RB: '#22C55E',
  WR: '#F59E0B',
  TE: '#EF4444',
}

const AGE_MIN = 21
const AGE_MAX = 35
const CURRENT_YEAR = 2026

const SVG_W = 280
const SVG_H = 48
const PAD_L = 6
const PAD_R = 6
const PAD_T = 14
const PAD_B = 10
const PLOT_W = SVG_W - PAD_L - PAD_R
const PLOT_H = SVG_H - PAD_T - PAD_B
const AXIS_Y = PAD_T + PLOT_H

function ageToX(age) {
  return PAD_L + ((age - AGE_MIN) / (AGE_MAX - AGE_MIN)) * PLOT_W
}

function winWindowLabel(avgAge) {
  if (avgAge == null) return null
  if (avgAge < 24) return `Core window: ${CURRENT_YEAR + 2}–${CURRENT_YEAR + 5} — building phase`
  if (avgAge < 26) return `Core window: ${CURRENT_YEAR + 1}–${CURRENT_YEAR + 4} — ascending`
  if (avgAge < 28) return `Core window: ${CURRENT_YEAR}–${CURRENT_YEAR + 3} — prime window`
  if (avgAge < 30) return `Core window: ${CURRENT_YEAR}–${CURRENT_YEAR + 2} — contending now`
  return 'Core window: peaking — prioritize proven players'
}

export default function AgeCurveSection({ players, avgStarterAge, allRosters }) {
  const leagueAvgAge = useMemo(() => {
    if (!allRosters?.length) return null
    const valid = allRosters.map(r => r.avgStarterAge).filter(a => a != null && a > 0)
    if (!valid.length) return null
    return valid.reduce((s, a) => s + a, 0) / valid.length
  }, [allRosters])

  const dots = useMemo(() => {
    return players
      .filter(p => p.age != null && p.age > 0 && POS_COLORS[p.position])
      .map(p => ({
        x: ageToX(Math.max(AGE_MIN, Math.min(AGE_MAX, p.age))),
        color: POS_COLORS[p.position],
        starter: p.isStarter,
        pos: p.position,
        age: p.age,
      }))
  }, [players])

  const peakX = ageToX(27)
  const TICK_AGES = [21, 25, 27, 30, 35]

  return (
    <div className="mt-4 mb-1">
      <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary dark:text-text-secondary mb-2">
        Age Curve
      </p>

      <div className="rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-3 py-3">
        {/* Dot plot */}
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          width="100%"
          height={SVG_H}
          style={{ display: 'block', overflow: 'visible' }}
        >
          {/* Axis line */}
          <line
            x1={PAD_L} y1={AXIS_Y}
            x2={SVG_W - PAD_R} y2={AXIS_Y}
            stroke="currentColor" strokeWidth="0.5"
            className="text-border-default"
          />

          {/* Tick marks + labels */}
          {TICK_AGES.map(age => {
            const x = ageToX(age)
            return (
              <g key={age}>
                <line
                  x1={x} y1={AXIS_Y}
                  x2={x} y2={AXIS_Y + 3}
                  stroke="currentColor" strokeWidth="0.5"
                  className="text-border-default"
                />
                <text
                  x={x} y={AXIS_Y + 9}
                  textAnchor="middle"
                  fontSize="6"
                  fill="currentColor"
                  className="text-text-tertiary"
                  fontFamily="'IBM Plex Sans', system-ui, sans-serif"
                >{age}</text>
              </g>
            )
          })}

          {/* Peak reference line */}
          <line
            x1={peakX} y1={PAD_T - 10}
            x2={peakX} y2={AXIS_Y}
            stroke="#F59E0B" strokeWidth="0.75" strokeDasharray="2,2"
          />
          <text
            x={peakX + 2} y={PAD_T - 3}
            fontSize="6" fill="#F59E0B"
            fontFamily="'IBM Plex Sans', system-ui, sans-serif"
          >Peak</text>

          {/* Player dots — bench behind starters */}
          {dots.filter(d => !d.starter).map((d, i) => (
            <circle
              key={`bench-${i}`}
              cx={d.x}
              cy={PAD_T + PLOT_H / 2}
              r={3}
              fill={d.color}
              opacity={0.4}
            />
          ))}
          {dots.filter(d => d.starter).map((d, i) => (
            <circle
              key={`starter-${i}`}
              cx={d.x}
              cy={PAD_T + PLOT_H / 2}
              r={3.5}
              fill={d.color}
              opacity={0.9}
            />
          ))}
        </svg>

        {/* Summary stats */}
        <div className="mt-2 flex flex-col gap-0.5">
          <p className="font-body text-[11px] text-text-secondary dark:text-text-secondary">
            <span className="font-medium">Avg starters:</span>{' '}
            <span className="font-mono">{avgStarterAge != null ? avgStarterAge.toFixed(1) : '—'}</span>
            {leagueAvgAge != null && (
              <>
                {' · '}
                <span className="font-medium">League avg:</span>{' '}
                <span className="font-mono">{leagueAvgAge.toFixed(1)}</span>
              </>
            )}
          </p>
          {avgStarterAge != null && (
            <p className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary">
              {winWindowLabel(avgStarterAge)}
            </p>
          )}
        </div>

        {/* Legend */}
        <div className="mt-2 flex gap-3">
          {Object.entries(POS_COLORS).map(([pos, color]) => (
            <div key={pos} className="flex items-center gap-1">
              <svg width="8" height="8" viewBox="0 0 8 8">
                <circle cx="4" cy="4" r="3.5" fill={color} opacity={0.9} />
              </svg>
              <span className="font-body text-[9px] font-semibold uppercase text-text-tertiary dark:text-text-tertiary tracking-wide">
                {pos}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
