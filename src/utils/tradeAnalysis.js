import { computeLeagueAverages, getPositionalDeltas, assignWinWindowTiers } from './rosterAnalysis'
import { getDeadlineVerdict } from './playoffOdds'
import { buildValueLineup, selectOptimalStarters } from './lineupBuild'
import { buildRosterSpace } from './rosterSpace'
import { sideVorp } from './positionalValue'
import { projectPlayerSeries, seriesDirection } from './dynastyTrajectory'
import { buildGivabilityContext, assetKeepScore, getDeficitPositions, joinAnd, PROTECT_THRESHOLD } from './recommendations'

// A scarcity read needs a side worth reading — two below-replacement sides
// carry no signal. And the flag only speaks on a real disagreement: 10 points
// of percentage gap, or the two scales naming different winners.
const SCARCITY_FLOOR = 500
const SCARCITY_GAP = 10

const PICK_SUFFIXES = ['', '1st', '2nd', '3rd', '4th']

function pickLabel(pick) {
  const suffix = PICK_SUFFIXES[pick.round] ?? `R${pick.round}`
  return `${pick.season} ${suffix}`
}

// The positional pecking order on a roster by dynasty value, grouped by the
// positions being dealt from and marking each departing piece. Shared by both
// directions of the trade: my "Giving Up" chart and the partner's chart for the
// player I'm asking them to send. Taxi/IR excluded — they can't start.
export function buildDepthContext(rosterPlayers, dealtPlayers, starterIds) {
  const positions = [...new Set((dealtPlayers ?? []).map(p => p.position).filter(Boolean))]
  return positions.map(pos => {
    const dealtIds = new Set(
      dealtPlayers.filter(p => p.position === pos).map(p => String(p.sleeperId))
    )
    const peers = (rosterPlayers ?? [])
      .filter(q => q.position === pos && !q.isIR && !q.isTaxi)
      .map(q => ({
        sleeperId: String(q.sleeperId),
        name: q.name,
        value: q.value || 0,
        unranked: q.unranked,
        isStarter: starterIds.has(String(q.sleeperId)),
        isDealt: dealtIds.has(String(q.sleeperId)),
      }))
      .sort((a, b) => b.value - a.value)
    const dealt = peers
      .filter(q => q.isDealt)
      .map(q => ({
        name: q.name,
        posRank: peers.findIndex(x => x.sleeperId === q.sleeperId) + 1,
        isStarter: q.isStarter,
      }))
    return { position: pos, count: peers.length, peers, dealt }
  })
}

// Where an arriving player LANDS on the destination roster: his rank at the
// position once the trade settles, whether he cracks the optimal lineup, and
// which slot he'd occupy. Answers "does this actually change their starters?" —
// the question a position tag can't. Unranked arrivals still get a spot (rule 7).
export function buildLandingSpots(arrivals, afterPlayers, afterLineup) {
  return (arrivals ?? [])
    .filter(p => p.position)
    .map(p => {
      const id = String(p.sleeperId)
      const peers = afterPlayers
        .filter(q => q.position === p.position && !q.isIR && !q.isTaxi)
        .sort((a, b) => (b.value || 0) - (a.value || 0))
      const idx = peers.findIndex(q => String(q.sleeperId) === id)
      const starter = afterLineup.starters.find(s => s.key === id) ?? null
      return {
        sleeperId: id,
        name: p.name,
        position: p.position,
        value: p.value || 0,
        unranked: p.unranked,
        posRank: idx >= 0 ? idx + 1 : null,
        count: peers.length,
        starts: afterLineup.starterIds.has(id),
        slot: starter?.slot ?? null,
      }
    })
}

// The band of "you give" totals that lands the trade inside the ±5% fair window
// for what you're getting. A point estimate ("you're 12% light") tells you the
// offer is wrong; a band tells you how much room you have to haggle, which is
// the thing you actually need at the table.
export function buildFairBand(giveTotal, getTotal) {
  if (!getTotal && !giveTotal) return null
  const low  = Math.round(getTotal * 0.95)
  const high = Math.round(getTotal * 1.05)
  return {
    low, high, target: getTotal, current: giveTotal,
    inside: giveTotal >= low && giveTotal <= high,
    // Signed distance to the near edge — what closing it actually costs.
    gapToBand: giveTotal < low ? low - giveTotal : giveTotal > high ? giveTotal - high : 0,
    // Rendering bounds, padded so the band never sits flush against an end.
    axisLow:  Math.round(Math.min(low, giveTotal) * 0.9),
    axisHigh: Math.round(Math.max(high, giveTotal) * 1.1),
  }
}

// A roster's best lineup measured in THIS WEEK's projected points rather than
// dynasty value — the same slot-fill, a different metric. In-season only; the
// caller passes no projections in the offseason and this returns null.
function pointsLineupTotal(players, projMap) {
  if (!projMap) return null
  const items = (players ?? [])
    .filter(p => !p.isIR && !p.isTaxi && p.position)
    .map(p => ({
      key: String(p.sleeperId),
      position: p.position,
      metric: projMap[String(p.sleeperId)]?.pts_half_ppr ?? 0,
    }))
  return selectOptimalStarters(items).total
}

