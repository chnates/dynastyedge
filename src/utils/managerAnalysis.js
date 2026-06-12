import { findPickValue } from './pickCapital'

// Manager scouting analysis: turns multi-season league history (trades,
// waivers, drafts) into per-manager behavioral profiles — trade scorecards,
// asset tendencies, FAAB efficiency, and rookie-draft grades — plus
// self-coaching insights for my own report card.
//
// Valuation lens: everything is graded at TODAY'S FantasyCalc prices
// (hindsight grading — did the move age well?). Traded picks whose draft has
// since happened resolve to the actual player drafted at that slot, valued
// at today's price. Unresolved (future) picks use today's market value of
// the pick. FAAB dollars are tracked but count 0 toward trade value, same
// convention as League › Activity.

const ROUND_LABELS = ['', '1st', '2nd', '3rd', '4th', '5th']
const TRADE_EDGE = 0.05        // net beyond ±5% of trade size = win / loss
const STARTUP_ROUNDS = 6       // drafts longer than this are startup drafts
const DRAFT_HIT_VALUE = 1000   // a drafted player worth this today is a "hit"
export const STEAL_DELTA = 5   // slots beaten (pick no. vs class value rank)

// ── Season normalization ─────────────────────────────────────────────────────

// Each season → { season, ownerByRoster, userById, transactions, drafts,
// rosterSettingsByOwner }. Owner IDs are the stable cross-season identity;
// roster IDs are only meaningful within their own season.
function normalizeSeasons(history, currentLeague) {
  const seasons = []

  const currentOwnerByRoster = {}
  const currentRecordByOwner = {}
  currentLeague.allRosters.forEach(r => {
    const ownerId = r.owner?.user_id
    if (!ownerId) return
    currentOwnerByRoster[r.rosterId] = ownerId
    currentRecordByOwner[ownerId] = r.record
  })

  seasons.push({
    season: currentLeague.season,
    ownerByRoster: currentOwnerByRoster,
    userById: Object.fromEntries(
      currentLeague.allRosters
        .filter(r => r.owner)
        .map(r => [r.owner.user_id, r.owner])
    ),
    transactions: currentLeague.transactions ?? [],
    drafts: history?.currentDrafts ?? [],
    recordByOwner: currentRecordByOwner,
  })

  ;(history?.pastSeasons ?? []).forEach(ps => {
    const ownerByRoster = {}
    const recordByOwner = {}
    ps.rosters.forEach(r => {
      if (!r.owner_id) return
      ownerByRoster[r.roster_id] = r.owner_id
      const s = r.settings ?? {}
      recordByOwner[r.owner_id] = {
        wins: s.wins ?? 0,
        losses: s.losses ?? 0,
        ties: s.ties ?? 0,
      }
    })
    seasons.push({
      season: ps.season,
      ownerByRoster,
      userById: Object.fromEntries(ps.users.map(u => [u.user_id, u])),
      transactions: ps.transactions,
      drafts: ps.drafts,
      recordByOwner,
    })
  })

  return seasons   // newest → oldest
}

// ── Pick resolution ──────────────────────────────────────────────────────────

// "season-round-originalRosterId" → the player actually drafted at that slot.
// The draft order is defined in the league that hosted the draft, which is
// exactly the season the traded pick references. Built directly from the
// pick list (no dependency on declared round counts); the slot → roster map
// falls back to draft_order (user → slot) joined with that season's
// user → roster mapping when Sleeper omits slot_to_roster_id, which is
// common on older drafts.
function buildPickIndex(seasons) {
  const idx = {}
  seasons.forEach(s => {
    const ownerToRoster = {}
    Object.entries(s.ownerByRoster).forEach(([rid, oid]) => { ownerToRoster[oid] = rid })

    s.drafts.forEach(({ draft, picks }) => {
      if (!picks?.length) return

      let slotToRoster = draft?.slot_to_roster_id
      if (!slotToRoster || Object.keys(slotToRoster).length === 0) {
        slotToRoster = {}
        Object.entries(draft?.draft_order ?? {}).forEach(([userId, slot]) => {
          const rid = ownerToRoster[userId]
          if (rid != null) slotToRoster[slot] = rid
        })
      }
      if (Object.keys(slotToRoster).length === 0) {
        console.warn(`managerAnalysis: no draft order for ${draft?.season} draft — its picks can't resolve to players`)
        return
      }

      picks.forEach(p => {
        if (!p?.player_id || p.draft_slot == null || p.round == null) return
        const originalRoster = slotToRoster[p.draft_slot]
        if (originalRoster == null) return
        idx[`${draft.season}-${p.round}-${originalRoster}`] = {
          playerId: String(p.player_id),
          overall: p.pick_no,
          slotLabel: `${p.round}.${String(p.draft_slot).padStart(2, '0')}`,
        }
      })
    })
  })
  return idx
}

