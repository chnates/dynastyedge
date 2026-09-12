import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLeagueContext } from '../../context/LeagueContext'
import { getTeamName } from '../../hooks/useLeague'
import { getTopTradeTargets, rankTradePartners } from '../../utils/rosterAnalysis'
import { buildCashOutBoard } from '../../utils/recommendations'
import { PEAK_WINDOWS } from '../../utils/peakWindows'
import { suggestFairPackage } from '../../utils/tradeAnalysis'
import PartnerContextStrip from './PartnerContextStrip'
import PartnerSelect, { buildPartnerOptions } from './PartnerSelect'
import {
  Badge, Chip, ErrorState, Lede, Magnitude, Mark, PositionBand, Row, RuledList,
  Loading, TrendArrow, WinWindowBadge, cn,
} from '../ui'
import { POS_BG, POS_CHIP_ACTIVE } from '../../utils/positionColors'

const POSITION_FILTERS = ['All', 'QB', 'RB', 'WR', 'TE']

// The appeal read, in the app's status colors: green = a clear reason to say
// yes, amber = there isn't one. Never brand red — that is reserved for "you"
// accents. The same scale grades both seats, so one tone map serves both.
//
// FAIR IS DELIBERATELY UNMARKED. Finding B2 measured that the two appeal reads
// — the most decision-relevant fields on the card — were its smallest text,
// while the player's name (the least decision-relevant: you know who Ja'Marr
// Chase is) was the loudest. Both are fixed below, but marking all three tiers
// would put 40 coloured blocks down a 20-row board and scan as noise. `Fair` is
// the null result; marking only Strong and Weak leaves a readable pattern of
// "gettable" and "they won't bite" down the list, which is the question this
// board exists to answer.
const APPEAL_MARK = { Strong: 'success', Weak: 'warning' }

// Deliberately terser than the fit's own `summary`, which is written for the
// Analyzer panel and truncates to nothing on a 390px card.
const APPEAL_LINE = {
  Strong: 'clear reason for them to say yes',
  Fair:   'something here, but not compelling',
  Weak:   'little reason for them to say yes',
}

// The same read from my seat. The board graded every suggestion for the other
// manager and said nothing about my own roster, which is what made it read as
// though the app were negotiating against its owner.
const MY_APPEAL_LINE = {
  Strong: 'clear gain for your roster',
  Fair:   'helps you, but not decisive',
  Weak:   'little here for your roster',
}

// Session-scoped so drilling into the Analyzer and coming back keeps the
// scouted team — same contract as the League tab's sort/position filters.
// Roster-scoped: useIdentity wipes it on any identity change (the valid
// opponent set depends on which team you are).
const TEAM_KEY = 'dynastyedge_targets_team'

function loadTeamFilter() {
  try {
    const raw = sessionStorage.getItem(TEAM_KEY)
    return raw ? Number(raw) : null
  } catch { return null }
}

function saveTeamFilter(rosterId) {
  try {
    if (rosterId == null) sessionStorage.removeItem(TEAM_KEY)
    else sessionStorage.setItem(TEAM_KEY, String(rosterId))
  } catch { /* private mode — the filter just won't persist */ }
}


