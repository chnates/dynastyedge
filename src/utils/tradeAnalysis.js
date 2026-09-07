import { computeLeagueAverages, getPositionalDeltas, assignWinWindowTiers } from './rosterAnalysis'
import { getDeadlineVerdict } from './playoffOdds'
import { buildValueLineup, selectOptimalStarters } from './lineupBuild'
import { buildRosterSpace } from './rosterSpace'
import { sideVorp } from './positionalValue'
import { projectPlayerSeries, seriesDirection } from './dynastyTrajectory'
import { buildFairBand } from './fairBand'
import { buildGivabilityContext, assetKeepScore, getDeficitPositions, joinAnd, PROTECT_THRESHOLD } from './recommendations'
// Re-exported so existing importers of the Analyzer's fair band keep working.
export { buildFairBand, FAIR_BAND_PCT } from './fairBand'

// A scarcity read needs a side worth reading — two below-replacement sides
// carry no signal. And the flag only speaks on a real disagreement: 10 points
// of percentage gap, or the two scales naming different winners.
// How far MY best starting lineup must move before the change is allowed to
// break a roster-fit tie, as a fraction of that lineup's current value. This is
// a materiality floor, not a measured constant — it exists so noise (a 40-point
// move on a 45,000 lineup) can never flip a verdict.
export const MY_LINEUP_MATERIAL_PCT = 0.01

const SCARCITY_FLOOR = 500
const SCARCITY_GAP = 10

// Appeal is ordinal, so a comparison needs an explicit order. Used by the
// package builder to prefer the candidate their roster likes most.
const APPEAL_RANK = { Weak: 0, Fair: 1, Strong: 2 }

const PICK_SUFFIXES = ['', '1st', '2nd', '3rd', '4th']

// Normalize a trade asset into the player shape the lineup sim expects. An
// arriving player can never land on taxi or IR, so both are false by definition.
const addAsPlayer = a => ({
  sleeperId: String(a.sleeperId), name: a.name, position: a.position,
  value: a.value || 0, age: a.age, unranked: a.unranked, isIR: false, isTaxi: false,
})

function pickLabel(pick) {
  const suffix = PICK_SUFFIXES[pick.round] ?? `R${pick.round}`
  return `${pick.season} ${suffix}`
}

