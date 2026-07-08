/**
 * GET /api/social/connect
 *
 * Ensures a single-user Upload-Post profile exists, requests a fresh
 * connect URL from the provider, and redirects the browser there so the
 * user can link social accounts through Upload-Post's hosted flow.
 *
 * On failure, redirects back to the accounts page with `?error=...` instead
 * of rendering a raw error page.
 */
import { NextResponse } from 'next/server'
import { generateSocialConnectUrl } from '@/services/SocialService'

export async function GET(request: Request) {
    const res = await generateSocialConnectUrl()
    if (!res.success || !res.data) {
        const back = new URL('/concepts/avatar-forge/social/accounts', request.url)
        back.searchParams.set('error', res.error || 'connect failed')
        return NextResponse.redirect(back)
    }
    return NextResponse.redirect(res.data.accessUrl)
}
