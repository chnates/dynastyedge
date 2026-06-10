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
    const ideal  = sorted.find(a => a.value >= gap * 0.8 && a.value <= gap * 1.5)
    if (ideal) return ideal
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

export function suggestFairPackage(targetPlayer, myRoster) {
  if (!targetPlayer || !myRoster) return null
  const targetValue = targetPlayer.value || 0
  if (targetValue === 0) return null

  // Ascending sort — cheapest first, so we can find minimum-cost packages
  const available = [
    ...myRoster.players
      .filter(p => !p.isIR)
      .map(p => ({ type: 'player', name: p.name, value: p.value, sleeperId: p.sleeperId })),
    ...myRoster.picks
      .map(p => ({ type: 'pick', name: pickLabel(p), value: p.value ?? 0 })),
  ]
    .filter(a => a.value > 0)
    .sort((a, b) => a.value - b.value)

  if (!available.length) return null

  const FLOOR = targetValue * 0.9  // allow up to 10% undershoot
  const CAP   = targetValue * 1.5  // avoid massive overpay

  // Cheapest single asset that reaches FLOOR
  const cheapestSingle = available.find(a => a.value >= FLOOR)

  // Minimum-sum two-asset pair within [FLOOR, CAP]
  // For each i, the first j > i where sum >= FLOOR is the min sum for that i (ascending order)
  let bestTwo = null, bestTwoSum = Infinity
  for (let i = 0; i < available.length - 1; i++) {
    for (let j = i + 1; j < available.length; j++) {
      const s = available[i].value + available[j].value
      if (s > CAP) break
      if (s >= FLOOR && s < bestTwoSum) {
        bestTwo    = [available[i], available[j]]
        bestTwoSum = s
        break  // further j only increases sum for this i
      }
    }
  }

  // Three-asset minimum — only if neither single nor pair found
  let bestThree = null, bestThreeSum = Infinity
  if (!cheapestSingle && !bestTwo) {
    outer: for (let i = 0; i < available.length - 2; i++) {
      for (let j = i + 1; j < available.length - 1; j++) {
        for (let k = j + 1; k < available.length; k++) {
          const s = available[i].value + available[j].value + available[k].value
          if (s > CAP) break
          if (s >= FLOOR && s < bestThreeSum) {
            bestThree    = [available[i], available[j], available[k]]
            bestThreeSum = s
            break outer
          }
        }
      }
    }
  }

  // Collect valid candidates, pick the one with minimum total value
  const options = []
  if (cheapestSingle && cheapestSingle.value <= CAP)
    options.push({ assets: [cheapestSingle], totalValue: cheapestSingle.value })
  if (bestTwo)
    options.push({ assets: bestTwo, totalValue: bestTwoSum })
  if (bestThree)
    options.push({ assets: bestThree, totalValue: bestThreeSum })

  if (options.length > 0) {
    options.sort((a, b) => a.totalValue - b.totalValue)
    const best = options[0]
    const gapPct = Math.round(Math.abs(best.totalValue - targetValue) / targetValue * 100)
    return { assets: best.assets, totalValue: best.totalValue, gapPct, over: best.totalValue >= targetValue }
  }

  // Fallback: closest single asset regardless of CAP
  const fallback = [...available].sort(
    (a, b) => Math.abs(a.value - targetValue) - Math.abs(b.value - targetValue)
  )[0]
  if (!fallback) return null
  const gapPct = Math.round(Math.abs(fallback.value - targetValue) / targetValue * 100)
  return { assets: [fallback], totalValue: fallback.value, gapPct, over: fallback.value >= targetValue }
}