export function analyzeTrade(giveAssets, getAssets, myRoster, opponentRoster, allRosters, opts = {}) {
  if (!myRoster || !opponentRoster || !allRosters?.length) return null

  const {
    myPlayoffPct = null,
    opponentTrajectoryRead = null,
    curves = null,            // dynasty age curves (from buildAgeCurves) — enables the my-players trajectory lens
    myDraftGrade = null,      // { count, hits, avgDelta } from my Manager Scouting report card
    replacementLevels = null, // scarcity floors from buildReplacementLevels — DISPLAY ONLY
    rosterLimits = null,      // { activeSlots, … } from getRosterLimits(leagueInfo)
    weeklyProjections = null, // { projMap, week } — in-season only
    partnerActivity = null,   // buildPartnerActivity(...) for the opponent
  } = opts

  const giveTotal = giveAssets.reduce((s, a) => s + (a.value || 0), 0)
  const getTotal  = getAssets.reduce((s, a)  => s + (a.value || 0), 0)

  // Layer 1: Raw value
  const maxTotal  = Math.max(giveTotal, getTotal, 1)
  const valueDiff = getTotal - giveTotal
  const valuePct  = Math.round(Math.abs(valueDiff) / maxTotal * 100)
  const valueWinner = valuePct <= 5 ? 'even' : valueDiff > 0 ? 'you' : 'them'

  const getPlayers  = getAssets.filter(a => a.type === 'player')
  const getPicks    = getAssets.filter(a => a.type === 'pick')
  const givePlayers = giveAssets.filter(a => a.type === 'player')
  const givePicks   = giveAssets.filter(a => a.type === 'pick')

  // Layer 2: Roster fit — simulated against the ACTUAL post-trade starting
  // lineup (optimal by dynasty value), not a bare position-tag match. So an
  // acquired player only "fills" a need if he'd genuinely start, and shipping a
  // player only "hurts" if it actually drops that position below league average.
  const leagueAverages = computeLeagueAverages(allRosters)
  const myDeltas = getPositionalDeltas(myRoster, leagueAverages)

  const giveIds = new Set(givePlayers.map(p => String(p.sleeperId)))
  const addAsPlayer = a => ({
    sleeperId: String(a.sleeperId), name: a.name, position: a.position,
    value: a.value || 0, age: a.age, unranked: a.unranked, isIR: false, isTaxi: false,
  })

  const beforeLineup = buildValueLineup(myRoster.players)
  const afterPlayers = [
    ...myRoster.players.filter(p => !giveIds.has(String(p.sleeperId))),
    ...getPlayers.map(addAsPlayer),
  ]
  const afterLineup = buildValueLineup(afterPlayers)
  const afterDeltas = getPositionalDeltas({ players: afterPlayers }, leagueAverages)

  // Received players: which actually START in the resulting lineup vs. sit as depth?
  const startingAcquisitions = getPlayers.filter(p => afterLineup.starterIds.has(String(p.sleeperId)))
  const benchAcquisitions = getPlayers
    .filter(p => p.position && !afterLineup.starterIds.has(String(p.sleeperId)))
    .map(p => ({ name: p.name, position: p.position }))

  // Given players: which were STARTERS in my best pre-trade lineup?
  const starterDepartures = givePlayers
    .filter(p => p.position && beforeLineup.starterIds.has(String(p.sleeperId)))
    .map(p => ({ name: p.name, position: p.position }))

  // "What am I giving up?" — for every position I'm dealing from, the roster's
  // positional pecking order by dynasty value, marking the piece(s) leaving and
  // who starts. Grouped by position so dealing two players at one spot shows one
  // depth chart. Taxi/IR excluded (they can't start), matching the lineup sim.
  const giveContext = buildDepthContext(myRoster.players, givePlayers, beforeLineup.starterIds)

  // A need is filled only by a player who (a) starts post-trade and (b) plays a
  // position where I'm below league average today.
  const filledNeeds = []
  startingAcquisitions.forEach(p => {
    if (p.position && myDeltas[p.position] < 0 && !filledNeeds.includes(p.position))
      filledNeeds.push(p.position)
  })

  // A position is hurt when I ship a player there AND the trade actively drops
  // that position below league average (afterDeltas < 0 and strictly worse than
  // before) — so dealing a starter out of a surplus that falls below the line
  // registers, while shedding a benchwarmer that changes nothing does not.
  const hurtStrengths = []
  givePlayers.forEach(p => {
    const pos = p.position
    if (!pos) return
    if (afterDeltas[pos] < 0 && afterDeltas[pos] < myDeltas[pos] && !hurtStrengths.includes(pos))
      hurtStrengths.push(pos)
  })

  let fitScore = 0
  if (filledNeeds.length > 0 && hurtStrengths.length === 0)      fitScore =  1
  else if (hurtStrengths.length > 0 && filledNeeds.length === 0) fitScore = -1
  else if (filledNeeds.length > hurtStrengths.length)            fitScore =  1
  else if (hurtStrengths.length > filledNeeds.length)            fitScore = -1

  // Bench note: acquired players who won't crack the starting lineup are depth,
  // not the upgrade a position-tag read would imply.
  let benchNote = null
  if (benchAcquisitions.length > 0) {
    const names = joinAnd(benchAcquisitions.map(b => b.name))
    const projects = benchAcquisitions.length > 1 ? 'project' : 'projects'
    benchNote = `${names} ${projects} as ${benchAcquisitions[0].position} depth in your lineup — not a starting upgrade.`
  }

  // Starter-loss note: shipping a lineup regular that did NOT drop the position
  // below average (so it isn't a hurtStrength) still deserves a heads-up.
  let starterLossNote = null
  const softDepartures = starterDepartures.filter(d => !hurtStrengths.includes(d.position))
  if (softDepartures.length > 0) {
    const names  = joinAnd(softDepartures.map(d => d.name))
    const plural = softDepartures.length > 1
    starterLossNote = `You're dealing ${plural ? 'starters' : 'a starter'} (${names}) from your best lineup — the position stays at or above league average, but make sure the return replaces the production.`
  }

  // Layer 3: Win window fit
  const winWindowTiers = assignWinWindowTiers(allRosters)
  const myTier = winWindowTiers[myRoster.rosterId] ?? 'Middle'

  let windowScore = 0
  let windowNote  = 'Neutral — fits your current win window'

  if (myTier === 'Contending') {
    const gettingOnlyPicks  = getPicks.length > 0 && getPlayers.length === 0
    const givingProvenVets  = givePlayers.some(p => p.value > 5000 && (p.age ?? 99) <= 30)

    if (gettingOnlyPicks) {
      windowScore = -1
      windowNote  = 'Getting only picks conflicts with your Contending window — proven players serve you better'
    } else if (givingProvenVets) {
      windowScore = -1
      windowNote  = 'Giving up proven starters conflicts with your Contending window'
    } else {
      windowScore = 1
      windowNote  = 'Proven players fit your Contending window'
    }
  } else if (myTier === 'Rebuilding') {
    const gettingExpVets       = getPlayers.some(p => p.value > 6000 && (p.age ?? 0) >= 28)
    const gettingYouthOrPicks  = getPlayers.some(p => (p.age ?? 99) < 25) || getPicks.length > 0

    if (gettingExpVets) {
      windowScore = -1
      windowNote  = 'Acquiring expensive veterans conflicts with your Rebuilding window'
    } else if (gettingYouthOrPicks) {
      windowScore = 1
      windowNote  = 'Youth and picks align with your Rebuilding window'
    } else {
      windowNote  = 'Neutral for your Rebuilding window'
    }
  }

  // Playoff-odds context (real probability behind the win-window read). Only
  // present in-season once the simulation has live odds; null otherwise.
  let playoffPct = null
  let oddsStance = null
  let oddsNote   = null
  let oddsTone   = null
  if (myPlayoffPct != null) {
    const dv = getDeadlineVerdict(myPlayoffPct, myTier)
    playoffPct = myPlayoffPct
    oddsStance = dv.stance
    oddsNote   = dv.text
    oddsTone   = dv.tone ?? null
  }

  // Partner's multi-year value direction (Dynasty Trajectory). Most relevant
  // when you're acquiring their players: a declining team is motivated to sell
  // win-now talent; an ascending team will resist parting with youth.
  let partnerTrajectoryNote = null
  let partnerTrajectoryTone = null
  if (opponentTrajectoryRead && getPlayers.length > 0) {
    const r = opponentTrajectoryRead
    if (r.direction === 'declining') {
      partnerTrajectoryNote = `Their roster value peaks now and slides through ${r.lastSeason} — they may be motivated to move win-now talent for picks or youth.`
      partnerTrajectoryTone = 'success'
    } else if (r.direction === 'ascending') {
      partnerTrajectoryNote = `Their value is climbing toward ${r.peakSeason} — they're building and may resist parting with young assets.`
      partnerTrajectoryTone = 'warning'
    }
  }

  // My-players trajectory lens (Dynasty Trajectory over MY side of the deal).
  // Age is already priced into raw value, so this never rewrites Layer 1 — it's
  // a separate forward-looking flag. Selling an ascending player (the classic
  // "trading a young riser") is the sharpest warning; acquiring a declining one
  // is the milder caution. Only surfaces when age curves are supplied.
  let myTrajectoryNote = null
  let myTrajectoryTone = null
  if (curves) {
    const ascendingGiven = givePlayers.filter(p => seriesDirection(projectPlayerSeries(p, curves)) === 'ascending')
    const decliningGotten = getPlayers.filter(p => seriesDirection(projectPlayerSeries(p, curves)) === 'declining')
    if (ascendingGiven.length > 0) {
      const names = joinAnd(ascendingGiven.map(p => p.name))
      myTrajectoryNote = `You're moving ${names}, whose value the model projects to keep climbing — you may be selling an ascending asset before its peak.`
      myTrajectoryTone = 'warning'
    } else if (decliningGotten.length > 0) {
      const names = joinAnd(decliningGotten.map(p => p.name))
      const projects = decliningGotten.length > 1 ? 'project' : 'projects'
      myTrajectoryNote = `${names} ${projects} to shed value over the next few seasons — treat this as a win-now add, not a long-term hold.`
      myTrajectoryTone = 'warning'
    }
  }

  // Draft-grade confidence nudge — when I'm acquiring picks, my rookie-draft
  // hindsight record adjusts confidence in that capital (never the raw value).
  // Keyed to HIT RATE (the share of my rookie picks now worth starting-caliber
  // value), not slot-delta: at this league's sample (~7 graded picks per owner)
  // avgDelta is noise-dominated — it flips sign year-to-year for most owners and
  // even grades a 9-of-11-hit drafter "weak" for taking good players at their
  // slot — while hit rate is both steadier and closer to what "will this pick
  // capital pan out?" actually asks. Gated at ≥5 graded picks; still a small
  // sample, so the copy states the record as fact, not durable skill.
  let draftNote = null
  let draftTone = null
  if (myDraftGrade && getPicks.length > 0 && (myDraftGrade.count ?? 0) >= 5) {
    const { count, hits } = myDraftGrade
    const hitRate = count > 0 ? hits / count : 0
    if (hitRate >= 0.7) {
      draftNote = `Your recent rookie picks have hit — ${hits} of ${count} are already worth starting-caliber dynasty value. This pick capital has tended to pan out for you.`
      draftTone = 'success'
    } else if (hitRate <= 0.35) {
      draftNote = `Caution on the pick: only ${hits} of ${count} of your recent rookie picks have hit — value this capital at market, not on upside.`
      draftTone = 'warning'
    }
  }


  // ── Layer 4: Their side ───────────────────────────────────────────────────
  // Layer 2 run on the PARTNER's roster: does this deal do anything for the
  // team being asked to accept it? Everything here is deterministic roster
  // logic — what the trade does to their positional standing against league
  // average and to their optimal starting lineup.
  //
  // It is explicitly NOT a prediction that they will accept. Per-manager
  // behavioral profiling was pre-registered, tested on this league's full
  // 4-season corpus (95 trades / 176 sides) and DISCONFIRMED — the own-manager
  // profile scored *below* the league baseline
  // (docs/analysis/trade-structure-stability-2026-08.md, standing ruling). So
  // this models the roster, never the human, and the copy says so.
  const theirTier         = winWindowTiers[opponentRoster.rosterId] ?? 'Middle'
  const theirDeltas       = getPositionalDeltas(opponentRoster, leagueAverages)
  const theirBeforeLineup = buildValueLineup(opponentRoster.players)

  const getIds = new Set(getPlayers.map(p => String(p.sleeperId)))
  const theirAfterPlayers = [
    ...opponentRoster.players.filter(p => !getIds.has(String(p.sleeperId))),
    ...givePlayers.map(addAsPlayer),
  ]
  const theirAfterLineup = buildValueLineup(theirAfterPlayers)
  const theirAfterDeltas = getPositionalDeltas({ players: theirAfterPlayers }, leagueAverages)

  // Where what they'd RECEIVE lands on their chart, and where what they'd SEND
  // currently sits on it — the two halves of "what does this look like to you?"
  const theirLandingSpots = buildLandingSpots(
    givePlayers.map(addAsPlayer), theirAfterPlayers, theirAfterLineup
  )
  const theirGiveContext = buildDepthContext(
    opponentRoster.players, getPlayers, theirBeforeLineup.starterIds
  )

  // The single honest measure of "does this help them": the change in the value
  // of their best startable lineup. A player who only stacks their bench moves
  // this by 0, however much he's worth.
  const theirStartersDelta = Math.round(theirAfterLineup.startingValue - theirBeforeLineup.startingValue)

  const theirFills  = []  // a deficit position an arriving player would actually start at
  const theirStacks = []  // arriving at a position they're already above league average
  theirLandingSpots.forEach(l => {
    const d = theirDeltas[l.position] ?? 0
    if (d < 0 && l.starts && !theirFills.includes(l.position)) theirFills.push(l.position)
    if (d > 0 && !theirStacks.includes(l.position)) theirStacks.push(l.position)
  })

  // Positions the trade actually costs them — the same test Layer 2 applies to
  // me, so "they can't replace him" reads consistently in both directions.
  const theirWeakens = []
  getPlayers.forEach(p => {
    const pos = p.position
    if (!pos) return
    if (theirAfterDeltas[pos] < 0 && theirAfterDeltas[pos] < theirDeltas[pos] && !theirWeakens.includes(pos))
      theirWeakens.push(pos)
  })

  // Raw value from their seat. valuePct is measured on the larger side, so it's
  // symmetric — only the winner flips.
  const theirValueDiff   = giveTotal - getTotal
  const theirValueWinner = valuePct <= 5 ? 'even' : theirValueDiff > 0 ? 'them' : 'you'

  // Reasons render in order; `partnerConcerns` is the negative subset, so the
  // verdict gate can quote the most specific objection rather than whichever
  // line happened to land first.
  const partnerReasons  = []
  const partnerConcerns = []
  let appealScore = 0
  const against = txt => { partnerReasons.push(txt); partnerConcerns.push(txt) }

  if (theirValueWinner === 'them') {
    appealScore += 1
    partnerReasons.push(`They come out ${valuePct}% ahead on raw dynasty value.`)
  } else if (theirValueWinner === 'you') {
    appealScore -= 1
    against(`They'd be giving up ${valuePct}% more value than they get back.`)
  }

  // Arriving into a position they're already strong at. This scores against the
  // deal ONLY when the player can't crack their lineup — that's a fact the value
  // total hides entirely. When he does start, the upgrade is merely marginal,
  // and `theirStartersDelta` already measures exactly how marginal; penalising
  // it here too would charge the same fact twice and would put the weaker of
  // the two sentences in front of the verdict gate.
  const benchedForThem = theirLandingSpots.filter(l => theirStacks.includes(l.position) && !l.starts)
  if (theirFills.length === 0 && benchedForThem.length > 0) {
    appealScore -= 1
    against(`${joinAnd(benchedForThem.map(b => b.name))} wouldn't crack their lineup — they're already above league average at ${joinAnd([...new Set(benchedForThem.map(b => b.position))])}.`)
  } else if (theirFills.length === 0 && theirStacks.length > 0) {
    partnerReasons.push(`They're already above league average at ${joinAnd(theirStacks)} — this is a marginal upgrade for them, not a hole filled.`)
  }

  if (theirStartersDelta > 0) {
    appealScore += 1
    partnerReasons.push(`Their best starting lineup gains ${theirStartersDelta.toLocaleString()} in value.`)
  } else if (theirStartersDelta < 0) {
    appealScore -= 1
    against(`Their best starting lineup loses ${Math.abs(theirStartersDelta).toLocaleString()} in value.`)
  } else if (givePlayers.length > 0) {
    partnerReasons.push("Nothing you're sending changes their starting lineup.")
  }

  if (theirFills.length > 0) {
    appealScore += 1
    partnerReasons.push(`It covers their ${joinAnd(theirFills)} deficit with a player who starts for them right away.`)
  }

  if (theirWeakens.length > 0) {
    appealScore -= 1
    against(`Making it drops them below league average at ${joinAnd(theirWeakens)}.`)
  }

  // Win-window lean on picks — the mirror of Layer 3's read, from their seat.
  if (givePicks.length > 0) {
    if (theirTier === 'Rebuilding') {
      appealScore += 1
      partnerReasons.push(`They're rebuilding — the ${givePicks.length > 1 ? 'picks' : 'pick'} you're offering is what they're collecting.`)
    } else if (theirTier === 'Contending' && givePlayers.length === 0) {
      appealScore -= 1
      against("They're contending and you're offering only picks — they want win-now help.")
    }
  }

  const appeal = appealScore >= 2 ? 'Strong' : appealScore >= 0 ? 'Fair' : 'Weak'
  const APPEAL_SUMMARY = {
    Strong: 'Their roster gives them a clear reason to say yes.',
    Fair:   "There's something here for them, but it isn't compelling on its own.",
    Weak:   'Their roster gives them little reason to take this.',
  }

  const partnerFit = {
    tier: theirTier,
    deltas: theirDeltas,
    valueWinner: theirValueWinner,
    startersDelta: theirStartersDelta,
    fills: theirFills,
    stacks: theirStacks,
    weakens: theirWeakens,
    landingSpots: theirLandingSpots,
    giveContext: theirGiveContext,
    appeal,
    appealScore,
    summary: APPEAL_SUMMARY[appeal],
    reasons: partnerReasons,
    concerns: partnerConcerns,
    activity: partnerActivity,
  }

  // My side's mirror: where the players I'm ACQUIRING land on my own chart.
  const myLandingSpots = buildLandingSpots(getPlayers.map(addAsPlayer), afterPlayers, afterLineup)


  // ── The negotiating instruments (all descriptive — none moves the verdict) ──
  //
  // Owner call 2026-09-06: verdict provenance stays raw value / lineup-sim fit /
  // win window / partner appeal. Everything below changes what you understand
  // and how you negotiate, not the call — the same discipline that keeps usage
  // stats, camp movement and combine numbers out of every score in this app.

  const fairBand = buildFairBand(giveTotal, getTotal)

  // Scarcity (value over replacement). FantasyCalc prices Superflex demand into
  // each player, but summing across positions assumes a point of QB value and a
  // point of WR value are interchangeable, and in a 10-team Superflex they are
  // not. The flag speaks ONLY when the two scales disagree — a second number
  // that agrees with the first is noise, and FantasyCalc stays the headline
  // everywhere so the pitch quotes a total the other manager can look up.
  let scarcity = null
  if (replacementLevels && (givePlayers.length > 0 || getPlayers.length > 0)) {
    const giveVorp = Math.round(sideVorp(giveAssets, replacementLevels))
    const getVorp  = Math.round(sideVorp(getAssets, replacementLevels))
    const vorpMax  = Math.max(giveVorp, getVorp)
    // Two below-replacement sides carry no scarcity signal worth a sentence.
    if (vorpMax >= SCARCITY_FLOOR) {
      const vorpDiff   = getVorp - giveVorp
      const vorpPct    = Math.round(Math.abs(vorpDiff) / vorpMax * 100)
      const vorpWinner = vorpPct <= 5 ? 'even' : vorpDiff > 0 ? 'you' : 'them'
      const disagrees  = vorpWinner !== valueWinner || Math.abs(vorpPct - valuePct) >= SCARCITY_GAP
      if (disagrees) {
        // Name the mechanism with the piece doing the most work on each side.
        const best = list => list
          .map(a => ({ a, v: Math.round(sideVorp([a], replacementLevels)) }))
          .sort((x, y) => y.v - x.v)[0] ?? null
        const bg = best(getPlayers)
        const bv = best(givePlayers)
        const parts = []
        if (bg) parts.push(`${bg.a.name} is +${bg.v.toLocaleString()} over a startable ${bg.a.position}`)
        if (bv) parts.push(`${bv.a.name} is +${bv.v.toLocaleString()} over a startable ${bv.a.position}`)
        scarcity = {
          giveVorp, getVorp, vorpPct, vorpWinner,
          note: vorpWinner === 'even'
            ? `Against replacement level the two sides are much closer than the raw totals suggest — ${joinAnd(parts)}.`
            : `Adjusted for positional scarcity this favors ${vorpWinner === 'you' ? 'you' : 'them'} by ${vorpPct}%${parts.length ? ` — ${joinAnd(parts)}` : ''}.`,
          tone: vorpWinner === 'you' ? 'success' : vorpWinner === 'them' ? 'warning' : 'neutral',
        }
      }
    }
  }

  // Roster space. Over the cap is a NORMAL post-draft state in this league —
  // teams are simply owed drops before the season — so this never calls a trade
  // illegal. It reports headroom, and flags the case that is genuinely a selling
  // point: a partner carrying more players than slots wants a 2-for-1.
  const myRosterSpace = rosterLimits
    ? buildRosterSpace(myRoster, { arrivals: getPlayers, departures: givePlayers, limits: rosterLimits })
    : null
  const theirRosterSpace = rosterLimits
    ? buildRosterSpace(opponentRoster, { arrivals: givePlayers, departures: getPlayers, limits: rosterLimits })
    : null

  // This week's projected points — roster fit in the other currency. A dynasty
  // trade is not decided on one week, which is exactly why this is a note and
  // never a score; it answers "what does this cost me on Sunday?"
  let weeklyImpact = null
  const projMap = weeklyProjections?.projMap ?? null
  if (projMap && (givePlayers.length > 0 || getPlayers.length > 0)) {
    const mineBefore  = pointsLineupTotal(myRoster.players, projMap)
    const mineAfter   = pointsLineupTotal(afterPlayers, projMap)
    const theirsBefore = pointsLineupTotal(opponentRoster.players, projMap)
    const theirsAfter  = pointsLineupTotal(theirAfterPlayers, projMap)
    const round1 = n => Math.round(n * 10) / 10
    weeklyImpact = {
      week: weeklyProjections.week ?? null,
      mine:   { before: round1(mineBefore),   after: round1(mineAfter),   delta: round1(mineAfter - mineBefore) },
      theirs: { before: round1(theirsBefore), after: round1(theirsAfter), delta: round1(theirsAfter - theirsBefore) },
    }
  }

  return {
    giveTotal, getTotal, valueDiff, valuePct, valueWinner,
    filledNeeds, hurtStrengths, fitScore,
    benchAcquisitions, starterDepartures, benchNote, starterLossNote, giveContext,
    myLandingSpots, partnerFit,
    fairBand, scarcity, myRosterSpace, theirRosterSpace, weeklyImpact,
    myTier, windowScore, windowNote, myDeltas,
    playoffPct, oddsStance, oddsNote, oddsTone,
    partnerTrajectoryNote, partnerTrajectoryTone,
    myTrajectoryNote, myTrajectoryTone,
    draftNote, draftTone,
  }
}

