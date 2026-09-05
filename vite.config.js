import { execFileSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// One id per build, stamped into BOTH the bundle (as `__BUILD_ID__`) and the
// emitted version.json. The running app compares the two to notice it is
// serving stale HTML — see src/hooks/useAppVersion.js for why that is needed
// on iOS.
//
// The id is a BUILD NUMBER: the count of first-parent commits on the branch,
// which advances by exactly one per merge (or direct push) to main. PR #32
// shipped build 131, PR #33 build 132. That is legible in a way a timestamp is
// not — "am I on 132?" is answerable against the repo; "am I on Sep 5,
// 01:25 AM?" is not.
//
// NOT the PR number, though it tracks it closely: deploy.yml runs on PUSH TO
// MAIN, where no PR number exists, and values-history.yml's keepalive commits
// to main with no PR at all. The id also has to be unique per build or the
// self-heal quietly stops working, which is the one failure this whole
// mechanism exists to prevent.
//
// A SHALLOW CLONE WOULD SILENTLY POISON THIS. `actions/checkout` defaults to
// depth 1, where the count is 1 for every build — every deploy would share an
// id and the app could never tell it was stale. deploy.yml therefore sets
// `fetch-depth: 0`, and if that is ever lost we detect the shallow repo here
// and fall back to a timestamp: a less pretty id, but never a duplicate one.
function buildId() {
  const git = cmd => execFileSync('git', cmd, { encoding: 'utf8' }).trim()
  try {
    if (git(['rev-parse', '--is-shallow-repository']) === 'true') {
      console.warn('[build-version] shallow clone — falling back to a timestamp id')
      return new Date().toISOString()
    }
    const n = Number(git(['rev-list', '--count', '--first-parent', 'HEAD']))
    if (!Number.isInteger(n) || n < 1) throw new Error(`bad count: ${n}`)
    return String(n)
  } catch (err) {
    console.warn(`[build-version] no usable git history (${err.message}) — timestamp id`)
    return new Date().toISOString()
  }
}

const BUILD_ID = buildId()
// Recorded alongside it purely for debugging: the number says WHICH build, the
// sha says exactly what was in it. Nothing compares on the sha.
const BUILD_SHA = (() => {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim() }
  catch { return null }
})()

// version.json must be EMITTED BY THE BUILD, never committed under public/:
// a checked-in file would have to be bumped by hand and would silently drift
// from the compiled-in id, which is the one thing this mechanism cannot
// tolerate (a stale id in either direction means an update is never noticed,
// or every launch reloads).
function buildVersionPlugin() {
  return {
    name: 'dynastyedge-build-version',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ buildId: BUILD_ID, sha: BUILD_SHA }) + '\n',
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), buildVersionPlugin()],
  base: '/dynastyedge/',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
})
