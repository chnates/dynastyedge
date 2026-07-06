// reg.mjs — registers loader.mjs as a module-resolution hook.
//
// USAGE:
//   node --import /home/user/dynastyedge/.claude/skills/dynastyedge-diagnostics-and-tooling/scripts/reg.mjs your-script.mjs
//
// After this, `import('/home/user/dynastyedge/src/utils/playoffOdds.js')`
// (and every other src/utils module, despite their extensionless internal
// imports) works under plain Node. Requires Node >= 18.19 (module.register).
// The './loader.mjs' specifier resolves relative to THIS file's location, so
// the pair can be invoked from any working directory.
import { register } from 'node:module'
register('./loader.mjs', import.meta.url)
