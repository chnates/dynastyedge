#!/usr/bin/env node
// stdio.js — the stdio entry point (Claude Desktop, Claude Code, local runs).
//
//   node --import ./mcp/register.mjs mcp/stdio.js
//
// The --import hook is MANDATORY: src/utils use Vite-style extensionless
// relative imports that plain node cannot resolve. See mcp/register.mjs.
//
// NOTHING may be written to stdout except protocol frames — stdout IS the
// transport. Diagnostics go to stderr.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server.js'

const { server, config } = createServer()

process.on('unhandledRejection', err => {
  console.error('[dynastyedge-mcp] unhandled rejection:', err)
})

await server.connect(new StdioServerTransport())
console.error(
  `[dynastyedge-mcp] ready · league ${config.defaultLeagueId} · roster ${config.defaultRosterId} ` +
  `· snapshot TTL ${Math.round(config.snapshotTtlMs / 1000)}s`
)
