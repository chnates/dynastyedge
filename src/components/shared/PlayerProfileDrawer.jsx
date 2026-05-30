import { useEffect, useMemo, useRef } from 'react'
import { X } from 'lucide-react'
import TrendArrow from './TrendArrow'

// ── Opportunity grade ────────────────────────────────────────────────────────

function getOpportunityGrade(position, positionRank, value) {
  if (position === 'QB') {
    if (positionRank <= 2) return 'A'
    if (positionRank <= 6) return 'B'
    if (positionRank <= 12) return 'C'
    return 'D'
  }
  if (position === 'WR') {
    if (positionRank <= 5 && value >= 5000) return 'A'
    if (positionRank <= 12) return 'B'
    if (positionRank <= 24) return 'C'
    return 'D'
  }
  if (position === 'RB') {
    if (positionRank <= 5 && value >= 4000) return 'A'
    if (positionRank <= 12) return 'B'
    if (positionRank <= 24) return 'C'
    return 'D'
  }
  if (position === 'TE') {
    if (positionRank <= 2) return 'A'
    if (positionRank <= 6) return 'B'
    if (positionRank <= 12) return 'C'
    return 'D'
  }
  return 'C'
}

const GRADE_STYLES = {
  A: 'bg-success/20 text-success border-success/30',
  B: 'bg-accent/20 text-accent border-accent/30',
  C: 'bg-warning/20 text-warning border-warning/30',
  D: 'bg-text-tertiary/20 text-text-tertiary border-text-tertiary/30',
}

const GRADE_LABELS = { A: 'Elite', B: 'Strong', C: 'Upside', D: 'Deep Stash' }

// ── Role description per position ────────────────────────────────────────────

function getRoleDescription(position, positionRank) {
  if (position === 'QB') {
    if (positionRank <= 3) return 'Elite QB1 — top Superflex asset'
    if (positionRank <= 8) return 'QB1 starter — strong Superflex value'
    if (positionRank <= 15) return 'QB2 / streaming — situational Superflex'
    return 'Backup QB — minimal dynasty value'
  }
  if (position === 'WR') {
    if (positionRank <= 5) return 'WR1 profile — featured target in offense'
    if (positionRank <= 12) return 'WR2 profile — reliable weekly starter'
    if (positionRank <= 24) return 'WR3 / flex — target-share dependent'
    if (positionRank <= 40) return 'Depth / boom-bust upside'
    return 'Stash candidate — long-term dart throw'
  }
  if (position === 'RB') {
    if (positionRank <= 5) return 'Three-down workhorse — lead back role'
    if (positionRank <= 12) return 'Feature back or competitive timeshare'
    if (positionRank <= 24) return 'Timeshare / committee role'
    return 'Backup / handcuff value only'
  }
  if (position === 'TE') {
    if (positionRank <= 2) return 'Elite TE1 — target monster, positional scarcity'
    if (positionRank <= 6) return 'TE1 starter — reliable weekly production'
    if (positionRank <= 12) return 'TE2 / streaming — matchup dependent'
    return 'Depth TE — minimal standalone value'
  }
  return ''
}

// ── Comparable players ───────────────────────────────────────────────────────

