// tests/mcpOauth.test.mjs — pins mcp/oauth.js and mcp/oauthRoutes.js.
//
// This is the security-critical layer, so the tests are written as attacks
// rather than as happy paths. Behaviors pinned (with their source):
//
//  - MCP authorization spec, "Open Redirection": an authorization server MUST
//    validate redirect URIs against pre-registered values. With no client
//    registry, an ORIGIN ALLOWLIST is that control, and it is the one whose
//    failure is catastrophic rather than inconvenient.
//  - Spec, "Authorization Code Protection": PKCE is REQUIRED. In a stateless
//    design a code cannot be marked used, so PKCE is not defence in depth —
//    it IS the defence, and `plain` must be refused.
//  - Spec, "Access Token Privilege Restriction": a server MUST reject a token
//    not issued for it (audience binding) — the confused-deputy problem.
//  - mcp/oauth.js's header: signed-not-stored costs revocation, so tokens are
//    short and the allowlist is re-checked at every verification.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

import {
  deriveSigningKey, sign, verify, verifyPkce, mintAuthCode, redeemAuthCode,
  mintAccessToken, verifyAccessToken, authorizationServerMetadata,
  protectedResourceMetadata, mintClientId, readClientId,
  mintRefreshToken, redeemRefreshToken, REFRESH_TOKEN_TTL_S, REFRESH_SESSION_MAX_S,
} from '../mcp/oauth.js'
import { createOAuthRoutes, DEFAULT_REDIRECT_ORIGINS } from '../mcp/oauthRoutes.js'

const ORIGIN = 'https://dynastyedge-mcp.vercel.app'
const CLIENT_ID = 'dynastyedge-claude'
const LOGIN = 'chnates'
const KEY = deriveSigningKey('a-github-client-secret')

// A real PKCE pair, computed the way a client would.
const VERIFIER = 'a'.repeat(64)
const CHALLENGE = Buffer.from(
  crypto.createHash('sha256').update(VERIFIER, 'ascii').digest()
).toString('base64url')

// ── the key ────────────────────────────────────────────────────────────────

test('the signing key is derived, distinct from the secret, and deterministic', () => {
  const a = deriveSigningKey('secret-one')
  const b = deriveSigningKey('secret-one')
  const c = deriveSigningKey('secret-two')
  assert.deepEqual(a, b, 'the same secret must derive the same key across instances')
  assert.notDeepEqual(a, c, 'a different secret derives an unrelated key')
  assert.ok(!a.toString('utf8').includes('secret-one'), 'the key is not the secret')
  assert.equal(a.length, 32)
  assert.throws(() => deriveSigningKey(null), /GITHUB_CLIENT_SECRET/,
    'no secret must fail loudly, never fall back to a constant')
})

// ── signing ────────────────────────────────────────────────────────────────

test('a token round-trips, and any tampering is rejected', () => {
  const token = sign({ kind: 'test', v: 1, exp: Math.floor(Date.now() / 1000) + 60 }, KEY)
  assert.equal(verify(token, KEY).v, 1)

  const [body, mac] = token.split('.')
  const evil = Buffer.from(JSON.stringify({
    kind: 'test', v: 999, exp: Math.floor(Date.now() / 1000) + 60,
  })).toString('base64url')
  assert.equal(verify(`${evil}.${mac}`, KEY), null, 'a swapped payload fails the MAC')
  assert.equal(verify(`${body}.${mac}x`, KEY), null, 'a mangled MAC fails')
  assert.equal(verify(token, deriveSigningKey('other')), null, 'a different key cannot verify')
})

test('a malformed token shape is rejected rather than parsed optimistically', () => {
  for (const bad of [null, undefined, 42, '', 'nodot', 'a.b.c', '.', 'a.']) {
    assert.equal(verify(bad, KEY), null, `${JSON.stringify(bad)} must not verify`)
  }
})

test('an expired token is rejected, and one with no exp is never accepted', () => {
  const expired = sign({ kind: 'test', exp: Math.floor(Date.now() / 1000) - 1 }, KEY)
  assert.equal(verify(expired, KEY), null)
  const noExp = sign({ kind: 'test' }, KEY)
  assert.equal(verify(noExp, KEY), null, 'a token without an expiry is not a valid token')
})

