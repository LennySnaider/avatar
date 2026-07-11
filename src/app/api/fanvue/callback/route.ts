/**
 * GET /api/fanvue/callback
 *
 * Fanvue's hosted consent flow redirects back here with `?code&state`. We
 * verify the signed state cookie (CSRF + PKCE verifier), exchange the code for
 * tokens using the stored verifier, persist the agency connection for the
 * session user, clear the state cookie, and redirect back to the Fanvue
 * accounts page with `?connected=1` / `?error=...`.
 */
import { type NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { exchangeCode, FANVUE_STATE_COOKIE } from '@/lib/fanvue/oauth'
import { verifySignedPayload } from '@/lib/fanvue/pkce'
import { upsertConnection } from '@/lib/fanvue/tokenStore'

const ACCOUNTS_PATH = '/concepts/avatar-forge/fanvue/accounts'

export async function GET(request: NextRequest) {
    const back = new URL(ACCOUNTS_PATH, request.url)

    const finish = (params: Record<string, string>) => {
        for (const [key, value] of Object.entries(params))
            back.searchParams.set(key, value)
        const response = NextResponse.redirect(back)
        // Single-use: always clear the state cookie after the callback.
        response.cookies.delete(FANVUE_STATE_COOKIE)
        return response
    }

    try {
        const code = request.nextUrl.searchParams.get('code')
        const state = request.nextUrl.searchParams.get('state')
        const oauthError = request.nextUrl.searchParams.get('error')
        if (oauthError) {
            return finish({
                error:
                    request.nextUrl.searchParams.get('error_description') ||
                    oauthError,
            })
        }
        if (!code || !state)
            return finish({ error: 'Missing authorization code or state' })

        const rawCookie = request.cookies.get(FANVUE_STATE_COOKIE)?.value
        if (!rawCookie)
            return finish({
                error: 'Connect session expired — please try again',
            })

        const payload = verifySignedPayload(rawCookie)
        if (!payload)
            return finish({ error: 'Invalid connect state signature' })

        let parsed: { state?: string; codeVerifier?: string }
        try {
            parsed = JSON.parse(
                Buffer.from(payload, 'base64url').toString('utf8'),
            )
        } catch {
            return finish({ error: 'Malformed connect state' })
        }
        if (!parsed.state || !parsed.codeVerifier || parsed.state !== state) {
            return finish({ error: 'State mismatch — possible CSRF, aborting' })
        }

        const session = await auth()
        if (!session?.user?.id) return finish({ error: 'Not authenticated' })

        const tokens = await exchangeCode({
            code,
            codeVerifier: parsed.codeVerifier,
        })
        await upsertConnection(session.user.id, tokens)

        return finish({ connected: '1' })
    } catch (e) {
        return finish({
            error: e instanceof Error ? e.message : 'connect failed',
        })
    }
}
