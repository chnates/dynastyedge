// findTradeTargets.js — tool #9: "Who should I call about, and what would it cost?"
//
// MCP_DISCOVERY.md §5 deferred this to phase two as "trade targets / fair
// packages (note this is the ~730ms path in-app)". It is the largest
// capability gap the server had: `analyze_trade` grades a trade you already
// thought of, and nothing answered the question that comes BEFORE it.
//
// Orchestration only. Every number is `rosterAnalysis.getTopTradeTargets` +
// `tradeAnalysis.suggestFairPackage`, unmodified — the same two functions
// Trade > Targets runs, so the board on the phone and the answer in the chat
// cannot disagree. The one piece of logic that lives here is mapping a
// package's pick back to the id `analyze_trade` accepts, and it refuses
// rather than guesses (below).
//
// ── FRESHNESS: this layer deliberately has NO TTL of its own ────────────────
// weekly.js, season.js, transactions.js and liveScores.js each argue a number
// because each OWNS A FETCH. This one owns none: `getTopTradeTargets` and
// `suggestFairPackage` are pure functions of the snapshot the server has
// already fetched, already cached for ~15 minutes and already stamped. Its
// freshness domain is therefore the snapshot's, exactly, and a TTL of its own
// could only ever be a second clock disagreeing with the first — the same
// trap `store.js` records from the other direction. Note also that
// `getSnapshot` assembles a FRESH object every call (`generatedAt` is `now`),
// so a derived cache keyed on snapshot identity would never hit and one keyed
// on time would be that second clock.
//
// What the ~730ms buys is CPU, not requests, and CPU is bounded the way
// §4e-v says to bound it — by how many TARGETS are priced (`limit`, measured
// at ~32ms each on the live league), never by truncating the candidate search
// inside a target. Truncation is what the untruncated search replaced.

import { getTopTradeTargets, assignWinWindowTiers } from '../../src/utils/rosterAnalysis.js'
import { suggestFairPackage } from '../../src/utils/tradeAnalysis.js'
import { getDeficitPositions } from '../../src/utils/recommendations.js'
import { getTeamName } from '../../src/utils/teamName.js'
import { resolveTeam, describeTeams } from '../teams.js'

// Bounded output (§7 / non-negotiable 2). Twenty targets each carrying two fit
// reads, a package and an alternative is a large response for a question whose
// useful answer is "here are the few worth a phone call". The DEFAULT is small
// and the cap is the app board's own size, so this tool can never return more
// rows than Trade > Targets shows.
export const DEFAULT_LIMIT = 8
export const MAX_LIMIT = 20
// The ranking depth. Always the app's 20, whatever `limit` returns, so
// `counts.board` is a real denominator rather than an echo of the cap — and so
// a position or team filter is answered against the same board the phone
// builds. Only the returned slice is priced.
const BOARD_DEPTH = 20

const POSITIONS = ['QB', 'RB', 'WR', 'TE']

function playerRow(p) {
  return {
    sleeperId: String(p.sleeperId),
    name: p.name,
    position: p.position,
    nflTeam: p.team || null,
    age: p.age ?? null,
    // Rule 7: unpriced is null, never 0. A target is on the board because it
    // is worth >= 1000, so this is never actually null here — the shape is
    // uniform with every other tool on purpose.
    value: p.unranked ? null : (p.value ?? null),
    unranked: !!p.unranked,
    positionRank: p.positionRank ?? null,
    trend30Day: p.trend30Day ?? 0,
  }
}

// A package asset, carrying the id `analyze_trade` will accept so the handoff
// is one call rather than a re-resolution.
//
// THE PICK ID IS READ OFF THE ASSET, NEVER RECOVERED FROM ITS LABEL.
// `suggestFairPackage` carries `season` + `round` + `originalOwner` — the
// triple that IS the id — precisely so no consumer has to reverse a
// `pickLabel` back into an identity. It cannot be reversed: the label is
// "{season} {suffix}" and a roster can hold several picks under one (measured
// live 2026-09-22: **6 of 10 rosters** do). The first cut of this tool built a
// label index and refused an ambiguous one, which was the right call given the
// shape it had; carrying the identity is better, because it makes the
// ambiguity impossible rather than detectable.
//
// A missing field still yields `id: null` rather than a guess — the same rule
// resolve_assets keeps, kept here as a guard rather than as the mechanism.
function assetRow(a) {
  if (a.type === 'pick') {
    const complete = a.season != null && a.round != null && a.originalOwner != null
    return {
      id: complete ? `${a.season}-${a.round}-${a.originalOwner}` : null,
      type: 'pick',
      name: a.name,
      value: a.value ?? null,
      round: a.round ?? undefined,
      season: a.season != null ? String(a.season) : undefined,
    }
  }
  return {
    id: String(a.sleeperId),
    type: 'player',
    name: a.name,
    position: a.position,
    age: a.age ?? null,
    value: a.value ?? null,
  }
}

