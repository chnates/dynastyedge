// analyzeTrade.js — tool #5: "Grade this trade."
//
// Mirrors src/components/trade/TradeAnalyzer.jsx:141-256 — the same call
// chain in the same order:
//
//   analyzeTrade → getTradeVerdict → adjustVerdictForInjuries
//                → getCounterSuggestion → buildTradePitch
//
// Zero domain math here. Every number, every sentence and the verdict itself
// come out of src/utils/tradeAnalysis.js, which is where the app gets them —
// so the server and the phone can never grade the same trade differently.
//
// ── IDS ONLY. THIS IS THE POINT OF THE TOOL. ──────────────────────────────
//
// MCP_DISCOVERY.md §1: "resolve_assets first, then grade on IDs only — costs
// a round-trip; makes grading the wrong player structurally impossible."
//
// So a free-text name is REJECTED with a pointer to resolve_assets, never
// guessed at. This is enforced here rather than left to the schema's prose,
// because the failure it prevents is the worst one this whole design has: an
// LLM that silently grades the wrong Mike Williams produces a fluent,
// confident, completely wrong verdict, and nothing downstream can catch it.
//
// ── WHAT IS NOT WIRED, AND WHY ────────────────────────────────────────────
//
// analyzeTrade takes eight optional signals. Four are computable from the
// snapshot alone and ARE passed: opponentTrajectoryRead, curves,
// replacementLevels, rosterLimits. Three need a fetch this tool does not
// make, and are passed null, which is their documented degraded state — each
// block simply does not render:
//
//   myPlayoffPct     needs every regular-season week's matchups (usePlayoffOdds).
//                    Layer 3 falls back to the win-window TIER, and the
//                    response says which basis actually scored it, because
//                    `windowBasis` is exactly the field that exists to stop a
//                    reader assuming the wrong one.
//   myDraftGrade     needs the multi-season league-history walk.
//   partnerActivity  needs the season-wide transaction feed.
//
// weeklyProjections IS passed when the caller is in-season and the projections
// loaded — it is the one of the three that phase 1b already fetches for
// recommend_free_agents, so it costs nothing extra here.

import {
  analyzeTrade as runAnalyzeTrade,
  getTradeVerdict,
  adjustVerdictForInjuries,
  getCounterSuggestion,
  buildTradePitch,
} from '../../src/utils/tradeAnalysis.js'
import { buildAgeCurves, buildRosterTrajectory, getTrajectoryRead } from '../../src/utils/dynastyTrajectory.js'
import { buildReplacementLevels } from '../../src/utils/positionalValue.js'
import { getRosterLimits } from '../../src/utils/rosterSpace.js'
import { getTeamName } from '../../src/utils/teamName.js'
import { resolveTeam } from '../teams.js'

export const MAX_ASSETS_PER_SIDE = 12

const PICK_ID_RE = /^(20\d{2})-(\d)-(\d+)$/
const PLAYER_ID_RE = /^\d+$/

// Turn one id into the asset object tradeAnalysis expects, taken from the
// roster that actually owns it. Returns { asset } or { error }.
//
// It reads the OWNING roster rather than trusting the caller, so a trade can
// never be graded against a value the caller supplied — the price is always
// the app's own.
function resolveAssetId(id, roster, sideLabel) {
  const raw = String(id).trim()

  if (PLAYER_ID_RE.test(raw)) {
    const p = roster.players.find(x => String(x.sleeperId) === raw)
    if (!p) {
      return { error:
        `Player id ${raw} is not on ${getTeamName(roster.owner)}'s roster, so it cannot be on the "${sideLabel}" side. ` +
        'Check which team owns him with resolve_assets.' }
    }
    return { asset: { ...p, type: 'player', id: String(p.sleeperId) } }
  }

  const m = raw.match(PICK_ID_RE)
  if (m) {
    const pk = roster.picks.find(x => `${x.season}-${x.round}-${x.originalOwner}` === raw)
    if (!pk) {
      return { error:
        `Pick ${raw} is not owned by ${getTeamName(roster.owner)}, so it cannot be on the "${sideLabel}" side. ` +
        'Check who owns it with resolve_assets.' }
    }
    return { asset: { ...pk, type: 'pick', id: raw } }
  }

  // The whole reason resolve_assets exists. Never guess.
  return { error:
    `"${raw}" is not a resolved asset id. analyze_trade accepts IDS ONLY — a numeric Sleeper player id ` +
    '(e.g. "4866") or a pick id of the form "SEASON-ROUND-ORIGINALOWNERROSTERID" (e.g. "2027-1-4"). ' +
    'Call resolve_assets with this name first and pass back the id it returns. ' +
    'This tool will not guess which player a name means, because grading the wrong player produces a ' +
    'confident wrong verdict that nothing downstream can catch.' }
}