// ── PKCE ───────────────────────────────────────────────────────────────────

test('PKCE accepts the real verifier and refuses everything else', () => {
  assert.equal(verifyPkce(VERIFIER, CHALLENGE), true)
  assert.equal(verifyPkce('b'.repeat(64), CHALLENGE), false, 'a wrong verifier fails')
  assert.equal(verifyPkce(VERIFIER, 'not-the-challenge'), false)
  assert.equal(verifyPkce(undefined, CHALLENGE), false)
})

test('PKCE refuses `plain` — the challenge equal to the verifier', () => {
  // In a stateless design the code cannot be marked used, so accepting plain
  // would mean anyone holding the code holds everything needed to redeem it.
  assert.equal(verifyPkce(VERIFIER, VERIFIER), false)
})

test('PKCE enforces the length bounds RFC 7636 sets', () => {
  const short = 'a'.repeat(42)
  const shortChallenge = Buffer.from(
    crypto.createHash('sha256').update(short, 'ascii').digest()
  ).toString('base64url')
  assert.equal(verifyPkce(short, shortChallenge), false, '42 chars is below the floor')
  const long = 'a'.repeat(129)
  const longChallenge = Buffer.from(
    crypto.createHash('sha256').update(long, 'ascii').digest()
  ).toString('base64url')
  assert.equal(verifyPkce(long, longChallenge), false, '129 chars is above the ceiling')
})

// ── authorization codes ────────────────────────────────────────────────────

const codeFor = (over = {}) => mintAuthCode({
  login: LOGIN, clientId: CLIENT_ID, redirectUri: 'https://claude.ai/cb',
  codeChallenge: CHALLENGE, resource: ORIGIN, ...over,
}, KEY)

const redeem = (code, over = {}) => redeemAuthCode(code, {
  clientId: CLIENT_ID, redirectUri: 'https://claude.ai/cb', codeVerifier: VERIFIER, ...over,
}, KEY)

test('a code redeems once with the right verifier, client and redirect', () => {
  const out = redeem(codeFor())
  assert.equal(out.ok, true)
  assert.equal(out.login, LOGIN)
})

test('a code is bound to its client, its redirect_uri and its PKCE challenge', () => {
  assert.equal(redeem(codeFor(), { clientId: 'someone-else' }).ok, false)
  assert.equal(redeem(codeFor(), { redirectUri: 'https://claude.ai/other' }).ok, false)
  assert.equal(redeem(codeFor(), { codeVerifier: 'b'.repeat(64) }).ok, false)
  assert.equal(redeem(codeFor(), { codeVerifier: undefined }).ok, false)
})

test('an access token cannot be passed off as an authorization code', () => {
  const access = mintAccessToken({ login: LOGIN, audience: ORIGIN, clientId: CLIENT_ID }, KEY)
  assert.equal(redeem(access).ok, false, 'the `kind` discriminator keeps the token types apart')
})

// ── access tokens ──────────────────────────────────────────────────────────

test('a valid access token verifies and carries the login', () => {
  const t = mintAccessToken({ login: LOGIN, audience: ORIGIN, clientId: CLIENT_ID }, KEY)
  const info = verifyAccessToken(t, { audience: ORIGIN, allowedLogin: LOGIN }, KEY)
  assert.equal(info.extra.login, LOGIN)
  assert.deepEqual(info.scopes, ['mcp'])
})

test('AUDIENCE BINDING: a token minted for another resource is refused', () => {
  const t = mintAccessToken({ login: LOGIN, audience: 'https://other.example', clientId: CLIENT_ID }, KEY)
  assert.equal(verifyAccessToken(t, { audience: ORIGIN, allowedLogin: LOGIN }, KEY), null,
    'accepting it is the confused-deputy problem the spec devotes a section to')
})

