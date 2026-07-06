// run-model.mjs — THE model harness. Runs DynastyEdge's pure analysis models
// (simulatePlayoffs, buildRosterTrajectory, analyzeTrade) outside the browser,
// on either a deterministic synthetic fixture (offline) or live API data.
//
// USAGE (the --import loader hook is MANDATORY — src/utils use extensionless
// relative imports that plain node cannot resolve):
//
//   SKILL=/home/user/dynastyedge/.claude/skills/dynastyedge-diagnostics-and-tooling
//   node --import $SKILL/scripts/reg.mjs $SKILL/scripts/run-model.mjs --fixture   # offline, deterministic
//   node --import $SKILL/scripts/reg.mjs $SKILL/scripts/run-model.mjs --live      # NETWORK REQUIRED
//
// --fixture: builds a synthetic 10-team league in-script (seeded PRNG, so the
//   output is byte-identical run to run) and verifies:
//     · playoff % across teams sums to exactly playoff_teams (6)
//     · fixed-seed determinism (two runs → identical results)
//     · trajectory series shape (4 seasons, per-position sub-series)
//     · analyzeTrade + getTradeVerdict produce a verdict on a sample trade
// --live: same models on real Sleeper + FantasyCalc data (graceful failure
//   when the network is blocked).
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../../..')
const UTILS = p => path.join(REPO_ROOT, 'src/utils', p)

const mode = process.argv.includes('--live') ? 'live'
  : process.argv.includes('--fixture') ? 'fixture' : null
if (!mode) {
  console.error('Usage: node --import <scripts>/reg.mjs run-model.mjs --fixture | --live')
  process.exit(2)
}

// ── Load the pure utils (fails loudly if the loader hook isn't registered) ──
let playoffOdds, trajectory, tradeAnalysis
try {
  playoffOdds = await import(UTILS('playoffOdds.js'))
  trajectory = await import(UTILS('dynastyTrajectory.js'))
  tradeAnalysis = await import(UTILS('tradeAnalysis.js'))
} catch (err) {
  console.error('FAILED to import src/utils modules:', err.message)
  console.error('Most likely cause: the resolver hook is not registered.')
  console.error('Re-run with:  node --import ' + path.join(SCRIPT_DIR, 'reg.mjs') + ' ' + process.argv[1] + ' --' + mode)
  process.exit(1)
}
const { buildScoringModel, simulatePlayoffs, buildStrengthPreview, getDeadlineVerdict } = playoffOdds
const { buildAgeCurves, buildRosterTrajectory, getTrajectoryVerdict, getTrajectoryRead, TRAJECTORY_HORIZON } = trajectory
const { analyzeTrade, getTradeVerdict } = tradeAnalysis

const fmt = n => Math.round(n).toLocaleString('en-US')
const pct = p => (p * 100).toFixed(1) + '%'

