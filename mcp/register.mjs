// register.mjs — the MCP server's entry to THE resolver hook.
//
//   node --import ./mcp/register.mjs mcp/stdio.js
//
// The hook itself is scripts/loader.mjs (one copy for the tests, the server
// and the diagnostics skill — CODE-REVIEW-1 #13). The deployed server does not
// use it: Vercel runs the committed esbuild bundle (api/mcp.js).
import { register } from 'node:module'
register('../scripts/loader.mjs', import.meta.url)
