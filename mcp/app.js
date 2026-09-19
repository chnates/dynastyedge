// app.js — the whole hosted server: the OAuth endpoints in front of the MCP
// endpoint, as one Web-standard handler.
//
//   (Request) => Promise<Response>
//
// Composition order matters and is the security boundary: OAuth paths are
// matched FIRST and answered without a token (they are how you get one);
// everything else falls through to the MCP handler, which requires one. A
// path that is neither returns 404 rather than reaching the MCP transport.
//
// ── IT REFUSES TO START WITHOUT A SECRET ───────────────────────────────────
//
// No GITHUB_CLIENT_SECRET means no signing key, and a server that started
// anyway would either run with no authentication or with a guessable one.
// Both are worse than not starting. `createApp` throws, which on Vercel
// surfaces as a failed deployment — loud, and before the endpoint is public.

import { loadConfig } from './config.js'
import { createMcpHandler } from './http.js'
import { createOAuthRoutes } from './oauthRoutes.js'
import { deriveSigningKey, verifyAccessToken } from './oauth.js'

export function createApp({ env = process.env, store = null, fetchImpl = fetch } = {}) {
  const config = loadConfig(env)

  if (!config.githubClientSecret) {
    throw new Error(
      'GITHUB_CLIENT_SECRET is not set. The server cannot derive a token signing key, ' +
      'so it refuses to start rather than serve league data unauthenticated.'
    )
  }

  const signingKey = deriveSigningKey(
    config.githubClientSecret, env.DYNASTYEDGE_TOKEN_SECRET || null
  )

  const oauth = createOAuthRoutes({
    origin: config.origin,
    clientId: config.mcpClientId,
    githubClientId: config.githubClientId,
    githubClientSecret: config.githubClientSecret,
    allowedLogin: config.allowedGithubLogin,
    signingKey,
    fetchImpl,
  })

  const mcp = createMcpHandler({
    store,
    resourceMetadataUrl: `${config.origin}/.well-known/oauth-protected-resource`,
    // The gate. A bearer token is verified on EVERY request — signature,
    // expiry, audience, and the allowlist — and nothing here trusts a session.
    authenticate: async request => {
      const header = request.headers.get('authorization') || ''
      const [scheme, token] = header.split(' ')
      if (!/^Bearer$/i.test(scheme || '') || !token) {
        return { ok: false, reason: 'A Bearer token is required' }
      }
      const info = verifyAccessToken(token, {
        // Both spellings of this server: the canonical MCP URL a client names
        // as its `resource`, and the bare origin. Anything else is refused.
        audiences: [`${config.origin}/mcp`, config.origin],
        allowedLogin: config.allowedGithubLogin,
      }, signingKey)
      if (!info) return { ok: false, reason: 'Token invalid, expired, or not for this server' }
      return { ok: true, authInfo: info }
    },
  })

  return async function app(request) {
    const handled = await oauth(request)
    if (handled) return handled

    const { pathname } = new URL(request.url)
    // The MCP endpoint lives at / and /mcp. Anything else is a 404 — an
    // unknown path must not reach the transport at all.
    if (pathname === '/' || pathname === '/mcp') return mcp(request)

    return new Response(JSON.stringify({ error: 'not_found', path: pathname }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    })
  }
}
