import { getTeamName } from '../../hooks/useLeague'
import { rankTradePartners } from '../../utils/rosterAnalysis'
import { Select } from '../ui'

// THE opponent picker for the Trade section — never a blind list of names. It
// answers "who do I call?" inside the control itself: options grouped by trade
// fit (Priority / Good Fit / Poor Fit, from `rankTradePartners`, best match
// first), each carrying the team's win-window tier and record. Shared by the
// Trade Analyzer (which opponent am I building against?) and Trade › Targets
// (whose board am I scouting?).
//
//   const options = buildPartnerOptions(league)
//   <PartnerSelect options={options} value={id} onChange={setId}
//                  label="Team" placeholder="All teams" />

const FIT_GROUPS = ['Priority', 'Good Fit', 'Poor Fit']

// Fit-ranked options for the selector. Returns [] until league data lands.
export function buildPartnerOptions(league) {
  if (!league?.myRoster || !league?.allRosters?.length) return []
  const { partners } = rankTradePartners(league.myRoster, league.allRosters)
  const rosterById = Object.fromEntries(league.allRosters.map(r => [r.rosterId, r]))
  return partners.map(p => {
    const r = rosterById[p.rosterId]
    return {
      rosterId: p.rosterId,
      name:     getTeamName(p.owner),
      fitBadge: p.fitBadge,
      tier:     p.winWindowTier,
      record:   r?.hasRecord ? r.record : null,
    }
  })
}

function optionLabel(p) {
  const record = p.record
    ? `${p.record.wins}-${p.record.losses}${p.record.ties ? `-${p.record.ties}` : ''}`
    : null
  return [p.name, p.tier, record].filter(Boolean).join(' · ')
}

export default function PartnerSelect({
  options,
  value,
  onChange,
  label = 'Opponent',
  placeholder = 'Select a team…',
  hint = 'Sorted by fit — Priority partners first',
}) {
  return (
    <Select
      label={label}
      hint={hint}
      value={value ?? ''}
      onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
    >
      <option value="">{placeholder}</option>
      {FIT_GROUPS.map(group => {
        const inGroup = options.filter(p => p.fitBadge === group)
        if (inGroup.length === 0) return null
        return (
          <optgroup key={group} label={group}>
            {inGroup.map(p => (
              <option key={p.rosterId} value={p.rosterId}>{optionLabel(p)}</option>
            ))}
          </optgroup>
        )
      })}
    </Select>
  )
}
