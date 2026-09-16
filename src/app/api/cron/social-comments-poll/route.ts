/**
 * GET /api/cron/social-comments-poll
 *
 * Cada 15 minutos (ver `vercel.json`): por cada `social_profiles` con la IA
 * de comentarios encendida (`status='active' and
 * ai_comment_replies_enabled=true`), primero sincroniza sus
 * `social_post_targets` desde el history de Upload-Post
 * (`syncPostTargets`) y después sondea comentarios nuevos en esos targets
 * (`pollProfileComments`) — ingesta al Inbox del agente + borrador/autopilot,
 * mismo patrón que `agent-inbox-poll`.
 *
 * Resiliencia POR PERFIL: un perfil que falla no tumba el resto (mismo
 * patrón que `agent-inbox-poll`/`social-reconcile`).
 *
 * Gated por `CRON_SECRET` (Bearer), igual que el resto de los crons.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { listPollableProfiles } from '@/lib/social/comments/settings'
import { syncPostTargets } from '@/lib/social/comments/targets'
import { pollProfileComments } from '@/lib/social/comments/poll'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: NextRequest) {
    const secret = process.env.CRON_SECRET
    const authHeader = request.headers.get('authorization')
    if (secret && authHeader !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const profiles = await listPollableProfiles()

    let synced = 0
    let targets = 0
    let comments = 0
    let newComments = 0
    let drafts = 0
    let autoQueued = 0
    let skippedOwn = 0
    let errors = 0
    const reauthRequired: { profile: string; platform: string }[] = []

    for (const { row, settings } of profiles) {
        try {
            const syncResult = await syncPostTargets(row)
            synced += syncResult.synced
        } catch (e) {
            errors++
            console.warn('[social-comments-poll] syncPostTargets falló para un perfil, se salta (el resto sigue)', {
                profileId: row.id,
            }, e)
        }

        try {
            const pollResult = await pollProfileComments(row)
            targets += pollResult.targets
            comments += pollResult.comments
            newComments += pollResult.newComments
            drafts += pollResult.drafts
            autoQueued += pollResult.autoQueued
            skippedOwn += pollResult.skippedOwn
            errors += pollResult.errors
            for (const platform of pollResult.reauthRequired) {
                reauthRequired.push({ profile: settings.uploadPostUsername, platform })
            }
        } catch (e) {
            errors++
            console.warn('[social-comments-poll] pollProfileComments falló para un perfil, se salta (el resto sigue)', {
                profileId: row.id,
            }, e)
        }
    }

    return NextResponse.json({
        profiles: profiles.length,
        synced,
        targets,
        comments,
        newComments,
        drafts,
        autoQueued,
        skippedOwn,
        reauthRequired,
        errors,
    })
}
