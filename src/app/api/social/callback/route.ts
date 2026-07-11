/**
 * GET /api/social/callback
 *
 * Upload-Post's hosted connect flow redirects the browser back here once
 * the user finishes (or abandons) linking accounts. We resolve WHICH avatar
 * was being connected — from the `?avatarId=` query param we put on the
 * redirect_url, falling back to the signed cookie set by /api/social/connect
 * — and best-effort refresh that avatar's connected-accounts snapshot. If
 * neither carrier survived, every active profile is refreshed instead
 * (benign degradation). The accounts page also has a manual "Refresh"
 * button in case this sync misses anything.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { listAvatarSocialAccounts, syncConnectedAccounts } from '@/services/SocialService'
import { verifySignedPayload } from '@/lib/fanvue/pkce'

const AVATAR_COOKIE = 'social_connect_avatar'

export async function GET(request: NextRequest) {
    const url = new URL(request.url)
    const qpAvatar = url.searchParams.get('avatarId')
    const cookieRaw = request.cookies.get(AVATAR_COOKIE)?.value
    const cookieAvatar = cookieRaw ? verifySignedPayload(cookieRaw) : null
    const avatarId = qpAvatar ?? cookieAvatar

    // Best-effort sync; both actions return errors as data, never throw.
    if (avatarId) {
        await syncConnectedAccounts(avatarId)
    } else {
        const accounts = await listAvatarSocialAccounts()
        for (const account of accounts.data ?? []) {
            if (account.profile?.status === 'active') {
                await syncConnectedAccounts(account.avatarId)
            }
        }
    }

    const back = new URL('/concepts/avatar-forge/social/accounts', request.url)
    back.searchParams.set('connected', '1')
    if (avatarId) back.searchParams.set('avatarId', avatarId)
    const response = NextResponse.redirect(back)
    response.cookies.delete(AVATAR_COOKIE)
    return response
}