function resolveSide(ids, roster, sideLabel) {
  const list = Array.isArray(ids) ? ids : ids == null ? [] : [ids]
  if (list.length > MAX_ASSETS_PER_SIDE) {
    return { error: `Too many assets on the "${sideLabel}" side (${list.length}); the cap is ${MAX_ASSETS_PER_SIDE}.` }
  }
  const assets = []
  const errors = []
  const seen = new Set()
  list.forEach(id => {
    const key = String(id).trim()
    if (seen.has(key)) return // a repeated id is one asset, not two
    seen.add(key)
    const r = resolveAssetId(key, roster, sideLabel)
    if (r.error) errors.push(r.error)
    else assets.push(r.asset)
  })
  return errors.length ? { error: errors.join(' ') } : { assets }
}

export function buildTradeAnswer(snapshot, weekly, { give, get, partner, myRosterId } = {}) {
  const { league, values } = snapshot
  if (!league) throw new Error('League state unavailable')

  if (!league.myRoster) {
    return { ok: false, error:
      `No roster ${myRosterId} in this league, so there is no "your side" to grade. ` +
      'Pass a leagueId whose rosters include yours, or set DYNASTYEDGE_ROSTER_ID.' }
  }
  const myRoster = league.myRoster

  const resolvedPartner = resolveTeam(league, partner, null)
  if (resolvedPartner.error) {
    return { ok: false, error: `Trade partner: ${resolvedPartner.error}`, candidates: resolvedPartner.candidates ?? [] }
  }
  const opponentRoster = resolvedPartner.roster
  if (opponentRoster.rosterId === myRoster.rosterId) {
    return { ok: false, error: 'The trade partner is your own team. Name the other side.' }
  }

  // "give" comes off MY roster, "get" off THEIRS — checked, not assumed.
  const giveSide = resolveSide(give, myRoster, 'give')
  if (giveSide.error) return { ok: false, error: giveSide.error }
  const getSide = resolveSide(get, opponentRoster, 'get')
  if (getSide.error) return { ok: false, error: getSide.error }

  const giveAssets = giveSide.assets
  const getAssets = getSide.assets

  // The app's own gate: no verdict until both sides have something. Totals
  // still render, exactly as the panel does.
  const bothSides = giveAssets.length > 0 && getAssets.length > 0

  // ── The four signals computable without an extra fetch ────────────────
  const ageCurves = values?.playerMap ? buildAgeCurves(values.playerMap) : null
  const season = Number(snapshot.nflState?.season) || new Date().getFullYear()
  const opponentTrajectoryRead = ageCurves
    ? getTrajectoryRead(buildRosterTrajectory(opponentRoster, season, ageCurves.curves, ageCurves.generic))
    : null
  const replacementLevels = buildReplacementLevels(league.allRosters)?.levels ?? null
  const rosterLimits = getRosterLimits(league.leagueInfo)
  const weeklyProjections = weekly?.available && weekly.projMap
    ? { projMap: weekly.projMap, week: weekly.week }
    : null

  const analysis = runAnalyzeTrade(giveAssets, getAssets, myRoster, opponentRoster, league.allRosters, {
    // Null: needs the full matchup-week fetch. Layer 3 falls back to the tier
    // and reports `windowBasis: 'tier'` — see the header.
    myPlayoffPct: null,
    opponentTrajectoryRead,
    curves: ageCurves?.curves ?? null,
    myDraftGrade: null,      // needs the league-history walk
    replacementLevels,
    rosterLimits,
    weeklyProjections,
    partnerActivity: null,   // needs the transaction feed
  })
  if (!analysis) throw new Error('Trade analysis unavailable — roster or league data missing')

  const verdict = getTradeVerdict(analysis)
  // liveIntelligence is a per-player news/injury fetch the app makes lazily on
  // the drawer. Passing null is its documented no-op: the verdict is returned
  // unchanged rather than adjusted on evidence we do not have.
  const adjusted = adjustVerdictForInjuries(verdict, null, giveAssets, getAssets)
  const counter = bothSides && adjusted?.verdict === 'Counter'
    ? getCounterSuggestion(analysis, myRoster, opponentRoster, giveAssets, getAssets)
    : null
  const partnerName = getTeamName(opponentRoster.owner)
  const pitch = buildTradePitch(analysis, { partnerName, giveAssets, getAssets })

  return {
    ok: true,
    asOf: snapshot.asOf,
    league: {
      leagueId: league.leagueId,
      name: league.leagueInfo?.name ?? null,
      season: snapshot.nflState?.season ?? null,
      isOffseason: snapshot.isOffseason,
    },
    sides: {
      you: { rosterId: myRoster.rosterId, teamName: getTeamName(myRoster.owner) },
      them: { rosterId: opponentRoster.rosterId, teamName: partnerName },
      give: giveAssets.map(assetRow),
      get: getAssets.map(assetRow),
    },
    // THE CALL — the app leads with this, and so does the tool.
    verdict: bothSides
      ? {
        verdict: adjusted?.verdict ?? null,
        reasoning: adjusted?.reasoning ?? null,
        // True when adjustVerdictForInjuries moved it. Always false here
        // (liveIntelligence is null) — stated rather than omitted so the
        // field means the same thing as it does in the app.
        injuryAdjusted: !!adjusted && adjusted.verdict !== verdict?.verdict,
      }
      : null,
    // Layer 1.
    value: {
      giveTotal: analysis.giveTotal,
      getTotal: analysis.getTotal,
      diff: analysis.valueDiff,
      pctDiff: analysis.valuePct,
      winner: analysis.valueWinner,
    },
    // Layer 2 + the my-seat read (buildSideFit from my seat — DISPLAY ONLY,
    // it never moves the verdict).
    forYou: {
      appeal: analysis.myFit?.appeal ?? null,
      summary: analysis.myFit?.summary ?? null,
      reasons: analysis.myFit?.reasons ?? [],
      concerns: analysis.myFit?.concerns ?? [],
      startersDelta: analysis.myFit?.startersDelta ?? null,
      lineupNote: analysis.myFit?.lineupNote ?? null,
      fills: analysis.fills ?? [],
      hurts: analysis.hurts ?? [],
      benchNote: analysis.benchNote ?? null,
      starterLossNote: analysis.starterLossNote ?? null,
      landingSpots: analysis.myLandingSpots ?? [],
    },
    // Layer 4 — "would they even want this?"
    forThem: {
      appeal: analysis.partnerFit?.appeal ?? null,
      summary: analysis.partnerFit?.summary ?? null,
      reasons: analysis.partnerFit?.reasons ?? [],
      concerns: analysis.partnerFit?.concerns ?? [],
      startersDelta: analysis.partnerFit?.startersDelta ?? null,
      fills: analysis.partnerFit?.fills ?? [],
      stacks: analysis.partnerFit?.stacks ?? [],
      weakens: analysis.partnerFit?.weakens ?? [],
      landingSpots: analysis.partnerFit?.landingSpots ?? [],
    },
    // Layer 3.
    winWindow: {
      // Names which basis actually scored it. In this tool it is always
      // 'tier' (no playoff odds fetched) — and saying so is the point.
      basis: analysis.windowBasis ?? null,
      note: analysis.windowNote ?? null,
      score: analysis.windowScore ?? null,
      myTier: analysis.myTier ?? null,
      theirTier: analysis.opponentTier ?? null,
      partnerTrajectory: analysis.partnerTrajectoryNote ?? null,
      myTrajectory: analysis.myTrajectoryNote ?? null,
    },
    // buildFairBand's own field names: `inside` (not "inBand") and a SIGNED
    // gapToBand of 0 when the offer is already inside. Renamed at this
    // boundary would just be a second vocabulary for one concept.
    fairBand: analysis.fairBand
      ? {
        low: analysis.fairBand.low,
        high: analysis.fairBand.high,
        target: analysis.fairBand.target,
        current: analysis.fairBand.current,
        inside: analysis.fairBand.inside,
        gapToBand: analysis.fairBand.gapToBand ?? 0,
      }
      : null,
    counter: counter
      ? { side: counter.side, type: counter.type, item: counter.item?.name ?? null, text: counter.text }
      : null,
    // The message to actually send, stated entirely from their side.
    // buildTradePitch returns { text, lines, bullets }; `text` is the copyable
    // message and the bullets are the reasons it is built from.
    pitch: pitch ? { text: pitch.text, bullets: pitch.bullets ?? [] } : null,
    notes: buildNotes({ snapshot, weekly, bothSides, giveAssets, getAssets }),
  }
}

