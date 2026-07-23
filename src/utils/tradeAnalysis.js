import { computeLeagueAverages, getPositionalDeltas, assignWinWindowTiers } from './rosterAnalysis'
import { getDeadlineVerdict } from './playoffOdds'
import { buildValueLineup } from './lineupBuild'
import { projectPlayerSeries, seriesDirection } from './dynastyTrajectory'
import { buildGivabilityContext, assetKeepScore, getDeficitPositions, joinAnd, PROTECT_THRESHOLD } from './recommendations'

const PICK_SUFFIXES = ['', '1st', '2nd', '3rd', '4th']

function pickLabel(pick) {
  const suffix = PICK_SUFFIXES[pick.round] ?? `R${pick.round}`
  return `${pick.season} ${suffix}`
}

export function analyzeTrade(giveAssets, getAssets, myRoster, opponentRoster, allRosters, opts = {}) {
  if (!myRoster || !opponentRoster || !allRosters?.length) return null

  const {
    myPlayoffPct = null,
    opponentTrajectoryRead = null,
    curves = null,            // dynasty age curves (from buildAgeCurves) — enables the my-players trajectory lens
    myDraftGrade = null,      // { count, hits, avgDelta } from my Manager Scouting report card
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
  const givePositions = [...new Set(givePlayers.map(p => p.position).filter(Boolean))]
  const giveContext = givePositions.map(pos => {
    const dealtIds = new Set(
      givePlayers.filter(p => p.position === pos).map(p => String(p.sleeperId))
    )
    const peers = myRoster.players
      .filter(q => q.position === pos && !q.isIR && !q.isTaxi)
      .map(q => ({
        sleeperId: String(q.sleeperId),
        name: q.name,
        value: q.value || 0,
        unranked: q.unranked,
        isStarter: beforeLineup.starterIds.has(String(q.sleeperId)),
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

  return {
    giveTotal, getTotal, valueDiff, valuePct, valueWinner,
    filledNeeds, hurtStrengths, fitScore,
    benchAcquisitions, starterDepartures, benchNote, starterLossNote, giveContext,
    myTier, windowScore, windowNote, myDeltas,
    playoffPct, oddsStance, oddsNote, oddsTone,
    partnerTrajectoryNote, partnerTrajectoryTone,
    myTrajectoryNote, myTrajectoryTone,
    draftNote, draftTone,
  }
}

export function getTradeVerdict(analysis) {
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
