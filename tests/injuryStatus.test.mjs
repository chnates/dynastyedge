// The injury-status rule has ONE home (src/utils/injuryStatus.js, 2026-10-07).
// Before it there were three lists that disagreed on live players — Sleeper's
// `Sus` never blocked a lineup slot, `NA` blocked a starter but read "Active" on
// his card, `DNR` / `COV` were healthy everywhere, and `Doubtful` was startable
// in the Optimizer but "currently out" in the trade verdict.
// docs/analysis/code-review-2026-10.md, finding 1 and the owner decisions.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  classifyInjuryStatus, injuryFlag, injuryShortLabel, isIrEligible,
  injuryFromMeta, INJURY_UNAVAILABLE,
} from '../src/utils/injuryStatus.js'
import { getAvailability } from '../src/utils/projections.js'
import { adjustVerdictForInjuries } from '../src/utils/tradeAnalysis.js'

// Every value on the live /players/nfl payload, 2026-10-07, grouped as the
// owner decided: OUT = not playing this week; QUESTIONABLE = can play.
test('owner decision: every live Sleeper status lands in its group', () => {
  for (const s of ['Out', 'IR', 'PUP', 'Sus', 'NA', 'DNR', 'COV']) {
    assert.equal(classifyInjuryStatus(s), 'out', s)
    assert.equal(injuryFlag(s), 'red', s)
  }
  for (const s of ['Questionable', 'Doubtful']) {
    assert.equal(classifyInjuryStatus(s), 'questionable', s)
    assert.equal(injuryFlag(s), 'yellow', s)
  }
  for (const s of [null, undefined, '', '  ']) {
    assert.equal(classifyInjuryStatus(s), 'ok', String(s))
    assert.equal(injuryFlag(s), 'green', String(s))
  }
})

test('older spellings still block, and casing cannot turn a status healthy', () => {
  for (const s of ['Suspended', 'SUSP', 'NFI', 'NFI-R', 'out', 'OUT', 'sus', 'dnr']) {
    assert.equal(classifyInjuryStatus(s), 'out', s)
  }
  assert.equal(classifyInjuryStatus('doubtful'), 'questionable')
})

// An unrecognised code is how DNR and COV slipped through as healthy. It is
// flagged (shown) but never blocks — the middle answer, not a guess.
test('an unknown status is flagged, never healthy and never blocking', () => {
  assert.equal(classifyInjuryStatus('XYZ'), 'questionable')
  const a = getAvailability({ sleeperId: 'p', team: 'KC' }, { p: { injury_status: 'XYZ' } }, new Set(['KC']))
  assert.equal(a.blocked, false)
  assert.equal(a.status, 'questionable')
})

test('the Optimizer reads the same rule: Sus / NA / DNR / COV block, Doubtful does not', () => {
  const player = { sleeperId: 'p', team: 'KC' }
  const playing = new Set(['KC'])
  for (const s of ['Sus', 'NA', 'DNR', 'COV', 'Out', 'PUP']) {
    const a = getAvailability(player, { p: { injury_status: s } }, playing)
    assert.equal(a.blocked, true, s)
    assert.equal(a.status, 'out', s)
    assert.equal(a.label, s)
  }
  const d = getAvailability(player, { p: { injury_status: 'Doubtful' } }, playing)
  assert.equal(d.blocked, false)
  assert.equal(d.status, 'questionable')
  assert.equal(d.short, 'D')
  assert.equal(injuryShortLabel('Questionable'), 'Q')
  assert.equal(injuryShortLabel(null), null)
})

// IR eligibility is the LEAGUE's setting, not the out list. This league,
// live 2026-10-07: reserve_allow_out 1, _cov 1, everything else 0.
test('IR eligibility follows the league reserve_allow_* settings', () => {
  const league = {
    reserve_allow_out: 1, reserve_allow_cov: 1, reserve_allow_doubtful: 0,
    reserve_allow_sus: 0, reserve_allow_na: 0, reserve_allow_dnr: 0,
  }
  for (const s of ['IR', 'PUP', 'Out', 'COV']) assert.equal(isIrEligible(s, league), true, s)
  for (const s of ['Doubtful', 'Sus', 'NA', 'DNR', 'Questionable', null, '']) {
    assert.equal(isIrEligible(s, league), false, String(s))
  }
  // IR and PUP are what the slot is for; everything else needs the setting.
  assert.equal(isIrEligible('IR', {}), true)
  assert.equal(isIrEligible('Out', {}), false)
  assert.equal(isIrEligible('Sus', { reserve_allow_sus: 1 }), true)
})

