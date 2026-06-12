import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useScrollLock } from '../../hooks/useScrollLock'
import { useTradeTimeValues } from '../../hooks/useTradeTimeValues'
import { STEAL_DELTA } from '../../utils/managerAnalysis'
import { getTeamName } from '../../hooks/useLeague'
import TeamAvatar from '../shared/TeamAvatar'
import WinWindowBadge from '../shared/WinWindowBadge'
import PlayerProfileDrawer from '../shared/PlayerProfileDrawer'
import SectionHeader from '../shared/SectionHeader'

const LEDGER_PAGE = 10

const RESULT_STYLES = {
  win:  'bg-success/15 text-success',
  loss: 'bg-danger/15 text-danger',
  even: 'bg-bg-secondary dark:bg-bg-secondary text-text-secondary dark:text-text-secondary',
}

function fmtNet(net) {
  return `${net >= 0 ? '+' : '−'}${Math.abs(Math.round(net)).toLocaleString()}`
}

function StatCard({ label, value, valueClass = 'text-text-primary dark:text-text-primary' }) {
  return (
    <div className="rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-3 py-2.5">
      <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary dark:text-text-tertiary mb-1">
        {label}
      </p>
      <p className={`font-mono text-lg font-semibold tabular-nums leading-none ${valueClass}`}>
        {value}
      </p>
    </div>
  )
}

function AssetLine({ sign, asset, onSelectPlayer }) {
  const color = sign === '+' ? 'text-success' : 'text-danger'
  return (
    <div className="flex items-center gap-1 leading-snug">
      <span className={`font-mono text-xs font-bold ${color} shrink-0`}>{sign}</span>
      {asset.player ? (
        <button
          onClick={() => onSelectPlayer(asset.player)}
          className="font-body text-xs text-text-primary dark:text-text-primary truncate min-w-0 text-left underline decoration-dotted decoration-text-tertiary underline-offset-2 active:opacity-60 transition-opacity"
        >
          {asset.label}
        </button>
      ) : (
        <span className="font-body text-xs text-text-primary dark:text-text-primary truncate min-w-0">
          {asset.label}
        </span>
      )}
      <span className="flex-1" />
      <span className="font-mono text-[11px] text-text-secondary dark:text-text-secondary tabular-nums shrink-0">
        {asset.type === 'faab' || (asset.type === 'player' && !asset.ranked)
          ? '—'
          : `${asset.approx ? '≈' : ''}${asset.value.toLocaleString()}`}
      </span>
    </div>
  )
}

function TradeLedgerCard({ trade, partnerName, getTradeTimeTotals, onSelectPlayer }) {
  const thenTotals = getTradeTimeTotals(trade)
  return (
    <div className="rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-3 py-3">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary">
          Wk {trade.week} · {trade.season}
        </span>
        <span className="font-body text-[11px] text-text-secondary dark:text-text-secondary truncate">
          vs {partnerName}
        </span>
        <span className={`ml-auto shrink-0 font-mono text-[11px] font-bold rounded px-1.5 py-0.5 tabular-nums ${RESULT_STYLES[trade.result]}`}>
          {trade.result === 'even' ? 'Even' : fmtNet(trade.net)}
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        {trade.got.map((a, i) => <AssetLine key={`g${i}`} sign="+" asset={a} onSelectPlayer={onSelectPlayer} />)}
        {trade.gave.map((a, i) => <AssetLine key={`v${i}`} sign="−" asset={a} onSelectPlayer={onSelectPlayer} />)}
      </div>
      {thenTotals && (
        <p className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary mt-1.5">
          At trade time: got {thenTotals.gotThen.toLocaleString()} ⇄ gave {thenTotals.gaveThen.toLocaleString()}
        </p>
      )}
    </div>
  )
}

function DraftPickRow({ row, onSelectPlayer }) {
  const badge = row.delta >= STEAL_DELTA
    ? { label: `Steal +${row.delta}`, cls: 'bg-success/15 text-success' }
    : row.delta <= -STEAL_DELTA
      ? { label: `Reach ${row.delta}`, cls: 'bg-danger/15 text-danger' }
      : null
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-border-default/60 dark:border-border-default/60 last:border-0">
      <span className="font-mono text-[11px] text-text-tertiary dark:text-text-tertiary w-14 shrink-0">
        {row.season} {row.slotLabel}
      </span>
      {row.player.player ? (
        <button
          onClick={() => onSelectPlayer(row.player.player)}
          className="font-body text-xs text-text-primary dark:text-text-primary truncate min-w-0 text-left underline decoration-dotted decoration-text-tertiary underline-offset-2 active:opacity-60 transition-opacity"
        >
          {row.player.label}
        </button>
      ) : (
        <span className="font-body text-xs text-text-primary dark:text-text-primary truncate min-w-0">
          {row.player.label}
        </span>
      )}
      <span className="flex-1" />
      {badge && (
        <span className={`shrink-0 font-body text-[10px] font-semibold rounded px-1.5 py-0.5 ${badge.cls}`}>
          {badge.label}
        </span>
      )}
      <span className="font-mono text-[11px] text-text-secondary dark:text-text-secondary tabular-nums shrink-0 w-12 text-right">
        {row.player.ranked ? row.player.value.toLocaleString() : '—'}
      </span>
    </div>
  )
}

