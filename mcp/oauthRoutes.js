// oauthRoutes.js — the five endpoints the MCP authorization flow needs, as
// Web-standard handlers. The crypto and the policy live in oauth.js; this
// file is HTTP plumbing and validation.
//
//   GET  /.well-known/oauth-protected-resource   RFC 9728 — who guards this
//   GET  /.well-known/oauth-authorization-server RFC 8414 — where to log in
//   GET  /api/oauth/authorize                    start; bounce to GitHub
//   GET  /api/oauth/callback/github              GitHub returns here
//   POST /api/oauth/token                        code + verifier -> token
//
// ── REDIRECT URI VALIDATION IS THE LOAD-BEARING CHECK ──────────────────────
//
// The spec: "Authorization servers MUST validate exact redirect URIs against
// pre-registered values to prevent redirection attacks." With no client
// registry there is nothing to compare against per-client, so the registry is
// replaced by an ORIGIN ALLOWLIST checked on every authorize request. An
// attacker who knows the (public) client id still cannot make us send a code
// anywhere but Claude or localhost.
//
// This is the one control whose failure is catastrophic rather than
// inconvenient: get it wrong and the flow hands an authorization code to
// whoever asked. It is therefore checked BEFORE anything is minted, and a
// failure renders an error page rather than redirecting — redirecting an
// unvalidated URI is the attack.

import {
  mintGithubState, readGithubState, mintAuthCode, redeemAuthCode, mintAccessToken,
  protectedResourceMetadata, authorizationServerMetadata, ACCESS_TOKEN_TTL_S,
} from './oauth.js'

export const DEFAULT_REDIRECT_ORIGINS = [
  'https://claude.ai',
  'https://claude.com',
  'http://localhost',
  'http://127.0.0.1',
]

const GITHUB_AUTHORIZE = 'https://github.com/login/oauth/authorize'
const GITHUB_TOKEN = 'https://github.com/login/oauth/access_token'
const GITHUB_USER = 'https://api.github.com/user'

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
})

// An OAuth error shown to a HUMAN in a browser, not to a program. It is text,
// not JSON, because the person staring at it is mid-login and needs a
// sentence rather than a payload.
const errorPage = (title, detail, status = 400) => new Response(
  `DynastyEdge MCP — ${title}\n\n${detail}\n`,
  { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } }
)

function redirectOriginAllowed(redirectUri, allowedOrigins) {
  let url
  try { url = new URL(redirectUri) } catch { return false }
  // Anything but https is refused except on loopback, per OAuth 2.1.
  const isLoopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !isLoopback) return false
  return allowedOrigins.some(allowed => {
    const a = new URL(allowed)
    return a.protocol === url.protocol && a.hostname === url.hostname
  })
}

// Bounce back to the client with an OAuth error, which is what the spec wants
// once the redirect URI is known to be trustworthy.
function redirectError(redirectUri, state, error, description) {
  const u = new URL(redirectUri)
  u.searchParams.set('error', error)
  if (description) u.searchParams.set('error_description', description)
  if (state) u.searchParams.set('state', state)
  return Response.redirect(u.toString(), 302)
}

