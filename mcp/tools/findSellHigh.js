// findSellHigh.js — tool #2: "Who's my best sell-high candidate?"
//
// MCP_DISCOVERY.md §5: reuses `edgeBriefing.computeEdgeSignals` +
// `recommendations.suggestSellMove`. The second one is why this tool is worth
// having at all: it returns a CONCRETE partner and a CONCRETE return, not
// "shop him to someone". suggestSellMove scores every opponent on three
// roster facts — do they need the position, would he actually START for them
// (buildValueLineup), and do they own a comparable-value player at one of MY
// deficit positions — so a needy team holding nothing I want loses to a
// slightly-less-needy one that can actually pay.
//
// Orchestration only. Every number here is computed in src/utils, which is
// where the app gets it too: the sell-high pick, the buy-low window, the
// underperforming opponent and the deficit/surplus split are all
// computeEdgeSignals' output, unmodified.

import { computeEdgeSignals } from '../../src/utils/edgeBriefing.js'
import { suggestSellMove } from '../../src/utils/recommendations.js'
import { getTeamName } from '../../src/utils/teamName.js'

// Bounded output (§7). These are "the best few", not a dump — the question is
// "who do I sell?", and a list of twenty is not an answer to it.
const MAX_ALTERNATIVES = 5

const TREND_THRESHOLD = 50
const MIN_TARGET_VALUE = 1000

function playerRow(p) {
  return {
    sleeperId: String(p.sleeperId),
    name: p.name,
    position: p.position,
    nflTeam: p.team || null,
    age: p.age ?? null,
    // Rule 7 end to end: unpriced is null, never 0.
    value: p.unranked ? null : (p.value ?? null),
    unranked: !!p.unranked,
    positionRank: p.positionRank ?? null,
    trend30Day: p.trend30Day ?? 0,
  }
}

export function buildSellHighAnswer(snapshot, { myRosterId } = {}) {
  const { league, values } = snapshot
  if (!league) throw new Error('League state unavailable')

  if (!league.myRoster) {
    return {
      ok: false,
      error: `No roster ${myRosterId} in this league, so there is no "my team" to sell from. ` +
             'Pass a leagueId whose rosters include yours, or set DYNASTYEDGE_ROSTER_ID.',
      candidates: league.allRosters.map(r => ({
        rosterId: r.rosterId, teamName: getTeamName(r.owner), username: r.owner?.username ?? '',
      })),
    }
  }

  // The same signals The Edge's briefing is built from. `watchlist` is a
  // browser-only concept (localStorage, Feature 8) and has no meaning on a
  // server, so it is passed empty — it only ever ADDS radar rows, which this
  // tool does not use.
  const signals = computeEdgeSignals({
    league,
    values,
    watchlist: [],
    nflState: snapshot.nflState,
    myRosterId: league.myRoster.rosterId,
  })
  if (!signals) throw new Error('Could not compute league signals — values or roster missing')

  const { myRoster, allRosters } = league

  // The headline candidate, and the move that goes with it.
  const move = signals.sellHigh
    ? suggestSellMove(signals.sellHigh, myRoster, allRosters)
    : null

  // Runners-up, by the SAME rule computeEdgeSignals picks its winner with
  // (a riser above the trend threshold, at a surplus position, worth enough to
  // be worth a phone call) — so the list and the headline cannot disagree.
  // Re-stated here rather than exported from edgeBriefing because that module
  // returns only the top one; the thresholds are its documented constants.
  const alternatives = myRoster.players
    .filter(p =>
      (p.trend30Day ?? 0) > TREND_THRESHOLD &&
      (p.value ?? 0) >= MIN_TARGET_VALUE &&
      signals.mySurpluses.includes(p.position) &&
      String(p.sleeperId) !== String(signals.sellHigh?.sleeperId ?? '')
    )
    .sort((a, b) => b.trend30Day - a.trend30Day)
    .slice(0, MAX_ALTERNATIVES)
    .map(playerRow)

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
      winWindow: signals.myTier,
      valueRank: signals.valueRank,
      teamTrend: signals.teamTrend,
    },
    // What the sell/buy logic is reasoning FROM. Without these the
    // recommendation is unfalsifiable: "sell Jones" means nothing until you
    // know the app thinks you are deep at his position.
    positions: {
      surpluses: signals.mySurpluses,
      deficits: signals.myDeficits,
    },
    sellHigh: signals.sellHigh
      ? {
        player: playerRow(signals.sellHigh),
        reason:
          `Up ${signals.sellHigh.trend30Day} over 30 days at ${signals.sellHigh.position}, ` +
          'a position you are above league average in — so the depth behind him absorbs the loss.',
        move: move
          ? {
            partnerRosterId: move.opponentRosterId,
            partnerName: move.partnerName,
            // null when nobody holds a comparable-value player at one of my
            // deficit positions. The tool says "shop him to X" then, and says
            // WHY there is no named return, rather than inventing one.
            returnPlayer: move.get?.length ? playerRow(move.get[0]) : null,
            fillsDeficit: move.deficitPos,
            startsForThem: move.startsForThem,
            summary: move.summary,
          }
          : null,
      }
      : null,
    alternatives,
    // The other side of the same market read: computeEdgeSignals already found
    // the best falling player at a position I am SHORT of, which is what you
    // spend the sale on.
    buyLow: signals.buyLow
      ? {
        player: playerRow(signals.buyLow),
        ownerRosterId: signals.buyLow.ownerRoster?.rosterId ?? null,
        ownerTeam: signals.buyLow.ownerRoster ? getTeamName(signals.buyLow.ownerRoster.owner) : null,
        ownerWinWindow: signals.buyLow.ownerTier ?? null,
        reason:
          `Down ${Math.abs(signals.buyLow.trend30Day)} over 30 days at ${signals.buyLow.position}, ` +
          `one of your deficit positions` +
          (signals.buyLow.ownerTier === 'Rebuilding'
            ? ' — and a rebuilding owner is the likeliest to move him.'
            : '.'),
      }
      : null,
    underperformer: signals.underperformer
      ? {
        rosterId: signals.underperformer.rosterId,
        teamName: getTeamName(signals.underperformer.owner),
        totalValue: signals.underperformer.totalValue,
        record: signals.underperformer.hasRecord ? signals.underperformer.record : null,
        reason: 'Their roster value runs well ahead of their record — a frustrated owner is a buy window.',
      }
      : null,
    notes: buildNotes(snapshot, signals),
  }
}