// The move the board below structurally cannot surface. Targets rank opponents'
// players by MY positional deficits, so a roster thin at WR sees WRs priced
// around its deficit and never a target sized to its most valuable aging asset
// — the package builder won't reach for one either, since it refuses to offer
// an asset worth far more than its target. So: name the asset bleeding value to
// age, and list who is in the band it can actually reach.
function CashOutBlock({ board, onTap }) {
  const { asset, targets } = board
  const window = PEAK_WINDOWS[asset.position]

  return (
    <>
      {/* The standout move is ONE decision, so it is a <Lede>, not a tinted
          card: the finding is the value bleeding to age, and the headline
          marks it. */}
      <PositionBand label="Cash out the age" className="mt-5" />
      <Lede
        eyebrow={`${asset.position} · age ${asset.age?.toFixed(1)}`}
        headline={
          <>{asset.name} has <Mark tone="warning">{Math.round(asset.valueAtRisk).toLocaleString()}</Mark> at risk</>
        }
      >
        He is {asset.yearsPastPeak.toFixed(1)} years past the {asset.position} peak
        window{window ? ` (${window[0]}–${window[1]})` : ''}, so roughly that much of his{' '}
        {(asset.value || 0).toLocaleString()} is exposed to decline over the next three
        seasons.
      </Lede>

      {targets.length === 0 ? (
        <p className="aside py-3 font-body text-[11px] text-text-tertiary leading-relaxed">
          Nobody younger is available in his price band right now — the board below is the
          better route.
        </p>
      ) : (
        <>
          <p className="py-2.5 font-body text-[11px] text-text-tertiary leading-relaxed">
            Younger targets in the band he can reach ({board.band[0].toLocaleString()}–
            {board.band[1].toLocaleString()}) — tap to build the trade.
          </p>
          <RuledList>
            {targets.map(t => (
              <Row key={t.sleeperId} onClick={() => onTap(t)}>
                <div className="flex items-baseline gap-2">
                  <span
                    className={cn('shrink-0 w-[7px] h-[7px] self-center', POS_BG[t.position] ?? 'bg-text-tertiary')}
                    aria-hidden="true"
                  />
                  <span className="flex-1 min-w-0 font-body text-sm font-medium text-text-primary text-balance">
                    {t.name}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-text-tertiary tabular-nums">
                    {t.age?.toFixed(1)}
                  </span>
                  <span className="shrink-0 self-center">
                    <Magnitude value={t.value > 0 ? t.value : null} />
                  </span>
                </div>
                <div className="mt-1 pl-[15px] flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-tertiary">
                    {getTeamName(t.owner)}
                  </span>
                  {t.fillsNeed && <Badge tone="danger" soft>Your need</Badge>}
                </div>
                <p className="mt-1 pl-[15px] font-body text-[10px] text-text-tertiary leading-snug">
                  {t.reasons.join(' · ')}
                </p>
              </Row>
            ))}
          </RuledList>
        </>
      )}
    </>
  )
}

// One line of the appeal read: a label, the tier (marked when it is Strong or
// Weak), and the sentence. This is what replaced the two soft Badges — a badge
// set the tier at 9px, which is precisely the inversion B2 measured.
function AppealLine({ label, tier, children }) {
  const tone = APPEAL_MARK[tier]
  return (
    <p className="mt-1 font-body text-[11px] leading-snug text-text-tertiary">
      <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-tertiary">
        {label}
      </span>{' '}
      {tone
        ? <Mark tone={tone} className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em]">{tier}</Mark>
        : <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-text-secondary">{tier}</span>}
      {' '}<span className="text-text-secondary">{children}</span>
    </p>
  )
}