// ── Asset resolution (today's prices) ────────────────────────────────────────

// Median value per round across every pick FantasyCalc currently lists,
// season-agnostic. FantasyCalc only prices FUTURE drafts, so a past-season
// pick that can't be resolved to its drafted player would otherwise value at
// 0 and badly skew trade grades — "a 2nd is a 2nd" is a far better estimate.
function buildGenericRoundValues(pickEntries) {
  const byRound = {}
  for (let round = 1; round < ROUND_LABELS.length; round++) {
    const suffix = ROUND_LABELS[round]
    const matches = (pickEntries ?? [])
      .filter(e => e.name.includes(suffix))
      .sort((a, b) => a.value - b.value)
    byRound[round] = matches.length
      ? matches[Math.floor(matches.length / 2)].value
      : 0
  }
  return byRound
}

function makeResolvers(playerMap, playerDB, pickEntries, pickIndex) {
  const genericRoundValues = buildGenericRoundValues(pickEntries)
  function playerAsset(pid) {
    const id = String(pid)
    const fc = playerMap[id]
    const meta = playerDB?.[id]
    return {
      type: 'player',
      id,
      label: fc?.name ?? meta?.name ?? `Player #${id}`,
      position: fc?.position ?? meta?.position ?? null,
      age: fc?.age ?? meta?.age ?? null,
      value: fc?.value ?? 0,
      ranked: !!fc,
      player: fc ?? null,
    }
  }

  function pickAsset(pk) {
    const season = String(pk.season)
    const roundLabel = ROUND_LABELS[pk.round] ?? `R${pk.round}`
    const pickKey = `${season}-${pk.round}-${pk.roster_id}`
    const resolved = pickIndex[pickKey]
    if (resolved) {
      const became = playerAsset(resolved.playerId)
      return {
        type: 'pick',
        resolved: true,
        pickKey,
        label: `${season} ${roundLabel} → ${became.label}`,
        position: became.position,
        age: null,
        value: became.value,
        player: became.player,
      }
    }
    // Unresolved: FantasyCalc's market price for that exact pick (future
    // drafts), else the generic round value (past drafts FantasyCalc no
    // longer lists) — never 0 just because a draft year has passed.
    const market = findPickValue({ season, round: pk.round }, pickEntries)
    const value = market > 0 ? market : (genericRoundValues[pk.round] ?? 0)
    return {
      type: 'pick',
      resolved: false,
      approx: market === 0 && value > 0,
      pickKey,
      label: `${season} ${roundLabel}`,
      position: null,
      age: null,
      value,
      player: null,
    }
  }

  return { playerAsset, pickAsset }
}

// ── Trade ledger ─────────────────────────────────────────────────────────────