test('the ALLOWLIST is re-checked at every request, not only at login', () => {
  const t = mintAccessToken({ login: 'someone-else', audience: ORIGIN, clientId: CLIENT_ID }, KEY)
  assert.equal(verifyAccessToken(t, { audience: ORIGIN, allowedLogin: LOGIN }, KEY), null,
    'a token minted before the allowlist changed must stop working immediately')
})

test('an authorization code cannot be used as a bearer token', () => {
  assert.equal(verifyAccessToken(codeFor(), { audience: ORIGIN, allowedLogin: LOGIN }, KEY), null)
})

// ── metadata ───────────────────────────────────────────────────────────────

test('the metadata documents say what we actually implement', () => {
  const as = authorizationServerMetadata(ORIGIN)
  assert.deepEqual(as.code_challenge_methods_supported, ['S256'], 'plain is never advertised')
  assert.deepEqual(as.token_endpoint_auth_methods_supported, ['none'], 'a public client')
  // Advertising no registration endpoint was the first cut, on the reading
  // that RFC 7591 is a SHOULD. A real client could then not START sign-in.
  assert.equal(as.registration_endpoint, `${ORIGIN}/api/oauth/register`)
  // Without refresh_token the connector fell to "needs reconnect" an hour
  // after every sign-in, and a scheduled routine could never get in (§0 #9).
  assert.deepEqual(as.grant_types_supported, ['authorization_code', 'refresh_token'])
  const prm = protectedResourceMetadata(ORIGIN, `${ORIGIN}/mcp`)
  assert.deepEqual(prm.authorization_servers, [ORIGIN])
  assert.equal(prm.resource, `${ORIGIN}/mcp`,
    'the CANONICAL server URI, path included — the bare origin does not match what a client connected to')
})

test('a registered client_id carries its redirect URIs and nothing else', () => {
  const uris = ['https://claude.ai/api/mcp/auth_callback']
  const id = mintClientId(uris, KEY)
  assert.deepEqual(readClientId(id, KEY), uris)
  assert.equal(readClientId(id, deriveSigningKey('other')), null, 'a forged id does not verify')
  assert.equal(readClientId('not-an-id', KEY), null)
  // The three token kinds stay disjoint.
  assert.equal(readClientId(codeFor(), KEY), null, 'an auth code is not a client id')
  assert.equal(verifyAccessToken(id, { audiences: [ORIGIN], allowedLogin: LOGIN }, KEY), null,
    'a client id is not a bearer token')
})

test('AUDIENCE: both spellings of this server are accepted, nothing else is', () => {
  const auds = [`${ORIGIN}/mcp`, ORIGIN]
  for (const aud of auds) {
    const t = mintAccessToken({ login: LOGIN, audience: aud, clientId: CLIENT_ID }, KEY)
    assert.ok(verifyAccessToken(t, { audiences: auds, allowedLogin: LOGIN }, KEY),
      `${aud} identifies this server`)
  }
  const foreign = mintAccessToken({ login: LOGIN, audience: 'https://evil.example', clientId: CLIENT_ID }, KEY)
  assert.equal(verifyAccessToken(foreign, { audiences: auds, allowedLogin: LOGIN }, KEY), null)
})

// ── the routes ─────────────────────────────────────────────────────────────

function routes({ allowedLogin = LOGIN, fetchImpl } = {}) {
  return createOAuthRoutes({
    origin: ORIGIN, clientId: CLIENT_ID,
    githubClientId: 'Ov23liTEST', githubClientSecret: 'gh-secret',
    allowedLogin, signingKey: KEY, fetchImpl,
  })
}

const authorizeUrl = (over = {}) => {
  const u = new URL(`${ORIGIN}/api/oauth/authorize`)
  const params = {
    response_type: 'code', client_id: CLIENT_ID, redirect_uri: 'https://claude.ai/cb',
    code_challenge: CHALLENGE, code_challenge_method: 'S256', state: 'client-state', ...over,
  }
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v)
  return new Request(u.toString())
}