function baseTradeVerdict(analysis) {
  if (!analysis) return null
  const {
    giveTotal, getTotal, valuePct, valueWinner,
    filledNeeds, hurtStrengths, fitScore, windowScore, windowNote,
  } = analysis

  if (giveTotal === 0 && getTotal === 0) return null

  // Hard decline: losing > 15% raw value
  if (valueWinner === 'them' && valuePct > 15) {
    return {
      verdict: 'Decline',
      reasoning: `You're giving up ${valuePct}% more in raw value — the gap is too large to justify.`,
    }
  }

  // Winning value + good fit + good window → clean accept
  if (valueWinner !== 'them' && fitScore >= 0 && windowScore >= 0) {
    const valueNote = valueWinner === 'you' ? `You're winning ${valuePct}% on raw value` : 'Value is roughly even'
    const fitNote   = filledNeeds.length > 0 ? ` and this fills your ${filledNeeds[0]} need` : ''
    return { verdict: 'Accept', reasoning: `${valueNote}${fitNote}.` }
  }

  // Overpaying but fills a critical need (tension: raw vs fit)
  if (valueWinner === 'them' && valuePct <= 15 && fitScore > 0) {
    const needNote = filledNeeds[0]
      ? `fills your ${filledNeeds[0]} gap which is your roster's primary weakness`
      : 'addresses your roster needs'
    return {
      verdict: 'Accept',
      reasoning: `You're overpaying ~${valuePct}% on raw value, but this directly ${needNote}.`,
    }
  }

  // Good raw value but wrong asset type for win window (tension: raw vs window)
  if (valueWinner === 'you' && valuePct > 5 && windowScore < 0) {
    return {
      verdict: 'Counter',
      reasoning: `Raw value is in your favor (+${valuePct}%), but ${windowNote.toLowerCase()}.`,
    }
  }

  // Hurting a weakness
  if (fitScore < 0) {
    const posNote   = hurtStrengths[0] ? `weakens your ${hurtStrengths[0]} depth` : 'hurts your roster balance'
    const valueNote = valueWinner === 'them' && valuePct > 5 ? ` and you're overpaying ${valuePct}%` : ''
    return { verdict: 'Decline', reasoning: `This ${posNote}${valueNote}.` }
  }

  // Default: counter
  const reasoning = valuePct > 5 && valueWinner === 'them'
    ? `You're overpaying ${valuePct}% — adjust the terms to get closer to fair value.`
    : 'The offer needs minor adjustment to make sense for both sides.'
  return { verdict: 'Counter', reasoning }
}

