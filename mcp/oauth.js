// oauth.js — the login, and why it is STATELESS.
//
// The MCP spec makes the server an OAuth 2.1 *resource server*; we also act as
// our own *authorization server*, with GitHub as the upstream identity
// provider. That normally needs three pieces of durable state — registered
// clients, one-time authorization codes, and issued tokens — and a serverless
// host has nowhere to keep them.
//
// Two facts remove the need:
//
//   1. NO DYNAMIC CLIENT REGISTRATION. The spec says clients and servers
//      SHOULD support RFC 7591, and offers the documented alternative for
//      servers that do not: the client is pre-registered out of band. Claude's
//      connector UI has exactly that — "Advanced settings" for an OAuth Client
//      ID and Secret. So there is one client, it lives in config, and there is
//      no registry to persist.
//
//   2. EVERYTHING ELSE IS SIGNED, NOT STORED. An authorization code and an
//      access token are each a payload plus an HMAC over it. Verification is
//      recomputing the MAC, so any instance can verify what any other minted,
//      with nothing shared but the key.
//
// ── WHY NOT A JWT LIBRARY ──────────────────────────────────────────────────
//
// `jose` is present as a transitive dependency of the SDK, but relying on a
// transitive dep is one upstream release away from breaking, and CLAUDE.md's
// rule 5 is explicit: write the ~30-line vanilla version first and only
// propose a dependency if that is genuinely worse. HS256 over base64url is
// a hash and a comparison. This is the same reasoning that produced `cn.js`
// instead of a classnames package.
//
// ── WHAT SIGNED-NOT-STORED COSTS, STATED PLAINLY ───────────────────────────
//
// - A token cannot be revoked before it expires. Access tokens are therefore
//   SHORT (1 hour). Revocation in practice is rotating the GitHub client
//   secret, which changes the derived key and invalidates every token at once.
// - An authorization code cannot be marked used, so replay is bounded by its
//   60-second lifetime rather than prevented outright. PKCE is what actually
//   protects it: a replayed code without the original `code_verifier` is
//   useless, which is why S256 is REQUIRED here and `plain` is rejected.
//
// Both are real trade-offs and both are acceptable for a single-user server.
// Neither would be acceptable for a multi-tenant one — that wants the KV the
// caching layer deliberately does not need.

import crypto from 'node:crypto'

export const ACCESS_TOKEN_TTL_S = 60 * 60      // 1 hour — short, because unrevocable
export const AUTH_CODE_TTL_S = 60              // 60 seconds — long enough to redeem, no more
export const GITHUB_STATE_TTL_S = 10 * 60      // the human is in the loop here

const b64u = buf => Buffer.from(buf).toString('base64url')
const unb64u = str => Buffer.from(str, 'base64url')

// The signing key is DERIVED from the GitHub client secret rather than being a
// second secret the owner has to create, store and rotate. HKDF with a
// distinct `info` string is the standard way to get an independent key from
// existing material — the derived key cannot be run backwards to the secret,
// and a different `info` would yield an unrelated key. An explicit
// DYNASTYEDGE_TOKEN_SECRET still wins if one is ever set.
export function deriveSigningKey(clientSecret, override = null) {
  if (override) return Buffer.from(override, 'utf8')
  if (!clientSecret) throw new Error('No GITHUB_CLIENT_SECRET — cannot derive a signing key')
  return Buffer.from(
    crypto.hkdfSync('sha256', Buffer.from(clientSecret, 'utf8'), Buffer.alloc(0),
      Buffer.from('dynastyedge-mcp token signing v1', 'utf8'), 32)
  )
}

// A compact signed token: base64url(payload).base64url(hmac). Deliberately not
// a JWT — there is no `alg` header, so there is no algorithm to confuse and no
// `alg: none` to reject. One algorithm, always.
export function sign(payload, key) {
  const body = b64u(JSON.stringify(payload))
  const mac = crypto.createHmac('sha256', key).update(body).digest()
  return `${body}.${b64u(mac)}`
}

export function verify(token, key, { now = Date.now() } = {}) {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, mac] = parts

  const expected = crypto.createHmac('sha256', key).update(body).digest()
  let given
  try { given = unb64u(mac) } catch { return null }
  // timingSafeEqual throws on a length mismatch, which is itself an oracle if
  // it escapes — check the length first, then compare in constant time.
  if (given.length !== expected.length) return null
  if (!crypto.timingSafeEqual(given, expected)) return null

  let payload
  try { payload = JSON.parse(unb64u(body).toString('utf8')) } catch { return null }
  if (typeof payload?.exp !== 'number' || payload.exp * 1000 <= now) return null
  return payload
}