function seatRow(appeal, summary, concern, startersDelta) {
  return {
    appeal: appeal ?? null,
    summary: summary ?? null,
    concern: concern ?? null,
    startersDelta: startersDelta ?? null,
  }
}

export function buildTradeTargetsAnswer(snapshot, { team, position, limit, myRosterId } = {}) {
  const { league } = snapshot
  if (!league) throw new Error('League state unavailable')

  if (!league.myRoster) {
    return {
      ok: false,
      error: `No roster ${myRosterId} in this league, so there is no "my team" to find targets for. ` +
             'Pass a leagueId whose rosters include yours, or set DYNASTYEDGE_ROSTER_ID.',
      candidates: describeTeams(league.allRosters)
        .map(d => ({ rosterId: d.rosterId, teamName: d.teamName, username: d.username })),
    }
  }

  const wantPos = position ? String(position).toUpperCase() : null
  if (wantPos && !POSITIONS.includes(wantPos)) {
    return {
      ok: false,
      error: `"${position}" is not a tradable position in this league. Use one of ${POSITIONS.join(', ')} ` +
             '— there is no kicker, and a defense carries no dynasty value (FantasyCalc ranks zero of them), ' +
             'so no defense is ever a trade target here.',
    }
  }

  // Scoped mode. It NEVER guesses which team you meant — same discipline
  // get_roster and analyze_trade keep, because scouting the wrong roster is
  // the same class of error as grading the wrong player.
  let scopedRoster = null
  if (team != null && team !== '') {
    const resolved = resolveTeam(league, team, null)
    if (!resolved.roster) {
      return { ok: false, error: resolved.error, candidates: resolved.candidates ?? [] }
    }
    if (resolved.roster.rosterId === league.myRoster.rosterId) {
      return {
        ok: false,
        error: 'That is your own roster. Trade targets are players on OTHER teams — ' +
               'omit `team` for the league-wide board, or name an opponent to scout one.',
      }
    }
    scopedRoster = resolved.roster
  }

  const { myRoster, allRosters } = league
  const rosterById = new Map(allRosters.map(r => [r.rosterId, r]))
  // Computed once. `getWinWindowTier` re-runs assignWinWindowTiers over the
  // whole league on every call, and this answer names a tier per target.
  const tiers = assignWinWindowTiers(allRosters)

  const board = getTopTradeTargets(myRoster, allRosters, BOARD_DEPTH, {
    ownerRosterId: scopedRoster?.rosterId ?? null,
    position: wantPos,
  })

  const cap = Math.max(1, Math.min(MAX_LIMIT, limit ?? DEFAULT_LIMIT))
  const shown = board.slice(0, cap)

  // Only the returned slice is priced — the search inside each target stays
  // untruncated (§4e-v), which is the bound that must not move.
  let unidentifiedPick = false
  const targets = shown.map(t => {
    const owner = rosterById.get(t.ownerRosterId)
    const pkg = suggestFairPackage(t, myRoster, allRosters, owner)
    if (pkg) {
      pkg.assets.forEach(a => {
        if (a.type === 'pick' && (a.season == null || a.originalOwner == null)) unidentifiedPick = true
      })
    }
    return {
      player: playerRow(t),
      owner: {
        rosterId: t.ownerRosterId,
        teamName: getTeamName(t.owner),
        winWindow: tiers[t.ownerRosterId] ?? null,
      },
      // Why he is on the board. `fillsNeed` is false only in scoped mode,
      // where an explicitly chosen team keeps its best movable pieces rather
      // than rendering empty.
      fillsNeed: !!t.fillsNeed,
      // Three roster facts about the team that holds him, as a multiplier on
      // need x value. A TILT, never a gate — nothing is hidden by it.
      movability: Math.round((t.movability ?? 1) * 100) / 100,
      package: pkg
        ? {
          assets: pkg.assets.map(assetRow),
          totalValue: pkg.totalValue,
          gapPct: pkg.gapPct,
          over: !!pkg.over,
          // Whether the offer is one the Analyzer will call fair. False only
          // when nothing you can spare reaches the band — an honest near-miss
          // rather than no answer.
          inFairBand: pkg.short ? false : !!pkg.inFairBand,
          short: !!pkg.short,
          rationale: pkg.rationale,
          you: seatRow(pkg.myAppeal, pkg.mySummary, pkg.myConcern, pkg.myStartersDelta),
          them: seatRow(pkg.appeal, pkg.partnerSummary, pkg.partnerConcern, pkg.partnerStartersDelta),
          // The package they'd want MORE that the search declined to pay for,
          // and what it costs over the target. On most rows this is the most
          // actionable field: a fairly-priced offer gives the other manager no
          // edge on value, so the premium IS the thing that buys a yes.
          alternative: pkg.alternative
            ? {
              assets: pkg.alternative.assets.map(assetRow),
              totalValue: pkg.alternative.totalValue,
              appeal: pkg.alternative.appeal ?? null,
              premiumPct: pkg.alternative.premiumPct,
            }
            : null,
        }
        : null,
      packageNote: pkg
        ? null
        : 'Nothing you can spare comes close to his price without touching a core piece.',
    }
  })

  const deficits = [...getDeficitPositions(myRoster, allRosters)]

  return {
    ok: true,
    asOf: snapshot.asOf,
    league: {
      leagueId: league.leagueId,
      name: league.leagueInfo?.name ?? null,
      season: snapshot.nflState?.season ?? null,
      isOffseason: snapshot.isOffseason,
      teams: allRosters.length,
    },
    team: {
      rosterId: myRoster.rosterId,
      teamName: getTeamName(myRoster.owner),
      winWindow: tiers[myRoster.rosterId] ?? null,
    },
    // What the ranking is reasoning FROM. Without it "target a WR" is
    // unfalsifiable.
    positions: { deficits },
    mode: scopedRoster ? 'scoped' : 'league-wide',
    scopedTo: scopedRoster
      ? { rosterId: scopedRoster.rosterId, teamName: getTeamName(scopedRoster.owner) }
      : null,
    filter: { position: wantPos },
    counts: {
      // The ranked board, before the output cap — so a reader can tell a short
      // answer from a short board.
      board: board.length,
      returned: targets.length,
      truncated: board.length > targets.length,
      fillsNeed: targets.filter(t => t.fillsNeed).length,
      priced: targets.filter(t => t.package).length,
      inFairBand: targets.filter(t => t.package?.inFairBand).length,
    },
    targets,
    notes: buildNotes(snapshot, { board, targets, deficits, scopedRoster, wantPos, unidentifiedPick }),
  }
}