function buildNotes(snapshot, signals) {
  const notes = []
  if (snapshot.asOf.stale) {
    notes.push('At least one source failed to refresh, so this is cached data — see asOf.sources.')
  }
  if (!signals.sellHigh) {
    notes.push(
      signals.mySurpluses.length
        ? `No player on your roster is up more than ${TREND_THRESHOLD} over 30 days at a surplus position ` +
          `(${signals.mySurpluses.join(', ')}) and worth at least ${MIN_TARGET_VALUE}. There is no sell-high right now — that is the answer, not a gap in the data.`
        : 'You are not above league average at any position, so there is no surplus to sell from.'
    )
  }
  if (!signals.buyLow) {
    notes.push(
      signals.myDeficits.length
        ? `No opponent holds a falling player at your deficit positions (${signals.myDeficits.join(', ')}) worth at least ${MIN_TARGET_VALUE}.`
        : 'You are at or above league average everywhere, so no position is flagged as a deficit to buy into.'
    )
  }
  if (!signals.anyRecords) {
    notes.push('No games have been played yet, so no team can be flagged as underperforming its roster.')
  }
  notes.push(
    'This is roster logic — whether the other manager would ACCEPT is not modelled. ' +
    'Per-manager behavioural profiling was tested on this league\'s full trade corpus and disconfirmed.'
  )
  notes.push('Sleeper\'s API is read-only: you still have to send the offer in the Sleeper app.')
  return notes
}

const num = n => (n == null ? '—' : n.toLocaleString('en-US'))

export function renderSellHighText(a) {
  if (!a.ok) {
    const list = a.candidates?.length
      ? '\n' + a.candidates.map(c => `  ${c.rosterId}. ${c.teamName} (@${c.username})`).join('\n')
      : ''
    return `${a.error}${list}`
  }
  const L = []
  L.push(`${a.team.teamName} — sell-high scan`)
  L.push(`${a.league.name ?? 'League'} · ${a.team.winWindow} · #${a.team.valueRank} of ${a.league.teams} by value`)
  L.push(`As of ${a.asOf.oldestSourceAt ?? 'unknown'}${a.asOf.stale ? ' — STALE, a source failed to refresh' : ''}`)
  L.push('')
  L.push(`Surplus: ${a.positions.surpluses.join(', ') || 'none'} · Deficit: ${a.positions.deficits.join(', ') || 'none'}`)
  L.push('')

  if (a.sellHigh) {
    const p = a.sellHigh.player
    L.push(`SELL HIGH — ${p.name} (${p.position}${p.nflTeam ? ` · ${p.nflTeam}` : ''})`)
    L.push(`  ${num(p.value)}${p.positionRank ? ` · ${p.position}${p.positionRank}` : ''} · 30d ↑${p.trend30Day}`)
    L.push(`  ${a.sellHigh.reason}`)
    if (a.sellHigh.move) {
      const m = a.sellHigh.move
      L.push(`  → ${m.summary}`)
      if (m.returnPlayer) {
        L.push(`    Return: ${m.returnPlayer.name} (${m.returnPlayer.position}) — ${num(m.returnPlayer.value)}, fills your ${m.fillsDeficit}`)
      }
      L.push(`    ${m.startsForThem ? 'He would start for them' : 'He would not crack their starting lineup'}`)
    }
    L.push('')
  }
  if (a.alternatives.length) {
    L.push(`OTHER RISERS AT A SURPLUS POSITION (${a.alternatives.length})`)
    a.alternatives.forEach(p => L.push(`  ${p.position.padEnd(3)} ${p.name} — ${num(p.value)} · 30d ↑${p.trend30Day}`))
    L.push('')
  }
  if (a.buyLow) {
    const p = a.buyLow.player
    L.push(`SPEND IT ON — ${p.name} (${p.position}) · ${num(p.value)} · 30d ↓${Math.abs(p.trend30Day)}`)
    L.push(`  Held by ${a.buyLow.ownerTeam ?? 'a free agent'}${a.buyLow.ownerWinWindow ? ` (${a.buyLow.ownerWinWindow})` : ''}`)
    L.push(`  ${a.buyLow.reason}`)
    L.push('')
  }
  if (a.underperformer) {
    const u = a.underperformer
    L.push(`CALL THEM — ${u.teamName}${u.record ? ` (${u.record.wins}-${u.record.losses})` : ''} · ${num(u.totalValue)}`)
    L.push(`  ${u.reason}`)
    L.push('')
  }
  a.notes.forEach(n => L.push(`Note: ${n}`))
  return L.join('\n').trimEnd()
}