export function createOAuthRoutes({
  origin, clientId, githubClientId, githubClientSecret, allowedLogin,
  signingKey, allowedRedirectOrigins = DEFAULT_REDIRECT_ORIGINS,
  fetchImpl = fetch,
}) {
  const callbackUrl = `${origin}/api/oauth/callback/github`

  // ── GET /api/oauth/authorize ────────────────────────────────────────────
  async function authorize(url) {
    const q = url.searchParams
    const redirectUri = q.get('redirect_uri')
    const state = q.get('state')

    if (!redirectUri) return errorPage('Bad request', 'No redirect_uri was supplied.')
    if (!redirectOriginAllowed(redirectUri, allowedRedirectOrigins)) {
      // NOT a redirect — see the header. We refuse to send anything anywhere
      // we have not vetted.
      return errorPage('Refused',
        `That redirect_uri is not allowed: ${redirectUri}\n` +
        'Only Claude and localhost may receive an authorization code from this server.', 403)
    }
    if (q.get('response_type') !== 'code') {
      return redirectError(redirectUri, state, 'unsupported_response_type',
        'Only the authorization code flow is supported')
    }
    if (q.get('client_id') !== clientId) {
      return redirectError(redirectUri, state, 'unauthorized_client', 'Unknown client_id')
    }
    if (q.get('code_challenge_method') !== 'S256' || !q.get('code_challenge')) {
      return redirectError(redirectUri, state, 'invalid_request',
        'PKCE with S256 is required')
    }

    // Everything the callback will need, signed into GitHub's `state` so this
    // server remembers nothing while the human logs in.
    const packed = mintGithubState({
      redirectUri,
      clientState: state ?? null,
      codeChallenge: q.get('code_challenge'),
      resource: q.get('resource') ?? origin,
    }, signingKey)

    const gh = new URL(GITHUB_AUTHORIZE)
    gh.searchParams.set('client_id', githubClientId)
    gh.searchParams.set('redirect_uri', callbackUrl)
    // No scopes. We want identity and nothing else — the token is read once to
    // learn the login and then discarded, so asking for repo access would be
    // requesting power we neither need nor should hold.
    gh.searchParams.set('scope', '')
    gh.searchParams.set('state', packed)
    return Response.redirect(gh.toString(), 302)
  }

  // ── GET /api/oauth/callback/github ──────────────────────────────────────
  async function githubCallback(url) {
    const q = url.searchParams
    if (q.get('error')) {
      return errorPage('GitHub declined', q.get('error_description') || q.get('error'))
    }

    const packed = readGithubState(q.get('state'), signingKey)
    if (!packed) {
      return errorPage('Expired or invalid', 'That login attempt is no longer valid. Start again.')
    }
    const code = q.get('code')
    if (!code) return errorPage('Bad request', 'GitHub returned no code.')

    let login
    try {
      const tokenRes = await fetchImpl(GITHUB_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_id: githubClientId,
          client_secret: githubClientSecret,
          code,
          redirect_uri: callbackUrl,
        }),
      })
      const tok = await tokenRes.json()
      if (!tok?.access_token) {
        return errorPage('Login failed', `GitHub did not issue a token (${tok?.error || 'unknown'}).`)
      }
      const userRes = await fetchImpl(GITHUB_USER, {
        headers: {
          Authorization: `Bearer ${tok.access_token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'dynastyedge-mcp',
        },
      })
      const user = await userRes.json()
      login = user?.login
      // The GitHub token has done its one job. It is never stored, never
      // returned to the client, and never used for anything else.
    } catch (err) {
      return errorPage('Login failed', `Could not reach GitHub: ${err.message}`, 502)
    }

    if (!login) return errorPage('Login failed', 'GitHub did not identify the user.')
    if (allowedLogin && login !== allowedLogin) {
      // Named plainly. This server belongs to one person; saying so is more
      // useful than a generic denial, and reveals nothing an attacker who
      // reached this point does not already know.
      return errorPage('Not authorized',
        `Signed in to GitHub as "${login}", which is not the account this server is for.`, 403)
    }

    const authCode = mintAuthCode({
      login, clientId,
      redirectUri: packed.redirectUri,
      codeChallenge: packed.codeChallenge,
      resource: packed.resource,
    }, signingKey)

    const back = new URL(packed.redirectUri)
    back.searchParams.set('code', authCode)
    if (packed.clientState) back.searchParams.set('state', packed.clientState)
    return Response.redirect(back.toString(), 302)
  }

  // ── POST /api/oauth/token ───────────────────────────────────────────────
  async function token(request) {
    let form
    try {
      form = new URLSearchParams(await request.text())
    } catch {
      return json({ error: 'invalid_request' }, 400)
    }
    if (form.get('grant_type') !== 'authorization_code') {
      return json({ error: 'unsupported_grant_type' }, 400)
    }

    const result = redeemAuthCode(form.get('code'), {
      clientId: form.get('client_id'),
      redirectUri: form.get('redirect_uri'),
      codeVerifier: form.get('code_verifier'),
    }, signingKey)

    if (!result.ok) {
      return json({ error: result.error, error_description: result.reason }, 400)
    }
    // The token is bound to the resource the client asked for, defaulting to
    // this server — so it cannot be replayed at a different one.
    return json({
      access_token: mintAccessToken({
        login: result.login, audience: result.resource || origin, clientId,
      }, signingKey),
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_S,
      scope: 'mcp',
    })
  }

  // ── the router ──────────────────────────────────────────────────────────
  // Returns null when the path is not ours, so the MCP handler takes it.
  return async function handleOAuth(request) {
    const url = new URL(request.url)
    const { pathname } = url

    if (request.method === 'GET' && pathname === '/.well-known/oauth-protected-resource') {
      return json(protectedResourceMetadata(origin))
    }
    if (request.method === 'GET' && pathname === '/.well-known/oauth-authorization-server') {
      return json(authorizationServerMetadata(origin))
    }
    if (request.method === 'GET' && pathname === '/api/oauth/authorize') return authorize(url)
    if (request.method === 'GET' && pathname === '/api/oauth/callback/github') return githubCallback(url)
    if (request.method === 'POST' && pathname === '/api/oauth/token') return token(request)
    return null
  }
}
