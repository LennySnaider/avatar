/**
 * GET /api/fanvue/connect
 *
 * Starts the Fanvue agency OAuth flow: builds the PKCE (S256) authorize URL,
 * stashes the signed {state, codeVerifier} in a short-lived, httpOnly cookie
 * (set on THIS redirect response — the documented Route Handler pattern), and
 * redirects the browser to Fanvue's hosted consent screen.
 *
 * On failure, redirects back to the Fanvue accounts page with `?error=...`.
 */
import { NextResponse } from 'next/server'
import { generateFanvueConnectUrl } from '@/services/FanvueService'

const ACCOUNTS_PATH = '/concepts/avatar-forge/fanvue/accounts'

export async function GET(request: Request) {
    try {
        const res = await generateFanvueConnectUrl()
        if (!res.success || !res.data) {
            const back = new URL(ACCOUNTS_PATH, request.url)
            back.searchParams.set('error', res.error || 'connect failed')
            return NextResponse.redirect(back)
        }

        const { authorizeUrl, stateCookie } = res.data
        const response = NextResponse.redirect(authorizeUrl)
        response.cookies.set(stateCookie.name, stateCookie.value, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: stateCookie.maxAge,
        })
        return response
    } catch (e) {
        // Never surface a bare 500 — bounce back to the accounts page with a
        // readable reason so the UI can show it.
        console.error('[fanvue/connect] failed:', e)
        const back = new URL(ACCOUNTS_PATH, request.url)
        back.searchParams.set(
            'error',
            e instanceof Error ? e.message : 'connect failed',
        )
        return NextResponse.redirect(back)
    }
}