// ═════════════════════════════ FIXTURE MODE ═════════════════════════════════
function buildFixture() {
  // Seeded PRNG (mulberry32 — same algorithm the sim itself uses) so the
  // fixture is identical on every run. NEVER use Math.random here.
  let seed = 0xd15ea5e
  const rng = () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  // Rough dynasty-market value-by-age shape per position (peaks early for RB,
  // late for QB) — only used to synthesize a plausible market pool.
  const shape = (pos, age) => {
    const peak = { QB: 27, RB: 24, WR: 26, TE: 27 }[pos]
    const fall = { QB: 9, RB: 4.5, WR: 6, TE: 6 }[pos]
    return Math.exp(-((age - peak) ** 2) / (2 * fall * fall))
  }

  // Market pool for buildAgeCurves: ~400 priced players across positions/ages.
  const playerMap = {}
  let nextId = 1000
  const POS_COUNTS = { QB: 70, RB: 110, WR: 140, TE: 80 }
  for (const [pos, count] of Object.entries(POS_COUNTS)) {
    for (let i = 0; i < count; i++) {
      const age = 21 + Math.floor(rng() * 15) // 21..35
      const tier = rng() ** 2                 // most players are cheap
      const value = Math.round(400 + 9000 * tier * shape(pos, age) * (0.7 + 0.6 * rng()))
      const id = String(nextId++)
      playerMap[id] = { sleeperId: id, name: `${pos}_${id}`, position: pos, age, value }
    }
  }

  // 10 rosters with a strength gradient. Team i strength factor 1.30 → 0.70.
  const rosters = []
  for (let i = 0; i < 10; i++) {
    const strength = 1.3 - 0.06667 * i
    const players = []
    const compo = [['QB', 2], ['RB', 5], ['WR', 5], ['TE', 3]]
    for (const [pos, n] of compo) {
      for (let k = 0; k < n; k++) {
        const age = 22 + Math.floor(rng() * 10)
        const depth = k === 0 ? 1 : 0.45 / k
        const value = Math.round(1200 * strength * depth * (2 + 4 * rng()) * shape(pos, age))
        players.push({
          sleeperId: `t${i + 1}p${players.length}`, name: `${pos}_t${i + 1}_${k}`,
          position: pos, age, value, isIR: false, isTaxi: false, type: 'player',
        })
      }
    }
    const picks = [
      { season: '2027', round: 1, originalOwner: i + 1, value: Math.round(2000 + 2000 * rng()) },
      { season: '2028', round: 2, originalOwner: i + 1, value: Math.round(600 + 600 * rng()) },
    ]
    const totalValue = players.reduce((s, p) => s + p.value, 0) + picks.reduce((s, p) => s + p.value, 0)
    const starters = [...players].sort((a, b) => b.value - a.value).slice(0, 10)
    rosters.push({
      rosterId: i + 1, owner: `Team ${i + 1}`, players, picks, totalValue,
      avgStarterAge: starters.reduce((s, p) => s + p.age, 0) / starters.length,
      pickCapitalScore: picks.reduce((s, p) => s + p.value, 0),
    })
  }

  // Round-robin schedule, 14 weeks (9-week single round robin + weeks 1–5
  // again). Weeks 1–5 are "completed" with scores drawn from each team's
  // strength; weeks 6–14 remain to be simulated.
  const ids = rosters.map(r => r.rosterId)
  const weeks = []
  const rot = ids.slice(1)
  for (let w = 0; w < 9; w++) {
    const order = [ids[0], ...rot]
    const matchups = []
    for (let k = 0; k < 5; k++) matchups.push([order[k], order[9 - k]])
    weeks.push({ week: w + 1, matchups })
    rot.push(rot.shift())
  }
  for (let w = 9; w < 14; w++) weeks.push({ week: w + 1, matchups: weeks[w - 9].matchups })

  const completedScores = Object.fromEntries(ids.map(id => [id, []]))
  const records = Object.fromEntries(ids.map(id => [id, { wins: 0, losses: 0, ties: 0 }]))
  for (const wk of weeks.slice(0, 5)) {
    for (const [a, b] of wk.matchups) {
      const score = id => {
        const strength = 1.3 - 0.06667 * (id - 1)
        return Math.round(10 * (115 * (1 + 0.4 * (strength - 1)) + 48 * (rng() - 0.5))) / 10
      }
      const sa = score(a), sb = score(b)
      completedScores[a].push(sa); completedScores[b].push(sb)
      if (sa > sb) { records[a].wins++; records[b].losses++ }
      else if (sb > sa) { records[b].wins++; records[a].losses++ }
      else { records[a].ties++; records[b].ties++ }
    }
  }
  rosters.forEach(r => {
    r.record = records[r.rosterId]
    r.pointsFor = completedScores[r.rosterId].reduce((s, v) => s + v, 0)
  })

  return { playerMap, rosters, remainingSchedule: weeks.slice(5), completedScores, playoffTeams: 6 }
}