// Every completed trade, recorded once per participating manager from that
// manager's perspective: what they got, what they gave, net at today's
// prices, and a win/loss/even call.
function buildTradeLedgers(seasons, resolvers) {
  const byOwner = {}

  seasons.forEach(s => {
    s.transactions
      .filter(tx => tx.type === 'trade')
      .forEach(tx => {
        const rosterIds = tx.roster_ids ?? []
        rosterIds.forEach(rid => {
          const ownerId = s.ownerByRoster[rid]
          if (!ownerId) return

          const got = []
          const gave = []
          Object.entries(tx.adds ?? {}).forEach(([pid, r]) => {
            if (r === rid) got.push(resolvers.playerAsset(pid))
          })
          Object.entries(tx.drops ?? {}).forEach(([pid, r]) => {
            if (r === rid) gave.push(resolvers.playerAsset(pid))
          })
          ;(tx.draft_picks ?? []).forEach(pk => {
            if (pk.owner_id === rid) got.push(resolvers.pickAsset(pk))
            else if (pk.previous_owner_id === rid) gave.push(resolvers.pickAsset(pk))
          })
          ;(tx.waiver_budget ?? []).forEach(wb => {
            const faab = { type: 'faab', label: `$${wb.amount} FAAB`, value: 0, player: null }
            if (wb.receiver === rid) got.push(faab)
            if (wb.sender === rid) gave.push(faab)
          })
          if (got.length === 0 && gave.length === 0) return

          const gotValue = got.reduce((sum, a) => sum + a.value, 0)
          const gaveValue = gave.reduce((sum, a) => sum + a.value, 0)
          const net = gotValue - gaveValue
          const size = Math.max(gotValue, gaveValue)
          const result = size > 0 && Math.abs(net) / size > TRADE_EDGE
            ? (net > 0 ? 'win' : 'loss')
            : 'even'

          if (!byOwner[ownerId]) byOwner[ownerId] = []
          byOwner[ownerId].push({
            txId: tx.transaction_id,
            season: s.season,
            week: tx.week,
            date: tx.status_updated ?? null,
            got,
            gave,
            gotValue,
            gaveValue,
            net,
            result,
            partnerOwnerIds: rosterIds
              .filter(r => r !== rid)
              .map(r => s.ownerByRoster[r])
              .filter(Boolean),
          })
        })
      })
  })

  Object.values(byOwner).forEach(ledger =>
    ledger.sort((a, b) => (b.date ?? 0) - (a.date ?? 0))
  )
  return byOwner
}

// ── Waivers / free agency ────────────────────────────────────────────────────

function buildFaabStats(seasons, resolvers) {
  const byOwner = {}
  function entry(ownerId) {
    if (!byOwner[ownerId]) {
      byOwner[ownerId] = { dollars: 0, claims: 0, valueAcquired: 0, faMoves: 0, bids: [] }
    }
    return byOwner[ownerId]
  }

  seasons.forEach(s => {
    s.transactions.forEach(tx => {
      const ownerId = s.ownerByRoster[tx.roster_ids?.[0]]
      if (!ownerId) return
      const adds = Object.keys(tx.adds ?? {})
      if (tx.type === 'waiver' && adds.length > 0) {
        const e = entry(ownerId)
        const bid = tx.settings?.waiver_bid ?? 0
        e.claims += 1
        e.dollars += bid
        if (bid > 0) e.bids.push(bid)
        adds.forEach(pid => { e.valueAcquired += resolvers.playerAsset(pid).value })
      } else if (tx.type === 'free_agent' && adds.length > 0) {
        entry(ownerId).faMoves += 1
      }
    })
  })

  Object.values(byOwner).forEach(e => {
    e.avgBid = e.bids.length ? e.bids.reduce((a, b) => a + b, 0) / e.bids.length : null
    e.valuePer100 = e.dollars > 0 ? Math.round((e.valueAcquired / e.dollars) * 100) : null
    delete e.bids
  })
  return byOwner
}

// ── Rookie draft grading ─────────────────────────────────────────────────────