// The verdict is the base ladder (raw value / fit / window), then gated by
// Layer 4: a deal the partner's roster gives them no reason to make is not an
// "Accept" — it's an offer that goes unanswered, which is a worse outcome than
// a counter you'd actually get a reply to.
//
// The gate only ever DOWNGRADES, and only from Accept. A trade that's bad for
// me doesn't become good because they'd love it — their enthusiasm is not
// evidence in my favor, it's evidence against.
export function getTradeVerdict(analysis) {
  const base = baseTradeVerdict(analysis)
  const pf = analysis?.partnerFit
  if (!base || !pf || pf.appeal !== 'Weak' || base.verdict !== 'Accept') return base
  const concern = pf.concerns?.[0] ?? pf.reasons[0]
  return {
    verdict: 'Counter',
    reasoning: `${base.reasoning} But there's little in it for them. ${concern} Expect this one to go unanswered as offered.`,
    partnerGated: true,
  }
}

// Build the pitch you'd actually send the other manager: the whole case stated
// from THEIR side of the table, because an argument for why the trade is good
// for you is not a pitch. Every line is a fact the app already computed —
// nothing here is persuasion the numbers don't support.
export function buildTradePitch(analysis, opts = {}) {
  const { partnerName = 'your team', giveAssets = [], getAssets = [] } = opts
  if (!analysis || !giveAssets.length || !getAssets.length) return null

  const { giveTotal, getTotal, valuePct, partnerFit: pf } = analysis
  if (!pf) return null

  const label = a => (a.type === 'pick' ? a.name : `${a.name}${a.position ? ` (${a.position})` : ''}`)
  const lines = []

  lines.push(`You get: ${giveAssets.map(label).join(' + ')}`)
  lines.push(`You give: ${getAssets.map(label).join(' + ')}`)
  lines.push('')

  const bullets = []

  // 1. Value, stated from their seat.
  if (pf.valueWinner === 'even') {
    bullets.push(`Dynasty value is basically even — ${giveTotal.toLocaleString()} coming to you against ${getTotal.toLocaleString()} going out (FantasyCalc, Superflex half-PPR).`)
  } else if (pf.valueWinner === 'them') {
    bullets.push(`You come out ${valuePct}% ahead on dynasty value — ${giveTotal.toLocaleString()} to ${getTotal.toLocaleString()} (FantasyCalc, Superflex half-PPR).`)
  } else {
    bullets.push(`Value leans my way by ${valuePct}% on paper (${getTotal.toLocaleString()} to ${giveTotal.toLocaleString()}) — tell me what would even it out.`)
  }

  // 2. What the incoming pieces actually do to their lineup.
  pf.landingSpots.forEach(l => {
    if (l.starts) {
      bullets.push(`${l.name} slots in as your ${l.position}${l.posRank} and starts${l.slot ? ` at ${l.slot}` : ''}.`)
    } else {
      bullets.push(`${l.name} would be your ${l.position}${l.posRank} of ${l.count} — depth behind what you already start.`)
    }
  })
  if (pf.startersDelta > 0) {
    bullets.push(`Net, your best starting lineup gains about ${pf.startersDelta.toLocaleString()} in dynasty value.`)
  }

  // 3. Why the piece I'm asking for is one they can spare (or honestly can't).
  pf.giveContext.forEach(g => {
    g.dealt.forEach(d => {
      const spare = !pf.weakens.includes(g.position)
      bullets.push(spare
        ? `${d.name} is your ${g.position}${d.posRank} of ${g.count} — you stay at or above league average at ${g.position} without him.`
        : `I know ${d.name} is real depth for you at ${g.position} — say what it would take.`)
    })
  })

  // 4. Roster space, when it's a point in their favour. In this league that is
  //    often the strongest argument available: a team carrying more players
  //    than it has slots is owed drops, and a 2-for-1 pays that debt down.
  const sp = analysis.theirRosterSpace
  if (sp) {
    if (sp.relievesCrunch) {
      bullets.push(`It also frees you ${Math.abs(sp.net)} roster spot${Math.abs(sp.net) > 1 ? 's' : ''} — you're carrying ${sp.before} against ${sp.cap} slots.`)
    } else if (sp.net < 0 && sp.headroomAfter > 0) {
      bullets.push(`It opens ${Math.abs(sp.net)} roster spot${Math.abs(sp.net) > 1 ? 's' : ''} for you.`)
    }
  }

  // 5. This week's lineup, when it moves in their favour (in-season only).
  if (analysis.weeklyImpact?.theirs?.delta > 0) {
    const w = analysis.weeklyImpact
    bullets.push(`Week ${w.week}: your projected starting lineup goes up about ${w.theirs.delta} points.`)
  }

  // 6. Scarcity — volunteered ONLY when it argues their side. A pitch is
  //    advocacy, and there is no reason to hand over the case against you; it
  //    never states anything untrue, it just doesn't make your opponent's
  //    argument for them. The analysis above tells YOU the whole picture.
  if (analysis.scarcity?.vorpWinner === 'them') {
    bullets.push(`Against replacement level at each position, this actually lands ${analysis.scarcity.vorpPct}% in your favor.`)
  }

  // 7. Window read, only when it's a genuine alignment.
  if (pf.tier === 'Rebuilding' && giveAssets.some(a => a.type === 'pick')) {
    bullets.push("You're building — this moves capital your way while I go win-now.")
  }

  lines.push(...bullets.map(b => `• ${b}`))
  lines.push('')
  lines.push('Happy to adjust either side — let me know what you think.')

  const text = `Trade offer for ${partnerName}\n\n${lines.join('\n')}`
  return { text, lines, bullets }
}

