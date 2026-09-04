import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// One id per build, stamped into BOTH the bundle (as `__BUILD_ID__`) and the
// emitted version.json. The running app compares the two to notice it is
// serving stale HTML — see src/hooks/useAppVersion.js for why that is needed
// on iOS.
const BUILD_ID = new Date().toISOString()

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
        source: JSON.stringify({ buildId: BUILD_ID }) + '\n',
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), buildVersionPlugin()],
  base: '/dynastyedge/',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
})
