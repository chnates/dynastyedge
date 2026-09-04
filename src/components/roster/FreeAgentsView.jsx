import { useCallback, useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useLeagueContext } from '../../context/LeagueContext'
import { useSleeperRookies } from '../../hooks/useSleeperRookies'
import { usePlayerDB } from '../../hooks/usePlayerDB'
import { useWeeklyProjections } from '../../hooks/weeklyProjections'
import { getPositionalDeltas, computeLeagueAverages } from '../../utils/rosterAnalysis'
import { recommendFreeAgents } from '../../utils/recommendations'
import { Card, Chip, SearchInput } from '../ui'
import LoadingSpinner from '../shared/LoadingSpinner'
import ErrorState from '../shared/ErrorState'
import SectionHeader from '../shared/SectionHeader'
import TrendArrow from '../shared/TrendArrow'
import PlayerProfileDrawer from '../shared/PlayerProfileDrawer'
import { POS_CHIP_ACTIVE, POS_TEXT } from '../../utils/positionColors'

// DEF belongs here: the league starts one, and FantasyCalc ranks zero
// defenses — so filtering the pool to FantasyCalc's positions (the old
// ['QB','RB','WR','TE']) made every available defense invisible. See
// utils/freeAgents.js for the same blind spot on the Optimizer's waiver list.
const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'DEF']
const VALUED_POSITIONS = ['QB', 'RB', 'WR', 'TE']
const SORT_VALUE = { id: 'value', label: 'Value' }
const SORT_PROJ  = { id: 'proj',  label: 'Proj'  }
const SORT_AGE   = { id: 'age',   label: 'Age'   }

function FillsNeedBadge() {
  return (
    <span className="font-body text-[9px] font-bold uppercase tracking-wider text-success bg-success/15 border border-success/30 rounded-none px-1.5 py-0.5 flex-shrink-0">
      Need
    </span>
  )
}

function RookieBadge() {
  return (
    <span className="font-body text-[9px] font-bold uppercase tracking-wider text-warning bg-warning/15 border border-warning/30 rounded-none px-1.5 py-0.5 flex-shrink-0">
      Rookie
    </span>
  )
}