// The positional pecking order on a roster by dynasty value, grouped by the
// positions in play, marking the piece(s) this trade moves. Shared by BOTH
// directions of a trade and by both seats: my "Giving Up" chart (marker `out`,
// read off the PRE-trade roster), my "Coming In" chart (marker `in`, read off
// the POST-trade roster — the only reading that stays true when a WR goes out
// and a WR comes back), and the partner's chart for the player I'm asking them
// to send. Taxi/IR excluded — they can't start.
export function buildDepthContext(rosterPlayers, markedPlayers, starterIds, opts = {}) {
  const { marker = 'out' } = opts
  const positions = [...new Set((markedPlayers ?? []).map(p => p.position).filter(Boolean))]
  return positions.map(pos => {
    const markedIds = new Set(
      markedPlayers.filter(p => p.position === pos).map(p => String(p.sleeperId))
    )
    const peers = (rosterPlayers ?? [])
      .filter(q => q.position === pos && !q.isIR && !q.isTaxi)
      .map(q => ({
        sleeperId: String(q.sleeperId),
        name: q.name,
        value: q.value || 0,
        unranked: q.unranked,
        isStarter: starterIds.has(String(q.sleeperId)),
        isMarked: markedIds.has(String(q.sleeperId)),
      }))
      .sort((a, b) => b.value - a.value)
    const marked = peers
      .filter(q => q.isMarked)
      .map(q => ({
        name: q.name,
        posRank: peers.findIndex(x => x.sleeperId === q.sleeperId) + 1,
        isStarter: q.isStarter,
      }))
    return { position: pos, count: peers.length, marker, peers, marked }
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

// ── Seat voice ──────────────────────────────────────────────────────────────
// The fit engine below is seat-agnostic, but its reasons are prose and prose
// has a person. Every sentence is spelled out per seat rather than assembled
// from pronoun fragments: the partner's copy has to stay byte-identical (the
// verdict gate quotes it and the pitch is built from it), and stitching
// "they"/"you" into shared templates is exactly how a sentence ends up
// grammatical on one side and not the other.
const SEAT_VOICE = {
  them: {
    valueAhead:   pct => `They come out ${pct}% ahead on raw dynasty value.`,
    valueBehind:  pct => `They'd be giving up ${pct}% more value than they get back.`,
    benchedStack: (names, positions) => `${names} wouldn't crack their lineup — they're already above league average at ${positions}.`,
    marginalStack: positions => `They're already above league average at ${positions} — this is a marginal upgrade for them, not a hole filled.`,
    lineupGain:   n => `Their best starting lineup gains ${n} in value.`,
    lineupLoss:   n => `Their best starting lineup loses ${n} in value.`,
    lineupFlat:   () => "Nothing you're sending changes their starting lineup.",
    fills:        positions => `It covers their ${positions} deficit with a player who starts for them right away.`,
    weakens:      positions => `Making it drops them below league average at ${positions}.`,
    picksWanted:  plural => `They're rebuilding — the ${plural ? 'picks' : 'pick'} you're offering is what they're collecting.`,
    picksOnly:    () => "They're contending and you're offering only picks — they want win-now help.",
    summary: {
      Strong: 'Their roster gives them a clear reason to say yes.',
      Fair:   "There's something here for them, but it isn't compelling on its own.",
      Weak:   'Their roster gives them little reason to take this.',
    },
  },
  you: {
    valueAhead:   pct => `You come out ${pct}% ahead on raw dynasty value.`,
    valueBehind:  pct => `You'd be giving up ${pct}% more value than you get back.`,
    benchedStack: (names, positions) => `${names} wouldn't crack your lineup — you're already above league average at ${positions}.`,
    marginalStack: positions => `You're already above league average at ${positions} — this is a marginal upgrade, not a hole filled.`,
    lineupGain:   n => `Your best starting lineup gains ${n} in value.`,
    lineupLoss:   n => `Your best starting lineup loses ${n} in value.`,
    lineupFlat:   () => "Nothing you're getting changes your starting lineup.",
    fills:        positions => `It covers your ${positions} deficit with a player who starts for you right away.`,
    weakens:      positions => `Making it drops you below league average at ${positions}.`,
    picksWanted:  plural => `The ${plural ? 'picks' : 'pick'} coming back is the asset your window calls for.`,
    picksOnly:    () => "You're buying and getting only picks — your window calls for win-now help.",
    summary: {
      Strong: 'Your roster gives you a clear reason to do this.',
      Fair:   "There's something here for you, but it isn't compelling on its own.",
      Weak:   'Your roster gives you little reason to take this.',
    },
  },
}

// ── The fit engine — ONE function, either seat ──────────────────────────────
// "Does this deal do anything for the roster receiving `incomingAssets`?"
// Layer 2's question, asked of whichever team you point it at: what the trade
// does to that roster's positional standing against league average, and to its
// optimal starting lineup.
//
// It is called TWICE per analysis — once from the partner's seat (Layer 4,
// `buildPartnerFit` below) and once from mine (`myFit`). Symmetry by
// construction: the two seats are the same code, so they cannot drift, and the
// panel can answer "is this strong for ME?" in the same words it has always
// used for them. The Analyzer used to grade only the partner, which left every
// suggestion reading "Fair for them" with nothing said about my own roster.
//
// It is explicitly NOT a prediction that anyone will accept. Per-manager
// behavioral profiling was pre-registered, tested on this league's full
// 4-season corpus (95 trades / 176 sides) and DISCONFIRMED — the own-manager
// profile scored *below* the league baseline
// (docs/analysis/trade-structure-stability-2026-08.md, standing ruling). So
// this models the roster, never the human, and the copy says so.
//
// Exported because the RECOMMENDERS need it too. `suggestFairPackage` scores
// its candidate packages with this exact function, so the package the app
// suggests and the appeal the Analyzer will show it are computed by one piece
// of code and cannot disagree — the "app proposes, then argues with itself"
// loop (OPEN-6). It is extracted rather than reached by calling analyzeTrade
// because the package search runs it hundreds of times per board: measured on
// the live league, scoring the full candidate set through analyzeTrade takes
// 1.5s against 78ms through this alone, and the rest of analyzeTrade
// (trajectory, scarcity, weekly points, the draft nudge) answers questions a
// package search never asks.
//
// leagueAverages / winWindowTiers are accepted so a caller in a loop computes
// them once; both are derived from allRosters when omitted, and injecting them
// can never change the answer.
export function buildSideFit(incomingAssets, outgoingAssets, roster, allRosters, opts = {}) {
  if (!roster || !allRosters?.length) return null

  const {
    leagueAverages: injectedAverages = null,
    winWindowTiers = null,
    partnerActivity = null,
    seat = 'them',
    // 'buy' | 'sell' | null — overrides the tier-derived lean. My seat passes
    // the stance Layer 3 actually scored on (live playoff odds in season), so
    // the two layers can't print different answers to one question.
    stance = null,
  } = opts

  const voice = SEAT_VOICE[seat] ?? SEAT_VOICE.them
  // Value winners are named in ABSOLUTE terms ('you' / 'them'), not relative to
  // the seat — buildTradePitch reads `pf.valueWinner === 'them'` and means the
  // other manager by it.
  const sideLabel  = seat === 'you' ? 'you' : 'them'
  const otherLabel = seat === 'you' ? 'them' : 'you'

  const leagueAverages = injectedAverages ?? computeLeagueAverages(allRosters)

  const incomingPlayers = incomingAssets.filter(a => a.type === 'player')
  const incomingPicks   = incomingAssets.filter(a => a.type === 'pick')
  const outgoingPlayers = outgoingAssets.filter(a => a.type === 'player')

  const incomingTotal = incomingAssets.reduce((s, a) => s + (a.value || 0), 0)
  const outgoingTotal = outgoingAssets.reduce((s, a) => s + (a.value || 0), 0)
  // Measured on the larger side, so the read is symmetric with Layer 1's —
  // only the winner flips between the two seats.
  const valuePct = Math.round(Math.abs(outgoingTotal - incomingTotal) / Math.max(incomingTotal, outgoingTotal, 1) * 100)

  const tiers = winWindowTiers ?? assignWinWindowTiers(allRosters)
  const sideTier   = tiers[roster.rosterId] ?? 'Middle'
  const sideDeltas = getPositionalDeltas(roster, leagueAverages)
  const beforeLineup = buildValueLineup(roster.players)

  const outgoingIds = new Set(outgoingPlayers.map(p => String(p.sleeperId)))
  const afterPlayers = [
    ...roster.players.filter(p => !outgoingIds.has(String(p.sleeperId))),
    ...incomingPlayers.map(addAsPlayer),
  ]
  const afterLineup = buildValueLineup(afterPlayers)
  const afterDeltas = getPositionalDeltas({ players: afterPlayers }, leagueAverages)

  // Where what this side would RECEIVE lands on their chart, and where what
  // they'd SEND currently sits on it — the two halves of "what does this look
  // like from here?"
  const landingSpots = buildLandingSpots(incomingPlayers.map(addAsPlayer), afterPlayers, afterLineup)
  const giveContext  = buildDepthContext(roster.players, outgoingPlayers, beforeLineup.starterIds, { marker: 'out' })

  // The single honest measure of "does this help them": the change in the value
  // of their best startable lineup. A player who only stacks their bench moves
  // this by 0, however much he's worth.
  const startersDelta = Math.round(afterLineup.startingValue - beforeLineup.startingValue)

  const fills  = []  // a deficit position an arriving player would actually start at
  const stacks = []  // arriving at a position they're already above league average
  landingSpots.forEach(l => {
    const d = sideDeltas[l.position] ?? 0
    if (d < 0 && l.starts && !fills.includes(l.position)) fills.push(l.position)
    if (d > 0 && !stacks.includes(l.position)) stacks.push(l.position)
  })

  // Positions the trade actually costs this side — the same test applied in
  // both directions, so "they can't replace him" reads consistently either way.
  const weakens = []
  outgoingPlayers.forEach(p => {
    const pos = p.position
    if (!pos) return
    if (afterDeltas[pos] < 0 && afterDeltas[pos] < sideDeltas[pos] && !weakens.includes(pos))
      weakens.push(pos)
  })

  // Raw value from this seat. valuePct is measured on the larger side, so it's
  // symmetric — only the winner flips.
  const valueDiff   = incomingTotal - outgoingTotal
  const valueWinner = valuePct <= 5 ? 'even' : valueDiff > 0 ? sideLabel : otherLabel

  // Reasons render in order; `concerns` is the negative subset, so the verdict
  // gate can quote the most specific objection rather than whichever line
  // happened to land first.
  const reasons  = []
  const concerns = []
  let appealScore = 0
  const against = txt => { reasons.push(txt); concerns.push(txt) }

  if (valueWinner === sideLabel) {
    appealScore += 1
    reasons.push(voice.valueAhead(valuePct))
  } else if (valueWinner === otherLabel) {
    appealScore -= 1
    against(voice.valueBehind(valuePct))
  }

  // Arriving into a position this side is already strong at. This scores
  // against the deal ONLY when the player can't crack the lineup — that's a
  // fact the value total hides entirely. When he does start, the upgrade is
  // merely marginal, and `startersDelta` already measures exactly how marginal;
  // penalising it here too would charge the same fact twice and would put the
  // weaker of the two sentences in front of the verdict gate.
  const benched = landingSpots.filter(l => stacks.includes(l.position) && !l.starts)
  if (fills.length === 0 && benched.length > 0) {
    appealScore -= 1
    against(voice.benchedStack(joinAnd(benched.map(b => b.name)), joinAnd([...new Set(benched.map(b => b.position))])))
  } else if (fills.length === 0 && stacks.length > 0) {
    reasons.push(voice.marginalStack(joinAnd(stacks)))
  }

  // The lineup sentence is kept as its own field too: it is the one measure the
  // verdict gate quotes, and a surface that wants only that fact shouldn't have
  // to re-derive the wording from `startersDelta`.
  let lineupNote = null
  if (startersDelta > 0) {
    appealScore += 1
    lineupNote = voice.lineupGain(startersDelta.toLocaleString())
    reasons.push(lineupNote)
  } else if (startersDelta < 0) {
    appealScore -= 1
    lineupNote = voice.lineupLoss(Math.abs(startersDelta).toLocaleString())
    against(lineupNote)
  } else if (incomingPlayers.length > 0) {
    lineupNote = voice.lineupFlat()
    reasons.push(lineupNote)
  }

  // A filled deficit and a lineup gain are ONE fact, not two. A "fill" is
  // defined as an arriving player who STARTS at a position the side is below
  // average in — which is precisely what raises `startersDelta`. Scoring both
  // charged a single event the 2 points that mean `Strong`, and it was the same
  // double-count already removed on the negative side (the `stacks` branch
  // above says so in as many words). So the point is awarded once, by the
  // lineup delta, and the fill only adds its own point when the lineup delta
  // did NOT already score it. The sentence still renders either way — naming
  // WHERE the hole is, is information the delta alone doesn't carry.
  if (fills.length > 0) {
    if (startersDelta <= 0) appealScore += 1
    reasons.push(voice.fills(joinAnd(fills)))
  }

  if (weakens.length > 0) {
    appealScore -= 1
    against(voice.weakens(joinAnd(weakens)))
  }

  // Win-window lean on picks — Layer 3's read, from this seat.
  const lean = stance ?? (sideTier === 'Rebuilding' ? 'sell' : sideTier === 'Contending' ? 'buy' : null)
  if (incomingPicks.length > 0) {
    if (lean === 'sell') {
      appealScore += 1
      reasons.push(voice.picksWanted(incomingPicks.length > 1))
    } else if (lean === 'buy' && incomingPlayers.length === 0) {
      appealScore -= 1
      against(voice.picksOnly())
    }
  }

  const appeal = appealScore >= 2 ? 'Strong' : appealScore >= 0 ? 'Fair' : 'Weak'

  return {
    afterPlayers,
    tier: sideTier,
    deltas: sideDeltas,
    valueWinner,
    startersDelta,
    lineupNote,
    fills,
    stacks,
    weakens,
    landingSpots,
    giveContext,
    appeal,
    appealScore,
    summary: voice.summary[appeal],
    reasons,
    concerns,
    activity: partnerActivity,
  }
}

// ── Layer 4: their side ─────────────────────────────────────────────────────
// The fit engine pointed at the PARTNER: does this deal do anything for the
// team being asked to accept it? A thin wrapper so the argument order still
// reads in MY terms (what I give, what I get) at every existing call site —
// what I give is what arrives for them.
export function buildPartnerFit(giveAssets, getAssets, opponentRoster, allRosters, opts = {}) {
  return buildSideFit(giveAssets, getAssets, opponentRoster, allRosters, { ...opts, seat: 'them' })
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

  // Layer 2: Roster fit — simulated against the ACTUAL post-trade starting
  // lineup (optimal by dynasty value), not a bare position-tag match. So an
  // acquired player only "fills" a need if he'd genuinely start, and shipping a
  // player only "hurts" if it actually drops that position below league average.
  const leagueAverages = computeLeagueAverages(allRosters)
  const myDeltas = getPositionalDeltas(myRoster, leagueAverages)

  const giveIds = new Set(givePlayers.map(p => String(p.sleeperId)))

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
  const giveContext = buildDepthContext(myRoster.players, givePlayers, beforeLineup.starterIds, { marker: 'out' })

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

  // The mirror of Layer 4's `startersDelta` — the change in the value of MY
  // best startable lineup. Layer 4 calls this "the single honest measure of
  // does this help them" and computes it for the partner; both lineups were
  // already built here, so my own side was one subtraction away from having
  // the same measure and did not have it.
  const myStartersDelta = Math.round(afterLineup.startingValue - beforeLineup.startingValue)
  // Material relative to MY lineup, not an absolute number — a 150-point move
  // means something different on a 27,000 lineup than on a 63,000 one (the
  // live league spans exactly that range). Below this it is noise and must not
  // move a verdict.
  const myLineupMaterial = Math.abs(myStartersDelta) >= beforeLineup.startingValue * MY_LINEUP_MATERIAL_PCT

  let fitScore = 0
  if (filledNeeds.length > 0 && hurtStrengths.length === 0)      fitScore =  1
  else if (hurtStrengths.length > 0 && filledNeeds.length === 0) fitScore = -1
  else if (filledNeeds.length > hurtStrengths.length)            fitScore =  1
  else if (hurtStrengths.length > filledNeeds.length)            fitScore = -1

  // NOTE: this deliberately does NOT feed `fitScore`. Position counts tie far
  // more often than they resolve (measured live: `fitScore` was 0 on 18 of 20
  // suggested trades, because giving a back and getting a receiver fills one
  // position and hurts one whatever the sizes), so folding the delta in as a
  // tiebreak is tempting — but `fitScore < 0` is a hard Decline branch below,
  // and a rebuild trade that ships a starter for youth and picks SHOULD drop
  // my current lineup. Declining those would be a worse error than the one
  // being fixed. It gates the verdict instead — see `getTradeVerdict`.

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
  //
  // WHAT DECIDES "am I buying or selling?" — live playoff odds in season, the
  // win-window tier only when there are no odds (offseason).
  //
  // The tier is a RANKING of accumulated assets: 50% total roster value (bench
  // and picks included), 30% pick capital, 20% youth, top 3 Contending / bottom
  // 3 Rebuilding. Measured on the live league it tracks total assets at
  // Spearman 0.952 but the actual STARTING LINEUP at only 0.721 — it scores
  // what you own, not the team you field. Playoff odds track the starting
  // lineup at 0.988, which is the question this layer is asking.
  //
  // Two live mislabels the tier produced and the odds fix: roster 5 has the
  // 2nd-best starting lineup and 87.7% odds but reads `Rebuilding` (top-heavy,
  // no picks left — in fact the most win-now team in the league), and Jake &
  // Bake has the 9th-best lineup and 8.3% odds but reads `Middle` because
  // hoarding picks props up their tier score.
  //
  // The tier ALSO has no branch at all for `Middle`, so four teams by
  // construction — 40% of the league every season, this owner included — got
  // windowScore 0 and the placeholder note on every trade they ever analyzed.
  // "On the bubble" is a measured state that can hold any number of teams,
  // including none; `Middle` is a fixed-size bucket.
  //
  // The asset-type tests below are UNCHANGED — only what selects them moved.
  // See docs/analysis/trade-engine-my-side-2026-09.md §4.
  const winWindowTiers = assignWinWindowTiers(allRosters)
  const myTier = winWindowTiers[myRoster.rosterId] ?? 'Middle'

  // `getDeadlineVerdict` is the ONE definition of buyer/seller in the app — the
  // Playoffs page, Trade Partner Finder and The Edge all read it. Reusing it
  // here means the Analyzer can never disagree with the odds page about what
  // your own stance is.
  const deadlineVerdict = myPlayoffPct != null ? getDeadlineVerdict(myPlayoffPct, myTier) : null
  const oddsStanceLive = deadlineVerdict?.stance ?? null
  const windowBasis = oddsStanceLive ? 'odds' : 'tier'
  // Buyer/Seller come from odds when they exist; Contending/Rebuilding are the
  // offseason stand-in. Anything else ("On the bubble", "Middle") takes no lean.
  const buying  = oddsStanceLive ? oddsStanceLive === 'Buyer'  : myTier === 'Contending'
  const selling = oddsStanceLive ? oddsStanceLive === 'Seller' : myTier === 'Rebuilding'
  const oddsPctLabel = myPlayoffPct != null ? `${Math.round(myPlayoffPct * 100)}% playoff odds` : null
  const basisLabel = windowBasis === 'odds' ? oddsPctLabel : `${myTier} window`

  let windowScore = 0
  let windowNote  = windowBasis === 'odds'
    ? `You're on the bubble at ${oddsPctLabel} — no strong buy or sell lean, so this trade stands on value and lineup fit`
    : 'Neutral — fits your current win window'

  if (buying) {
    const gettingOnlyPicks  = getPicks.length > 0 && getPlayers.length === 0
    const givingProvenVets  = givePlayers.some(p => p.value > 5000 && (p.age ?? 99) <= 30)

    if (gettingOnlyPicks) {
      windowScore = -1
      windowNote  = `Getting only picks conflicts with your ${basisLabel} — proven players serve you better`
    } else if (givingProvenVets) {
      windowScore = -1
      windowNote  = `Giving up proven starters conflicts with your ${basisLabel}`
    } else {
      windowScore = 1
      windowNote  = `Proven players fit your ${basisLabel}`
    }
  } else if (selling) {
    const gettingExpVets       = getPlayers.some(p => p.value > 6000 && (p.age ?? 0) >= 28)
    const gettingYouthOrPicks  = getPlayers.some(p => (p.age ?? 99) < 25) || getPicks.length > 0

    if (gettingExpVets) {
      windowScore = -1
      windowNote  = `Acquiring expensive veterans conflicts with your ${basisLabel}`
    } else if (gettingYouthOrPicks) {
      windowScore = 1
      windowNote  = `Youth and picks align with your ${basisLabel}`
    } else {
      windowNote  = windowBasis === 'odds'
        ? `Neutral for a season your ${oddsPctLabel} call a long shot`
        : 'Neutral for your Rebuilding window'
    }
  }

  // Playoff-odds context. This is the SAME verdict object that selected the
  // window lean above — computed once, so the stance the panel prints and the
  // stance the score used can never drift apart.
  const playoffPct = myPlayoffPct ?? null
  const oddsStance = deadlineVerdict?.stance ?? null
  const oddsNote   = deadlineVerdict?.text ?? null
  const oddsTone   = deadlineVerdict?.tone ?? null

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

  // Layer 4 — their side. Extracted (see buildPartnerFit) so the recommenders
  // score their suggestions with the same function that grades them here.
  const partnerFit = buildPartnerFit(giveAssets, getAssets, opponentRoster, allRosters, {
    leagueAverages, winWindowTiers, partnerActivity,
  })
  const { afterPlayers: theirAfterPlayers } = partnerFit

  // My side's mirror: where the players I'm ACQUIRING land on my own chart.
  const myLandingSpots = buildLandingSpots(getPlayers.map(addAsPlayer), afterPlayers, afterLineup)

  // "What am I getting?" — the mirror of `giveContext`, and the same chart.
  // Read off the POST-trade roster on purpose: the arriving player's rank has
  // to count the players actually left at the position, so trading a WR for a
  // WR still reads true. Picks carry no position and are excluded, exactly as
  // they are from the landing spots.
  const getContext = buildDepthContext(
    afterPlayers, getPlayers.map(addAsPlayer), afterLineup.starterIds, { marker: 'in' }
  )

  // MY side, graded by the engine that grades theirs — one function, both
  // seats, so the two can never drift and the panel can finally say what a
  // trade is worth to ME in the same words it has always used for them.
  //
  // DISPLAY ONLY. It never enters the verdict ladder or either gate: my side is
  // already scored by Layers 1–3 plus the `myStartersDelta` gate, and a second
  // my-side score would charge the ladder twice for facts it already weighs.
  // Verified byte-identical verdicts across the live target board — see
  // docs/analysis/trade-my-side-read-2026-09.md §2.
  const myFit = buildSideFit(getAssets, giveAssets, myRoster, allRosters, {
    leagueAverages, winWindowTiers, seat: 'you',
    // The lean Layer 3 actually scored on — live playoff odds in season, the
    // win-window tier in the offseason. Without it the my-side pick lean would
    // read off the tier while the layer directly above it read off the odds,
    // and the panel would print two answers to one question.
    stance: buying ? 'buy' : selling ? 'sell' : null,
  })

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
    myStartersDelta, myLineupMaterial,
    benchAcquisitions, starterDepartures, benchNote, starterLossNote, giveContext, getContext,
    myLandingSpots, partnerFit, myFit,
    fairBand, scarcity, myRosterSpace, theirRosterSpace, weeklyImpact,
    myTier, windowScore, windowNote, windowBasis, myDeltas,
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
  if (!base || base.verdict !== 'Accept') return base

  // MY gate runs first, and it is the mirror of the partner gate below: the
  // same measure (the change in the value of a best startable lineup), applied
  // to my own roster. Layer 2 grades fit by COUNTING positions filled against
  // positions hurt, which ties whenever a trade swaps one position for another
  // — so an Accept could sit on top of a starting lineup that got materially
  // worse and say "this fills your WR need" without ever weighing what left.
  //
  // Like the partner gate it only ever DOWNGRADES an Accept, and only on a
  // move that clears MY_LINEUP_MATERIAL_PCT of my own lineup. It does not fire
  // on a deliberate sell-off: those lose raw value too, so they never reach
  // the clean-Accept branch this gates.
  if (analysis.myLineupMaterial && analysis.myStartersDelta < 0) {
    return {
      verdict: 'Counter',
      reasoning: `${base.reasoning} But your best starting lineup drops ${Math.abs(analysis.myStartersDelta).toLocaleString()} in value — the position count balances, the players don't.`,
      lineupGated: true,
    }
  }

  const pf = analysis?.partnerFit
  if (!pf || pf.appeal !== 'Weak') return base
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
    g.marked.forEach(d => {
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

// Phase 2 scores EVERY candidate in the fair band on the partner's side — the
// list is deliberately not truncated. It used to take the cheapest 40, which
// was a cost guard with a real correctness price: phase 1 orders by what a
// package costs ME and knows nothing about them, so cutting its output can hide
// the package they would actually want. Measured on the live 20-target board:
//
//     40  -> 102ms, Strong 5 · Fair 13 · Weak 2
//     150 -> 211ms, Strong 6 · Fair 13 · Weak 1
//     all -> 731ms, Strong 7 · Fair 13 · Weak 0   <- shipped
//
// Scoring everything is the only setting that leaves NO target where the best
// offer the app can find is one the other manager has no reason to accept.
// The cost is affordable because WhatsFair no longer computes this during
// render: it walks the targets one per tick off the render path, so the worst
// single target (109ms here) is the longest the main thread is ever held, and
// rows fill in progressively behind a "working on it" line.
//
// The search cannot run away: candidates are 1-3 assets, drawn only from assets
// under PROTECT_THRESHOLD, and must land inside the fair band. If a much deeper
// roster ever makes this bite, chunk WITHIN a target rather than truncating —
// truncation is what this replaced.

// How much keep-pain a cheaper alternative must actually save before it is
// worth showing beside the suggestion. Below this the two packages cost about
// the same and the only difference is that one reads worse to the partner,
// which is not an option — it is just a worse offer.
const ALTERNATIVE_MIN_SAVING = 0.25

// What a step of partner appeal is WORTH, denominated in my own keep-pain —
// the same 0..1-per-asset scale `assetKeepScore` uses, so the two are directly
// comparable and phase 2 is a trade-off rather than an override.
//
// The shape is deliberately asymmetric, because the two ends are not the same
// kind of fact. A `Weak` package is a real failure — it means the offer goes
// unanswered, which is the whole reason phase 2 exists (see the two-phase note
// on suggestFairPackage). `Strong` over `Fair` is a nicety: both give them a
// reason to engage, and the difference is negotiating comfort, not whether a
// deal happens. So Weak is priced as an near-prohibitive penalty and Strong as
// a small bonus:
//
//   · to pick Strong over Fair, the Strong package must cost me no more than
//     APPEAL_BONUS.Strong extra keep-pain
//   · a Weak package needs to save more than 1.0 keep-pain — roughly a whole
//     untouchable-tier asset — before it is preferred to a Fair one
//
// These are PREFERENCE WEIGHTS, not measured constants — the same status as
// AGE_TILT_BY_TIER in recommendations.js, and bounded for the same reason: they
// break near-ties, they do not argue with the fair band or the protect
// threshold, both of which still bind first.
//
// `Strong` is set MID-PLATEAU, not at a step edge. Swept over the live 20-target
// board (keep-pain paid across all 20 suggestions, vs the old lexicographic
// rule):
//
//   w:      0.00   0.10   0.20 | 0.30   0.40   0.50 | 0.70 | 1.00
//   pain:  17.79  17.79  17.79 | 18.46  18.46  18.46 | 19.02| 19.84
//   changed:  5/20 ................ 2/20 ................ 1/20 | 0/20 (= old rule)
//
// Three flat plateaus. 0.30 and 0.50 are its edges, so 0.40 is the robust pick
// — a small mis-estimate in either direction changes nothing. The plateau it
// selects is the one that buys `Strong` only when it is nearly free: measured
// on the same board, upgrading Fair -> Strong costs -0.63, 0.08, 0.23, 0.28,
// 0.73 and 0.85 keep-pain on the six targets where both tiers exist, so this
// takes the first four and refuses the last two.
//
// The `Weak` penalty is a GUARD, not an active lever — on this board a Fair
// package existed for all 20 targets, so it never bound. It is sized to stay
// inert unless the only alternative to Weak costs more than a whole
// untouchable-tier asset, which preserves the §4e-v finding that a Weak
// suggestion is a real failure rather than a cheap win.
export const APPEAL_BONUS = { Weak: -1, Fair: 0, Strong: 0.4 }

// Suggest a fair package from MY roster to acquire targetPlayer.
//
// TWO-PHASE, and the second phase is the point. Phase 1 enumerates every
// package inside the fair band and ranks them by what they cost ME — surplus
// and depth first, core starters never auto-included, win-window lean. Phase 2
// takes that shortlist and scores each candidate on the PARTNER's side with
// `buildPartnerFit` — the same Layer 4 the Analyzer will grade the suggestion
// with — then picks the best appeal, breaking ties by my own cost.
//
// Phase 2 is what stops the app arguing with itself. Phase 1's objective alone
// selects, by construction, the pieces a partner has least use for: measured
// against the live league, 19 of 20 suggested packages graded `Weak` appeal and
// every verdict came back Counter or Decline, because the cheapest asset by
// keep-score was a third quarterback nobody in a Superflex league needs. The
// packages that work were already inside the same band — an exhaustive search
// found a Fair-or-better package for all 20 targets (8 Strong, 12 Fair) without
// touching a protected asset. Phase 1 simply never looked at their side.
//
// A `Weak` result that survives phase 2 is therefore real information, not a
// failure: it means nothing you can spare interests them at this price.
//
// allRosters + opponentRoster are optional; without them it degrades to a
// depth-aware package (no surplus/window/partner lean) and skips phase 2 —
// there is no partner to score against.
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
      // `round` is load-bearing: assetKeepScore prices a pick's keep-score by
      // round (PICK_ROUND_KEEP), and without it every pick falls back to the
      // flat default this replaced.
      .map(p => ({ type: 'pick', name: pickLabel(p), value: p.value ?? 0, round: p.round })),
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
  const candidates = []
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
    candidates.push({ idxs, total, pain })
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

  // ── Phase 2: score the shortlist on THEIR side ────────────────────────────
  // Only appeal and my own cost decide this — both roster facts. The
  // negotiating signals (scarcity, roster space, weekly points, their recent
  // moves) stay out of it, exactly as they stay out of the verdict.
  let best = null
  let alternative = null
  if (candidates.length) {
    candidates.sort((a, b) => a.pain - b.pain)

    const canScorePartner = !!opponentRoster && !!allRosters?.length
    if (!canScorePartner) {
      best = candidates[0]
    } else {
      // Computed once and injected — phase 2 runs buildPartnerFit up to
      // once per candidate per target, and these are the same for all of them.
      const leagueAverages = computeLeagueAverages(allRosters)
      const winWindowTiers = assignWinWindowTiers(allRosters)
      const getAssets = [{ ...targetPlayer, type: 'player' }]

      const scored = []
      candidates.forEach(c => {
        const assets = c.idxs.map(i => available[i])
        const fit = buildPartnerFit(assets, getAssets, opponentRoster, allRosters, {
          leagueAverages, winWindowTiers,
        })
        if (!fit) return
        const rank = APPEAL_RANK[fit.appeal] ?? 0
        // Their appeal and my cost on ONE scale. Previously this was
        // lexicographic — best appeal won outright and my cost only broke ties
        // — which made the search buy their enthusiasm at any price inside the
        // band. Measured on the live 20-target board, that picked a package
        // other than the cheapest fair one on 18 of 20 targets, sending 11,293
        // more dynasty value in total (median 654, max 1,403 per trade) and
        // reaching for an asset just under the protect line on 10 of them.
        const netScore = (APPEAL_BONUS[fit.appeal] ?? 0) - c.pain
        scored.push({ ...c, appealRank: rank, netScore, partnerFit: fit })
        // The shortlist is already sorted by pain ascending, so a strict >
        // keeps the cheaper package when two score identically.
        if (!best || netScore > best.netScore) best = { ...c, appealRank: rank, netScore, partnerFit: fit }
      })
      // The road not taken — and it now points the OTHER way. When appeal was
      // lexicographically first, the suggestion was always the most agreeable
      // package and the useful footnote was the cheaper one. Now that the
      // winner already weighs my cost, the option worth naming is the package
      // they'd like MORE that I chose not to pay for. The owner's standing call
      // is preserved either way: knowing whether they would accept is the
      // information this search exists to produce, so it is still on the card —
      // it is just no longer what silently picks the offer.
      //
      // Only surfaced when the extra cost is real (ALTERNATIVE_MIN_SAVING) —
      // below that the two packages cost the same and one merely reads better,
      // which is not a decision.
      if (best) {
        alternative = scored
          .filter(c => c.appealRank > best.appealRank && c.pain - best.pain >= ALTERNATIVE_MIN_SAVING)
          .sort((a, b) => b.appealRank - a.appealRank || a.pain - b.pain)[0] ?? null
      }
      // Every scored candidate returned null (no partner roster shape to read) —
      // fall back to the cheapest rather than suggesting nothing.
      if (!best) best = candidates[0]
    }
  }

  if (best) {
    const assets = best.idxs.map(i => available[i])
    const gapPct = Math.round(Math.abs(best.total - targetValue) / targetValue * 100)
    const fit = best.partnerFit ?? null
    // The MY-side read for the package actually chosen. The board used to grade
    // every suggestion "Fair for them" and say nothing at all about my own
    // roster, which read as the app negotiating against its owner.
    //
    // It does NOT reorder anything: phase 2's ranking (APPEAL_BONUS − keep-pain)
    // is untouched and still the measured one, and this is computed once, for
    // the winner only — so the untruncated search stays affordable. No playoff
    // odds reach this function, so the lean falls back to my win-window tier,
    // the same fallback the Analyzer uses in the offseason.
    const mine = allRosters?.length
      ? buildSideFit([{ ...targetPlayer, type: 'player' }], assets, myRoster, allRosters, { seat: 'you' })
      : null
    return {
      assets, totalValue: best.total, gapPct,
      over: best.total >= targetValue,
      rationale: packageRationale(assets, ctx),
      // What this package is worth to MY roster — the counterpart to `appeal`.
      myAppeal: mine?.appeal ?? null,
      mySummary: mine?.summary ?? null,
      myStartersDelta: mine?.startersDelta ?? null,
      myConcern: mine?.concerns?.[0] ?? null,
      // The partner read this package was CHOSEN for, so a surface showing the
      // suggestion can show what it's worth to them instead of implying it's
      // agreeable. Null when there's no partner roster to read.
      appeal: fit?.appeal ?? null,
      partnerSummary: fit?.summary ?? null,
      partnerStartersDelta: fit?.startersDelta ?? null,
      partnerConcern: fit?.concerns?.[0] ?? null,
      // The cheaper option, when giving less would genuinely cost less and the
      // only price is how it reads to them. Null when no such package exists.
      alternative: alternative
        ? {
          assets: alternative.idxs.map(i => available[i]),
          totalValue: alternative.total,
          appeal: alternative.partnerFit?.appeal ?? null,
        }
        : null,
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