// Each rookie pick graded by slot vs where the player ranks in their class
// by today's value (delta > 0 = beat the slot). Startup drafts are excluded.
function buildDraftRecords(seasons, resolvers) {
  const byOwner = {}

  seasons.forEach(s => {
    s.drafts.forEach(({ draft, picks }) => {
      if (!picks?.length) return
      if ((draft.settings?.rounds ?? 0) > STARTUP_ROUNDS) return   // startup draft

      const graded = picks
        .filter(p => p?.player_id)
        .map(p => ({ pick: p, asset: resolvers.playerAsset(p.player_id) }))
      const valueOrder = [...graded].sort((a, b) => b.asset.value - a.asset.value)
      const valueRank = new Map(valueOrder.map((g, i) => [g.pick.player_id, i + 1]))

      graded.forEach(({ pick, asset }) => {
        const ownerId = pick.picked_by || s.ownerByRoster[pick.roster_id]
        if (!ownerId) return
        if (!byOwner[ownerId]) byOwner[ownerId] = []
        byOwner[ownerId].push({
          season: String(draft.season),
          overall: pick.pick_no,
          slotLabel: `${pick.round}.${String(pick.draft_slot).padStart(2, '0')}`,
          player: asset,
          delta: pick.pick_no - (valueRank.get(pick.player_id) ?? pick.pick_no),
          hit: asset.value >= DRAFT_HIT_VALUE,
        })
      })
    })
  })

  const result = {}
  Object.entries(byOwner).forEach(([ownerId, rows]) => {
    rows.sort((a, b) => b.season.localeCompare(a.season) || a.overall - b.overall)
    const totalValue = rows.reduce((sum, r) => sum + r.player.value, 0)
    const hits = rows.filter(r => r.hit).length
    const avgDelta = rows.length
      ? rows.reduce((sum, r) => sum + r.delta, 0) / rows.length
      : 0
    const best = [...rows].sort((a, b) => b.delta - a.delta)[0] ?? null
    result[ownerId] = {
      picks: rows,
      count: rows.length,
      totalValue,
      hits,
      avgDelta: Math.round(avgDelta * 10) / 10,
      best: best && best.delta >= STEAL_DELTA ? best : null,
    }
  })
  return result
}

// ── Tendencies ───────────────────────────────────────────────────────────────

function avg(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
}

function buildTendencies(ledger, faab, leagueAvgBid) {
  const labels = []
  let picksGot = 0
  let picksGave = 0
  const agesGot = []
  const agesGave = []
  const posGot = {}

  ;(ledger ?? []).forEach(t => {
    t.got.forEach(a => {
      if (a.type === 'pick') picksGot += 1
      if (a.type === 'player') {
        if (a.age != null) agesGot.push(a.age)
        if (a.position) posGot[a.position] = (posGot[a.position] ?? 0) + 1
      }
    })
    t.gave.forEach(a => {
      if (a.type === 'pick') picksGave += 1
      if (a.type === 'player' && a.age != null) agesGave.push(a.age)
    })
  })

  if (picksGot - picksGave >= 2) labels.push('Accumulates picks')
  else if (picksGave - picksGot >= 2) labels.push('Ships picks out')

  const ageGot = avg(agesGot)
  const ageGave = avg(agesGave)
  if (ageGot != null && ageGave != null && agesGot.length >= 2 && agesGave.length >= 2) {
    if (ageGave - ageGot >= 1.5) labels.push('Buys youth')
    else if (ageGot - ageGave >= 1.5) labels.push('Buys veterans')
  }

  const topPos = Object.entries(posGot).sort((a, b) => b[1] - a[1])[0]
  if (topPos && topPos[1] >= 3) labels.push(`Chases ${topPos[0]}s`)

  if (faab?.avgBid != null && leagueAvgBid != null && leagueAvgBid > 0) {
    if (faab.avgBid >= leagueAvgBid * 1.5) labels.push('Aggressive bidder')
    else if (faab.avgBid <= leagueAvgBid * 0.5 && faab.claims >= 3) labels.push('Bargain hunter')
  }

  return { labels: labels.slice(0, 3), picksGot, picksGave, ageGot, ageGave, posGot }
}

function activityLabel(tradeCount, seasonCount) {
  if (tradeCount === 0) return 'No trades yet'
  const rate = tradeCount / Math.max(1, seasonCount)
  if (rate >= 2.5) return 'Active dealer'
  if (rate >= 1) return 'Occasional dealer'
  return 'Rarely trades'
}