// ── PKCE ───────────────────────────────────────────────────────────────────
//
// S256 ONLY. `plain` is permitted by OAuth 2.1 in narrow cases and is useless
// here — it makes the challenge equal to the verifier, so an attacker holding
// the code also holds everything needed to redeem it, which is the one thing
// PKCE exists to prevent. Since an authorization code cannot be marked used
// in a stateless design, PKCE is not defence in depth here; it IS the defence.
export function verifyPkce(codeVerifier, codeChallenge) {
  if (typeof codeVerifier !== 'string' || typeof codeChallenge !== 'string') return false
  if (codeVerifier.length < 43 || codeVerifier.length > 128) return false
  const computed = b64u(crypto.createHash('sha256').update(codeVerifier, 'ascii').digest())
  const a = Buffer.from(computed)
  const b = Buffer.from(codeChallenge)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

const nowS = () => Math.floor(Date.now() / 1000)

// ── the three token kinds ──────────────────────────────────────────────────

// Carries the client's original request across the GitHub round trip, so
// nothing has to be remembered while the human is logging in.
export function mintGithubState(params, key) {
  return sign({ ...params, kind: 'gh-state', exp: nowS() + GITHUB_STATE_TTL_S }, key)
}

export function readGithubState(state, key) {
  const p = verify(state, key)
  return p?.kind === 'gh-state' ? p : null
}

// ── DYNAMIC CLIENT REGISTRATION, WITHOUT A REGISTRY ───────────────────────
//
// The first cut had no `/register` at all, on the reading that RFC 7591 is a
// SHOULD and a pre-registered client is the documented alternative. That was
// wrong in practice: Claude's connector registers itself, and with no
// registration endpoint it cannot even START sign-in — the failure the owner
// hit, before a browser ever opened.
//
// A registry is the one piece of OAuth state that genuinely has to persist...
// unless the client_id IS the registration. Signing the redirect URIs into
// the id means `/authorize` can recover them by verifying a MAC, so any
// instance honours a registration any other issued, with nothing stored.
//
// THE ALLOWLIST STILL BINDS AT REGISTRATION. A signed id is only ever minted
// for URIs that passed the origin check, so this widens who may register, not
// where a code may be sent.
export const CLIENT_ID_TTL_S = 10 * 365 * 24 * 60 * 60 // effectively permanent

export function mintClientId(redirectUris, key) {
  return sign({
    kind: 'client', redirectUris,
    exp: nowS() + CLIENT_ID_TTL_S,
  }, key)
}

// Returns the registered redirect URIs, or null when this is not one of ours.
export function readClientId(clientId, key) {
  const p = verify(clientId, key)
  return p?.kind === 'client' && Array.isArray(p.redirectUris) ? p.redirectUris : null
}

export function mintAuthCode({ login, clientId, redirectUri, codeChallenge, resource }, key) {
  return sign({
    kind: 'code', login, clientId, redirectUri, codeChallenge, resource,
    exp: nowS() + AUTH_CODE_TTL_S,
  }, key)
}

// Redeeming binds the code to the client, the exact redirect URI it was issued
// for, and the PKCE verifier. Any mismatch is a refusal, never a warning.
export function redeemAuthCode(code, { clientId, redirectUri, codeVerifier }, key) {
  const p = verify(code, key)
  if (p?.kind !== 'code') return { ok: false, error: 'invalid_grant', reason: 'Code invalid or expired' }
  if (p.clientId !== clientId) return { ok: false, error: 'invalid_grant', reason: 'Code was issued to a different client' }
  if (p.redirectUri !== redirectUri) return { ok: false, error: 'invalid_grant', reason: 'redirect_uri does not match the authorization request' }
  if (!verifyPkce(codeVerifier, p.codeChallenge)) return { ok: false, error: 'invalid_grant', reason: 'PKCE verification failed' }
  return { ok: true, login: p.login, resource: p.resource }
}

// THE AUDIENCE IS NOT OPTIONAL. The spec is explicit: a server MUST reject a
// token that was not issued for it. Without `aud`, a token minted by some
// other service using the same key shape would be accepted here — the
// "confused deputy" the spec devotes a section to.
export function mintAccessToken({ login, audience, clientId }, key) {
  return sign({
    kind: 'access', login, aud: audience, clientId,
    iat: nowS(), exp: nowS() + ACCESS_TOKEN_TTL_S,
  }, key)
}

export function verifyAccessToken(token, { audience, audiences, allowedLogin }, key) {
  const p = verify(token, key)
  if (p?.kind !== 'access') return null
  // A client may name the resource as the canonical MCP URL or as the bare
  // origin; both identify this server. The check still REJECTS anything else,
  // which is what audience binding is for — this accepts two spellings of us,
  // never someone else.
  const accepted = audiences ?? (audience ? [audience] : [])
  if (!accepted.includes(p.aud)) return null
  // The allowlist is re-checked at EVERY request, not only at login. A token
  // minted before the allowlist changed must stop working immediately.
  if (allowedLogin && p.login !== allowedLogin) return null
  return { token, clientId: p.clientId, scopes: ['mcp'], expiresAt: p.exp, extra: { login: p.login } }
}

// ── the metadata documents ─────────────────────────────────────────────────

// RFC 9728. The MCP spec says a server MUST serve this, and MUST point at it
// from WWW-Authenticate on a 401.
// `resource` MUST be the canonical URI of the MCP server — the URL the client
// actually connected to, path included. Returning the bare origin made the
// document fail to match what the user typed, which is a silent discovery
// failure rather than an error anyone sees.
export function protectedResourceMetadata(origin, resource = origin) {
  return {
    resource,
    authorization_servers: [origin],
    bearer_methods_supported: ['header'],
    scopes_supported: ['mcp'],
  }
}

// RFC 8414.
export function authorizationServerMetadata(origin) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/api/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    // Clients register themselves — see mintClientId. Without this, a client
    // that expects RFC 7591 cannot begin sign-in at all.
    registration_endpoint: `${origin}/api/oauth/register`,
    code_challenge_methods_supported: ['S256'],
    // A PUBLIC client — no client secret. OAuth 2.1 supports this precisely
    // when PKCE protects the code exchange, which it does here. The
    // alternative was inventing a second secret for the owner to create,
    // store in Vercel AND paste into Claude; it would add a handling step for
    // a value that guards nothing PKCE plus the GitHub login and the
    // allowlist do not already guard.
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['mcp'],
  }
}
