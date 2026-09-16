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
 * Override manual `?sinceDays=N` (acotado a 1..30, default 7 —
 * `clampSinceDays`): para probar el sondeo contra datos reales sin esperar
 * la ventana de 7 días por defecto (p.ej. el último post de un perfil es
 * más viejo que eso y con el default no hay nada que sincronizar). Vercel
 * Scheduled Functions llama sin query string, así que en producción esto
 * siempre cae al default — no cambia el comportamiento programado.
 *
 * Gated por `CRON_SECRET` (Bearer), igual que el resto de los crons.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { listPollableProfiles } from '@/lib/social/comments/settings'
import { syncPostTargets } from '@/lib/social/comments/targets'
import { pollProfileComments } from '@/lib/social/comments/poll'
import { clampSinceDays } from '@/lib/social/comments/pollRules'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: NextRequest) {
    const secret = process.env.CRON_SECRET
    const authHeader = request.headers.get('authorization')
    if (secret && authHeader !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const sinceDays = clampSinceDays(request.nextUrl.searchParams.get('sinceDays'))

    const profiles = await listPollableProfiles()

    let synced = 0
    /** Entradas del history con `success=false` de `syncPostTargets`
     *  (publicó bien en una red, falló en otra) — visibilidad operativa,
     *  distinto de `errors` (que son fallos de ESTE sondeo, no del post). */
    let historyFailed = 0
    let targets = 0
    let comments = 0
    let newComments = 0
    let drafts = 0
    let autoQueued = 0
    let skippedOwn = 0
    /** Comentarios ingeridos que se quedaron sin borrador por agotarse el
     *  presupuesto de borradores del perfil (`DRAFT_BUDGET_PER_PROFILE`);
     *  sus hilos quedan `needs_attention` en el Inbox. */
    let draftBudgetExhausted = 0
    let errors = 0
    const reauthRequired: { profile: string; platform: string }[] = []

    for (const { row, settings } of profiles) {
        try {
            const syncResult = await syncPostTargets(row, sinceDays)
            synced += syncResult.synced
            historyFailed += syncResult.failedEntries
            if (syncResult.reauth) {
                // `listHistory` no es por plataforma (una llamada cubre
                // todas las del post) — se marca con 'history' en vez de
                // una plataforma concreta, a diferencia de lo que reporta
                // pollProfileComments más abajo.
                reauthRequired.push({ profile: settings.uploadPostUsername, platform: 'history' })
            }
        } catch (e) {
            errors++
            console.warn('[social-comments-poll] syncPostTargets falló para un perfil, se salta (el resto sigue)', {
                profileId: row.id,
            }, e)
        }

        try {
            const pollResult = await pollProfileComments(row, { sinceDays })
            targets += pollResult.targets
            comments += pollResult.comments
            newComments += pollResult.newComments
            drafts += pollResult.drafts
            autoQueued += pollResult.autoQueued
            skippedOwn += pollResult.skippedOwn
            draftBudgetExhausted += pollResult.draftBudgetExhausted
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
        sinceDays,
        synced,
        historyFailed,
        targets,
        comments,
        newComments,
        drafts,
        autoQueued,
        skippedOwn,
        draftBudgetExhausted,
        reauthRequired,
        errors,
    })
}