// ═════════════════════════════ LIVE MODE ════════════════════════════════════
async function buildLive() {
  const c = await import(path.join(REPO_ROOT, 'src/constants.js'))
  const getJSON = async url => {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`)
    return res.json()
  }
  const fcUrl = `${c.FANTASYCALC_BASE}/values/current?isDynasty=true&numQbs=2&numTeams=10&ppr=0.5`
  const [league, sleeperRosters, users, state, fc] = await Promise.all([
    getJSON(`${c.SLEEPER_BASE}/league/${c.LEAGUE_ID}`),
    getJSON(`${c.SLEEPER_BASE}/league/${c.LEAGUE_ID}/rosters`),
    getJSON(`${c.SLEEPER_BASE}/league/${c.LEAGUE_ID}/users`),
    getJSON(`${c.SLEEPER_BASE}/state/nfl`),
    getJSON(fcUrl),
  ])
  const playerMap = {}
  fc.forEach(e => {
    if (e.player?.sleeperId != null) {
      playerMap[String(e.player.sleeperId)] = {
        sleeperId: String(e.player.sleeperId), name: e.player.name,
        position: e.player.position, age: e.player.maybeAge, value: e.value,
      }
    }
  })
  const userById = new Map(users.map(u => [u.user_id, u]))
  const rosters = sleeperRosters.map(r => {
    const ir = new Set((r.reserve ?? []).map(String))
    const taxi = new Set((r.taxi ?? []).map(String))
    const players = (r.players ?? []).map(id => {
      const p = playerMap[String(id)]
      return {
        sleeperId: String(id), name: p?.name ?? `#${id}`, position: p?.position ?? null,
        age: p?.age ?? null, value: p?.value ?? 0, unranked: !p,
        isIR: ir.has(String(id)), isTaxi: taxi.has(String(id)), type: 'player',
      }
    })
    const starters = players.filter(p => !p.isIR && !p.isTaxi && p.value > 0)
      .sort((a, b) => b.value - a.value).slice(0, 10)
    const ages = starters.map(p => p.age).filter(a => a != null)
    return {
      rosterId: r.roster_id,
      owner: userById.get(r.owner_id)?.display_name ?? `roster ${r.roster_id}`,
      players, picks: [], // live pick resolution needs traded_picks plumbing — omitted; player-only totals
      totalValue: players.reduce((s, p) => s + p.value, 0),
      avgStarterAge: ages.length ? ages.reduce((s, a) => s + a, 0) / ages.length : null,
      pickCapitalScore: 0,
      record: { wins: r.settings?.wins ?? 0, losses: r.settings?.losses ?? 0, ties: r.settings?.ties ?? 0 },
      pointsFor: r.settings?.fpts ?? 0,
    }
  })

  // Schedule + completed scores, only meaningful in the regular season.
  let remainingSchedule = [], completedScores = {}
  if (state.season_type === 'regular') {
    const lastRegWeek = (league.settings?.playoff_week_start ?? 15) - 1
    const weeks = await Promise.all(
      Array.from({ length: lastRegWeek }, (_, i) =>
        getJSON(`${c.SLEEPER_BASE}/league/${c.LEAGUE_ID}/matchups/${i + 1}`).catch(() => []))
    )
    completedScores = Object.fromEntries(rosters.map(r => [r.rosterId, []]))
    weeks.forEach((wk, i) => {
      if (!wk.length) return
      const byMatch = new Map()
      wk.forEach(m => {
        if (!byMatch.has(m.matchup_id)) byMatch.set(m.matchup_id, [])
        byMatch.get(m.matchup_id).push(m)
      })
      const complete = wk.every(m => (m.points ?? 0) > 0)
      if (complete) wk.forEach(m => completedScores[m.roster_id]?.push(m.points))
      else remainingSchedule.push({
        week: i + 1,
        matchups: [...byMatch.values()].filter(p => p.length === 2).map(p => [p[0].roster_id, p[1].roster_id]),
      })
    })
  }
  return {
    playerMap, rosters, remainingSchedule, completedScores,
    playoffTeams: league.settings?.playoff_teams ?? 6,
    live: true, seasonType: state.season_type, season: state.season,
  }
}

// ═════════════════════════════ RUN ══════════════════════════════════════════
let fx
if (mode === 'fixture') {
  fx = buildFixture()
  console.log('=== run-model --fixture (synthetic 10-team league, deterministic) ===\n')
} else {
  try { fx = await buildLive() } catch (err) {
    console.error('NETWORK FAILURE — could not fetch live data.')
    console.error(`  ${err.message}`)
    console.error('--live requires outbound HTTPS to api.sleeper.app + api.fantasycalc.com.')
    console.error('Sandboxed sessions typically get proxy 403s — use --fixture offline instead.')
    process.exit(1)
  }
  console.log(`=== run-model --live (${fx.season} · season_type=${fx.seasonType}) ===\n`)
}

// 1 ── Playoff simulation ------------------------------------------------------
console.log(`-- simulatePlayoffs (${fx.remainingSchedule.length} remaining weeks, playoffTeams=${fx.playoffTeams}) --`)
if (!fx.remainingSchedule.length && mode === 'live') {
  console.log('No remaining schedule (offseason) — buildStrengthPreview fallback:')
  buildStrengthPreview(fx.rosters, fx.playoffTeams)
    .forEach(r => console.log(`  seed ${String(r.projSeed).padStart(2)}  ${r.owner.padEnd(20)} strength ${fmt(r.strength)} ${r.projectedIn ? '· projected IN' : ''}`))
} else {
  const model = buildScoringModel(fx.rosters, fx.completedScores)
  const args = { allRosters: fx.rosters, model, remainingSchedule: fx.remainingSchedule, playoffTeams: fx.playoffTeams }
  const run1 = simulatePlayoffs(args)
  const run2 = simulatePlayoffs(args)

  const deterministic = JSON.stringify(run1) === JSON.stringify(run2)
  const oddsSum = run1.reduce((s, r) => s + r.playoffPct, 0)
  const sumOk = Math.abs(oddsSum - fx.playoffTeams) < 1e-9

  console.log('team                    record  playoff%  top-seed%  avgSeed  projRecord')
  ;[...run1].sort((a, b) => b.playoffPct - a.playoffPct).forEach(r => {
    const ro = fx.rosters.find(x => x.rosterId === r.rosterId)
    console.log(
      `${(ro.owner ?? '').padEnd(22)}  ${`${ro.record.wins}-${ro.record.losses}`.padEnd(6)}  `
      + `${pct(r.playoffPct).padStart(7)}  ${pct(r.topSeedPct).padStart(8)}  ${r.avgSeed.toFixed(2).padStart(7)}  `
      + `${r.projWins.toFixed(1)}-${r.projLosses.toFixed(1)}`)
  })
  console.log(`\nCHECK sum(playoffPct) = ${oddsSum.toFixed(6)} (expect ${fx.playoffTeams}): ${sumOk ? 'PASS' : '*** FAIL ***'}`)
  console.log(`CHECK fixed-seed determinism (two runs identical): ${deterministic ? 'PASS' : '*** FAIL ***'}`)
  const my = run1.find(r => r.rosterId === (mode === 'live' ? 6 : 6))
  if (my) {
    const dv = getDeadlineVerdict(my.playoffPct, 'Middle')
    console.log(`Roster 6 deadline verdict: ${dv.stance} — ${dv.text}`)
  }
  if (!sumOk || !deterministic) process.exitCode = 1
}