// Returns a structured suggestion ({ side, type, item, text }) so the UI can
// offer an "Apply" action that adds the named asset directly to the trade.
// Assets already in the trade are excluded from candidates.
export function getCounterSuggestion(analysis, myRoster, opponentRoster, giveAssets = [], getAssets = []) {
  if (!analysis || !myRoster || !opponentRoster) return null
  const { valueWinner, valuePct, giveTotal, getTotal } = analysis
  if (valueWinner === 'even' || valuePct <= 5) return null

  const gap = Math.abs(getTotal - giveTotal)
  const inTrade = new Set([...giveAssets, ...getAssets].map(a => a.id))
  const pickAssetId = p => `${p.season}-${p.round}-${p.originalOwner}`

  function candidatesFrom(roster) {
    return [
      ...roster.players
        .filter(p => !p.isIR && !inTrade.has(String(p.sleeperId)))
        .map(p => ({ type: 'player', name: p.name, value: p.value || 0, item: p })),
      ...roster.picks
        .filter(p => !inTrade.has(pickAssetId(p)))
        .map(p => ({ type: 'pick', name: pickLabel(p), value: p.value ?? 0, item: p })),
    ]
  }

  function bestBridger(assets) {
    const sorted = assets.filter(a => a.value > 0).sort((a, b) => a.value - b.value)
    const inWindow = sorted.filter(a => a.value >= gap * 0.8 && a.value <= gap * 1.5)
    if (inWindow.length > 0)
      // Closest to the gap lands the applied counter nearest the ±5% fair band
      // (ties break cheap, since the list is sorted ascending).
      return inWindow.reduce((best, a) =>
        Math.abs(a.value - gap) < Math.abs(best.value - gap) ? a : best)
    const under = sorted.filter(a => a.value < gap)
    return under.length > 0 ? under[under.length - 1] : sorted[0]
  }

  if (valueWinner === 'them') {
    const b = bestBridger(candidatesFrom(opponentRoster))
    if (!b) return null
    return {
      side: 'get',
      type: b.type,
      item: b.item,
      text: b.type === 'pick'
        ? `Ask them to add their ${b.name} (est. ${b.value.toLocaleString()})`
        : `Ask them to add ${b.name} (${b.value.toLocaleString()})`,
    }
  }

  // valueWinner === 'you'
  const b = bestBridger(candidatesFrom(myRoster))
  if (!b) return null
  return {
    side: 'give',
    type: b.type,
    item: b.item,
    text: b.type === 'pick'
      ? `Add your ${b.name} (est. ${b.value.toLocaleString()}) to even it out`
      : `Offer to add ${b.name} (${b.value.toLocaleString()}) to even it out`,
  }
}

