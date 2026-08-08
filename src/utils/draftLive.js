// The rookie draft's LIVE path, as pure functions.
//
// This logic used to live inline in DraftTracker's useMemos, where nothing
// could reach it: the test suite covers pure utils only (no component or hook
// rendering), so the Tracker's one live moment per year — the on-the-clock
// banner, "N picks until yours", Best Available, the completion recap — had
// never been executed by anything but a real draft. Extracted here so
// tests/draftLive.test.mjs can walk a real past draft pick by pick.
//
// Everything below is a pure function of already-fetched data. Nothing fetches.

// Where the draft stands right now, given the resolved order and the picks
// made so far. `order` comes from buildDraftOrder (useSleeperDraft) and is
// null when Sleeper knows no slot assignment yet.
export function deriveDraftState({ draft, order, picks = [], myRosterId, fallbackRounds = 4, fallbackTeams = 10 }) {
  const orderKnown = order != null
  const teams = draft?.settings?.teams ?? fallbackTeams
  const totalPicks = order?.length ?? (draft?.settings?.rounds ?? fallbackRounds) * teams

  const sortedPicks = [...picks].sort((a, b) => a.pick_no - b.pick_no)
  const draftedIds = new Set(sortedPicks.map(p => String(p.player_id)))
  const made = sortedPicks.length

  // Sleeper flips `status` to 'complete' itself, but a board that has taken
  // every pick is complete whether or not that flag has landed yet.
  const isComplete = draft?.status === 'complete' || (totalPicks > 0 && made >= totalPicks)
  const isLive = draft?.status === 'drafting' || draft?.status === 'paused'

  // The next pick is simply the order slot after the ones already used.
  const nextPick = !isComplete && orderKnown ? order[made] ?? null : null
  const isOnClock = isLive && nextPick?.rosterId === myRosterId

  const myUpcoming = orderKnown
    ? order.slice(made).filter(p => p.rosterId === myRosterId)
    : []
  // How many OTHER teams pick before me. 0 = I'm on the clock next.
  const picksUntilMine = myUpcoming.length > 0 ? myUpcoming[0].overall - made - 1 : null

  return {
    orderKnown, teams, totalPicks, sortedPicks, draftedIds,
    picksMade: made, isComplete, isLive, nextPick, isOnClock,
    myUpcoming, picksUntilMine,
  }
}

// Best Available, shown only while I'm on the clock: the top undrafted
// prospect overall, then the top one at each position I'm below league
// average in. Ranked by My Board when the user has one, else derived rookie ADP.
export function buildBestAvailable({ isOnClock, prospects = [], draftedIds, boardRankMap, needPositions = [] }) {
  if (!isOnClock) return []
  const drafted = draftedIds ?? new Set()
  const avail = prospects.filter(p => !drafted.has(p.sleeperId))
  const rankOf = boardRankMap
    ? p => boardRankMap[p.sleeperId] ?? 9999
    : p => p.adp ?? 9999
  const sorted = [...avail].sort((a, b) => rankOf(a) - rankOf(b))

  const rows = []
  if (sorted[0]) rows.push({ tag: 'Best overall', player: sorted[0] })
  needPositions.forEach(pos => {
    const top = sorted.find(p =>
      p.position === pos && !rows.some(r => r.player.sleeperId === p.sleeperId)
    )
    if (top) rows.push({ tag: `Top ${pos} · need`, player: top })
  })
  return rows
}

// My pick capital for this draft: order-driven (real slots) when the order is
// known, else the roster's round-level picks. `used` marks picks already spent.
export function buildMyCapital({ order, orderKnown, leaguePicks = [], picksMade = 0, myRosterId }) {
  if (orderKnown && order) {
    return order
      .filter(p => p.rosterId === myRosterId)
      .map(p => ({
        key: p.label,
        label: p.label,
        used: p.overall <= picksMade,
        value: leaguePicks.find(lp =>
          lp.round === p.round && lp.originalOwner === p.originalRosterId
        )?.value ?? 0,
      }))
  }
  return leaguePicks.map(p => ({
    key: `${p.round}-${p.originalOwner}`,
    label: `Rd ${p.round}`,
    used: false,
    value: p.value ?? 0,
  }))
}

// Post-draft recap: per-team value drafted, plus the biggest steals and
// reaches measured as pick slot vs the player's derived rookie ADP.
// delta > 0 = fell past his ADP (a steal); delta < 0 = taken early (a reach).
export function buildRecap({ isComplete, sortedPicks = [], resolvePick, adpById = {} }) {
  if (!isComplete) return null
  const totals = {}
  const entries = sortedPicks.map(pick => {
    const player = resolvePick(pick)
    const adp = adpById[String(pick.player_id)] ?? null
    const delta = adp != null ? pick.pick_no - adp : null
    if (!totals[pick.roster_id]) totals[pick.roster_id] = { rosterId: pick.roster_id, total: 0, count: 0 }
    totals[pick.roster_id].total += player.value ?? 0
    totals[pick.roster_id].count += 1
    return { pick, player, delta }
  })
  const withDelta = entries.filter(e => e.delta != null)
  return {
    entries,
    teamTotals: Object.values(totals).sort((a, b) => b.total - a.total),
    steals: [...withDelta].sort((a, b) => b.delta - a.delta).filter(e => e.delta >= 2).slice(0, 3),
    reaches: [...withDelta].sort((a, b) => a.delta - b.delta).filter(e => e.delta <= -2).slice(0, 3),
  }
}