test('THE LOAD-BEARING CHECK: a foreign redirect_uri is refused WITHOUT redirecting', async () => {
  const res = await routes()(authorizeUrl({ redirect_uri: 'https://evil.example/steal' }))
  assert.equal(res.status, 403)
  assert.equal(res.headers.get('location'), null,
    'redirecting an unvalidated URI is the attack — we must not bounce anywhere')
  assert.match(await res.text(), /not allowed/)
})

test('the allowlist matches on exact host, so a lookalike subdomain fails', async () => {
  for (const bad of [
    'https://evil.claude.ai/cb',      // subdomain of an allowed host
    'https://claude.ai.evil.com/cb',  // allowed host as a prefix
    'http://claude.ai/cb',            // non-https off loopback
    'javascript:alert(1)',            // not even a URL we would follow
  ]) {
    const res = await routes()(authorizeUrl({ redirect_uri: bad }))
    assert.equal(res.status, 403, `${bad} must be refused`)
  }
})

test('localhost is allowed over http, because OAuth 2.1 carves it out', async () => {
  const res = await routes()(authorizeUrl({ redirect_uri: 'http://localhost:8080/cb' }))
  assert.equal(res.status, 302)
  assert.match(res.headers.get('location'), /^https:\/\/github\.com\/login\/oauth\/authorize/)
})

test('a valid authorize request bounces to GitHub asking for NO scopes', async () => {
  const res = await routes()(authorizeUrl())
  assert.equal(res.status, 302)
  const gh = new URL(res.headers.get('location'))
  assert.equal(gh.origin + gh.pathname, 'https://github.com/login/oauth/authorize')
  assert.equal(gh.searchParams.get('client_id'), 'Ov23liTEST')
  assert.equal(gh.searchParams.get('scope'), '',
    'identity only — we read the login once and discard the token')
  assert.equal(gh.searchParams.get('redirect_uri'), `${ORIGIN}/api/oauth/callback/github`)
  assert.ok(gh.searchParams.get('state'), 'the client request rides in a signed state')
})

test('a bad request bounces the ERROR to the client once the redirect is vetted', async () => {
  const missingPkce = await routes()(authorizeUrl({ code_challenge: null }))
  assert.equal(missingPkce.status, 302)
  const u = new URL(missingPkce.headers.get('location'))
  assert.equal(u.origin, 'https://claude.ai')
  assert.equal(u.searchParams.get('error'), 'invalid_request')
  assert.equal(u.searchParams.get('state'), 'client-state', 'the client state is echoed back')

  const plainPkce = await routes()(authorizeUrl({ code_challenge_method: 'plain' }))
  assert.match(new URL(plainPkce.headers.get('location')).search, /invalid_request/)

  const wrongClient = await routes()(authorizeUrl({ client_id: 'nope' }))
  assert.match(new URL(wrongClient.headers.get('location')).search, /unauthorized_client/)
})

test('a non-allowlisted GitHub user is refused by NAME, and gets no code', async () => {
  const handler = routes({
    fetchImpl: async url => {
      if (String(url).includes('access_token')) {
        return { json: async () => ({ access_token: 'gh-tok' }) }
      }
      return { json: async () => ({ login: 'someone-else' }) }
    },
  })
  // Walk the real flow: authorize -> capture state -> callback.
  const start = await handler(authorizeUrl())
  const state = new URL(start.headers.get('location')).searchParams.get('state')
  const res = await handler(new Request(
    `${ORIGIN}/api/oauth/callback/github?code=gh-code&state=${encodeURIComponent(state)}`
  ))
  assert.equal(res.status, 403)
  assert.equal(res.headers.get('location'), null, 'no code is issued to an unauthorized user')
  assert.match(await res.text(), /someone-else/)
})