function getComparables(player, playerMap) {
  const { position, value, age, sleeperId } = player
  if (!value || !position) return []

  const valueLow = value * 0.78
  const valueHigh = value * 1.28
  const ageLow = (age ?? 25) - 2.5
  const ageHigh = (age ?? 25) + 2.5

  return Object.values(playerMap)
    .filter(p =>
      p.sleeperId !== sleeperId &&
      p.position === position &&
      p.value >= valueLow &&
      p.value <= valueHigh &&
      p.age != null &&
      p.age >= ageLow &&
      p.age <= ageHigh
    )
    .sort((a, b) => Math.abs(a.value - value) - Math.abs(b.value - value))
    .slice(0, 4)
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PlayerProfileDrawer({ player, onClose, playerMap = {}, csvColumns = [], rosterComparison = null }) {
  const overlayRef = useRef(null)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const grade = useMemo(() =>
    getOpportunityGrade(player.position, player.positionRank ?? 99, player.value ?? 0),
  [player])

  const role = useMemo(() =>
    getRoleDescription(player.position, player.positionRank ?? 99),
  [player])

  const comparables = useMemo(() =>
    getComparables(player, playerMap),
  [player, playerMap])

  const myRankings = csvColumns
    .map(col => ({ name: col.name, rank: col.data?.[player.name?.toLowerCase()] ?? null }))
    .filter(r => r.rank != null)

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose()
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-end bg-black/60"
    >
      <div className="w-full max-h-[85vh] overflow-y-auto bg-bg-secondary rounded-t-2xl border-t border-border-default">

        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border-default" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-4 pt-2 pb-3 border-b border-border-default">
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-body text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${GRADE_STYLES[grade]}`}>
                {grade} — {GRADE_LABELS[grade]}
              </span>
              {player.position && (
                <span className="font-body text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                  {player.position}
                </span>
              )}
            </div>
            <h2 className="font-display text-xl font-bold uppercase tracking-wide text-text-primary mt-1 leading-tight">
              {player.name}
            </h2>
            <p className="font-body text-sm text-text-secondary mt-0.5">
              {player.team || 'FA'}{player.age != null ? ` · Age ${Math.floor(player.age)}` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex-shrink-0"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="px-4 pb-6 pt-3 flex flex-col gap-4">

          {/* Dynasty value */}
          <div className="rounded-xl bg-bg-card border border-border-default px-3 py-3">
            <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-2">
              Dynasty Value
            </p>
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-3xl font-semibold text-accent tabular-nums">
                {(player.value ?? 0).toLocaleString()}
              </span>
              <TrendArrow trend={player.trend30Day ?? 0} />
            </div>
            <div className="flex gap-4 mt-2">
              {player.overallRank != null && (
                <div>
                  <span className="font-mono text-sm text-text-primary tabular-nums">#{player.overallRank}</span>
                  <span className="font-body text-[10px] text-text-tertiary ml-1">Overall</span>
                </div>
              )}
              {player.positionRank != null && (
                <div>
                  <span className="font-mono text-sm text-text-primary tabular-nums">#{player.positionRank}</span>
                  <span className="font-body text-[10px] text-text-tertiary ml-1">{player.position}</span>
                </div>
              )}
              {player.adp != null && (
                <div>
                  <span className="font-mono text-sm text-text-primary tabular-nums">{Number(player.adp).toFixed(1)}</span>
                  <span className="font-body text-[10px] text-text-tertiary ml-1">ADP</span>
                </div>
              )}
            </div>
          </div>

          {/* Roster comparison — shown only in free agent context */}
          {rosterComparison != null && rosterComparison.length > 0 && (
            <div className="rounded-xl bg-bg-card border border-border-default px-3 py-3">
              <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-2">
                Your Roster — {player.position}
              </p>
              <div className="flex flex-col gap-0">
                {rosterComparison.map((rp, i) => {
                  const delta = (player.value ?? 0) - (rp.value ?? 0)
                  return (
                    <div
                      key={rp.sleeperId}
                      className={`flex items-center justify-between py-2 ${i < rosterComparison.length - 1 ? 'border-b border-border-default' : ''}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-body text-sm text-text-primary truncate">{rp.name}</p>
                        <p className="font-body text-[10px] text-text-tertiary truncate">
                          {rp.team || 'FA'} · #{rp.positionRank ?? '—'} {rp.position}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                        <span className="font-mono text-sm text-text-secondary tabular-nums">
                          {(rp.value ?? 0).toLocaleString()}
                        </span>
                        <span className={`font-mono text-xs font-semibold tabular-nums w-14 text-right ${
                          delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : 'text-text-tertiary'
                        }`}>
                          {delta > 0 ? '+' : ''}{delta.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Role / opportunity */}
          {role && (
            <div className="rounded-xl bg-bg-card border border-border-default px-3 py-3">
              <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-1.5">
                Dynasty Outlook
              </p>
              <p className="font-body text-sm text-text-primary leading-snug">{role}</p>
            </div>
          )}

          {/* External rankings */}
          {myRankings.length > 0 && (
            <div className="rounded-xl bg-bg-card border border-border-default px-3 py-3">
              <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-2">
                Ranking Sources
              </p>
              <div className="flex flex-col gap-2">
                {myRankings.map(r => (
                  <div key={r.name} className="flex items-center justify-between">
                    <span className="font-body text-sm text-text-secondary truncate mr-2">{r.name}</span>
                    <span className="font-mono text-sm font-medium text-text-primary tabular-nums flex-shrink-0">
                      #{r.rank}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-border-default pt-2 mt-0.5">
                  <span className="font-body text-sm text-text-secondary">FantasyCalc</span>
                  <span className="font-mono text-sm font-medium text-accent tabular-nums flex-shrink-0">
                    #{player.overallRank ?? '—'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Comparable players */}
          {comparables.length > 0 && (
            <div className="rounded-xl bg-bg-card border border-border-default px-3 py-3">
              <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-2">
                Comparable Players
              </p>
              <div className="flex flex-col gap-0">
                {comparables.map((comp, i) => (
                  <div
                    key={comp.sleeperId}
                    className={`flex items-center justify-between py-2 ${i < comparables.length - 1 ? 'border-b border-border-default' : ''}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-body text-sm text-text-primary truncate">{comp.name}</p>
                      <p className="font-body text-[10px] text-text-tertiary">
                        {comp.team || 'FA'} · Age {Math.floor(comp.age ?? 0)} · #{comp.positionRank} {comp.position}
                      </p>
                    </div>
                    <span className="font-mono text-sm font-medium text-text-secondary tabular-nums ml-2 flex-shrink-0">
                      {(comp.value ?? 0).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trend detail */}
          {player.trend30Day != null && Math.abs(player.trend30Day) > 50 && (
            <div className="rounded-xl bg-bg-card border border-border-default px-3 py-3">
              <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-1.5">
                30-Day Trend
              </p>
              <div className="flex items-center gap-2">
                <TrendArrow trend={player.trend30Day} />
                <span className={`font-mono text-sm font-medium tabular-nums ${player.trend30Day > 0 ? 'text-success' : 'text-danger'}`}>
                  {player.trend30Day > 0 ? '+' : ''}{player.trend30Day} pts
                </span>
                <span className="font-body text-xs text-text-tertiary">over past 30 days</span>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