const VERDICT_UPGRADE   = { Decline: 'Counter', Counter: 'Accept', Accept: 'Accept' }
const VERDICT_DOWNGRADE = { Accept: 'Counter',  Counter: 'Decline', Decline: 'Decline' }

export function adjustVerdictForInjuries(baseVerdict, liveIntelligence, giveAssets, getAssets) {
  if (!baseVerdict || !liveIntelligence?.length) return baseVerdict

  const getNames  = new Set(getAssets.filter(a => a.type === 'player').map(a => a.name))
  const giveNames = new Set(giveAssets.filter(a => a.type === 'player').map(a => a.name))

  const getOut  = liveIntelligence.filter(i => i.injuryFlag === 'red' && getNames.has(i.playerName))
  const giveOut = liveIntelligence.filter(i => i.injuryFlag === 'red' && giveNames.has(i.playerName))

  if (!getOut.length && !giveOut.length) return baseVerdict

  let { verdict, reasoning } = baseVerdict
  const notes = []

  // Getting an injured player → downgrade Accept → Counter
  if (getOut.length > 0 && verdict === 'Accept') {
    verdict = VERDICT_DOWNGRADE[verdict]
    const names = getOut.map(i => i.playerName).join(' and ')
    notes.push(`${names} ${getOut.length > 1 ? 'are' : 'is'} currently out — verify status before accepting`)
  }

  // Giving an injured player → upgrade (selling high on injured asset)
  if (giveOut.length > 0 && verdict !== 'Accept') {
    const prev = verdict
    verdict = VERDICT_UPGRADE[verdict]
    if (verdict !== prev) {
      const names = giveOut.map(i => i.playerName).join(' and ')
      notes.push(`you may be selling high on ${names} who ${giveOut.length > 1 ? 'are' : 'is'} currently out`)
    }
  }

  const updatedReasoning = notes.length > 0
    ? `${reasoning} Note: ${notes.join('; ')}.`
    : reasoning

  return { verdict, reasoning: updatedReasoning, adjustedByIntelligence: notes.length > 0 }
}