test('THE WHOLE FLOW: authorize -> GitHub -> code -> token -> a usable bearer', async () => {
  const handler = routes({
    fetchImpl: async url => {
      if (String(url).includes('access_token')) {
        return { json: async () => ({ access_token: 'gh-tok' }) }
      }
      return { json: async () => ({ login: LOGIN }) }
    },
  })

  const start = await handler(authorizeUrl())
  const state = new URL(start.headers.get('location')).searchParams.get('state')

  const back = await handler(new Request(
    `${ORIGIN}/api/oauth/callback/github?code=gh-code&state=${encodeURIComponent(state)}`
  ))
  assert.equal(back.status, 302)
  const cb = new URL(back.headers.get('location'))
  assert.equal(cb.origin + cb.pathname, 'https://claude.ai/cb')
  assert.equal(cb.searchParams.get('state'), 'client-state')
  const code = cb.searchParams.get('code')
  assert.ok(code)

  const tokenRes = await handler(new Request(`${ORIGIN}/api/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code,
      client_id: CLIENT_ID, redirect_uri: 'https://claude.ai/cb', code_verifier: VERIFIER,
    }).toString(),
  }))
  assert.equal(tokenRes.status, 200)
  const body = await tokenRes.json()
  assert.equal(body.token_type, 'Bearer')
  assert.ok(body.expires_in <= 3600, 'short-lived, because it cannot be revoked')

  const info = verifyAccessToken(body.access_token, { audience: ORIGIN, allowedLogin: LOGIN }, KEY)
  assert.equal(info.extra.login, LOGIN, 'the minted token is accepted by the resource server')
})

test('the token endpoint refuses a stolen code without the verifier', async () => {
  const handler = routes()
  const code = codeFor()
  const res = await handler(new Request(`${ORIGIN}/api/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code,
      client_id: CLIENT_ID, redirect_uri: 'https://claude.ai/cb',
      code_verifier: 'c'.repeat(64),
    }).toString(),
  }))
  assert.equal(res.status, 400)
  assert.equal((await res.json()).error, 'invalid_grant')
})

test('REGISTRATION is stateless, and the allowlist still binds', async () => {
  const handler = routes()
  const reg = async body => handler(new Request(`${ORIGIN}/api/oauth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }))

  const ok = await reg({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], client_name: 'Claude' })
  assert.equal(ok.status, 201)
  const client = await ok.json()
  assert.ok(client.client_id)
  assert.equal(client.token_endpoint_auth_method, 'none', 'public client — no secret issued')
  assert.deepEqual(readClientId(client.client_id, KEY), ['https://claude.ai/api/mcp/auth_callback'])

  // Registration widens WHO may ask, never WHERE a code may be sent.
  const evil = await reg({ redirect_uris: ['https://evil.example/steal'] })
  assert.equal(evil.status, 400)
  assert.equal((await evil.json()).error, 'invalid_redirect_uri')
  const mixed = await reg({ redirect_uris: ['https://claude.ai/cb', 'https://evil.example/cb'] })
  assert.equal(mixed.status, 400, 'one bad URI rejects the whole registration')
  assert.equal((await reg({})).status, 400)
})

test('a registered client is held to the URIs IT registered', async () => {
  const handler = routes()
  const reg = await handler(new Request(`${ORIGIN}/api/oauth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ redirect_uris: ['https://claude.ai/registered'] }),
  }))
  const { client_id } = await reg.json()

  const good = await handler(authorizeUrl({ client_id, redirect_uri: 'https://claude.ai/registered' }))
  assert.equal(good.status, 302)
  assert.match(good.headers.get('location'), /github\.com/)

  // An allowlisted origin this client did NOT register is still refused.
  const other = await handler(authorizeUrl({ client_id, redirect_uri: 'https://claude.ai/somewhere-else' }))
  assert.equal(other.status, 302)
  assert.match(new URL(other.headers.get('location')).search, /unauthorized_client/)
})

test('the router serves the PRM at BOTH paths RFC 9728 allows', async () => {
  const handler = routes()
  for (const path of ['/.well-known/oauth-protected-resource',
                      '/.well-known/oauth-protected-resource/mcp']) {
    const res = await handler(new Request(`${ORIGIN}${path}`))
    assert.equal(res.status, 200, `${path} must serve the document`)
    assert.equal((await res.json()).resource, `${ORIGIN}/mcp`,
      'both name the same canonical resource')
  }
})