function buildNotes(snapshot, { board, targets, deficits, scopedRoster, wantPos, unidentifiedPick }) {
  const notes = []
  if (snapshot.asOf.stale) {
    notes.push('At least one source failed to refresh, so this is cached data — see asOf.sources.')
  }
  if (board.length > targets.length) {
    notes.push(
      `Showing the top ${targets.length} of ${board.length} ranked targets — raise \`limit\` (max ${MAX_LIMIT}) for more. ` +
      'Only the returned rows are priced, so a larger limit costs more time, not less accuracy.'
    )
  }
  if (!board.length) {
    notes.push(
      scopedRoster
        ? `${getTeamName(scopedRoster.owner)} holds nobody worth ${wantPos ? `targeting at ${wantPos}` : 'targeting'} above the 1,000 value floor.`
        : deficits.length
          ? `No opponent holds a ${wantPos ? `${wantPos} ` : ''}player above the 1,000 value floor at your deficit positions (${deficits.join(', ')}).`
          : 'You are at or above league average everywhere, so no position is flagged as a deficit and the league-wide board is empty. ' +
            'Name a `team` to scout one roster anyway.'
    )
  }
  if (scopedRoster) {
    const fills = targets.filter(t => t.fillsNeed).length
    notes.push(
      fills
        ? `Scouting one roster: ${fills} of ${targets.length} shown fill a positional deficit; the rest are their most valuable movable pieces.`
        : `Scouting one roster: nothing ${getTeamName(scopedRoster.owner)} holds fills a positional deficit of yours — these are their most valuable movable pieces.`
    )
  }
  const weak = targets.filter(t => t.package?.them?.appeal === 'Weak').length
  if (weak) {
    notes.push(
      `${weak} of ${targets.length} packages read Weak to the other manager. That is a real property of a fairly-priced offer, ` +
      'not a search failure — at fair value they gain no edge on value. `alternative` names the premium that would change it.'
    )
  }
  if (unidentifiedPick) {
    notes.push(
      'A pick in one of these packages is missing the season or original owner that forms its id, so its id is null rather than ' +
      'a guess. Call resolve_assets to identify it before analyze_trade.'
    )
  }
  notes.push(
    `Packages are chosen to land inside the Analyzer's fair band (±5%); \`inFairBand: false\` means nothing you can spare reaches it. ` +
    'Hand `package.assets[].id` plus the target\'s `sleeperId` to analyze_trade for the graded verdict — this tool does not grade.'
  )
  notes.push(
    'This is roster logic. Whether the other manager would ACCEPT is not modelled — per-manager behavioural profiling was ' +
    'tested on this league\'s full trade corpus and disconfirmed.'
  )
  notes.push('Sleeper\'s API is read-only: you still have to send the offer in the Sleeper app.')
  return notes
}

