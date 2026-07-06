// Recipe 7 — determinism check: prove simulatePlayoffs is byte-identical across
// runs with the same seed (the repo's UI-stability contract) and DOES change
// with a different seed (i.e. the test has power).
//
// Run:  node --import /home/user/dynastyedge/.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/reg.mjs \
//         /home/user/dynastyedge/.claude/skills/dynastyedge-analysis-toolkit/scripts/07-determinism.mjs

import { createHash } from 'node:crypto'
import { simulatePlayoffs } from '/home/user/dynastyedge/src/utils/playoffOdds.js'

const n = 10
const allRosters = Array.from({ length: n }, (_, i) => ({
  rosterId: i + 1,
  record: { wins: i % 3, losses: 2 - (i % 3), ties: 0 },
  pointsFor: 220 + i * 7,
}))
const model = {}
allRosters.forEach((r, i) => { model[r.rosterId] = { mean: 100 + i * 3, std: 24 } })
const remainingSchedule = []
for (let w = 0; w < 8; w++) {
  const rot = [1]
  for (let i = 0; i < n - 1; i++) rot.push(2 + ((i + w) % (n - 1)))
  const matchups = []
  for (let i = 0; i < n / 2; i++) matchups.push([rot[i], rot[n - 1 - i]])
  remainingSchedule.push({ week: w + 1, matchups })
}

const run = seed => JSON.stringify(
  simulatePlayoffs({ allRosters, model, remainingSchedule, playoffTeams: 5, seed })
)
const sha = s => createHash('sha256').update(s).digest('hex').slice(0, 16)

const a = run(0x5eed) // the repo's default seed
const b = run(0x5eed)
const c = run(0x5eee)

console.log(`run A (seed 0x5eed): sha256 ${sha(a)}  (${a.length} bytes)`)
console.log(`run B (seed 0x5eed): sha256 ${sha(b)}`)
console.log(`run C (seed 0x5eee): sha256 ${sha(c)}`)
console.log(`A === B (byte-identical): ${a === b ? 'PASS' : 'FAIL — determinism broken'}`)
console.log(`A !== C (test has power): ${a !== c ? 'PASS' : 'FAIL — seed is being ignored'}`)

// Spot values so a reviewer sees actual numbers, not just hashes:
const first = JSON.parse(a)[0]
console.log(`\nspot check, roster 1: playoffPct=${first.playoffPct}, avgSeed=${first.avgSeed.toFixed(3)}, projWins=${first.projWins.toFixed(3)}`)