test('the router serves both discovery documents and declines unknown paths', async () => {
  const handler = routes()
  const prm = await handler(new Request(`${ORIGIN}/.well-known/oauth-protected-resource`))
  assert.equal(prm.status, 200)
  assert.equal(prm.headers.get('Cache-Control'), 'no-store')
  const as = await handler(new Request(`${ORIGIN}/.well-known/oauth-authorization-server`))
  assert.equal((await as.json()).issuer, ORIGIN)
  assert.equal(await handler(new Request(`${ORIGIN}/mcp`, { method: 'POST' })), null,
    'a path we do not own returns null so the MCP handler takes it')
})

test('the default redirect allowlist is Claude plus loopback, and nothing else', () => {
  assert.deepEqual(DEFAULT_REDIRECT_ORIGINS,
    ['https://claude.ai', 'https://claude.com', 'http://localhost', 'http://127.0.0.1'])
})

// ── refresh tokens (open-items §0 #9, owner-approved 2026-10-07) ───────────
//
// Like everything else here they are signed, not stored, so they cannot be
// revoked one at a time. These tests pin the bounds that stand in for that.

const nowSec = () => Math.floor(Date.now() / 1000)
const refreshFor = (over = {}, opts) => mintRefreshToken({
  login: LOGIN, clientId: CLIENT_ID, resource: `${ORIGIN}/mcp`, authAt: nowSec(), ...over,
}, KEY, opts)

test('the shipped lifetimes: 30-day refresh tokens, renewals capped at ~6 months', () => {
  assert.equal(REFRESH_TOKEN_TTL_S, 30 * 24 * 3600)
  assert.equal(REFRESH_SESSION_MAX_S, 180 * 24 * 3600)
})

test('a refresh token renews, carrying the login, the resource and the ORIGINAL sign-in time', () => {
  const authAt = nowSec() - 1000
  const out = redeemRefreshToken(refreshFor({ authAt }), { clientId: CLIENT_ID, allowedLogin: LOGIN }, KEY)
  assert.deepEqual(out, { ok: true, login: LOGIN, resource: `${ORIGIN}/mcp`, authAt })
})

test('a refresh token is bound to its client', () => {
  const out = redeemRefreshToken(refreshFor(), { clientId: 'someone-else', allowedLogin: LOGIN }, KEY)
  assert.equal(out.ok, false)
  assert.equal(out.error, 'invalid_grant')
})

test('the ALLOWLIST is re-checked at every renewal', () => {
  const out = redeemRefreshToken(refreshFor({ login: 'someone-else' }), { clientId: CLIENT_ID, allowedLogin: LOGIN }, KEY)
  assert.equal(out.ok, false, 'a refresh token minted before the allowlist changed must stop renewing')
})

test('an expired refresh token is refused', () => {
  const t = refreshFor()
  const later = Date.now() + (REFRESH_TOKEN_TTL_S + 1) * 1000
  assert.equal(redeemRefreshToken(t, { clientId: CLIENT_ID, allowedLogin: LOGIN }, KEY, { now: later }).ok, false)
})

test('THE CAP: a chain of renewals cannot outlive the sign-in by more than ~6 months', () => {
  // A token minted near the end of the session is clipped to the session's end…
  const authAt = nowSec() - REFRESH_SESSION_MAX_S + 60
  const near = refreshFor({ authAt })
  const [body] = near.split('.')
  const { exp } = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  assert.equal(exp, authAt + REFRESH_SESSION_MAX_S, 'never a fresh 30 days past the cap')
  // …and a session already past the cap cannot renew, whatever exp claims.
  const stale = sign({ kind: 'refresh', login: LOGIN, clientId: CLIENT_ID, resource: ORIGIN,
    authAt: nowSec() - REFRESH_SESSION_MAX_S - 1, exp: nowSec() + 3600 }, KEY)
  assert.equal(redeemRefreshToken(stale, { clientId: CLIENT_ID, allowedLogin: LOGIN }, KEY).ok, false)
  const noAuthAt = sign({ kind: 'refresh', login: LOGIN, clientId: CLIENT_ID, resource: ORIGIN, exp: nowSec() + 3600 }, KEY)
  assert.equal(redeemRefreshToken(noAuthAt, { clientId: CLIENT_ID, allowedLogin: LOGIN }, KEY).ok, false,
    'no sign-in time means no cap can be checked, so no renewal')
})