const num = n => (n == null ? '—' : n.toLocaleString('en-US'))
const signed = n => (n == null ? '—' : `${n >= 0 ? '+' : ''}${Math.round(n).toLocaleString('en-US')}`)

export function renderTradeTargetsText(a) {
  if (!a.ok) {
    const list = a.candidates?.length
      ? '\n' + a.candidates.map(c => `  ${c.rosterId}. ${c.teamName} (@${c.username})`).join('\n')
      : ''
    return `${a.error}${list}`
  }
  const L = []
  L.push(`${a.team.teamName} — trade targets${a.filter.position ? ` · ${a.filter.position}` : ''}${a.scopedTo ? ` · scouting ${a.scopedTo.teamName}` : ''}`)
  L.push(`${a.league.name ?? 'League'} · ${a.team.winWindow} · deficits: ${a.positions.deficits.join(', ') || 'none'}`)
  L.push(`As of ${a.asOf.oldestSourceAt ?? 'unknown'}${a.asOf.stale ? ' — STALE, a source failed to refresh' : ''}`)
  L.push('')

  a.targets.forEach((t, i) => {
    const p = t.player
    L.push(`${i + 1}. ${p.name} (${p.position}${p.nflTeam ? ` · ${p.nflTeam}` : ''}) — ${num(p.value)}`)
    L.push(`   ${t.owner.teamName}${t.owner.winWindow ? ` · ${t.owner.winWindow}` : ''}${t.fillsNeed ? ' · fills your need' : ' · depth piece'}`)
    if (!t.package) { L.push(`   ${t.packageNote}`); L.push(''); return }
    const k = t.package
    L.push(`   COST ${k.assets.map(x => x.name).join(' + ')} (~${num(k.totalValue)}${k.inFairBand ? ', inside the fair band' : `, ${k.short ? 'short of' : 'outside'} the fair band`})`)
    L.push(`   ${k.rationale}`)
    if (k.you.appeal) L.push(`   YOU  ${k.you.appeal} — ${k.you.concern ?? k.you.summary ?? ''} (lineup ${signed(k.you.startersDelta)})`)
    if (k.them.appeal) L.push(`   THEM ${k.them.appeal} — ${k.them.summary ?? ''} (their lineup ${signed(k.them.startersDelta)})`)
    if (k.alternative) {
      L.push(`   TO GET A YES ${k.alternative.assets.map(x => x.name).join(' + ')} (+${k.alternative.premiumPct}% over fair) — ${k.alternative.appeal} for them`)
    }
    L.push('')
  })

  a.notes.forEach(n => L.push(`Note: ${n}`))
  return L.join('\n').trimEnd()
}