test('a player-DB row becomes the card/trade row; an unreadable DB is never "Active"', () => {
  const row = injuryFromMeta({ injury_status: 'Out', injury_body_part: 'Knee', injury_notes: 'MRI Monday' })
  assert.deepEqual(row, {
    injuryFlag: 'red', injuryKind: 'out', injuryStatus: 'Out',
    injuryDetail: 'Knee', injuryNotes: 'MRI Monday', unavailable: false,
  })
  assert.equal(injuryFromMeta(undefined).injuryFlag, 'green')   // not in the DB = no status
  assert.equal(INJURY_UNAVAILABLE.injuryFlag, null)
  assert.equal(INJURY_UNAVAILABLE.unavailable, true)
})

// ── The trade verdict (owner decision 2026-10-07) ────────────────────────────

const base = { verdict: 'Accept', reasoning: 'Fair value.' }
const getAssets = [{ type: 'player', name: 'Getter' }]
const giveAssets = [{ type: 'player', name: 'Giver' }]
const row = (playerName, status) => ({ playerName, ...injuryFromMeta({ injury_status: status }) })

test('getting an OUT player still downgrades Accept → Counter', () => {
  const r = adjustVerdictForInjuries(base, [row('Getter', 'Out')], giveAssets, getAssets)
  assert.equal(r.verdict, 'Counter')
  assert.equal(r.adjustedByIntelligence, true)
  assert.match(r.reasoning, /Getter is currently out/)
})

test('getting a DOUBTFUL player is a caution note — the verdict never moves', () => {
  const r = adjustVerdictForInjuries(base, [row('Getter', 'Doubtful')], giveAssets, getAssets)
  assert.equal(r.verdict, 'Accept')
  assert.equal(r.adjustedByIntelligence, false)
  assert.match(r.reasoning, /Getter \(Doubtful\)/)
  assert.doesNotMatch(r.reasoning, /currently out/)
})

test('DNR and COV now count as out in a trade, as everywhere else', () => {
  for (const s of ['DNR', 'COV']) {
    assert.equal(adjustVerdictForInjuries(base, [row('Getter', s)], giveAssets, getAssets).verdict, 'Counter', s)
  }
})

// The old per-player lookup read a failure as green and the check silently
// passed. Now the verdict says it could not check — and does not move.
test('an unreadable status is said out loud, never treated as healthy', () => {
  const r = adjustVerdictForInjuries(base, [{ playerName: 'Getter', ...INJURY_UNAVAILABLE }], giveAssets, getAssets)
  assert.equal(r.verdict, 'Accept')
  assert.match(r.reasoning, /could not be checked for Getter/)
})

test('healthy players leave the verdict object untouched', () => {
  assert.equal(adjustVerdictForInjuries(base, [row('Getter', null), row('Giver', null)], giveAssets, getAssets), base)
})

// The guard that keeps it one home: no other file in src/ or mcp/ may decide
// what a Sleeper status code means.
test('no second injury-status list anywhere in src/ or mcp/', () => {
  const root = new URL('..', import.meta.url).pathname
  const files = []
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(js|jsx|mjs)$/.test(name)) files.push(p)
    }
  }
  walk(join(root, 'src'))
  walk(join(root, 'mcp'))
  // 'IR' alone is left out on purpose: it is also a roster SLOT name
  // (rosterSpace.js compares slots, not statuses).
  const CODE = "'(Out|PUP|Sus|Suspended|SUSP|NA|DNR|COV|Questionable|Doubtful)'"
  const patterns = [
    new RegExp(`(===|!==)\\s*${CODE}`),                       // status === 'Out'
    new RegExp(`Set\\(\\[\\s*${CODE}`),                       // new Set(['Out', …
    /(===|!==)\s*'(out|doubtful|pup|sus|dnr|cov)'.*injur/i,   // lower-cased status checks
    /HARD_BLOCK_STATUSES|SOFT_FLAG_STATUSES|deriveInjuryFlag/,
  ]
  const copies = []
  for (const f of files) {
    if (f.endsWith('utils/injuryStatus.js')) continue
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (line.trim().startsWith('//')) return
      if (patterns.some(re => re.test(line))) copies.push(`${f.slice(root.length)}:${i + 1}`)
    })
  }
  assert.deepEqual(copies, [], 'import from src/utils/injuryStatus.js instead')
})
