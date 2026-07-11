/**
 * Fanvue OAuth 2.0 (+ PKCE) helpers: authorize-URL construction and the
 * authorization-code / refresh-token grants against `https://auth.fanvue.com`.
 *
 * Server-only. Token values are never logged.
 */
import type { FanvueTokenResponse, FanvueTokens } from './types'

export const FANVUE_AUTH_BASE =
    process.env.FANVUE_AUTH_BASE || 'https://auth.fanvue.com'
export const FANVUE_API_BASE =
    process.env.FANVUE_API_BASE || 'https://api.fanvue.com'
export const FANVUE_API_VERSION = process.env.FANVUE_API_VERSION || '2025-06-26'

/** Cookie holding the signed `{ state, codeVerifier }` between connect + callback. */
export const FANVUE_STATE_COOKIE = 'fanvue_oauth_state'

/**
 * Agency scopes. Fanvue runs OIDC (Ory) — `openid` is required to start the
 * login/consent flow, and `offline_access`/`offline` are what make Fanvue
 * return a refresh token. The rest are the agency resource scopes. This mirrors
 * Fanvue's own quick-start example (`openid offline_access offline read:self …`).
 */
export const FANVUE_SCOPES = [
    'openid',
    'offline_access',
    'offline',
    'read:self',
    'read:agency',
    'read:creator',
    'write:creator',
    'read:media',
    'write:media',
    'read:post',
    'write:post',
    // Agent Inbox (Phase 2): list/read chats + send replies. Without these the
    // chat endpoints 403 (docs: get-list-of-chats → read:chat, send-a-message
    // → write:chat).
    'read:chat',
    'write:chat',
]

export function getRedirectUri(): string {
    return (
        process.env.FANVUE_REDIRECT_URI ||
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3030'}/api/fanvue/callback`
    )
}

function requireClientCredentials(): {
    clientId: string
    clientSecret: string
} {
    const clientId = process.env.FANVUE_CLIENT_ID
    const clientSecret = process.env.FANVUE_CLIENT_SECRET
    if (!clientId || !clientSecret) {
        throw new Error('FANVUE_CLIENT_ID / FANVUE_CLIENT_SECRET are not set')
    }
    return { clientId, clientSecret }
}

/**
 * Build the hosted-consent authorize URL. `state` + `codeChallenge` are
 * produced by the caller (see `pkce.ts`) so the verifier can be stashed in a
 * signed cookie for the callback.
 */
export function buildAuthorizeUrl(params: {
    state: string
    codeChallenge: string
    redirectUri?: string
    scopes?: string[]
}): string {
    const clientId = process.env.FANVUE_CLIENT_ID
    if (!clientId) throw new Error('FANVUE_CLIENT_ID is not set')

    const url = new URL('/oauth2/auth', FANVUE_AUTH_BASE)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', clientId)
    url.searchParams.set('redirect_uri', params.redirectUri ?? getRedirectUri())
    url.searchParams.set('scope', (params.scopes ?? FANVUE_SCOPES).join(' '))
    url.searchParams.set('state', params.state)
    url.searchParams.set('code_challenge', params.codeChallenge)
    url.searchParams.set('code_challenge_method', 'S256')
    return url.toString()
}

function toTokens(raw: FanvueTokenResponse): FanvueTokens {
    const ttlSeconds =
        typeof raw.expires_in === 'number' ? raw.expires_in : 3600
    return {
        accessToken: raw.access_token,
        refreshToken: raw.refresh_token,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
        scopes: raw.scope ? raw.scope.split(' ').filter(Boolean) : [],
    }
}

async function postToken(
    body: URLSearchParams,
    creds: { clientId: string; clientSecret: string },
): Promise<FanvueTokens> {
    // Fanvue's OAuth client is registered with token_endpoint_auth_method =
    // `client_secret_basic`, so the credentials MUST travel in the HTTP Basic
    // Authorization header — NOT in the form body (that would be
    // `client_secret_post`, which Fanvue rejects with invalid_client).
    const basic = Buffer.from(
        `${creds.clientId}:${creds.clientSecret}`,
    ).toString('base64')
    const res = await fetch(new URL('/oauth2/token', FANVUE_AUTH_BASE), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
            Authorization: `Basic ${basic}`,
        },
        body,
        // The token endpoint must not 3xx us elsewhere.
        redirect: 'error',
    })
    const text = await res.text()
    if (!res.ok) {
        // Error responses carry `{ error, error_description }`, not tokens.
        throw new Error(
            `Fanvue token endpoint returned ${res.status}: ${text.slice(0, 500)}`,
        )
    }
    let json: FanvueTokenResponse
    try {
        json = JSON.parse(text) as FanvueTokenResponse
    } catch {
        throw new Error('Fanvue token endpoint returned a non-JSON body')
    }
    if (!json.access_token || !json.refresh_token) {
        throw new Error('Fanvue token endpoint response was missing tokens')
    }
    return toTokens(json)
}

/** Exchange an authorization code (+ PKCE verifier) for the initial token pair. */
export async function exchangeCode(params: {
    code: string
    codeVerifier: string
    redirectUri?: string
}): Promise<FanvueTokens> {
    const { clientId, clientSecret } = requireClientCredentials()
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: params.code,
        redirect_uri: params.redirectUri ?? getRedirectUri(),
        code_verifier: params.codeVerifier,
    })
    return postToken(body, { clientId, clientSecret })
}

/**
 * Refresh the token pair. Fanvue rotates refresh tokens (single-use, 30s
 * grace) — the caller MUST persist the returned `refreshToken` before using
 * the new access token. See `tokenStore.ts`.
 */
export async function refreshTokens(params: {
    refreshToken: string
}): Promise<FanvueTokens> {
    const { clientId, clientSecret } = requireClientCredentials()
    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: params.refreshToken,
    })
    return postToken(body, { clientId, clientSecret })
}