function assetRow(a) {
  if (a.type === 'pick') {
    return {
      id: a.id, type: 'pick',
      name: a.slotLabel ? `${a.season} ${a.slotLabel}` : `${a.season} round ${a.round}`,
      season: String(a.season), round: a.round,
      value: a.value || null,
      pricing: a.slotLabel ? 'exact-slot' : 'round-median',
    }
  }
  return {
    id: a.id, type: 'player',
    name: a.name, position: a.position, nflTeam: a.team || null,
    age: a.age ?? null,
    value: a.unranked ? null : (a.value ?? null),
    unranked: !!a.unranked,
    positionRank: a.positionRank ?? null,
    trend30Day: a.trend30Day ?? 0,
  }
}

function buildNotes({ snapshot, weekly, bothSides, giveAssets, getAssets }) {
  const notes = []
  if (snapshot.asOf.stale) {
    notes.push('At least one source failed to refresh, so this is cached data — see asOf.sources.')
  }
  if (!bothSides) {
    notes.push(
      `Only the "${giveAssets.length ? 'give' : 'get'}" side has assets, so there is no verdict — ` +
      'totals are shown, exactly as the app does. Add at least one asset to each side.'
    )
  }
  const unpriced = [...giveAssets, ...getAssets].filter(a => a.type === 'player' && a.unranked)
  if (unpriced.length) {
    notes.push(
      `${unpriced.length} player(s) in this trade carry no FantasyCalc value (${unpriced.map(p => p.name).join(', ')}) ` +
      'and count 0 toward the totals. That is "unpriced", not "worthless" — the value read is weaker than usual here.'
    )
  }
  // The honest statement of what did NOT feed the grade.
  notes.push(
    'Win window was scored on the win-window TIER, not live playoff odds — this server does not fetch the ' +
    'rest-of-season simulation. In season the app scores this layer on odds, which track the starting lineup ' +
    'far more closely, so the window read here is the weaker of the two.'
  )
  if (!weekly?.available) {
    notes.push(
      snapshot.isOffseason
        ? 'Offseason: no weekly lineup-impact read, because Sleeper publishes no projections.'
        : 'This week\'s projections did not load, so the weekly lineup-impact read is absent.'
    )
  }
  notes.push(
    'Not wired in this server: your rookie-draft hindsight record (the pick-confidence nudge) and the ' +
    'partner\'s recent transactions. Both need fetches beyond the league snapshot; their absence removes ' +
    'context, never a number.'
  )
  notes.push(
    'This grades the ROSTER logic. Whether the other manager would accept is deliberately not modelled — ' +
    'per-manager behavioural profiling was tested on this league\'s full 95-trade corpus and disconfirmed.'
  )
  notes.push('Sleeper\'s API is read-only: you still have to send this offer in the Sleeper app.')
  return notes
}

