// register.mjs — registers loader.mjs as a module-resolution hook.
//
//   node --import ./mcp/register.mjs mcp/stdio.js
//
// The './loader.mjs' specifier resolves relative to THIS file, so the pair
// works from any working directory.
import { register } from 'node:module'
register('./loader.mjs', import.meta.url)
