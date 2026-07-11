/**
 * PKCE (RFC 7636, S256) + signed-cookie helpers for the Fanvue OAuth flow.
 *
 * Server-only: uses node `crypto`. Never import from a client component.
 */
import crypto from 'node:crypto'

/**
 * Random `code_verifier`: 32 bytes → 43-char base64url string, comfortably
 * inside the RFC 7636 43–128 char range.
 */
export function generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url')
}

/** S256 `code_challenge` = base64url(SHA-256(code_verifier)). */
export function generateCodeChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url')
}

/** Opaque, unguessable CSRF `state` value. */
export function generateState(): string {
    return crypto.randomBytes(16).toString('base64url')
}

function stateSecret(): string {
    const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
    if (!secret) {
        throw new Error(
            'AUTH_SECRET / NEXTAUTH_SECRET is not set (required to sign the Fanvue OAuth state cookie)',
        )
    }
    return secret
}

/**
 * HMAC-sign an arbitrary payload string so the state cookie cannot be forged
 * or tampered with. Returns `"<payload>.<base64url-hmac>"`.
 */
export function signPayload(payload: string): string {
    const sig = crypto
        .createHmac('sha256', stateSecret())
        .update(payload)
        .digest('base64url')
    return `${payload}.${sig}`
}

/**
 * Verify a value produced by `signPayload`. Returns the original payload on a
 * valid, timing-safe signature match, otherwise `null`.
 */
export function verifySignedPayload(signed: string): string | null {
    const idx = signed.lastIndexOf('.')
    if (idx < 0) return null
    const payload = signed.slice(0, idx)
    const provided = signed.slice(idx + 1)
    const expected = crypto
        .createHmac('sha256', stateSecret())
        .update(payload)
        .digest('base64url')
    const a = Buffer.from(provided)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return null
    if (!crypto.timingSafeEqual(a, b)) return null
    return payload
}