// 2 ── Dynasty trajectory ------------------------------------------------------
console.log('\n-- buildRosterTrajectory (roster 6, horizon +' + TRAJECTORY_HORIZON + ') --')
{
  const { curves, generic } = buildAgeCurves(fx.playerMap)
  const seasonYear = mode === 'live' ? Number(fx.season) : 2026
  const roster = fx.rosters.find(r => r.rosterId === 6)
  const traj = buildRosterTrajectory(roster, seasonYear, curves, generic)
  console.log(`seasons:     ${traj.seasons.join('  ')}`)
  console.log(`totalByYear: ${traj.totalByYear.map(fmt).join('  ')}`)
  console.log(`players:     ${traj.playerByYear.map(fmt).join('  ')}`)
  console.log(`picks:       ${traj.pickByYear.map(fmt).join('  ')}`)
  Object.entries(traj.byPosition).forEach(([pos, s]) => console.log(`  ${pos}: ${s.map(fmt).join('  ')}`))
  const shapeOk = traj.seasons.length === TRAJECTORY_HORIZON + 1
    && traj.totalByYear.length === TRAJECTORY_HORIZON + 1
    && Object.keys(traj.byPosition).length === 4
    && traj.totalByYear.every((v, i) => v === traj.playerByYear[i] + traj.pickByYear[i])
  console.log(`CHECK series shape (4 seasons, 4 position rows, totals = players+picks): ${shapeOk ? 'PASS' : '*** FAIL ***'}`)
  if (!shapeOk) process.exitCode = 1
  const verdict = getTrajectoryVerdict(traj)
  const read = getTrajectoryRead(traj)
  console.log(`verdict: [${verdict.tone}] peak ${verdict.peakSeason} — ${verdict.headline}`)
  console.log(`read:    ${read?.label ?? 'null'}`)
}

// 3 ── Trade analysis ----------------------------------------------------------
console.log('\n-- analyzeTrade (sample: my 2nd-best RB+WR for their best WR) --')
{
  const myRoster = fx.rosters.find(r => r.rosterId === 6)
  const opp = fx.rosters.find(r => r.rosterId === 1)
  const byVal = (roster, pos) => roster.players.filter(p => p.position === pos && !p.isIR).sort((a, b) => b.value - a.value)
  const give = [byVal(myRoster, 'RB')[1], byVal(myRoster, 'WR')[1]].filter(Boolean)
  const get = [byVal(opp, 'WR')[0]].filter(Boolean)
  const analysis = analyzeTrade(give, get, myRoster, opp, fx.rosters)
  console.log(`give: ${give.map(a => `${a.name} (${fmt(a.value)})`).join(' + ')}  → total ${fmt(analysis.giveTotal)}`)
  console.log(`get:  ${get.map(a => `${a.name} (${fmt(a.value)})`).join(' + ')}  → total ${fmt(analysis.getTotal)}`)
  console.log(`raw value: winner=${analysis.valueWinner} diff=${fmt(analysis.valueDiff)} (${analysis.valuePct}%)`)
  console.log(`fit: filledNeeds=[${analysis.filledNeeds}] hurtStrengths=[${analysis.hurtStrengths}] fitScore=${analysis.fitScore}`)
  console.log(`window: myTier=${analysis.myTier} windowScore=${analysis.windowScore} — ${analysis.windowNote}`)
  const v = getTradeVerdict(analysis)
  console.log(`VERDICT: ${v.verdict} — ${v.reasoning}`)
  const ok = analysis && v && ['Accept', 'Decline', 'Counter'].includes(v.verdict)
  console.log(`CHECK analyzeTrade returns a complete verdict: ${ok ? 'PASS' : '*** FAIL ***'}`)
  if (!ok) process.exitCode = 1
}

console.log('\nDone.' + (process.exitCode ? ' *** ONE OR MORE CHECKS FAILED ***' : ' All checks passed.'))