// A target is a RULED ROW, not a card (law 5): the board is an enumeration of
// twenty, and twenty bordered rectangles is the shape finding B7 named. The
// mock's `.md-row` grid is what this is — name and figure on the baseline, a
// meta line, then full-width caption lines for everything that is a sentence.
//
// THE HIERARCHY IS INVERTED FROM WHAT B2 MEASURED. The name drops out of
// display uppercase into body text (it identifies the row; it is not the
// decision), the value becomes a <Magnitude> so size carries it, and the two
// appeal reads come up out of 9px badges into marked lines.
function TargetRow({ target, fairPackage, packagePending, showNeedTag, onTap }) {
  return (
    <Row onClick={onTap}>
      <div className="flex items-baseline gap-2">
        {/* The board mixes positions, so its band is neutral ink and the hue
            rides on the row instead — the mock's `.sw` swatch. */}
        <span
          className={cn('shrink-0 w-[7px] h-[7px] self-center', POS_BG[target.position] ?? 'bg-text-tertiary')}
          aria-hidden="true"
        />
        {/* Not truncated: it was `truncate min-w-0`, and the value column beside
            it is variable-width now, so a long name wraps instead. */}
        <span className="flex-1 min-w-0 font-body text-sm font-medium text-text-primary text-balance">
          {target.name}
        </span>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
          {target.team}
        </span>
        <span className="shrink-0 self-center">
          <Magnitude value={target.value > 0 ? target.value : null} />
        </span>
        <span className="shrink-0 self-center">
          <TrendArrow trend={target.trend30Day} />
        </span>
      </div>

      {/* Row 2 swaps by mode. League-wide: the owning team, since that's the
          thing you can't infer. Team-scoped: the owner is already in the
          header and selector, so the row carries the one fact that varies —
          does this player fill a deficit, or is he depth? */}
      <div className="mt-1 pl-[15px] flex items-center gap-2">
        {showNeedTag ? (
          target.fillsNeed
            ? <Badge tone="danger" soft>Your need</Badge>
            : <Badge tone="neutral" soft>Depth</Badge>
        ) : (
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-tertiary">
            {getTeamName(target.owner)}
          </span>
        )}
      </div>

      {/* The search runs off the render path (see the effect in WhatsFair), so
          a card can be on screen before its cost is known — say so rather than
          leaving a hole where the answer will appear. */}
      {packagePending && (
        <p className="mt-1.5 pl-[15px] font-body text-[11px] text-text-tertiary">
          Working out what it would cost…
        </p>
      )}

      {fairPackage && (
        <div className="mt-1.5 pl-[15px]">
          {/* What the trade costs you is the most actionable field on the
              board, so it WRAPS — it must never elide. This was a flex row
              with `truncate` on the value, which cut the package to
              "Jordan James + Jordan Love + Jonatha…" on 5 of 11 live cards:
              a three-player package read as a two-player one. Laid out as a
              sentence rather than a flex row because flex items don't wrap
              their own text, and the trailing total has to follow the last
              name rather than float beside the first line. */}
          <p className="font-body text-[11px] text-text-tertiary">
            <span className="font-mono text-[9px] uppercase tracking-[0.16em]">Cost</span>{' '}
            <span className="font-body text-xs text-text-primary">
              {fairPackage.assets.map(a => a.name).join(' + ')}
            </span>{' '}
            <span className="font-mono text-[10px] text-text-secondary tabular-nums whitespace-nowrap">
              (~{(fairPackage.totalValue || 0).toLocaleString()})
            </span>
          </p>
          {fairPackage.rationale && (
            <p className="mt-0.5 font-body text-[10px] text-text-tertiary leading-snug">
              {fairPackage.rationale}
            </p>
          )}

          {/* The package was chosen for this read, so it belongs on the row:
              the board no longer hands over an offer without saying what it's
              worth to the team being asked to accept it — or to mine. */}
          {fairPackage.myAppeal && (
            <AppealLine label="You" tier={fairPackage.myAppeal}>
              {/* A Weak here is almost always the price, not the player: the
                  search's band is [0.9x, 1.15x] while `fairBand` calls fair
                  ±5%, so a suggestion routinely lands a few points over. Say
                  which, because "you'd pay 7% over fair" is a counter you can
                  make and "little here for your roster" is not. */}
              {fairPackage.myAppeal === 'Weak' && fairPackage.myConcern
                ? fairPackage.myConcern.replace(/\.$/, '').replace(/^You'd be /, "you'd be ")
                : fairPackage.myStartersDelta > 0
                  ? `your starters gain ${fairPackage.myStartersDelta.toLocaleString()}`
                  : MY_APPEAL_LINE[fairPackage.myAppeal]}
            </AppealLine>
          )}
          {fairPackage.appeal && (
            <AppealLine label="Them" tier={fairPackage.appeal}>
              {APPEAL_LINE[fairPackage.appeal]}
            </AppealLine>
          )}

          {/* The road not taken. The suggestion now weighs their appeal against
              what the package costs ME, so the option worth naming is the one
              they'd like MORE that it declined to pay for — the reverse of when
              appeal won outright. The read the search exists to produce is
              still on the row; it just no longer picks the offer by itself. */}
          {fairPackage.alternative && (
            <p className="mt-1 font-body text-[10px] text-text-tertiary leading-snug">
              <span className="font-mono text-[9px] uppercase tracking-[0.16em]">Costs more</span>{' '}
              <span className="text-text-secondary">
                {fairPackage.alternative.assets.map(a => a.name).join(' + ')}
              </span>{' '}
              — {fairPackage.alternative.appeal?.toLowerCase()} for them
            </p>
          )}
        </div>
      )}
    </Row>
  )
}

export default function WhatsFair() {
  const { league, loading, error, retry } = useLeagueContext()
  const navigate = useNavigate()
  const location = useLocation()
  const [posFilter, setPosFilter] = useState('All')

  // Nav state (Trade Partners → "See their targets") takes priority over the
  // persisted session filter, same precedence the Analyzer uses for its
  // pre-fills.
  const [teamFilter, setTeamFilter] = useState(() => {
    const fromNav = location.state?.targetsRosterId
    return fromNav != null ? Number(fromNav) : loadTeamFilter()
  })

  const analysis = useMemo(() => {
    if (!league?.myRoster || !league?.allRosters?.length) return null
    return rankTradePartners(league.myRoster, league.allRosters)
  }, [league])

  // A stale/foreign roster id (identity switch, a departed team) falls back to
  // the league-wide list rather than rendering an empty board.
  const activeTeam = useMemo(() => {
    if (teamFilter == null || !analysis) return null
    return analysis.partners.find(p => p.rosterId === teamFilter) ?? null
  }, [teamFilter, analysis])

  const scopedRosterId = activeTeam?.rosterId ?? null

  useEffect(() => { saveTeamFilter(scopedRosterId) }, [scopedRosterId])

  const targets = useMemo(() => {
    if (!league?.myRoster || !league?.allRosters?.length) return []
    return getTopTradeTargets(league.myRoster, league.allRosters, 20, {
      ownerRosterId: scopedRosterId,
    })
  }, [league, scopedRosterId])

  // Fair packages are computed OFF the render path, one target per tick.
  //
  // This used to be a useMemo, which runs *during* render — so the ~730ms of
  // package search blocked the very paint that would have shown a loading
  // state, and the tab simply sat blank. Walking the targets in an effect lets
  // the board paint immediately and fill its cost lines in as they land; the
  // longest the main thread is ever held is one target (109ms worst case on
  // this roster). It is also what makes scoring EVERY candidate affordable —
  // see the note above PACKAGE search in tradeAnalysis.js.
  const [fairPackages, setFairPackages] = useState({})
  const [packagesLeft, setPackagesLeft] = useState(0)

  useEffect(() => {
    if (!league?.myRoster || !targets.length) {
      setFairPackages({})
      setPackagesLeft(0)
      return
    }
    let cancelled = false
    let timer = null
    const rosterById = new Map(league.allRosters.map(r => [r.rosterId, r]))
    const acc = {}
    let i = 0
    setFairPackages({})
    setPackagesLeft(targets.length)

    const step = () => {
      if (cancelled) return
      const t = targets[i]
      acc[t.sleeperId] = suggestFairPackage(
        t, league.myRoster, league.allRosters, rosterById.get(t.ownerRosterId)
      )
      i += 1
      setFairPackages({ ...acc })
      setPackagesLeft(targets.length - i)
      if (i < targets.length) timer = setTimeout(step, 0)
    }
    timer = setTimeout(step, 0)
    // Switching teams or a data refresh abandons the walk in progress rather
    // than letting a stale run write over the new board.
    return () => { cancelled = true; clearTimeout(timer) }
  }, [targets, league])

  const filteredTargets = useMemo(() => {
    if (posFilter === 'All') return targets
    return targets.filter(t => t.position === posFilter)
  }, [targets, posFilter])

  const partnerOptions = useMemo(() => buildPartnerOptions(league), [league])

  // League-wide mode only: while a team is scoped the page is a scouting view
  // of one roster, and a block about MY aging asset reads as noise there.
  const cashOut = useMemo(
    () => (league?.myRoster && !scopedRosterId
      ? buildCashOutBoard(league.myRoster, league.allRosters, { limit: 3 })
      : null),
    [league, scopedRosterId]
  )

  if (loading && !league) return <Loading message="Finding trade targets…" />
  if (error && !league)   return <ErrorState message={error} onRetry={retry} />
  if (!league?.myRoster) return <ErrorState message="Could not load league data." onRetry={retry} />

  const myTeamName = getTeamName(league.myRoster.owner)
  const scopedTeamName = activeTeam ? getTeamName(activeTeam.owner) : null
  const needCount = filteredTargets.filter(t => t.fillsNeed).length

  return (
    <div className="px-4 pb-4">
      {/* Header */}
      <div className="pt-4 pb-3 border-b border-border-default dark:border-border-default">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-body text-sm text-text-secondary dark:text-text-secondary">
            {myTeamName}
          </span>
          <WinWindowBadge tier={analysis?.myTier ?? 'Middle'} />
        </div>
        <p className="font-body text-xs text-text-tertiary dark:text-text-tertiary leading-relaxed">
          {scopedTeamName
            ? `Everything ${scopedTeamName} has that you could ask for, ranked by your positional need × value. Tap to explore a fair package.`
            : 'Top targets ranked by positional need × value. Tap to explore a fair package.'}
        </p>
      </div>

      {/* The standout move first: the asset aging out, and who he can become.
          Above the board because the board cannot contain it. */}
      {cashOut && (
        <CashOutBlock
          board={cashOut}
          onTap={target => navigate('/trade/analyze', {
            state: {
              preloadTrade: {
                opponentRosterId: target.ownerRosterId,
                // Hand over the FULL roster objects, not the board's reduced
                // shapes: a preload must resolve to what the add sheet
                // produces or the builder's toggles and totals go subtly wrong
                // (92657ae). The id matches either way; team/trend do not.
                give: [{
                  ...(league.myRoster.players.find(
                    p => String(p.sleeperId) === String(cashOut.asset.sleeperId)
                  ) ?? cashOut.asset),
                  type: 'player',
                }],
                get: [{ ...target, type: 'player' }],
              },
            },
          })}
        />
      )}

      {/* Team selector — grouped by trade fit, each option carrying tier +
          record so the choice isn't blind. Same control the Analyzer uses. */}
      <div className="pt-3">
        <PartnerSelect
          options={partnerOptions}
          value={scopedRosterId}
          onChange={setTeamFilter}
          label="Team"
          placeholder="All teams"
        />
      </div>

      {/* Position filter */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none py-3 -mx-4 px-4">
        {POSITION_FILTERS.map(pos => (
          <Chip
            key={pos}
            active={posFilter === pos}
            activeClass={POS_CHIP_ACTIVE[pos] ?? 'bg-accent text-bg-primary'}
            onClick={() => setPosFilter(pos)}
            className={cn('py-1', posFilter !== pos && 'bg-bg-card dark:bg-bg-card')}
          >
            {pos}
          </Chip>
        ))}
      </div>

      {/* Partner intelligence for the scouted team — the same strip the
          Analyzer carries under its opponent selector. */}
      {activeTeam && <PartnerContextStrip partner={activeTeam} />}

      {/* Honest read on what the scoped list actually contains: their board is
          shown whole, need-matched first, so the mode never renders empty. */}
      {activeTeam && filteredTargets.length > 0 && (
        <p className="font-body text-[11px] text-text-tertiary dark:text-text-tertiary pb-2 leading-relaxed">
          {needCount === 0
            ? `Nothing on ${scopedTeamName} fills a positional deficit — these are their most valuable movable pieces.`
            : `${needCount} of ${filteredTargets.length} fill a positional deficit; the rest are their most valuable pieces.`}
        </p>
      )}

      {packagesLeft > 0 && (
        <p className="font-body text-[11px] text-accent pb-2 leading-relaxed" aria-live="polite">
          Pricing every package the {filteredTargets.length === 1 ? 'target' : 'targets'} could
          cost you — {packagesLeft} to go.
        </p>
      )}

      {filteredTargets.length === 0 ? (
        <div className="py-12 text-center">
          <p className="font-body text-sm text-text-tertiary dark:text-text-tertiary">
            {activeTeam
              ? (posFilter === 'All'
                  ? `${scopedTeamName} has no tradeable assets to target right now.`
                  : `${scopedTeamName} has no ${posFilter} worth targeting.`)
              : (posFilter === 'All'
                  ? "No targets found — your roster is well-balanced."
                  : `No ${posFilter} targets — you may already be strong at this position.`)}
          </p>
        </div>
      ) : (
        <>
          {/* The board mixes positions, so the band is NEUTRAL ink — picking a
              hue to make it colourful would lie about what is in it. */}
          <PositionBand
            label={scopedTeamName ? `${scopedTeamName} · movable` : 'Your targets'}
            count={filteredTargets.length}
          />
          <RuledList>
            {filteredTargets.map(target => (
              <TargetRow
                key={target.sleeperId}
                target={target}
                fairPackage={fairPackages[target.sleeperId]}
                packagePending={!(target.sleeperId in fairPackages)}
                showNeedTag={!!activeTeam}
                onTap={() =>
                  navigate('/trade/analyze', {
                    state: {
                      opponentRosterId: target.ownerRosterId,
                      whatsFairTarget:  target,
                    },
                  })
                }
              />
            ))}
          </RuledList>
        </>
      )}
    </div>
  )
}
