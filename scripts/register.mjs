// register.mjs — registers THE resolver hook (scripts/loader.mjs).
//
//   node --import ./scripts/register.mjs some-script.mjs
//
// The './loader.mjs' specifier resolves relative to THIS file, so it works
// from any working directory. Requires Node >= 18.19 (module.register).
import { register } from 'node:module'
register('./loader.mjs', import.meta.url)