// Bottom sheet with one manager's full scouting report: stat summary,
// tendencies, head-to-head vs me, rookie-draft grades, and the complete
// multi-season trade ledger from their perspective.
export default function ManagerScoutingSheet({ profile, tier, userById, onClose }) {
  const overlayRef = useRef(null)
  const [ledgerCount, setLedgerCount] = useState(LEDGER_PAGE)
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const { getTradeTimeTotals } = useTradeTimeValues()

  useScrollLock()

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose()
  }

  function partnerName(trade) {
    const names = trade.partnerOwnerIds.map(oid => getTeamName(userById[oid]))
    return names.length ? names.join(' + ') : 'Unknown'
  }

  const { faab, draft } = profile
  const firstSeason = profile.seasonsActive[profile.seasonsActive.length - 1]
  const visibleTrades = profile.trades.slice(0, ledgerCount)

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-end bg-black/60"
    >
      <div className="w-full bg-bg-secondary dark:bg-bg-secondary rounded-t-2xl border-t border-border-default dark:border-border-default">
        <div className="max-h-[88vh] overflow-y-auto" style={{ overscrollBehavior: 'contain', paddingBottom: 'env(safe-area-inset-bottom)' }}>

          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-border-default" />
          </div>

          <div className="px-4 pb-6">
            {/* Header */}
            <div className="flex items-center gap-2.5 py-2">
              <TeamAvatar owner={profile.user} size={36} />
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-bold uppercase tracking-wide text-text-primary dark:text-text-primary truncate leading-tight">
                  {getTeamName(profile.user)}
                </p>
                <p className="font-body text-[11px] text-text-secondary dark:text-text-secondary">
                  {profile.seasonsActive.length} season{profile.seasonsActive.length === 1 ? '' : 's'}
                  {firstSeason ? ` · since ${firstSeason}` : ''} · {profile.activity}
                </p>
              </div>
              {tier && <WinWindowBadge tier={tier} />}
              <button
                onClick={onClose}
                aria-label="Close"
                className="w-9 h-9 flex items-center justify-center rounded-lg text-text-secondary dark:text-text-secondary active:bg-black/5 dark:active:bg-white/5 shrink-0"
              >
                <X size={18} strokeWidth={2} />
              </button>
            </div>

            {/* Stat summary */}
            <div className="grid grid-cols-2 gap-2 mt-1">
              <StatCard
                label="Trade Record"
                value={profile.tradeCount > 0 ? `${profile.tradeWins}W-${profile.tradeLosses}L-${profile.tradeEvens}E` : '—'}
              />
              <StatCard
                label="Net Trade Value"
                value={profile.tradeCount > 0 ? fmtNet(profile.netValue) : '—'}
                valueClass={profile.netValue > 0 ? 'text-success' : profile.netValue < 0 ? 'text-danger' : 'text-text-primary dark:text-text-primary'}
              />
              <StatCard
                label="FAAB Spent"
                value={`$${faab.dollars}`}
              />
              <StatCard
                label="Value / $100 FAAB"
                value={faab.valuePer100 != null ? faab.valuePer100.toLocaleString() : '—'}
              />
            </div>

            {/* Tendencies */}
            {profile.tendencies.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {profile.tendencies.map(t => (
                  <span key={t} className="font-body text-[11px] font-semibold rounded-full px-2.5 py-1 bg-accent/10 text-accent">
                    {t}
                  </span>
                ))}
              </div>
            )}

            {/* Head-to-head vs me */}
            {profile.vsMe && (
              <div className="mt-3 rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-3 py-2.5">
                <p className="font-body text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary dark:text-text-tertiary mb-1">
                  Head-to-head vs you
                </p>
                <p className="font-body text-xs text-text-primary dark:text-text-primary">
                  {profile.vsMe.trades} trade{profile.vsMe.trades === 1 ? '' : 's'} together ·{' '}
                  <span className={`font-mono font-semibold ${profile.vsMe.myNet > 0 ? 'text-success' : profile.vsMe.myNet < 0 ? 'text-danger' : ''}`}>
                    you're {profile.vsMe.myNet >= 0 ? 'up' : 'down'} {Math.abs(Math.round(profile.vsMe.myNet)).toLocaleString()}
                  </span>
                </p>
              </div>
            )}

            {/* Rookie draft record */}
            {draft.count > 0 && (
              <>
                <SectionHeader
                  label="Rookie Draft Record"
                  count={`${draft.hits} hit${draft.hits === 1 ? '' : 's'} of ${draft.count}`}
                />
                <div className="rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-3 py-1">
                  {draft.picks.map((row, i) => (
                    <DraftPickRow key={i} row={row} onSelectPlayer={setSelectedPlayer} />
                  ))}
                </div>
              </>
            )}

            {/* Trade ledger */}
            <SectionHeader label="Trade Ledger" count={profile.tradeCount} />
            {profile.tradeCount === 0 ? (
              <p className="font-body text-sm text-text-tertiary dark:text-text-tertiary py-4 text-center">
                No completed trades on record.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {visibleTrades.map(trade => (
                  <TradeLedgerCard
                    key={trade.txId}
                    trade={trade}
                    partnerName={partnerName(trade)}
                    getTradeTimeTotals={getTradeTimeTotals}
                    onSelectPlayer={setSelectedPlayer}
                  />
                ))}
                {ledgerCount < profile.tradeCount && (
                  <button
                    onClick={() => setLedgerCount(c => c + LEDGER_PAGE)}
                    className="py-2.5 rounded-xl border border-border-default dark:border-border-default font-body text-sm font-medium text-accent active:opacity-70 transition-opacity"
                  >
                    Show more
                  </button>
                )}
              </div>
            )}

            <p className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary mt-3">
              All values at today's prices (hindsight grading). Traded picks whose draft has
              happened show the player they became; past picks that can't be resolved use
              today's typical value for that round (≈).
            </p>
          </div>
        </div>
      </div>

      {selectedPlayer && (
        <PlayerProfileDrawer
          player={selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  )
}
