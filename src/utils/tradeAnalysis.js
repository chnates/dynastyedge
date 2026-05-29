import { computeLeagueAverages, getPositionalDeltas, assignWinWindowTiers } from './rosterAnalysis'

const PICK_SUFFIXES = ['', '1st', '2nd', '3rd', '4th']

function pickLabel(pick) {
  const suffix = PICK_SUFFIXES[pick.round] ?? `R${pick.round}`
  return `${pick.season} ${suffix}`
}

export function analyzeTrade(giveAssets, getAssets, myRoster, opponentRoster, allRosters) {
  if (!myRoster || !opponentRoster || !allRosters?.length) return null

  const giveTotal = giveAssets.reduce((s, a) => s + (a.value || 0), 0)
  const getTotal  = getAssets.reduce((s, a)  => s + (a.value || 0), 0)

  // Layer 1: Raw value
  const maxTotal  = Math.max(giveTotal, getTotal, 1)
  const valueDiff = getTotal - giveTotal
  const valuePct  = Math.round(Math.abs(valueDiff) / maxTotal * 100)
  const valueWinner = valuePct <= 5 ? 'even' : valueDiff > 0 ? 'you' : 'them'

  // Layer 2: Roster fit
  const leagueAverages = computeLeagueAverages(allRosters)
  const myDeltas = getPositionalDeltas(myRoster, leagueAverages)

  const filledNeeds   = []
  const hurtStrengths = []

  getAssets
    .filter(a => a.type === 'player' && a.position)
    .forEach(p => {
      if (myDeltas[p.position] < 0 && !filledNeeds.includes(p.position))
        filledNeeds.push(p.position)
    })

  giveAssets
    .filter(a => a.type === 'player' && a.position)
    .forEach(p => {
      if (myDeltas[p.position] < 0 && !hurtStrengths.includes(p.position))
        hurtStrengths.push(p.position)
    })

  let fitScore = 0
  if (filledNeeds.length > 0 && hurtStrengths.length === 0)      fitScore =  1
  else if (hurtStrengths.length > 0 && filledNeeds.length === 0) fitScore = -1
  else if (filledNeeds.length > hurtStrengths.length)            fitScore =  1
  else if (hurtStrengths.length > filledNeeds.length)            fitScore = -1

  // Layer 3: Win window fit
  const winWindowTiers = assignWinWindowTiers(allRosters)
  const myTier = winWindowTiers[myRoster.rosterId] ?? 'Middle'

  const getPlayers  = getAssets.filter(a => a.type === 'player')
  const getPicks    = getAssets.filter(a => a.type === 'pick')
  const givePlayers = giveAssets.filter(a => a.type === 'player')

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

  return {
    giveTotal, getTotal, valueDiff, valuePct, valueWinner,
    filledNeeds, hurtStrengths, fitScore,
    myTier, windowScore, windowNote, myDeltas,
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

export function getCounterSuggestion(analysis, myRoster, opponentRoster) {
  if (!analysis || !myRoster || !opponentRoster) return null
  const { valueWinner, valuePct, giveTotal, getTotal } = analysis
  if (valueWinner === 'even' || valuePct <= 5) return null

  const gap = Math.abs(getTotal - giveTotal)

  function bestBridger(assets) {
    const sorted = assets.filter(a => a.value > 0).sort((a, b) => a.value - b.value)
    const ideal  = sorted.find(a => a.value >= gap * 0.8 && a.value <= gap * 1.5)
    if (ideal) return ideal
    const under = sorted.filter(a => a.value < gap)
    return under.length > 0 ? under[under.length - 1] : sorted[0]
  }

  if (valueWinner === 'them') {
    const assets = [
      ...opponentRoster.players.filter(p => !p.isIR).map(p => ({ type: 'player', name: p.name, value: p.value })),
      ...opponentRoster.picks.map(p => ({ type: 'pick', name: pickLabel(p), value: p.value ?? 0 })),
    ]
    const b = bestBridger(assets)
    if (!b) return null
    return b.type === 'pick'
      ? `Ask them to add their ${b.name} (est. ${b.value.toLocaleString()})`
      : `Ask them to add ${b.name} (${b.value.toLocaleString()})`
  }

  // valueWinner === 'you'
  const assets = [
    ...myRoster.players.filter(p => !p.isIR).map(p => ({ type: 'player', name: p.name, value: p.value })),
    ...myRoster.picks.map(p => ({ type: 'pick', name: pickLabel(p), value: p.value ?? 0 })),
  ]
  const b = bestBridger(assets)
  if (!b) return null
  return b.type === 'pick'
    ? `Add your ${b.name} (est. ${b.value.toLocaleString()}) to even it out`
    : `Offer to add ${b.name} (${b.value.toLocaleString()}) to even it out`
}

export function suggestFairPackage(targetPlayer, myRoster) {
  if (!targetPlayer || !myRoster) return null
  const targetValue = targetPlayer.value || 0
  if (targetValue === 0) return null

  const available = [
    ...myRoster.players
      .filter(p => !p.isIR)
      .map(p => ({ type: 'player', name: p.name, value: p.value, sleeperId: p.sleeperId })),
    ...myRoster.picks
      .map(p => ({ type: 'pick', name: pickLabel(p), value: p.value ?? 0 })),
  ]
    .filter(a => a.value > 0)
    .sort((a, b) => b.value - a.value)

  if (!available.length) return null

  // Single asset within 10%
  const single = available.find(
    a => Math.abs(a.value - targetValue) / targetValue <= 0.10
  )
  if (single) {
    const gapPct = Math.round(Math.abs(single.value - targetValue) / targetValue * 100)
    return { assets: [single], totalValue: single.value, gapPct, over: single.value >= targetValue }
  }

  // Greedy combination
  const selected = []
  let total = 0
  for (const asset of available) {
    if (total >= targetValue) break
    selected.push(asset)
    total += asset.value
  }

  const gapPct = Math.round(Math.abs(total - targetValue) / targetValue * 100)
  return { assets: selected, totalValue: total, gapPct, over: total >= targetValue }
}
