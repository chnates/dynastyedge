import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Info, X, ArrowRight } from 'lucide-react'
import { useSleeperRookies, getPlayerMetaMap } from '../../hooks/useSleeperRookies'
import { suggestSellMove } from '../../utils/recommendations'
import { Button } from '../ui'
import { PICK_YEARS } from '../../constants'

const DISMISSAL_KEY = 'dynastyedge_action_dismissals'

function loadDismissals() {
  try { return JSON.parse(localStorage.getItem(DISMISSAL_KEY) ?? '{}') }
  catch { return {} }
}

function saveDismissals(map) {
  try { localStorage.setItem(DISMISSAL_KEY, JSON.stringify(map)) }
  catch { /* storage blocked — dismissal just won't persist */ }
}

const URGENCY = {
  red:  { border: 'border-danger/30',  bg: 'bg-danger/10',  icon: 'text-danger' },
  amber:{ border: 'border-warning/30', bg: 'bg-warning/10', icon: 'text-warning' },
  blue: { border: 'border-accent/30',  bg: 'bg-accent/10',  icon: 'text-accent' },
}

function ActionCard({ item, onDismiss, onAction }) {
  const u = URGENCY[item.urgency]
  const Icon = item.urgency === 'blue' ? Info : AlertTriangle
  return (
    <div className={`px-3 py-2.5 rounded-xl border ${u.bg} ${u.border}`}>
      <div className="flex items-start gap-2.5">
        <Icon size={14} strokeWidth={2} className={`mt-0.5 flex-shrink-0 ${u.icon}`} />
        <span className="flex-1 font-body text-xs text-text-primary leading-snug">{item.message}</span>
        <button
          onClick={() => onDismiss(item.key, item.conditionSnapshot)}
          className="flex-shrink-0 text-text-tertiary hover:text-text-secondary transition-colors mt-0.5"
          aria-label="Dismiss"
        >
          <X size={13} strokeWidth={2} />
        </button>
      </div>

      {/* Concrete recommended move — the step beyond the warning. */}
      {item.detail && (
        <p className="mt-1.5 ml-[26px] font-body text-[11px] text-text-secondary leading-snug">
          {item.detail}
        </p>
      )}
      {item.action && (
        <Button
          variant="tinted"
          size="sm"
          onClick={() => onAction(item.action)}
          icon={<ArrowRight size={12} strokeWidth={2.25} />}
          iconRight
          className="mt-2 ml-[26px] gap-1 px-2.5 py-1 text-[11px]"
        >
          {item.action.label}
        </Button>
      )}
    </div>
  )
}

export default function RosterActionItems({ myRoster, nflState, allRosters }) {
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
      myRoster.players
        .filter(p => p.isTaxi)
        .forEach(p => {
          const meta = playerMeta[p.sleeperId]
          if (meta?.years_exp >= 2) {
            result.push({
              key: `taxi_${p.sleeperId}`,
              conditionSnapshot: meta.years_exp,
              urgency: 'red',
              message: `Activate ${p.name} from taxi squad before the season or lose eligibility`,
            })
          }
        })
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
        urgency: 'amber',
        message: `${qbs.length} QBs rostered — convert the surplus into a position you need`,
        detail: move?.summary,
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

    // 3. IR slot opportunity — active player eligible for IR but not placed there
    if (Object.keys(playerMeta).length > 0) {
      myRoster.players
        .filter(p => !p.isIR && !p.isTaxi)
        .forEach(p => {
          const meta = playerMeta[p.sleeperId]
          const status = meta?.injury_status
          if (status === 'Out' || status === 'PUP') {
            result.push({
              key: `ir_${p.sleeperId}`,
              conditionSnapshot: status,
              urgency: 'blue',
              message: `${p.name} is eligible for IR — move them to open a roster spot`,
            })
          }
        })
    }

    // 4. Missing future 1st round picks
    const currentSeason = nflState?.season ?? '2026'
    PICK_YEARS
      .filter(year => year > currentSeason)
      .forEach(year => {
        const has1st = myRoster.picks.some(p => p.season === year && p.round === 1)
        if (!has1st) {
          result.push({
            key: `missing_1st_${year}`,
            conditionSnapshot: true,
            urgency: 'red',
            message: `Missing ${year} 1st round pick — monitor trade opportunities to recover it`,
            detail: 'A pick-rich rebuilder is the most likely place to recover it.',
            action: { label: 'Find trade partners', to: '/trade' },
          })
        }
      })

    return result
  }, [myRoster, nflState, allRosters, dismissals]) // eslint-disable-line react-hooks/exhaustive-deps

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
    <div className="pt-3 pb-1">
      <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary mb-2">
        Action Items
      </p>
      <div className="flex flex-col gap-2">
        {visible.map(item => (
          <ActionCard key={item.key} item={item} onDismiss={dismiss} onAction={runAction} />
        ))}
      </div>
    </div>
  )
}
