import { useMemo, useState } from 'react'
import { TrendingUp, AlertTriangle, ChevronRight } from 'lucide-react'
import { useLeagueContext } from '../../context/LeagueContext'
import { useManagerProfiles } from '../../hooks/useManagerProfiles'
import { getTeamName } from '../../hooks/useLeague'
import { assignWinWindowTiers } from '../../utils/rosterAnalysis'
import TeamAvatar from '../shared/TeamAvatar'
import WinWindowBadge from '../shared/WinWindowBadge'
import LoadingSpinner from '../shared/LoadingSpinner'
import ErrorState from '../shared/ErrorState'
import SectionHeader from '../shared/SectionHeader'
import ManagerScoutingSheet from './ManagerScoutingSheet'

function fmtNet(net) {
  return `${net >= 0 ? '+' : '−'}${Math.abs(Math.round(net)).toLocaleString()}`
}

function netClass(net) {
  if (net > 0) return 'text-success'
  if (net < 0) return 'text-danger'
  return 'text-text-secondary dark:text-text-secondary'
}

function ReportStat({ label, value, valueClass = 'text-text-primary dark:text-text-primary' }) {
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

function InsightList({ title, items, Icon, colorClass }) {
  if (!items.length) return null
  return (
    <div className="mt-3">
      <p className={`font-body text-[10px] font-semibold uppercase tracking-[0.08em] mb-1.5 ${colorClass}`}>
        {title}
      </p>
      <div className="flex flex-col gap-1.5">
        {items.map((text, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <Icon size={12} strokeWidth={2} className={`shrink-0 mt-0.5 ${colorClass}`} />
            <span className="font-body text-xs text-text-primary dark:text-text-primary leading-snug">{text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MyReportCard({ profile, tier, insights, onOpen }) {
  const winRate = profile.tradeCount > 0
    ? Math.round((profile.tradeWins / profile.tradeCount) * 100)
    : null
  return (
    <div className="rounded-xl bg-bg-card dark:bg-bg-card border border-accent/40 px-3 py-3">
      <div className="flex items-center gap-2.5 mb-3">
        <TeamAvatar owner={profile.user} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="font-display text-base font-bold uppercase tracking-wide text-text-primary dark:text-text-primary truncate leading-tight">
              {getTeamName(profile.user)}
            </p>
            <span className="font-body text-[9px] font-bold uppercase tracking-wider rounded px-1 py-0.5 bg-accent/15 text-accent shrink-0">
              You
            </span>
          </div>
          <p className="font-body text-[11px] text-text-secondary dark:text-text-secondary">
            {profile.activity}{winRate != null ? ` · ${winRate}% trade win rate` : ''}
          </p>
        </div>
        {tier && <WinWindowBadge tier={tier} />}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ReportStat
          label="Trade Record"
          value={profile.tradeCount > 0 ? `${profile.tradeWins}W-${profile.tradeLosses}L-${profile.tradeEvens}E` : '—'}
        />
        <ReportStat
          label="Net Trade Value"
          value={profile.tradeCount > 0 ? fmtNet(profile.netValue) : '—'}
          valueClass={netClass(profile.netValue)}
        />
        <ReportStat
          label="Rookie Draft Hits"
          value={profile.draft.count > 0 ? `${profile.draft.hits}/${profile.draft.count}` : '—'}
        />
        <ReportStat
          label="Value / $100 FAAB"
          value={profile.faab.valuePer100 != null ? profile.faab.valuePer100.toLocaleString() : '—'}
        />
      </div>

      <InsightList title="Your Edge" items={insights.strengths} Icon={TrendingUp} colorClass="text-success" />
      <InsightList title="Work On" items={insights.workOn} Icon={AlertTriangle} colorClass="text-warning" />

      <button
        onClick={onOpen}
        className="w-full mt-3 py-2.5 rounded-xl border border-border-default dark:border-border-default font-body text-sm font-medium text-accent active:opacity-70 transition-opacity"
      >
        Full ledger & draft record
      </button>
    </div>
  )
}

function ManagerCard({ profile, tier, onOpen }) {
  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-xl bg-bg-card dark:bg-bg-card border border-border-default dark:border-border-default px-3 py-3 flex flex-col gap-2 active:opacity-80 transition-opacity"
    >
      <div className="flex items-center gap-2.5">
        <TeamAvatar owner={profile.user} size={30} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-bold uppercase tracking-wide text-text-primary dark:text-text-primary truncate leading-tight">
            {getTeamName(profile.user)}
          </p>
          <p className="font-body text-[11px] text-text-secondary dark:text-text-secondary truncate">
            {profile.activity}
            {profile.tradesThisSeason > 0 ? ` · ${profile.tradesThisSeason} this season` : ''}
          </p>
        </div>
        {tier && <WinWindowBadge tier={tier} />}
        <ChevronRight size={16} strokeWidth={2} className="text-text-tertiary dark:text-text-tertiary shrink-0" />
      </div>

      {profile.tradeCount > 0 ? (
        <p className="font-body text-xs text-text-secondary dark:text-text-secondary">
          {profile.tradeCount} trade{profile.tradeCount === 1 ? '' : 's'} ·{' '}
          {profile.tradeWins}W-{profile.tradeLosses}L ·{' '}
          <span className={`font-mono font-semibold tabular-nums ${netClass(profile.netValue)}`}>
            net {fmtNet(profile.netValue)}
          </span>
        </p>
      ) : (
        <p className="font-body text-xs text-text-tertiary dark:text-text-tertiary">
          Hasn't completed a trade.
        </p>
      )}

      {profile.tendencies.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {profile.tendencies.map(t => (
            <span key={t} className="font-body text-[10px] font-semibold rounded-full px-2 py-0.5 bg-accent/10 text-accent">
              {t}
            </span>
          ))}
        </div>
      )}

      {profile.vsMe && profile.vsMe.trades > 0 && (
        <p className="font-body text-[11px] text-text-secondary dark:text-text-secondary">
          Vs you: {profile.vsMe.trades} trade{profile.vsMe.trades === 1 ? '' : 's'} ·{' '}
          <span className={`font-mono font-semibold ${netClass(profile.vsMe.myNet)}`}>
            you're {profile.vsMe.myNet >= 0 ? 'up' : 'down'} {Math.abs(Math.round(profile.vsMe.myNet)).toLocaleString()}
          </span>
        </p>
      )}
    </button>
  )
}

// League › Managers: behavioral scouting reports built from every season of
// league history — my report card up top, then every opponent ranked by how
// active a trade partner they actually are.
export default function ManagersView() {
  const { league } = useLeagueContext()
  const { analysis, loading, error, retry } = useManagerProfiles()
  const [openOwnerId, setOpenOwnerId] = useState(null)

  const tiers = useMemo(
    () => (league?.allRosters?.length ? assignWinWindowTiers(league.allRosters) : {}),
    [league]
  )

  if (loading && !analysis) return <LoadingSpinner message="Walking league history…" />
  if (error && !analysis) return <ErrorState message={error} onRetry={retry} />
  if (!analysis) return <ErrorState message="Could not build manager profiles." onRetry={retry} />

  const { profiles, my, seasonList, userById, insights } = analysis
  const opponents = profiles
    .filter(p => !p.isMe)
    .sort((a, b) => b.tradeCount - a.tradeCount || b.netValue - a.netValue)

  const oldest = seasonList[seasonList.length - 1]
  const newest = seasonList[0]
  const openProfile = profiles.find(p => p.ownerId === openOwnerId) ?? null

  return (
    <div className="px-4 pb-4">
      <div className="pt-4 pb-3 border-b border-border-default dark:border-border-default">
        <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary dark:text-text-secondary mb-0.5">
          Manager Scouting
        </p>
        <p className="font-body text-sm text-text-secondary dark:text-text-secondary">
          {seasonList.length} season{seasonList.length === 1 ? '' : 's'} of history
          {oldest !== newest ? ` · ${oldest}–${newest}` : ` · ${newest}`}
        </p>
        <p className="font-body text-[10px] text-text-tertiary dark:text-text-tertiary mt-0.5">
          All moves graded at today's prices — did the deal age well?
        </p>
      </div>

      {my && (
        <>
          <SectionHeader label="Your Report Card" />
          <MyReportCard
            profile={my}
            tier={tiers[my.rosterId]}
            insights={insights}
            onOpen={() => setOpenOwnerId(my.ownerId)}
          />
        </>
      )}

      <SectionHeader label="Scouting Reports" count={opponents.length} />
      <div className="flex flex-col gap-3">
        {opponents.map(p => (
          <ManagerCard
            key={p.ownerId}
            profile={p}
            tier={tiers[p.rosterId]}
            onOpen={() => setOpenOwnerId(p.ownerId)}
          />
        ))}
      </div>

      {openProfile && (
        <ManagerScoutingSheet
          profile={openProfile}
          tier={tiers[openProfile.rosterId]}
          userById={userById}
          onClose={() => setOpenOwnerId(null)}
        />
      )}
    </div>
  )
}