test('the token kinds stay apart: refresh ≠ access ≠ code', () => {
  const access = mintAccessToken({ login: LOGIN, audience: ORIGIN, clientId: CLIENT_ID }, KEY)
  assert.equal(redeemRefreshToken(access, { clientId: CLIENT_ID, allowedLogin: LOGIN }, KEY).ok, false,
    'an access token cannot be traded for a refresh')
  assert.equal(redeemRefreshToken(codeFor(), { clientId: CLIENT_ID, allowedLogin: LOGIN }, KEY).ok, false)
  assert.equal(verifyAccessToken(refreshFor(), { audience: ORIGIN, allowedLogin: LOGIN }, KEY), null,
    'a refresh token is never a bearer')
  assert.equal(redeem(refreshFor()).ok, false, 'nor an authorization code')
})

test('a forged refresh token (wrong key) is refused', () => {
  const forged = mintRefreshToken({ login: LOGIN, clientId: CLIENT_ID, resource: ORIGIN, authAt: nowSec() },
    deriveSigningKey('someone-elses-secret'))
  assert.equal(redeemRefreshToken(forged, { clientId: CLIENT_ID, allowedLogin: LOGIN }, KEY).ok, false)
})

const tokenPost = (handler, params) => handler(new Request(`${ORIGIN}/api/oauth/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(params).toString(),
}))

test('THE ENDPOINT: a code returns a refresh token, and the refresh token renews into a working bearer', async () => {
  const handler = routes()
  const first = await (await tokenPost(handler, {
    grant_type: 'authorization_code', code: codeFor({ resource: `${ORIGIN}/mcp` }),
    client_id: CLIENT_ID, redirect_uri: 'https://claude.ai/cb', code_verifier: VERIFIER,
  })).json()
  assert.ok(first.refresh_token, 'without it the connector signs out after an hour')

  const res = await tokenPost(handler, { grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: CLIENT_ID })
  assert.equal(res.status, 200)
  const renewed = await res.json()
  assert.ok(renewed.expires_in <= 3600, 'the ACCESS token stays short-lived')
  assert.ok(renewed.refresh_token, 're-issued on every use, so weekly use keeps it alive')
  const info = verifyAccessToken(renewed.access_token, { audience: `${ORIGIN}/mcp`, allowedLogin: LOGIN }, KEY)
  assert.equal(info?.extra.login, LOGIN)
})

test('THE ENDPOINT: a renewal cannot change the audience the sign-in was for', async () => {
  const handler = routes()
  const t = refreshFor({ resource: `${ORIGIN}/mcp` })
  const renewed = await (await tokenPost(handler, {
    grant_type: 'refresh_token', refresh_token: t, client_id: CLIENT_ID, resource: 'https://evil.example',
  })).json()
  const [body] = renewed.access_token.split('.')
  assert.equal(JSON.parse(Buffer.from(body, 'base64url').toString('utf8')).aud, `${ORIGIN}/mcp`)
})

test('THE ENDPOINT: a refresh token for a de-listed login, another client, or garbage is invalid_grant', async () => {
  const handler = routes()
  for (const params of [
    { refresh_token: refreshFor({ login: 'someone-else' }), client_id: CLIENT_ID },
    { refresh_token: refreshFor(), client_id: 'someone-else' },
    { refresh_token: 'not-a-token', client_id: CLIENT_ID },
    { client_id: CLIENT_ID },
  ]) {
    const res = await tokenPost(handler, { grant_type: 'refresh_token', ...params })
    assert.equal(res.status, 400)
    assert.equal((await res.json()).error, 'invalid_grant')
  }
})

test('THE ENDPOINT: any other grant is still unsupported', async () => {
  const res = await tokenPost(routes(), { grant_type: 'client_credentials', client_id: CLIENT_ID })
  assert.equal((await res.json()).error, 'unsupported_grant_type')
})