const num = n => (n == null ? '—' : n.toLocaleString('en-US'))

// buildLandingSpots returns objects, not sentences: where an arriving player
// lands on the receiving depth chart, and whether he actually starts.
function landingSpotText(sp) {
  if (typeof sp === 'string') return sp
  const rank = sp.posRank ? `${sp.position}${sp.posRank} of ${sp.count}` : sp.position
  return `${sp.name} lands as ${rank}${sp.starts ? ` and starts at ${sp.slot ?? sp.position}` : ' — bench, not a starting upgrade'}`
}

export function renderTradeText(a) {
  if (!a.ok) {
    const list = a.candidates?.length
      ? '\n' + a.candidates.map(c => `  ${c.rosterId}. ${c.teamName} (@${c.username})`).join('\n')
      : ''
    return `${a.error}${list}`
  }
  const L = []
  L.push(`${a.sides.you.teamName}  ⇄  ${a.sides.them.teamName}`)
  L.push(`As of ${a.asOf.oldestSourceAt ?? 'unknown'}${a.asOf.stale ? ' — STALE, a source failed to refresh' : ''}`)
  L.push('')
  if (a.verdict) {
    L.push(`THE CALL — ${a.verdict.verdict}`)
    if (a.verdict.reasoning) L.push(`  ${a.verdict.reasoning}`)
    L.push('')
  }
  L.push(`YOU GIVE (${num(a.value.giveTotal)})`)
  a.sides.give.forEach(x => L.push(`  ${x.name}${x.position ? ` (${x.position})` : ''} — ${num(x.value)}${x.unranked ? ' [unranked]' : ''}`))
  L.push(`YOU GET (${num(a.value.getTotal)})`)
  a.sides.get.forEach(x => L.push(`  ${x.name}${x.position ? ` (${x.position})` : ''} — ${num(x.value)}${x.unranked ? ' [unranked]' : ''}`))
  L.push('')
  const w = a.value.winner
  L.push(`Raw value: ${w === 'even' ? 'even' : w === 'you' ? `you win by ${a.value.pctDiff}%` : `you overpay by ${a.value.pctDiff}%`}`)
  if (a.fairBand) {
    L.push(`Fair band: give ${num(a.fairBand.low)}–${num(a.fairBand.high)}${a.fairBand.inside ? ' — this offer is inside it' : a.fairBand.gapToBand ? ` — off by ${num(Math.abs(a.fairBand.gapToBand))}` : ''}`)
  }
  L.push('')
  // `reasons` is the FULL fact list and `concerns` is its against-subset —
  // buildSideFit's `against()` helper pushes to both. So a fact is marked "−"
  // when it also appears in concerns and "+" otherwise; printing the two
  // arrays separately would state every objection twice. `lineupNote` is
  // already inside `reasons`, so it is not printed again either.
  const renderSeat = (label, fit) => {
    if (!fit.appeal) return
    L.push(`${label} — ${fit.appeal}${fit.summary ? ` · ${fit.summary}` : ''}`)
    const against = new Set(fit.concerns ?? [])
    ;(fit.reasons ?? []).forEach(r => L.push(`  ${against.has(r) ? '−' : '+'} ${r}`))
    ;(fit.landingSpots ?? []).forEach(sp => L.push(`  ${landingSpotText(sp)}`))
    L.push('')
  }
  renderSeat('FOR YOU', a.forYou)
  renderSeat('FOR THEM', a.forThem)
  if (a.winWindow.note) {
    L.push(`WIN WINDOW (${a.winWindow.basis ?? 'unknown'} basis) — ${a.winWindow.note}`)
    if (a.winWindow.partnerTrajectory) L.push(`  ${a.winWindow.partnerTrajectory}`)
    if (a.winWindow.myTrajectory) L.push(`  ${a.winWindow.myTrajectory}`)
    L.push('')
  }
  if (a.counter) {
    L.push(`COUNTER — ${a.counter.text}`)
    L.push('')
  }
  if (a.pitch) {
    L.push('PITCH IT')
    String(a.pitch.text).split('\n').forEach(line => L.push(`  ${line}`))
    L.push('')
  }
  a.notes.forEach(n => L.push(`Note: ${n}`))
  return L.join('\n').trimEnd()
}