// Build a one-line, plain-English read of where a package's pieces come from —
// so the UI can explain why these assets (and not your studs) were chosen.
function packageRationale(assets, ctx) {
  const playerPositions = [...new Set(
    assets.filter(a => a.type === 'player').map(a => a.position).filter(Boolean)
  )]
  const surplusPos = playerPositions.filter(p => (ctx.myDeltas?.[p] ?? 0) > 0)
  const hasPicks   = assets.some(a => a.type === 'pick')

  const parts = []
  if (surplusPos.length) parts.push(`your ${surplusPos.join('/')} surplus`)
  if (hasPicks) parts.push(ctx.myTier === 'Contending' ? 'spare draft capital' : 'draft capital')
  if (!parts.length && playerPositions.length) parts.push('your roster depth')

  return parts.length
    ? `Drawn from ${joinAnd(parts)} — protects your starters.`
    : 'Protects your core starters.'
}

// Suggest a fair package from MY roster to acquire targetPlayer.
//
// Roster-aware ("balanced" posture): instead of grabbing the cheapest assets
// that reach the value, it draws from positions of surplus and depth, protects
// starters at thin positions, leans into my win window (a contender spends
// picks/young fliers; a rebuilder keeps youth/picks and moves aging vets), and
// — when the partner roster is known — prefers pieces at the partner's deficit
// positions so the package is one they'd actually accept.
//
// allRosters + opponentRoster are optional; without them it degrades to a
// depth-aware package (no surplus/window/partner lean).
export function suggestFairPackage(targetPlayer, myRoster, allRosters = null, opponentRoster = null) {
  if (!targetPlayer || !myRoster) return null
  const targetValue = targetPlayer.value || 0
  if (targetValue === 0) return null

  const ctx = buildGivabilityContext(myRoster, allRosters)
  const opponentDeficits = getDeficitPositions(opponentRoster, allRosters)

  // Build the candidate pool, then drop anything core/irreplaceable (an elite
  // backup-less starter like a top-1 TE) — the package builder never reaches for
  // those just to hit a value. The user can still add them manually.
  const allAssets = [
    ...myRoster.players
      .filter(p => !p.isIR)
      .map(p => ({
        type: 'player', name: p.name, value: p.value,
        sleeperId: p.sleeperId, position: p.position, age: p.age,
      })),
    ...myRoster.picks
      .map(p => ({ type: 'pick', name: pickLabel(p), value: p.value ?? 0 })),
  ].filter(a => a.value > 0)

  const available = allAssets
    .filter(a => assetKeepScore(a, ctx) < PROTECT_THRESHOLD)
    .sort((a, b) => a.value - b.value)

  if (!available.length) return null

  const FLOOR = targetValue * 0.9   // a lowball gets rejected
  const CAP   = targetValue * 1.15  // a big overpay is its own way of gutting the roster

  const keepCache = available.map(a => assetKeepScore(a, ctx))

  // Among packages whose value lands in [FLOOR, CAP], pick the one that hurts
  // least: minimize total keep-pain, prefer fewer pieces, nudge toward the exact
  // value and toward assets the partner needs. bestUnder tracks the closest
  // package that still undershoots — used only when nothing reaches fair value,
  // so we surface an honest "covers ~X%, add a piece" instead of a stud.
  let best = null
  let bestUnder = null
  const consider = idxs => {
    let total = 0, pain = 0
    for (const i of idxs) {
      total += available[i].value
      pain  += keepCache[i]
      if (opponentDeficits.has(available[i].position)) pain -= 0.08
    }
    if (total > CAP) return
    if (total < FLOOR) {
      if (!bestUnder || total > bestUnder.total) bestUnder = { idxs, total }
      return
    }
    pain += 0.2 * (idxs.length - 1)
    pain += Math.abs(total - targetValue) / targetValue * 0.3
    if (!best || pain < best.pain) best = { idxs, total, pain }
  }

  const n = available.length
  for (let i = 0; i < n; i++) consider([i])
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      if (available[i].value + available[j].value > CAP) break
      consider([i, j])
    }
  }
  for (let i = 0; i < n - 2; i++) {
    for (let j = i + 1; j < n - 1; j++) {
      if (available[i].value + available[j].value > CAP) break
      for (let k = j + 1; k < n; k++) {
        if (available[i].value + available[j].value + available[k].value > CAP) break
        consider([i, j, k])
      }
    }
  }

  if (best) {
    const assets = best.idxs.map(i => available[i])
    const gapPct = Math.round(Math.abs(best.total - targetValue) / targetValue * 100)
    return {
      assets, totalValue: best.total, gapPct,
      over: best.total >= targetValue,
      rationale: packageRationale(assets, ctx),
    }
  }

  // Nothing fair from depth alone — this target costs more than I can pay
  // without touching a core piece. Show the closest honest package and say so,
  // rather than suggesting I gut a position.
  if (bestUnder) {
    const assets = bestUnder.idxs.map(i => available[i])
    const gapPct = Math.round((targetValue - bestUnder.total) / targetValue * 100)
    return {
      assets, totalValue: bestUnder.total, gapPct, over: false, short: true,
      rationale: `${packageRationale(assets, ctx)} Covers ~${100 - gapPct}% — add a piece to reach fair value without dealing a core starter.`,
    }
  }

  return null
}
