import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSleeperRookies, getPlayerMetaMap } from '../../hooks/useSleeperRookies'
import { suggestSellMove } from '../../utils/recommendations'
import { Button, Lede, Mark, PositionBand, RuledList } from '../ui'
import { PICK_YEARS } from '../../constants'

const DISMISSAL_KEY = 'dynastyedge_action_dismissals'

// "A", "A and B", "A, B and C" — the prose voice. An aggregated item names
// every player it is about, so the sentence has to read like one.
function listNames(names) {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function loadDismissals() {
  try { return JSON.parse(localStorage.getItem(DISMISSAL_KEY) ?? '{}') }
  catch { return {} }
}

function saveDismissals(map) {
  try { localStorage.setItem(DISMISSAL_KEY, JSON.stringify(map)) }
  catch { /* storage blocked — dismissal just won't persist */ }
}

// An action item is the canonical "one thing you act on", so it is a <Lede>:
// eyebrow, a headline with the finding marked, the sentence, a real CTA. It was
// a tinted 1px-bordered rectangle with a lucide triangle — the icon+title+
// one-liner pattern (slop-checklist.md), and the tint made an urgent item and a
// routine one differ only in hue.
//
// The eyebrow now says what KIND of item this is, which is the job the triangle
// was gesturing at and could not do: "Taxi deadline" carries more than a
// warning glyph, and it is readable.

function ActionCard({ item, onDismiss, onAction }) {
  return (
    <Lede
      eyebrow={item.eyebrow}
      headline={item.headline}
      aside={
        <button
          onClick={() => onDismiss(item.key, item.conditionSnapshot)}
          className="tap-target focus-ring font-mono text-[10px] uppercase tracking-[0.14em]
                     text-text-tertiary hover:text-text-secondary transition-colors"
          aria-label="Dismiss"
        >
          Dismiss
        </button>
      }
      action={
        item.action ? (
          <Button variant="secondary" size="sm" onClick={() => onAction(item.action)}>
            {item.action.label}
          </Button>
        ) : null
      }
    >
      {item.message}
    </Lede>
  )
}

export default function RosterActionItems({ myRoster, nflState, allRosters, pickYears }) {
  // Trigger the /players/nfl fetch so meta is available (module-level cached)
  useSleeperRookies()
  const navigate = useNavigate()

  const [dismissals, setDismissals] = useState(loadDismissals)

  // Sync dismissals to localStorage whenever they change
  useEffect(() => { saveDismissals(dismissals) }, [dismissals])

  const items = useMemo(() => {
    if (!myRoster) return []
    const playerMeta = getPlayerMetaMap()
    const result = []

    // 1. Taxi squad deadline — taxi duration is 2 years in this league:
    // a player can spend their rookie and 2nd-year seasons on taxi, but
    // anyone entering their 3rd NFL season (years_exp >= 2) must be
    // activated before the regular season starts.
    if (Object.keys(playerMeta).length > 0) {
      const stuck = myRoster.players.filter(
        p => p.isTaxi && playerMeta[p.sleeperId]?.years_exp >= 2,
      )
      if (stuck.length) {
        const names = stuck.map(p => p.name)
        result.push({
          key: 'taxi',
          // The snapshot is the SET, not the count: one player aging out while
          // another is activated must re-surface a dismissed item, and a count
          // alone would silently stay hidden through that swap.
          conditionSnapshot: stuck.map(p => p.sleeperId).sort().join(','),
          eyebrow: 'Taxi deadline',
          headline: stuck.length === 1
            ? <>{names[0]} must be <Mark tone="danger">activated</Mark></>
            : <><Mark tone="danger">{stuck.length} taxi players</Mark> must be activated</>,
          message: `${listNames(names)} ${stuck.length === 1 ? 'is' : 'are'} entering a third NFL season, so taxi eligibility ends when the regular season starts.`,
        })
      }
    }

    // 2. Bloated QB room (4+) — and the concrete move to convert the surplus.
    const qbs = myRoster.players.filter(p => p.position === 'QB' && !p.isIR)
    if (qbs.length >= 4) {
      // The most expendable QB (lowest dynasty value) is the one to shop.
      const surplusQb = [...qbs].sort((a, b) => (a.value ?? 0) - (b.value ?? 0))[0]
      const move = surplusQb && allRosters?.length
        ? suggestSellMove(surplusQb, myRoster, allRosters)
        : null
      result.push({
        key: `qb_${qbs.length}`,
        conditionSnapshot: qbs.length,
        eyebrow: 'Surplus',
        headline: <>{qbs.length} <Mark tone="warning">quarterbacks</Mark>, one to move</>,
        message: move?.summary ?? 'Convert the surplus into a position you are below league average in.',
        // preloadTrade fills both sides on mount (give-only when there's no
        // clean return), with the partner already selected.
        action: move
          ? {
              label: move.ctaLabel,
              to: '/trade/analyze',
              state: { preloadTrade: { opponentRosterId: move.opponentRosterId, give: move.give, get: move.get ?? [] } },
            }
          : null,
      })
    }

    // 3. IR slot opportunity — active players eligible for IR but not on it.
    //    Aggregated, like the taxi item: three separate entries reading
    //    "X can go on IR" with identical prose is the icon+title+one-liner
    //    pattern wearing editorial clothes, and a <Lede> is for ONE decision.
    if (Object.keys(playerMeta).length > 0) {
      const stashable = myRoster.players.filter(p => {
        if (p.isIR || p.isTaxi) return false
        const status = playerMeta[p.sleeperId]?.injury_status
        return status === 'Out' || status === 'PUP'
      })
      if (stashable.length) {
        const names = stashable.map(p => p.name)
        result.push({
          key: 'ir',
          conditionSnapshot: stashable.map(p => p.sleeperId).sort().join(','),
          eyebrow: 'Roster spots',
          headline: stashable.length === 1
            ? <>{names[0]} can go on <Mark tone="alt">IR</Mark></>
            : <><Mark tone="alt">{stashable.length} spots</Mark> are sitting on injured players</>,
          message: `${listNames(names)} ${stashable.length === 1 ? 'is' : 'are'} out. Moving ${stashable.length === 1 ? 'him' : 'them'} to injured reserve frees ${stashable.length === 1 ? 'an active roster spot' : `${stashable.length} active roster spots`} without dropping anyone.`,
        })
      }
    }

    // 4. Missing future 1st round picks. The window is live (see
    // utils/seasonWindow.js); the constant only seeds it before NFL state lands.
    const currentSeason = nflState?.season ?? ''
    const years = pickYears ?? PICK_YEARS
    const missing = years.filter(
      year => year > currentSeason && !myRoster.picks.some(p => p.season === year && p.round === 1),
    )
    if (missing.length) {
      result.push({
        key: 'missing_1st',
        conditionSnapshot: missing.join(','),
        eyebrow: 'Pick capital',
        headline: missing.length === 1
          ? <>No <Mark tone="danger">{missing[0]} 1st</Mark> on the board</>
          : <>No first-rounder in <Mark tone="danger">{missing.length} of your {years.length} seasons</Mark></>,
        message: `You hold no round-one pick in ${listNames(missing)}. A pick-rich rebuilder is the most likely place to recover one.`,
        action: { label: 'Find trade partners', to: '/trade' },
      })
    }

    return result
  }, [myRoster, nflState, allRosters, pickYears, dismissals]) // eslint-disable-line react-hooks/exhaustive-deps

  // Filter out dismissed items whose condition snapshot still matches
  const visible = items.filter(item => {
    const stored = dismissals[item.key]
    return stored === undefined || stored !== item.conditionSnapshot
  })

  function dismiss(key, conditionSnapshot) {
    setDismissals(prev => ({ ...prev, [key]: conditionSnapshot }))
  }

  function runAction(action) {
    if (!action) return
    navigate(action.to, action.state ? { state: action.state } : undefined)
  }

  if (visible.length === 0) return null

  return (
    <div>
      <PositionBand label="Action Items" count={visible.length} className="mt-5" />
      <RuledList>
        {visible.map(item => (
          <ActionCard key={item.key} item={item} onDismiss={dismiss} onAction={runAction} />
        ))}
      </RuledList>
    </div>
  )
}