// Proactive "here's who to actually add" card — the assistant-GM read on the
// free-agent pool, not just a filterable list.
function RecommendedPickups({ recs, onSelect }) {
  if (!recs.length) return null
  return (
    <div>
      <SectionHeader label="Recommended Pickups" />
      <Card padding="none">
        {recs.map((rec, i) => {
          const p = rec.player
          return (
            <button
              key={p.sleeperId}
              onClick={() => onSelect(p)}
              className={`w-full text-left px-3 py-2.5 flex flex-col gap-1.5 active:opacity-60 transition-opacity ${
                i < recs.length - 1 ? 'border-b border-border-default' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <Sparkles size={13} className="text-accent flex-shrink-0" strokeWidth={2} />
                <span className="font-body text-sm font-medium text-text-primary flex-1 truncate leading-tight">
                  {p.name}
                </span>
                <span className={`font-body text-[10px] font-semibold uppercase tracking-wide flex-shrink-0 ${POS_TEXT[p.position] ?? 'text-text-tertiary'}`}>
                  {p.position}
                </span>
                <span className="font-mono text-sm font-medium text-accent tabular-nums flex-shrink-0">
                  {(p.value ?? 0).toLocaleString()}
                </span>
                <TrendArrow trend={p.trend30Day ?? 0} />
              </div>
              <div className="flex flex-wrap gap-1 pl-[21px]">
                {rec.reasons.slice(0, 2).map((reason, j) => (
                  <span key={j} className="font-body text-[10px] text-text-secondary bg-bg-secondary rounded-none px-1.5 py-0.5">
                    {reason}
                  </span>
                ))}
              </div>
            </button>
          )
        })}
      </Card>
    </div>
  )
}


// ── The defense you already roster ───────────────────────────────────────────
// You start exactly one defense a week, so the honest question here is never
// "which defenses should I add?" — it is "is there any reason to replace the
// one I have?" Almost always the answer is no: streaming defenses on Sleeper's
// weekly projection measured -0.00 pts/wk across 408 team-weeks (2023-25), one
// season significantly negative. So this card leads with the incumbent and
// only turns urgent in the two cases that actually cost you points — an empty
// slot, or your defense on bye.
function DefenseRosterNote({ myDefense, week }) {
  const tone = myDefense?.playing ? 'bg-accent' : 'bg-warning'
  return (
    <Card accent={tone} padding="sm" className="mb-3">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-1.5">
        Your Defense
      </p>
      {!myDefense ? (
        <p className="font-body text-sm text-text-primary leading-snug">
          You have <span className="font-semibold text-warning">no defense rostered</span>, and
          one starts every week. Add one below.
        </p>
      ) : myDefense.playing ? (
        <>
          <p className="font-body text-sm text-text-primary leading-snug">
            <span className="font-semibold">{myDefense.name}</span>
            {myDefense.proj != null && (
              <> — <span className="font-mono tabular-nums">{myDefense.proj.toFixed(1)}</span> projected
              {week ? ` in Week ${week}` : ''}</>
            )}.
          </p>
          <p className="font-body text-[11px] text-text-tertiary leading-snug mt-1.5">
            Only one defense starts, and there is no dynasty reason to hold a second. Swapping
            week to week on projection measured worth nothing over three seasons — this list is
            for a bye week or an empty slot, not a weekly edge.
          </p>
        </>
      ) : (
        <p className="font-body text-sm text-text-primary leading-snug">
          <span className="font-semibold">{myDefense.name}</span> is{' '}
          <span className="font-semibold text-warning">on bye{week ? ` in Week ${week}` : ''}</span> and
          will score 0. Pick up a replacement for this week.
        </p>
      )}
    </Card>
  )
}

export default function FreeAgentsView() {
  const { league, loading, error, retry, values } = useLeagueContext()
  const { sleeperRookieMap } = useSleeperRookies()
  const { playerDB } = usePlayerDB()
  // Best-effort and in-season only: a failure just hides the Proj column.
  const { projMap, week: projWeek, isOffseason } = useWeeklyProjections()
  const showProj = !isOffseason && !!projMap

  const [posFilter, setPosFilter]     = useState('ALL')
  const [sortMode, setSortMode]       = useState('value')
  const [search, setSearch]           = useState('')
  const [upgradesOnly, setUpgradesOnly] = useState(false)
  const [hideRookies, setHideRookies] = useState(false)
  const [selected, setSelected]       = useState(null)

  // Every defense is unranked, so a Value column under the DEF filter is a
  // column of `—`. Rule 7 is about never dropping a PLAYER; a column no row in
  // this view can ever fill is just noise, and the card above says why.
  const showValue = posFilter !== 'DEF'

  // Same rookie detection used by the Rookie badge — Sleeper years_exp===0,
  // with the age heuristic as fallback when experience data is missing
  const isRookie = useCallback(p =>
    !!sleeperRookieMap?.[p.sleeperId]
      || p.experience === 0
      || (p.experience == null && p.age != null && p.age <= 25),
  [sleeperRookieMap])

  const myNeeds = useMemo(() => {
    if (!league) return {}
    const avgs = computeLeagueAverages(league.allRosters)
    return getPositionalDeltas(league.myRoster, avgs)
  }, [league])

  const needPositions = useMemo(() =>
    Object.entries(myNeeds)
      .filter(([, delta]) => delta < 0)
      .map(([pos]) => pos),
  [myNeeds])

  // Lowest dynasty value per position on my roster (for Upgrades Only filter)
  const myWorstByPosition = useMemo(() => {
    if (!league?.myRoster) return {}
    const worst = {}
    league.myRoster.players.forEach(p => {
      if (!['QB', 'RB', 'WR', 'TE'].includes(p.position)) return
      if (worst[p.position] == null || (p.value ?? 0) < worst[p.position]) {
        worst[p.position] = p.value ?? 0
      }
    })
    return worst
  }, [league])

  // My rostered players grouped by position, sorted by value desc (for drawer comparison)
  const myPlayersByPosition = useMemo(() => {
    if (!league?.myRoster) return {}
    const byPos = {}
    league.myRoster.players.forEach(p => {
      if (!['QB', 'RB', 'WR', 'TE'].includes(p.position)) return
      if (!byPos[p.position]) byPos[p.position] = []
      byPos[p.position].push(p)
    })
    Object.values(byPos).forEach(arr => arr.sort((a, b) => (b.value ?? 0) - (a.value ?? 0)))
    return byPos
  }, [league])

  const rosteredIds = useMemo(() => {
    const rostered = new Set()
    ;(league?.allRosters ?? []).forEach(r =>
      r.players.forEach(p => rostered.add(p.sleeperId))
    )
    return rostered
  }, [league])

  // The dynasty-valued pool. This is what the recommendation engine scores —
  // it reasons entirely in FantasyCalc value, so defenses must never enter it.
  const freeAgents = useMemo(() => {
    if (!league || !values?.playerMap) return []
    return Object.values(values.playerMap)
      .filter(p =>
        !rosteredIds.has(p.sleeperId) &&
        VALUED_POSITIONS.includes(p.position) &&
        (p.value ?? 0) > 0
      )
  }, [league, values, rosteredIds])

  // Available defenses, resolved from the shared player DB — FantasyCalc ranks
  // none, so they carry no dynasty value and show `—` (rule 7). Without this
  // the DEF chip would be a filter over an empty set.
  const availableDefenses = useMemo(() => {
    if (!league || !playerDB) return []
    return Object.entries(playerDB)
      .filter(([id, p]) => p.position === 'DEF' && p.team && !rosteredIds.has(id))
      .map(([id, p]) => ({
        sleeperId: id,
        name: p.name,
        position: 'DEF',
        team: p.team,
        value: null,
        age: null,
        overallRank: null,
        trend30Day: 0,
      }))
  }, [league, playerDB, rosteredIds])

  // The defense I roster, plus whether it plays this week. A defense on bye has
  // NO row in the projections payload at all (verified against 2025 W6: 30 of
  // 32 defenses projected, the two bye teams absent) — so this needs no
  // schedule fetch.
  const myDefense = useMemo(() => {
    const def = (league?.myRoster?.players ?? []).find(p => p.position === 'DEF')
    if (!def) return null
    const entry = showProj ? projMap[def.sleeperId] : null
    return {
      name: def.name,
      proj: entry?.pts_half_ppr ?? null,
      // Offseason has no projections at all, so "not playing" would be a lie.
      playing: showProj ? !!entry : true,
    }
  }, [league, projMap, showProj])

  const projOf = useCallback(
    p => (showProj ? (projMap[p.sleeperId]?.pts_half_ppr ?? 0) : null),
    [showProj, projMap],
  )

  // Proactive pickup recommendations — respects the position filter so it
  // narrows with the list, but ignores search (it's advice, not a lookup).
  const recommendations = useMemo(() => {
    if (!league?.myRoster) return []
    const recs = recommendFreeAgents(freeAgents, league.myRoster, league.allRosters, { limit: 6 })
    return posFilter === 'ALL' ? recs : recs.filter(r => r.player.position === posFilter)
  }, [freeAgents, league, posFilter])

  const filtered = useMemo(() => {
    // Defenses live behind the DEF chip and NOWHERE else. You start exactly one
    // every week and there is no dynasty reason to hold a second, so mixing 14
    // of them into the general pool reads as "pick up some defenses" — advice
    // the app should never give. Under Proj sort they'd rank mid-list too,
    // since a defense projects 4–8 and plenty of real stashes project less.
    let list = posFilter === 'DEF' ? availableDefenses : freeAgents

    if (posFilter !== 'ALL' && posFilter !== 'DEF') list = list.filter(p => p.position === posFilter)

    // A value-based filter, so it only applies to positions that HAVE a value.
    if (upgradesOnly) {
      list = list.filter(p =>
        VALUED_POSITIONS.includes(p.position) &&
        (p.value ?? 0) > (myWorstByPosition[p.position] ?? 0))
    }

    if (hideRookies) {
      list = list.filter(p => !isRookie(p))
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(p => p.name?.toLowerCase().includes(q))
    }

    // A defense has no dynasty value and no age, so Value/Proj/Age is a choice
    // between one real ordering and two dead ones. Sort on the only axis it
    // has, and drop the control (below) rather than offer dead options.
    if (posFilter === 'DEF') {
      list = [...list].sort((a, b) =>
        (projOf(b) ?? 0) - (projOf(a) ?? 0) || a.name.localeCompare(b.name))
    } else if (sortMode === 'proj') {
      list = [...list].sort((a, b) => (projOf(b) ?? 0) - (projOf(a) ?? 0) || (b.value ?? 0) - (a.value ?? 0))
    } else if (sortMode === 'value') {
      list = [...list].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    } else {
      list = [...list].sort((a, b) => (a.age ?? 99) - (b.age ?? 99))
    }

    return list
  }, [freeAgents, availableDefenses, posFilter, upgradesOnly, hideRookies, isRookie, search, sortMode, myWorstByPosition, projOf])

  // Sorting by a projection that doesn't exist would silently reorder nothing;
  // and under DEF there is only one meaningful ordering, so the control goes.
  const sortOptions = posFilter === 'DEF'
    ? []
    : (showProj ? [SORT_VALUE, SORT_PROJ, SORT_AGE] : [SORT_VALUE, SORT_AGE])
  const activeSort = sortMode === 'proj' && !showProj ? 'value' : sortMode

  if (loading && !league) return <LoadingSpinner message="Loading league data…" />
  if (error && !league)   return <ErrorState message={error} onRetry={retry} />

  return (
    <>
      <div className="px-4 pb-4">
        {/* Search bar */}
        <div className="pt-4 pb-3">
          <SearchInput
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search free agents…"
            className="rounded-lg"
          />
        </div>

        {/* Position filter */}
        <div className="flex gap-1.5 mb-3 overflow-x-auto pb-0.5">
          {POSITIONS.map(pos => (
            <Chip
              key={pos}
              active={posFilter === pos}
              activeClass={POS_CHIP_ACTIVE[pos] ?? 'bg-accent text-bg-primary border border-transparent'}
              onClick={() => setPosFilter(pos)}
              className="rounded-lg tracking-wide"
            >
              {pos}
            </Chip>
          ))}
        </div>

        {/* Under the DEF chip the useful answer is about the defense you already
            have, not the 14 you could add. */}
        {posFilter === 'DEF' && <DefenseRosterNote myDefense={myDefense} week={projWeek} />}

        {/* Recommended pickups — assistant-GM advice, hidden while searching */}
        {!search.trim() && recommendations.length > 0 && (
          <div className="mb-3">
            <RecommendedPickups recs={recommendations.slice(0, 4)} onSelect={setSelected} />
          </div>
        )}

        {/* Filter toggles */}
        <div className="mb-3">
          <div className="flex items-center gap-2">
            {/* Upgrades Only compares dynasty value, which defenses don't have —
                showing it under the DEF chip would filter the list to nothing. */}
            {posFilter !== 'DEF' && (
              <Chip
                active={upgradesOnly}
                activeClass="bg-success/20 text-success border border-success/30"
                onClick={() => setUpgradesOnly(o => !o)}
                className="rounded-lg tracking-wide"
              >
                Upgrades Only
              </Chip>
            )}
            {/* No defense is a rookie, and none has a dynasty value to upgrade
                over — both chips are dead controls under the DEF filter. */}
            {posFilter !== 'DEF' && (
              <Chip
                active={hideRookies}
                activeClass="bg-warning/20 text-warning border border-warning/30"
                onClick={() => setHideRookies(h => !h)}
                className="rounded-lg tracking-wide"
              >
                Hide Rookies
              </Chip>
            )}
          </div>
          {upgradesOnly && posFilter !== 'DEF' && (
            <p className="font-body text-[10px] text-text-tertiary leading-tight mt-1.5">
              Better than my worst {posFilter === 'ALL' ? 'at each position' : posFilter}
            </p>
          )}
        </div>

        {/* Sort + count row */}
        <div className={`flex items-center justify-between ${sortOptions.length ? 'mb-1.5' : 'mb-3'}`}>
          <span className="font-body text-[11px] text-text-tertiary">
            {filtered.length} available
            {posFilter === 'DEF' ? ' · by Week projection' : ''}
          </span>
          <div className="flex gap-1">
            {sortOptions.map(o => (
              <Chip
                key={o.id}
                size="sm"
                active={activeSort === o.id}
                onClick={() => setSortMode(o.id)}
                className="rounded tracking-wide"
              >
                {o.label}
              </Chip>
            ))}
          </div>
        </div>

        {/* Why the second axis exists. Sorting a WAIVER list by dynasty value
            puts players who cannot score this week at the top — three of the
            current dynasty top ten project 0.0. The projection level, by
            contrast, sorts the waiver tier 12× across its range. */}
        {showProj && posFilter !== 'DEF' && (
          <p className="font-body text-[10px] text-text-tertiary leading-snug mb-3">
            {activeSort === 'proj'
              ? `Week ${projWeek} projection. Among waiver-tier players a 0–2 projection means a 0.9% chance of a 15+ point game; 6–8 means 10.6%.`
              : `Dynasty value first — tap Proj to rank by what they'd score in Week ${projWeek} instead.`}
          </p>
        )}

        {/* Player list */}
        {filtered.length === 0 ? (
          <p className="text-center text-text-tertiary font-body text-sm py-10">
            {search
              ? 'No players match your search.'
              : upgradesOnly
                ? 'No free agents upgrade your roster at this position.'
                : posFilter === 'DEF'
                  ? 'Every defense is rostered.'
                  : 'No free agents at this position.'
            }
          </p>
        ) : (
          <div className="rounded-none bg-bg-card border border-border-default px-3">
            <div className="flex items-center gap-2 pt-2 pb-1 border-b border-border-default font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
              <span className="flex-1 min-w-0" />
              {showProj && <span className="w-9 text-right shrink-0">Proj</span>}
              {showValue && <span className="w-11 text-right shrink-0">Value</span>}
              <span className="w-4 shrink-0" />
            </div>
            {filtered.map((player, i) => {
              const fillsNeed = needPositions.includes(player.position)
              const rookie = isRookie(player)
              const proj = projOf(player) ?? 0
              return (
                <button
                  key={player.sleeperId}
                  onClick={() => setSelected(player)}
                  className={`w-full text-left py-3 flex flex-col gap-1 active:opacity-60 transition-opacity ${
                    i < filtered.length - 1 ? 'border-b border-border-default' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-body text-sm font-medium text-text-primary flex-1 truncate leading-tight">
                      {player.name}
                    </span>
                    {rookie && <RookieBadge />}
                    {fillsNeed && <FillsNeedBadge />}
                    {showProj && (
                      <span className="font-mono text-sm font-semibold text-text-primary tabular-nums flex-shrink-0 w-9 text-right">
                        {proj > 0 ? proj.toFixed(1) : '—'}
                      </span>
                    )}
                    {showValue && (
                      <span className="font-mono text-sm font-medium text-accent tabular-nums flex-shrink-0 w-11 text-right">
                        {player.value ? player.value.toLocaleString() : '—'}
                      </span>
                    )}
                    {showValue && <TrendArrow trend={player.trend30Day ?? 0} />}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`font-body text-[10px] font-semibold uppercase tracking-wide ${POS_TEXT[player.position] ?? 'text-text-tertiary'}`}>
                      {player.position}
                    </span>
                    <span className="text-text-tertiary text-[10px]">·</span>
                    <span className="font-body text-[10px] text-text-tertiary">{player.team || 'FA'}</span>
                    {player.age != null && (
                      <>
                        <span className="text-text-tertiary text-[10px]">·</span>
                        <span className="font-body text-[10px] text-text-tertiary">Age {Math.floor(player.age)}</span>
                      </>
                    )}
                    {player.overallRank != null && (
                      <>
                        <span className="text-text-tertiary text-[10px]">·</span>
                        <span className="font-body text-[10px] text-text-tertiary">#{player.overallRank} OVR</span>
                      </>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {selected && (
        <PlayerProfileDrawer
          player={selected}
          playerMap={values?.playerMap ?? {}}
          rosterComparison={myPlayersByPosition[selected.position] ?? []}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}
