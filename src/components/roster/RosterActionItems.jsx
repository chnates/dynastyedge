import { useState, useMemo, useEffect } from 'react'
import { AlertTriangle, Info, X } from 'lucide-react'
import { useSleeperRookies, getPlayerMetaMap } from '../../hooks/useSleeperRookies'
import { PICK_YEARS } from '../../constants'

const DISMISSAL_KEY = 'dynastyedge_action_dismissals'

function loadDismissals() {
  try { return JSON.parse(localStorage.getItem(DISMISSAL_KEY) ?? '{}') }
  catch { return {} }
}

function saveDismissals(map) {
  localStorage.setItem(DISMISSAL_KEY, JSON.stringify(map))
}

const URGENCY = {
  red:  { border: 'border-danger/30',  bg: 'bg-danger/10',  icon: 'text-danger' },
  amber:{ border: 'border-warning/30', bg: 'bg-warning/10', icon: 'text-warning' },
  blue: { border: 'border-accent/30',  bg: 'bg-accent/10',  icon: 'text-accent' },
}

function ActionCard({ item, onDismiss }) {
  const u = URGENCY[item.urgency]
  const Icon = item.urgency === 'blue' ? Info : AlertTriangle
  return (
    <div className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl border ${u.bg} ${u.border}`}>
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
  )
}

export default function RosterActionItems({ myRoster, nflState }) {
  // Trigger the /players/nfl fetch so meta is available (module-level cached)
  useSleeperRookies()

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

    // 2. Bloated QB room (4+)
    const qbCount = myRoster.players.filter(p => p.position === 'QB').length
    if (qbCount >= 4) {
      result.push({
        key: `qb_${qbCount}`,
        conditionSnapshot: qbCount,
        urgency: 'amber',
        message: `${qbCount} QBs rostered — consider trading one for positional value`,
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
          })
        }
      })

    return result
  }, [myRoster, nflState, dismissals]) // eslint-disable-line react-hooks/exhaustive-deps

  // Filter out dismissed items whose condition snapshot still matches
  const visible = items.filter(item => {
    const stored = dismissals[item.key]
    return stored === undefined || stored !== item.conditionSnapshot
  })

  function dismiss(key, conditionSnapshot) {
    setDismissals(prev => ({ ...prev, [key]: conditionSnapshot }))
  }

  if (visible.length === 0) return null

  return (
    <div className="pt-3 pb-1">
      <p className="font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary mb-2">
        Action Items
      </p>
      <div className="flex flex-col gap-2">
        {visible.map(item => (
          <ActionCard key={item.key} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </div>
  )
}
