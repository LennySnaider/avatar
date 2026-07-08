/**
 * GET /api/social/callback
 *
 * Upload-Post's hosted connect flow redirects the browser back here once
 * the user finishes (or abandons) linking accounts. We best-effort refresh
 * the locally cached connected-accounts snapshot and send the user back to
 * the accounts page — the page itself also exposes a manual "Refresh"
 * button in case this sync misses anything (e.g. propagation delay on the
 * provider's side).
 */
import { NextResponse } from 'next/server'
import { syncConnectedAccounts } from '@/services/SocialService'

export async function GET(request: Request) {
    await syncConnectedAccounts() // best-effort; page shows a Refresh button too
    return NextResponse.redirect(
        new URL('/concepts/avatar-forge/social/accounts?connected=1', request.url),
    )
}
