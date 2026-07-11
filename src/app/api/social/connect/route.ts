/**
 * GET /api/social/connect?avatarId=<uuid>
 *
 * Requests a fresh connect URL for the given avatar's Upload-Post account
 * (each avatar has its own account/API key) and redirects the browser there
 * so the user can link that avatar's social accounts through Upload-Post's
 * hosted flow.
 *
 * The avatar id travels back to /api/social/callback two ways: as a query
 * param on the registered redirect_url, and as a signed httpOnly cookie —
 * Upload-Post is not guaranteed to preserve the query string on the way back.
 *
 * On failure, redirects back to the accounts page with `?error=...` instead
 * of rendering a raw error page.
 */
import { NextResponse } from 'next/server'
import { generateSocialConnectUrl } from '@/services/SocialService'
import { signPayload } from '@/lib/fanvue/pkce'

const AVATAR_COOKIE = 'social_connect_avatar'

export async function GET(request: Request) {
    const url = new URL(request.url)
    const avatarId = url.searchParams.get('avatarId')
    const back = new URL('/concepts/avatar-forge/social/accounts', request.url)

    if (!avatarId) {
        back.searchParams.set('error', 'Missing avatar — start the connect flow from an avatar card')
        return NextResponse.redirect(back)
    }

    const res = await generateSocialConnectUrl(avatarId)
    if (!res.success || !res.data) {
        back.searchParams.set('error', res.error || 'connect failed')
        return NextResponse.redirect(back)
    }

    const response = NextResponse.redirect(res.data.accessUrl)
    response.cookies.set(AVATAR_COOKIE, signPayload(avatarId), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60, // the connect JWT lives 48h, but a connect session shouldn't
    })
    return response
}