// ── My report card insights ──────────────────────────────────────────────────

function rankOf(profiles, ownerId, metric, filterFn = () => true) {
  const pool = profiles.filter(filterFn).sort((a, b) => metric(b) - metric(a))
  const i = pool.findIndex(p => p.ownerId === ownerId)
  return i === -1 ? null : { rank: i + 1, of: pool.length }
}

function fmtNet(net) {
  return `${net >= 0 ? '+' : '−'}${Math.abs(Math.round(net)).toLocaleString()}`
}

export function buildMyInsights(profiles, me) {
  if (!me) return { strengths: [], workOn: [] }
  const strengths = []
  const workOn = []

  // Dealmaking — net value at today's prices
  if (me.tradeCount > 0) {
    const r = rankOf(profiles, me.ownerId, p => p.netValue, p => p.tradeCount > 0)
    if (r && me.netValue > 0 && r.rank <= 3) {
      strengths.push(`Your trades are up ${fmtNet(me.netValue)} at today's values — #${r.rank} dealmaker of ${r.of} who've traded.`)
    } else if (me.netValue < -500) {
      workOn.push(`Your trades are down ${fmtNet(me.netValue)} at today's values — get a second look before accepting.`)
    }

    const winRate = me.tradeWins / me.tradeCount
    if (me.tradeCount >= 3) {
      if (winRate >= 0.6) strengths.push(`You've won ${me.tradeWins} of ${me.tradeCount} trades (beat the other side by 5%+).`)
      else if (winRate <= 0.3) workOn.push(`Only ${me.tradeWins} of ${me.tradeCount} trades have gone your way — you may be anchoring on the wrong values.`)
    }

    if (me.biggestLoss && me.biggestLoss.net < -1000) {
      workOn.push(`Worst deal: gave up ${me.biggestLoss.gave.map(a => a.label).join(', ')} (${fmtNet(me.biggestLoss.net)}) — study what went wrong.`)
    }
    if (me.biggestWin && me.biggestWin.net > 1000) {
      strengths.push(`Best deal: landed ${me.biggestWin.got.map(a => a.label).join(', ')} (${fmtNet(me.biggestWin.net)}).`)
    }
  } else {
    workOn.push(`You haven't completed a trade yet — the most active managers are reshaping their rosters around you.`)
  }

  // FAAB efficiency
  if (me.faab.dollars >= 20 && me.faab.valuePer100 != null) {
    const r = rankOf(profiles, me.ownerId, p => p.faab.valuePer100 ?? -1, p => (p.faab.dollars ?? 0) >= 20)
    if (r && r.of >= 3) {
      if (r.rank === 1) strengths.push(`Best FAAB efficiency in the league — ${me.faab.valuePer100.toLocaleString()} value per $100 spent.`)
      else if (r.rank === r.of) workOn.push(`Lowest FAAB efficiency in the league (${me.faab.valuePer100.toLocaleString()} value per $100) — save your dollars for real targets.`)
    }
  }

  // Rookie drafting
  if (me.draft.count >= 3) {
    if (me.draft.avgDelta >= 2) strengths.push(`Your rookie picks beat their draft slot by ${me.draft.avgDelta} spots on average — trust your board.`)
    else if (me.draft.avgDelta <= -2) workOn.push(`Your rookie picks lag their slot by ${Math.abs(me.draft.avgDelta)} spots on average — consider trading picks for proven players.`)
    if (me.draft.hits >= 2) strengths.push(`${me.draft.hits} of your ${me.draft.count} rookie picks are now worth 1,000+.`)
  }

  if (strengths.length === 0) strengths.push('No standout edge yet — your history is still building.')
  if (workOn.length === 0) workOn.push('No glaring leaks in your trade, waiver, or draft history. Stay sharp.')

  return { strengths: strengths.slice(0, 3), workOn: workOn.slice(0, 3) }
}

// ── Main entry ───────────────────────────────────────────────────────────────

export function buildManagerProfiles({ history, currentLeague, playerMap, pickEntries, playerDB, myOwnerId }) {
  const seasons = normalizeSeasons(history, currentLeague)
  const pickIndex = buildPickIndex(seasons)
  const resolvers = makeResolvers(playerMap, playerDB ?? {}, pickEntries ?? [], pickIndex)

  const ledgers = buildTradeLedgers(seasons, resolvers)
  const faabStats = buildFaabStats(seasons, resolvers)
  const draftRecords = buildDraftRecords(seasons, resolvers)

  const allBids = Object.values(faabStats).flatMap(f => (f.avgBid != null ? [f.avgBid] : []))
  const leagueAvgBid = avg(allBids)

  const seasonList = seasons.map(s => s.season)
  const currentSeason = seasonList[0]

  // Profiles for current managers only; departed owners still appear inside
  // ledgers as counterparties (named via that season's users).
  const profiles = currentLeague.allRosters
    .filter(r => r.owner?.user_id)
    .map(r => {
      const ownerId = r.owner.user_id
      const ledger = ledgers[ownerId] ?? []
      const seasonsActive = seasons
        .filter(s => Object.values(s.ownerByRoster).includes(ownerId))
        .map(s => s.season)

      const wins = ledger.filter(t => t.result === 'win').length
      const losses = ledger.filter(t => t.result === 'loss').length
      const netValue = ledger.reduce((sum, t) => sum + t.net, 0)
      const byNet = [...ledger].sort((a, b) => b.net - a.net)
      const faab = faabStats[ownerId] ?? { dollars: 0, claims: 0, valueAcquired: 0, faMoves: 0, avgBid: null, valuePer100: null }
      const tendencies = buildTendencies(ledger, faab, leagueAvgBid)

      const aggRecord = { wins: 0, losses: 0, ties: 0 }
      seasons.forEach(s => {
        const rec = s.recordByOwner[ownerId]
        if (!rec) return
        aggRecord.wins += rec.wins ?? 0
        aggRecord.losses += rec.losses ?? 0
        aggRecord.ties += rec.ties ?? 0
      })

      return {
        ownerId,
        rosterId: r.rosterId,
        user: r.owner,
        isMe: ownerId === myOwnerId,
        seasonsActive,
        record: aggRecord,
        trades: ledger,
        tradeCount: ledger.length,
        tradeWins: wins,
        tradeLosses: losses,
        tradeEvens: ledger.length - wins - losses,
        tradesThisSeason: ledger.filter(t => t.season === currentSeason).length,
        netValue,
        biggestWin: byNet[0]?.net > 0 ? byNet[0] : null,
        biggestLoss: byNet[byNet.length - 1]?.net < 0 ? byNet[byNet.length - 1] : null,
        tendencies: tendencies.labels,
        tendencyDetail: tendencies,
        activity: activityLabel(ledger.length, seasonsActive.length),
        faab,
        draft: draftRecords[ownerId] ?? { picks: [], count: 0, totalValue: 0, hits: 0, avgDelta: 0, best: null },
      }
    })

  // Head-to-head vs me, derived from my own ledger
  const my = profiles.find(p => p.isMe) ?? null
  if (my) {
    const vsMe = {}
    my.trades.forEach(t => {
      t.partnerOwnerIds.forEach(oid => {
        if (!vsMe[oid]) vsMe[oid] = { trades: 0, myNet: 0 }
        vsMe[oid].trades += 1
        vsMe[oid].myNet += t.net
      })
    })
    profiles.forEach(p => { p.vsMe = p.isMe ? null : (vsMe[p.ownerId] ?? null) })
  }

  // Departed-owner names for ledger partner display
  const userNameById = {}
  seasons.forEach(s => {
    Object.values(s.userById ?? {}).forEach(u => {
      if (u?.user_id && !userNameById[u.user_id]) userNameById[u.user_id] = u
    })
  })

  return {
    profiles,
    my,
    seasonList,                     // ['2026', '2025', ...] newest first
    userById: userNameById,
    insights: buildMyInsights(profiles, my),
  }
}
