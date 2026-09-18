'use server'

import { getOrgContext, type OrgContext } from '@/lib/tenant/getOrgContext'
import { requirePermission } from '@/lib/org/guards'
import { orgTable, orgSupabase, orgUpsert } from '@/lib/org/orgTable'
import { getRowMediaUrl } from '@/lib/storagePaths'
import {
    deriveUploadPostUsername,
    getSocialProvider,
    hasUploadPostKey,
    isAppManagedUsername,
    uploadPostKeyLast4,
} from '@/lib/social/provider'
import { assertActiveProfile } from '@/lib/social/profileGuard'
import { planProfileSync } from '@/lib/social/profileSync'
import { prepareInstagramPhotoUrl } from '@/lib/social/instagramFit'
import { DEFAULT_INSTAGRAM_FIT, isInstagramFit, type InstagramFit } from '@/lib/social/instagramFitRules'
import { indexKnowledgeSource } from '@/lib/agent/indexer'
import { UploadPostProviderError } from '@/lib/social/providers/UploadPostProvider'
import { validatePostForPlatforms } from '@/lib/social/platformValidators'
import { appendHashtagsToCaption } from '@/lib/social/hashtagHelpers'
import { validateSocialCommentSettingsPatch } from '@/lib/social/comments/settingsValidation'
import { ALL_PLATFORMS } from '@/@types/social'
import type { Platform, PlatformTarget } from '@/@types/social'
import type { ProfileDetails, PublishResponse, ScheduledPost } from '@/lib/social/providers/SocialProvider'
import type { Database, Json } from '@/@types/supabase'
import type { SocialCommentSettingsPatch } from '@/lib/social/comments/settingsValidation'

export type { SocialCommentSettingsPatch }

export interface SocialResult<T> { success: boolean; data?: T; error?: string }

type SocialProfileDbRow = Database['public']['Tables']['social_profiles']['Row']
type SocialPostDbRow = Database['public']['Tables']['social_posts']['Row']

/**
 * Client-safe view of ONE profile (sub-user) on the Upload-Post agency
 * account. `avatarId` null = unassigned (free to assign); `isExternal` = the
 * username does not follow this app's `slug-<8hex>` pattern, i.e. another
 * project created it on the shared account. No credential ever lives here:
 * the single agency key stays in env, server-side.
 */
export interface SocialProfileSummary {
    id: string
    avatarId: string | null
    uploadPostUsername: string
    status: string
    connectedPlatforms: unknown[]
    lastSyncedAt: string | null
    isExternal: boolean
    /** "IA en comentarios" (Task 6) — ver `updateSocialCommentSettings` más abajo. */
    aiCommentRepliesEnabled: boolean
    aiCommentDefaultChatMode: 'auto' | 'draft'
    aiCommentDmEnabled: boolean
    aiCommentDmText: string | null
    aiCommentDmButtons: { title: string; url: string }[]
}

export interface AvatarSocialAccountRow {
    avatarId: string
    avatarName: string
    profile: SocialProfileSummary | null
}

/** Estado de la cuenta agencia de Upload-Post (card superior de Social Accounts). */
export interface UploadPostAgencySummary {
    /** Hay `UPLOAD_POST_API_KEY` en el entorno del servidor. */
    configured: boolean
    keyLast4: string | null
    plan: string | null
    limit: number | null
    profilesUsed: number | null
    /** La consulta a Upload-Post falló (key inválida, red…); la parte de BD sigue valiendo. */
    remoteError: string | null
    /** Perfiles de esta org sin avatar asignado y activos en la cuenta. */
    unassigned: SocialProfileSummary[]
}

export interface SocialPostRow {
    id: string
    caption: string
    hashtags: string[]
    content_type: string
    media_urls: string[]
    platforms: unknown
    status: string
    scheduled_at: string | null
    published_at: string | null
    error_message: string | null
    created_at: string
    generation_id: string | null
    avatar_id: string | null
    avatar_name: string | null
}

export interface CreateSocialPostInput {
    /** Avatar whose Upload-Post account publishes this post. */
    avatarId: string
    generationId?: string
    /** Carousel: additional gallery generations (images only). Order = post order. */
    generationIds?: string[]
    caption: string
    hashtags: string[]
    platforms: string[]
    scheduledAt?: string | null
    /**
     * Cómo adaptar las FOTOS al feed de Instagram cuando su proporción queda
     * fuera de 4:5–1.91:1 (p.ej. las 9:16 del Studio, que Upload-Post rellena
     * con blanco): 'pad' = foto entera sobre fondo desenfocado (defecto),
     * 'crop' = recorte centrado. Solo actúa si 'instagram' va entre las
     * plataformas; Upload-Post recibe UNA lista de fotos, así que la variante
     * llega a todas las redes del post.
     */
    instagramFit?: InstagramFit
}

const fail = (e: unknown): { success: false; error: string } => ({
    success: false,
    error: e instanceof Error ? e.message : String(e),
})

const VALID_PLATFORMS = new Set<string>(ALL_PLATFORMS)

/** Narrow a plain-object/array value down to the Json type the jsonb columns expect. */
function toJson(value: unknown): Json {
    return value as Json
}

/** Validate raw platform strings from the client against the known Platform union. */
function toValidatedPlatforms(raw: string[]): { platforms: Platform[]; invalid: string[] } {
    const platforms: Platform[] = []
    const invalid: string[] = []
    for (const p of raw) {
        if (VALID_PLATFORMS.has(p)) platforms.push(p as Platform)
        else invalid.push(p)
    }
    return { platforms, invalid }
}

/**
 * `social_profiles.ai_comment_dm_buttons` (jsonb libre) → forma tipada para
 * el DTO cliente. A diferencia de `sanitizeDmButtons` (dmEligibility.ts, que
 * también valida longitud/URL para lo que se manda al proveedor), aquí sólo
 * importa que cada entrada tenga `title`/`url` de tipo string — el guardado
 * (`updateSocialCommentSettings`) ya garantiza que lo que queda en la fila
 * cumple las reglas; esto es sólo una guarda defensiva ante datos corruptos.
 */
function toDmButtons(raw: unknown): { title: string; url: string }[] {
    if (!Array.isArray(raw)) return []
    const out: { title: string; url: string }[] = []
    for (const item of raw) {
        if (!item || typeof item !== 'object') continue
        const title = (item as Record<string, unknown>).title
        const url = (item as Record<string, unknown>).url
        if (typeof title === 'string' && typeof url === 'string') out.push({ title, url })
    }
    return out
}

function toSummary(row: SocialProfileDbRow): SocialProfileSummary {
    return {
        id: row.id,
        avatarId: row.avatar_id,
        uploadPostUsername: row.upload_post_username,
        status: row.status,
        connectedPlatforms: Array.isArray(row.connected_platforms)
            ? (row.connected_platforms as unknown[])
            : [],
        lastSyncedAt: row.last_synced_at,
        isExternal: !isAppManagedUsername(row.upload_post_username),
        aiCommentRepliesEnabled: row.ai_comment_replies_enabled,
        aiCommentDefaultChatMode: row.ai_comment_default_chat_mode === 'auto' ? 'auto' : 'draft',
        aiCommentDmEnabled: row.ai_comment_dm_enabled,
        aiCommentDmText: row.ai_comment_dm_text,
        aiCommentDmButtons: toDmButtons(row.ai_comment_dm_buttons),
    }
}

/** Columnas de snapshot que se refrescan desde `getProfile` / `listProfiles`. */
function snapshotFromDetails(details: ProfileDetails) {
    return {
        connected_platforms: toJson(details.connectedAccounts ?? []),
        upload_post_metadata: details.metadata ? toJson(details.metadata) : null,
        last_synced_at: new Date().toISOString(),
    }
}

async function loadProfileByAvatar(ctx: OrgContext, avatarId: string): Promise<SocialProfileDbRow | null> {
    const { data, error } = await orgTable(ctx, 'social_profiles')
        .select('*')
        .eq('avatar_id', avatarId)
        .maybeSingle()
    if (error) throw new Error(error.message)
    return (data as SocialProfileDbRow | null) ?? null
}

/** Best-effort: trae el snapshot de redes del perfil; si falla, devuelve la fila tal cual. */
async function refreshSnapshot(ctx: OrgContext, row: SocialProfileDbRow): Promise<SocialProfileDbRow> {
    try {
        const details = await getSocialProvider().getProfile(row.upload_post_username)
        const { data } = await orgTable(ctx, 'social_profiles')
            .update(snapshotFromDetails(details))
            .eq('id', row.id)
            .select('*')
            .single()
        return data ? (data as SocialProfileDbRow) : row
    } catch (e) {
        console.warn('[SocialService] profile snapshot refresh failed (non-fatal)', e)
        return row
    }
}

function webhookCallbackUrl(): string {
    return `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3030'}/api/webhooks/upload-post`
}

// Event names as the Upload-Post Webhooks doc lists them (2026-09-17);
// `normalizeEventName()` in `src/app/api/webhooks/upload-post/route.ts`
// accepts these and the older dotted spellings.
const WEBHOOK_EVENTS = [
    'upload_completed',
    'social_account_connected',
    'social_account_disconnected',
    'social_account_reauth_required',
]

const SCHEDULE_MATCH_WINDOW_MS = 60 * 1000
const AMBIGUOUS_CANCEL_WINDOW_MS = 10 * 60 * 1000

/** Narrow a `platforms` jsonb value down to a `Set<Platform>` for comparison. */
function toPlatformSet(platforms: Json): Set<Platform> {
    if (!Array.isArray(platforms)) return new Set()
    return new Set(platforms.filter((p): p is Platform => typeof p === 'string') as Platform[])
}

function platformSetsEqual(a: Set<Platform>, b: Set<Platform>): boolean {
    if (a.size === 0 || a.size !== b.size) return false
    for (const platform of a) if (!b.has(platform)) return false
    return true
}

/**
 * Match a locally-known {scheduledAt, platforms} pair against Upload-Post's
 * `listScheduled` results, to recover the `jobId` that `PublishResponse`
 * never carries (see task-3 report addendum).
 *
 * This mirrors the cron's conservative `findScheduledMatch` in
 * `src/app/api/cron/social-reconcile/route.ts` (same rule, duplicated here
 * as a small pure function rather than importing across the route/service
 * boundary): a candidate must have (a) `scheduledAt` within 60 seconds of
 * ours, (b) an EXACT (non-empty) platform-set match, and (c) be the ONLY
 * candidate satisfying both — otherwise this refuses to guess and returns
 * `null`. The previous caption/title-prefix + 2-minute-window heuristic
 * ignored platforms entirely and used `.find()` (first match, no ambiguity
 * check), which could correlate to the WRONG provider job; since callers
 * use the result to cancel that job, a wrong match cancels someone else's
 * post instead of this one.
 */
function findMatchingScheduledJob(
    jobs: ScheduledPost[],
    targetScheduledAt: string | Date,
    platforms: Json,
): ScheduledPost | null {
    const targetMs = new Date(targetScheduledAt).getTime()
    if (Number.isNaN(targetMs)) return null
    const targetPlatforms = toPlatformSet(platforms)
    if (targetPlatforms.size === 0) return null

    const candidates = jobs.filter((job) => {
        const jobMs = new Date(job.scheduledAt).getTime()
        if (Number.isNaN(jobMs) || Math.abs(jobMs - targetMs) > SCHEDULE_MATCH_WINDOW_MS) return false
        return platformSetsEqual(targetPlatforms, new Set(job.platforms))
    })

    return candidates.length === 1 ? candidates[0] : null
}

/**
 * Trae el avatar acotado a la org de la sesión (guarda anti-IDOR).
 *
 * Antes verificaba pertenencia con `avatar.user_id !== userId`: dentro de una
 * org, `user_id` es sólo "creado por" (ver docstring de orgTable.ts), no la
 * frontera de tenant — el filtro `.eq('organization_id', ...)` de `orgTable`
 * YA es la comprobación real, igual que `assertAvatarInOrg` en
 * AvatarForgeService.ts.
 */
async function getOwnedAvatar(
    ctx: OrgContext,
    avatarId: string,
): Promise<{ id: string; name: string }> {
    const { data: avatar, error } = await orgTable(ctx, 'avatars')
        .select('id, name')
        .eq('id', avatarId)
        .maybeSingle()
    if (error) throw new Error(error.message)
    if (!avatar) throw new Error('Avatar not found')
    return { id: avatar.id, name: avatar.name }
}

/** Resolve avatar id + name for a batch of posts via their social profile. */
async function attachAvatarInfo(
    ctx: OrgContext,
    rows: SocialPostDbRow[],
): Promise<SocialPostRow[]> {
    const profileIds = [...new Set(rows.map((r) => r.social_profile_id).filter((id): id is string => Boolean(id)))]
    const profileToAvatar = new Map<string, string>()
    const avatarNames = new Map<string, string>()
    if (profileIds.length > 0) {
        const { data: profiles } = await orgTable(ctx, 'social_profiles')
            .select('id, avatar_id')
            .in('id', profileIds)
        for (const p of profiles ?? []) {
            if (p.avatar_id) profileToAvatar.set(p.id, p.avatar_id)
        }
        const avatarIds = [...new Set([...profileToAvatar.values()])]
        if (avatarIds.length > 0) {
            const { data: avatars } = await orgTable(ctx, 'avatars')
                .select('id, name')
                .in('id', avatarIds)
            for (const a of avatars ?? []) avatarNames.set(a.id, a.name)
        }
    }
    return rows.map((row) => {
        const avatarId = row.social_profile_id ? (profileToAvatar.get(row.social_profile_id) ?? null) : null
        return {
            id: row.id,
            caption: row.caption,
            hashtags: row.hashtags,
            content_type: row.content_type,
            media_urls: row.media_urls,
            platforms: row.platforms,
            status: row.status,
            scheduled_at: row.scheduled_at,
            published_at: row.published_at,
            error_message: row.error_message,
            created_at: row.created_at,
            generation_id: row.generation_id,
            avatar_id: avatarId,
            avatar_name: avatarId ? (avatarNames.get(avatarId) ?? null) : null,
        }
    })
}

// ---------------------------------------------------------------------------
// Avatars ↔ profiles of the agency account
// ---------------------------------------------------------------------------

/** All of the org's avatars, each with its assigned Upload-Post profile (or null). */
export async function listAvatarSocialAccounts(): Promise<SocialResult<AvatarSocialAccountRow[]>> {
    try {
        const ctx = await getOrgContext()
        requirePermission(ctx, 'content:read')
        // orgTable ya acota por organization_id: dentro de una org todos los
        // miembros ven todos sus avatares (mismo criterio que apiGetAvatars
        // en AvatarForgeService), así que el filtro previo por user_id/null
        // queda obsoleto.
        const { data: avatars, error: avErr } = await orgTable(ctx, 'avatars')
            .select('id, name')
            .order('created_at', { ascending: true })
        if (avErr) throw new Error(avErr.message)
        // orgTable devuelve el builder sin tipar (ver el gotcha documentado en
        // orgTable.ts); el cast va aquí, después del guard de arriba.
        const avatarRows = (avatars ?? []) as unknown as { id: string; name: string }[]

        const { data: profiles, error: prErr } = await orgTable(ctx, 'social_profiles')
            .select('*')
            .not('avatar_id', 'is', null)
        if (prErr) throw new Error(prErr.message)
        const byAvatar = new Map(
            ((profiles ?? []) as SocialProfileDbRow[]).map((p) => [p.avatar_id as string, p]),
        )

        return {
            success: true,
            data: avatarRows.map((a) => {
                const row = byAvatar.get(a.id)
                return {
                    avatarId: a.id,
                    avatarName: a.name,
                    profile: row ? toSummary(row) : null,
                }
            }),
        }
    } catch (e) {
        return fail(e)
    }
}


// ---------------------------------------------------------------------------
// Agency account + profile catalogue (SUPER-PLAN §4.0b, 2026-09-17)
// ---------------------------------------------------------------------------

/**
 * Estado de la cuenta agencia para la card superior: BD (perfiles libres de
 * esta org) + Upload-Post (plan, tope, perfiles usados). La parte remota es
 * best-effort: si la key es inválida o la API no responde, la página sigue
 * cargando y el motivo va en `remoteError`.
 */
export async function getUploadPostAgency(): Promise<SocialResult<UploadPostAgencySummary>> {
    try {
        const ctx = await getOrgContext()
        requirePermission(ctx, 'content:read')
        return { success: true, data: await buildAgencySummary(ctx) }
    } catch (e) {
        return fail(e)
    }
}

async function buildAgencySummary(ctx: OrgContext): Promise<UploadPostAgencySummary> {
    const unassigned = (await listUnassignedRows(ctx)).map(toSummary)
    const summary: UploadPostAgencySummary = {
        configured: hasUploadPostKey(),
        keyLast4: uploadPostKeyLast4(),
        plan: null,
        limit: null,
        profilesUsed: null,
        remoteError: null,
        unassigned,
    }
    if (!summary.configured) return summary
    try {
        const account = await getSocialProvider().listProfiles()
        summary.plan = account.plan
        summary.limit = account.limit
        summary.profilesUsed = account.profiles.length
    } catch (e) {
        summary.remoteError = e instanceof Error ? e.message : String(e)
    }
    return summary
}

async function listUnassignedRows(ctx: OrgContext): Promise<SocialProfileDbRow[]> {
    const { data, error } = await orgTable(ctx, 'social_profiles')
        .select('*')
        .is('avatar_id', null)
        .eq('status', 'active')
        .order('upload_post_username', { ascending: true })
    if (error) throw new Error(error.message)
    return (data ?? []) as SocialProfileDbRow[]
}

/**
 * "Refresh profiles": trae los perfiles de la cuenta agencia y los cruza con
 * las filas de esta org (`planProfileSync`, puro y testeado). Filas que
 * coinciden → snapshot fresco y `active`; perfiles nuevos → filas LIBRES
 * (avatar_id null) — un username que ya reclamó otra org se salta gracias a
 * `ignoreDuplicates` (índice único global); filas `active` que ya no están
 * en la cuenta → `disconnected` (conservan avatar_id y ajustes de IA). Nunca
 * borra nada en Upload-Post: la cuenta la comparten otros proyectos.
 */
export async function syncUploadPostProfiles(): Promise<
    SocialResult<{ agency: UploadPostAgencySummary; accounts: AvatarSocialAccountRow[] }>
> {
    try {
        const ctx = await getOrgContext()
        requirePermission(ctx, 'connection:manage')
        const account = await getSocialProvider().listProfiles()

        const { data: rows, error: rowsErr } = await orgTable(ctx, 'social_profiles')
            .select('id, upload_post_username, status')
        if (rowsErr) throw new Error(rowsErr.message)
        const plan = planProfileSync(
            (rows ?? []) as { id: string; upload_post_username: string; status: string }[],
            account.profiles,
        )

        for (const { id, details } of plan.activate) {
            const { error } = await orgTable(ctx, 'social_profiles')
                .update({ status: 'active', ...snapshotFromDetails(details) })
                .eq('id', id)
            if (error) throw new Error(error.message)
        }
        if (plan.insert.length > 0) {
            const { error } = await orgUpsert(
                ctx,
                'social_profiles',
                plan.insert.map((details) => ({
                    upload_post_username: details.username,
                    avatar_id: null,
                    status: 'active',
                    ...snapshotFromDetails(details),
                })),
                { onConflict: 'upload_post_username', ignoreDuplicates: true },
            )
            if (error) throw new Error(error.message)
        }
        if (plan.disconnect.length > 0) {
            const { error } = await orgTable(ctx, 'social_profiles')
                .update({ status: 'disconnected', connected_platforms: toJson([]) })
                .in('id', plan.disconnect)
            if (error) throw new Error(error.message)
        }

        const [agency, accounts] = await Promise.all([buildAgencySummary(ctx), listAvatarSocialAccounts()])
        if (!accounts.success) throw new Error(accounts.error ?? 'Could not list avatars')
        return { success: true, data: { agency, accounts: accounts.data ?? [] } }
    } catch (e) {
        return fail(e)
    }
}

/**
 * Crea el perfil del avatar en la cuenta agencia (o reutiliza uno que ya
 * exista con ese nombre) y lo deja asignado. Idempotente: el nombre es
 * determinista (`deriveUploadPostUsername`), Upload-Post tolera "ya existe",
 * y la fila previa del avatar (las legacy de las cuentas viejas) se REUTILIZA
 * — mismo id, así que el historial de posts y los ajustes `ai_comment_*`
 * sobreviven; sólo cambian username y estado.
 */
export async function createSocialProfileForAvatar(avatarId: string): Promise<SocialResult<SocialProfileSummary>> {
    try {
        const ctx = await getOrgContext()
        requirePermission(ctx, 'connection:manage')
        if (!avatarId) return { success: false, error: 'Avatar is required' }
        const avatar = await getOwnedAvatar(ctx, avatarId)

        const existing = await loadProfileByAvatar(ctx, avatarId)
        if (existing?.status === 'active') {
            return { success: false, error: 'This avatar already has a profile — unassign it first' }
        }
        const username = deriveUploadPostUsername(avatar)
        const provider = getSocialProvider()

        // Fila con ese mismo nombre (p.ej. un intento anterior que se quedó a
        // medias, o la propia fila legacy del avatar): se reutiliza.
        const { data: sameName, error: sameErr } = await orgTable(ctx, 'social_profiles')
            .select('*')
            .eq('upload_post_username', username)
            .maybeSingle()
        if (sameErr) throw new Error(sameErr.message)
        const free = sameName as SocialProfileDbRow | null
        if (free?.avatar_id && free.avatar_id !== avatarId) {
            return { success: false, error: `Profile ${username} is already assigned to another avatar` }
        }

        try {
            await provider.createProfile(username)
        } catch (e) {
            if (e instanceof UploadPostProviderError && e.isProfileLimitReached) {
                return { success: false, error: e.message }
            }
            const msg = e instanceof Error ? e.message : String(e)
            if (!/exist/i.test(msg)) throw e
        }

        let row: SocialProfileDbRow
        const target = free ?? existing
        if (target) {
            // El avatar arrastra OTRA fila (legacy con otro nombre) y además
            // hay una con el nombre nuevo: la legacy se queda sin avatar para
            // no chocar con el índice único de avatar_id.
            if (existing && free && existing.id !== free.id) {
                const { error } = await orgTable(ctx, 'social_profiles')
                    .update({ avatar_id: null })
                    .eq('id', existing.id)
                if (error) throw new Error(error.message)
            }
            const { data, error } = await orgTable(ctx, 'social_profiles')
                .update({
                    upload_post_username: username,
                    avatar_id: avatarId,
                    status: 'active',
                    connected_platforms: toJson([]),
                    upload_post_metadata: null,
                    last_synced_at: null,
                })
                .eq('id', target.id)
                .select('*')
                .single()
            if (error) throw new Error(error.message)
            row = data as SocialProfileDbRow
        } else {
            // Insert manual (no orgInsert): mismo patrón que apiCreateAvatar
            // en AvatarForgeService — organization_id de ctx, nunca del cliente.
            const { data, error } = await orgSupabase()
                .from('social_profiles')
                .insert({
                    avatar_id: avatarId,
                    upload_post_username: username,
                    status: 'active',
                    organization_id: ctx.organizationId,
                } as never)
                .select('*')
                .single()
            if (error) throw new Error(error.message)
            row = data as SocialProfileDbRow
        }

        row = await refreshSnapshot(ctx, row)
        return { success: true, data: toSummary(row) }
    } catch (e) {
        return fail(e)
    }
}

/**
 * Asigna un perfil LIBRE de la cuenta agencia a un avatar (calcado de
 * `setAvatarFanvueCreator`). Si el avatar arrastra una fila `disconnected`
 * (legacy), se le quita el avatar a esa fila primero: el índice único de
 * avatar_id no admite dos; su historial se queda en ella.
 */
export async function assignSocialProfileToAvatar(
    avatarId: string,
    profileId: string,
): Promise<SocialResult<SocialProfileSummary>> {
    try {
        const ctx = await getOrgContext()
        requirePermission(ctx, 'connection:manage')
        if (!avatarId || !profileId) return { success: false, error: 'Avatar and profile are required' }
        await getOwnedAvatar(ctx, avatarId)

        const { data: found, error: findErr } = await orgTable(ctx, 'social_profiles')
            .select('*')
            .eq('id', profileId)
            .maybeSingle()
        if (findErr) throw new Error(findErr.message)
        const profile = found as SocialProfileDbRow | null
        if (!profile) return { success: false, error: 'Profile not found' }
        if (profile.status !== 'active') {
            return { success: false, error: 'That profile is not on the agency account any more' }
        }
        if (profile.avatar_id && profile.avatar_id !== avatarId) {
            return { success: false, error: 'That profile is already assigned to another avatar' }
        }

        const current = await loadProfileByAvatar(ctx, avatarId)
        if (current && current.id !== profile.id) {
            if (current.status === 'active') {
                return { success: false, error: 'Unassign the current profile first' }
            }
            const { error } = await orgTable(ctx, 'social_profiles')
                .update({ avatar_id: null })
                .eq('id', current.id)
            if (error) throw new Error(error.message)
        }

        const { data, error } = await orgTable(ctx, 'social_profiles')
            .update({ avatar_id: avatarId })
            .eq('id', profile.id)
            .select('*')
            .single()
        if (error) throw new Error(error.message)
        const row = await refreshSnapshot(ctx, data as SocialProfileDbRow)
        return { success: true, data: toSummary(row) }
    } catch (e) {
        return fail(e)
    }
}

/**
 * Quita el avatar del perfil: el perfil sigue en la cuenta agencia (con sus
 * redes) y vuelve a la lista de libres. Apaga la IA de comentarios de la
 * fila: sin avatar no hay a quién responder, y `listPollableProfiles`
 * avisaría cada 15 min de una fila con IA encendida y sin avatar.
 */
export async function unassignSocialProfile(avatarId: string): Promise<SocialResult<SocialProfileSummary>> {
    try {
        const ctx = await getOrgContext()
        requirePermission(ctx, 'connection:manage')
        await getOwnedAvatar(ctx, avatarId)
        const { data, error } = await orgTable(ctx, 'social_profiles')
            .update({ avatar_id: null, ai_comment_replies_enabled: false, ai_comment_dm_enabled: false })
            .eq('avatar_id', avatarId)
            .select('*')
            .single()
        if (error) throw new Error(error.message)
        return { success: true, data: toSummary(data as SocialProfileDbRow) }
    } catch (e) {
        return fail(e)
    }
}

/**
 * Guarda los ajustes de "IA en comentarios" (Task 6): responder con IA,
 * modo inicial de los hilos nuevos y el DM privado de Instagram
 * (`ai_comment_*` en `social_profiles`). Exige cuenta Upload-Post activa —
 * sin perfil no hay canal que gatear (mismo criterio que
 * `updateTelegramAiSettings` en AgentTelegramService.ts, que exige bot
 * conectado). La validación (modo, botones, "no DM sin texto") vive en
 * `validateSocialCommentSettingsPatch` — puro, testeado sin Supabase — para
 * que un patch inválido se RECHACE con un error legible en vez de guardarse
 * a medias o descartar silenciosamente lo que no cumple.
 */
export async function updateSocialCommentSettings(
    avatarId: string,
    patch: SocialCommentSettingsPatch,
): Promise<SocialResult<SocialProfileSummary>> {
    try {
        const ctx = await getOrgContext()
        requirePermission(ctx, 'ai:autonomy')
        if (!avatarId) return { success: false, error: 'Avatar is required' }
        await getOwnedAvatar(ctx, avatarId)

        const { data: profile, error: profErr } = await orgTable(ctx, 'social_profiles')
            .select('*')
            .eq('avatar_id', avatarId)
            .maybeSingle()
        if (profErr) throw new Error(profErr.message)
        const row = profile as SocialProfileDbRow | null
        if (!row || row.status !== 'active') {
            return { success: false, error: 'This avatar has no active Upload-Post profile' }
        }

        const validated = validateSocialCommentSettingsPatch(patch, {
            aiCommentDmText: row.ai_comment_dm_text,
            aiCommentDmEnabled: row.ai_comment_dm_enabled,
        })
        if (!validated.ok) return { success: false, error: validated.error }

        // Patch vacío (o que sólo repite lo ya guardado): nada que escribir,
        // se devuelve la fila tal cual en vez de golpear la BD sin motivo.
        if (Object.keys(validated.update).length === 0) {
            return { success: true, data: toSummary(row) }
        }

        const dbUpdate: Record<string, unknown> = { ...validated.update }
        if (validated.update.ai_comment_dm_buttons !== undefined) {
            dbUpdate.ai_comment_dm_buttons = toJson(validated.update.ai_comment_dm_buttons)
        }

        const { data, error } = await orgTable(ctx, 'social_profiles')
            .update(dbUpdate)
            .eq('avatar_id', avatarId)
            .select('*')
            .single()
        if (error) throw new Error(error.message)
        return { success: true, data: toSummary(data as SocialProfileDbRow) }
    } catch (e) {
        // fail(e) no loguea (patrón conocido de este archivo) — acá sí, para
        // no sumar otro catch mudo (regla de global-constraints.md).
        console.error(
            '[SocialService.updateSocialCommentSettings]',
            { avatarId },
            e instanceof Error ? e.message : e,
        )
        return fail(e)
    }
}

export async function getSocialProfileAction(avatarId: string): Promise<SocialResult<SocialProfileSummary | null>> {
    try {
        const ctx = await getOrgContext()
        requirePermission(ctx, 'content:read')
        if (!avatarId) return { success: true, data: null }
        const { data, error } = await orgTable(ctx, 'social_profiles')
            .select('*')
            .eq('avatar_id', avatarId)
            .maybeSingle()
        if (error) throw new Error(error.message)
        return { success: true, data: data ? toSummary(data as SocialProfileDbRow) : null }
    } catch (e) {
        return fail(e)
    }
}

export async function generateSocialConnectUrl(avatarId: string): Promise<SocialResult<{ accessUrl: string; expiresAt: string | null }>> {
    try {
        const ctx = await getOrgContext()
        requirePermission(ctx, 'connection:manage')
        const avatar = await getOwnedAvatar(ctx, avatarId)
        const { data: profile } = await orgTable(ctx, 'social_profiles')
            .select('*')
            .eq('avatar_id', avatarId)
            .maybeSingle()
        if (!profile || profile.status !== 'active') {
            return {
                success: false,
                error: 'This avatar has no Upload-Post profile — create or assign one first',
            }
        }
        const provider = getSocialProvider()
        const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3030'}/api/social/callback?avatarId=${encodeURIComponent(avatarId)}`
        const res = await provider.generateConnectUrl({
            username: profile.upload_post_username,
            redirectUrl,
            connectTitle: `Connect ${avatar.name}'s accounts`,
        })
        return { success: true, data: { accessUrl: res.accessUrl, expiresAt: res.expiresAt.toISOString() } }
    } catch (e) {
        return fail(e)
    }
}

export async function syncConnectedAccounts(avatarId: string): Promise<SocialResult<SocialProfileSummary>> {
    try {
        const ctx = await getOrgContext()
        requirePermission(ctx, 'content:read')
        const { data: profile, error: profErr } = await orgTable(ctx, 'social_profiles')
            .select('*')
            .eq('avatar_id', avatarId)
            .maybeSingle()
        if (profErr) throw new Error(profErr.message)
        if (!profile) return { success: false, error: 'No Upload-Post profile for this avatar' }
        assertActiveProfile(profile)
        let details: ProfileDetails
        try {
            details = await getSocialProvider().getProfile(profile.upload_post_username)
        } catch (e) {
            // 404 = alguien borró el perfil en el panel de Upload-Post: la fila
            // pasa a disconnected en vez de seguir fingiendo que publica.
            if (e instanceof UploadPostProviderError && e.statusCode === 404) {
                const { data: gone, error: goneErr } = await orgTable(ctx, 'social_profiles')
                    .update({ status: 'disconnected', connected_platforms: toJson([]) })
                    .eq('id', profile.id)
                    .select('*')
                    .single()
                if (goneErr) throw new Error(goneErr.message)
                return { success: true, data: toSummary(gone as SocialProfileDbRow) }
            }
            throw e
        }
        const { data, error } = await orgTable(ctx, 'social_profiles')
            .update(snapshotFromDetails(details))
            .eq('id', profile.id)
            .select('*')
            .single()
        if (error) throw new Error(error.message)
        return { success: true, data: toSummary(data as SocialProfileDbRow) }
    } catch (e) {
        return fail(e)
    }
}

/** Registra el webhook de la CUENTA agencia: una sola vez, vale para todos los perfiles. */
export async function registerUploadPostWebhook(): Promise<SocialResult<{ configured: boolean }>> {
    try {
        const ctx = await getOrgContext()
        requirePermission(ctx, 'connection:manage')
        const result = await getSocialProvider().configureWebhook(webhookCallbackUrl(), WEBHOOK_EVENTS)
        return { success: true, data: { configured: result.configured } }
    } catch (e) {
        return fail(e)
    }
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

export async function createSocialPost(input: CreateSocialPostInput): Promise<SocialResult<SocialPostRow>> {
    try {
        const ctx = await getOrgContext()
        requirePermission(ctx, 'publish:social')

        if (!input.avatarId) {
            return { success: false, error: 'Select an avatar to post as' }
        }
        await getOwnedAvatar(ctx, input.avatarId)

        const { data: profile } = await orgTable(ctx, 'social_profiles')
            .select('*')
            .eq('avatar_id', input.avatarId)
            .eq('status', 'active')
            .maybeSingle()
        if (!profile) {
            return {
                success: false,
                error: 'This avatar has no Upload-Post profile — create or assign one in Social Accounts',
            }
        }
        const username = profile.upload_post_username

        const { platforms, invalid } = toValidatedPlatforms(input.platforms)
        if (invalid.length > 0) return { success: false, error: `Unknown platform(s): ${invalid.join(', ')}` }
        if (platforms.length === 0) return { success: false, error: 'Pick at least one platform' }

        // Resolve media from gallery generations (durable public URLs). A
        // single id posts as-is; multiple ids form a photo carousel (input
        // order preserved).
        const requestedIds = [
            ...(input.generationId ? [input.generationId] : []),
            ...(input.generationIds ?? []),
        ].filter((id, i, arr) => arr.indexOf(id) === i)
        let mediaUrls: string[] = []
        let contentType: 'photo' | 'video' | 'text' = 'text'
        let generationId: string | null = null
        if (requestedIds.length > 0) {
            // select('*') y no la lista de columnas: la URL de la media depende
            // de `storage_provider` (era R2) y esa columna puede no existir
            // todavía en la BD — nombrarla en el select rompería la query
            // entera, mientras que con '*' llega si está y si no, se cae a
            // Supabase como siempre. Mismo patrón que la galería del Studio.
            const { data: gens, error: genErr } = await orgTable(ctx, 'generations')
                .select('*')
                .in('id', requestedIds)
            if (genErr || !gens || gens.length !== requestedIds.length) {
                return { success: false, error: 'Generation not found' }
            }
            // orgTable devuelve el builder sin tipar (ver el gotcha documentado
            // en orgTable.ts); el cast va aquí, después del guard de arriba.
            const genRows = gens as unknown as Database['public']['Tables']['generations']['Row'][]
            const byId = new Map(genRows.map((g) => [g.id, g]))
            const ordered = requestedIds.map((id) => byId.get(id)!)
            // La comprobación previa era `gen.user_id !== userId`: dentro de una
            // org, `user_id` es sólo "creado por" (ver orgTable.ts) — el filtro
            // `.eq('organization_id', ...)` de `orgTable` ya garantiza que la
            // media es de ESTA org, así que cualquier miembro puede publicarla.
            for (const gen of ordered) {
                // Media generated under another avatar must not go out through
                // this avatar's accounts; avatar-less media (auto-saves) may.
                if (gen.avatar_id && gen.avatar_id !== input.avatarId) {
                    return { success: false, error: 'Media belongs to a different avatar' }
                }
            }
            if (ordered.length > 1 && ordered.some((g) => g.media_type === 'VIDEO')) {
                return { success: false, error: 'Carousels support images only — post videos individually' }
            }
            // URL POR FILA (2026-07-29): con `getStoragePublicUrl` fijo a
            // Supabase, la media que vive en R2 le llegaba a Upload-Post como
            // una URL 404 y el post se caía.
            mediaUrls = ordered.map((g) => getRowMediaUrl(g))
            contentType = ordered[0].media_type === 'VIDEO' ? 'video' : 'photo'
            generationId = ordered[0].id

            // Feed de Instagram: 4:5–1.91:1 o Upload-Post rellena con franjas
            // blancas (visto el 2026-09-18). Se manda una variante preparada;
            // si no se puede preparar, el post falla en vez de salir feo.
            if (contentType === 'photo' && platforms.includes('instagram')) {
                const fit = isInstagramFit(input.instagramFit) ? input.instagramFit : DEFAULT_INSTAGRAM_FIT
                try {
                    mediaUrls = await Promise.all(
                        ordered.map(async (gen, i) => {
                            const prepared = await prepareInstagramPhotoUrl({
                                organizationId: ctx.organizationId,
                                generationId: gen.id,
                                sourceUrl: mediaUrls[i],
                                fit,
                            })
                            return prepared.url
                        }),
                    )
                } catch (e) {
                    console.error('[SocialService] Instagram fit failed', { avatarId: input.avatarId, fit }, e)
                    return {
                        success: false,
                        error: `Could not prepare the photo for Instagram: ${e instanceof Error ? e.message : String(e)}`,
                    }
                }
            }
        }

        const caption = appendHashtagsToCaption(input.caption, input.hashtags)
        const validation = validatePostForPlatforms(caption, platforms, input.hashtags)
        const failures = Object.entries(validation).filter(([, result]) => result && !result.valid)
        if (failures.length > 0) {
            const message = failures
                .map(([platform, result]) => `${platform}: ${result?.errorKey ?? 'invalid'}`)
                .join('; ')
            return { success: false, error: message }
        }

        const provider = getSocialProvider()
        const platformTargets: PlatformTarget[] = platforms.map((platform) => ({ platform }))
        const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : undefined
        const publishBase = {
            username,
            caption,
            platforms: platformTargets,
            scheduledAt,
        }

        let dispatch: PublishResponse
        if (contentType === 'video') {
            if (mediaUrls.length === 0) return { success: false, error: 'Video post requires media' }
            dispatch = await provider.publishVideo({ ...publishBase, videoUrl: mediaUrls[0] })
        } else if (contentType === 'photo') {
            if (mediaUrls.length === 0) return { success: false, error: 'Photo post requires media' }
            dispatch = await provider.publishPhoto({ ...publishBase, photoUrls: mediaUrls })
        } else {
            dispatch = await provider.publishText(publishBase)
        }

        // Best-effort backfill: PublishResponse never carries Upload-Post's
        // internal schedule job id, so a scheduled dispatch is otherwise
        // uncancellable on the provider side (see task-3 report addendum).
        // Losing this lookup must never fail the publish that already
        // succeeded above.
        let uploadPostJobId: string | null = null
        if (input.scheduledAt) {
            try {
                const scheduled = await provider.listScheduled(username)
                uploadPostJobId = findMatchingScheduledJob(scheduled, input.scheduledAt, toJson(platforms))?.jobId ?? null
            } catch (e) {
                console.warn('[SocialService] listScheduled backfill failed', e)
            }
        }

        // Insert manual (no orgInsert): mismo patrón que apiSaveGeneration en
        // AvatarForgeService — organization_id + "creado por" de ctx.
        const { data: row, error: insErr } = await orgSupabase()
            .from('social_posts')
            .insert({
                social_profile_id: profile.id,
                generation_id: generationId,
                user_id: ctx.userId,
                caption,
                hashtags: input.hashtags,
                content_type: contentType,
                media_urls: mediaUrls,
                platforms: toJson(platforms),
                status: input.scheduledAt ? 'scheduled' : 'processing',
                scheduled_at: input.scheduledAt ?? null,
                upload_post_request_id: dispatch.requestId ?? null,
                upload_post_job_id: uploadPostJobId,
                upload_post_response: toJson(dispatch),
                organization_id: ctx.organizationId,
            } as never)
            .select('*')
            .single()
        if (insErr) throw new Error(insErr.message)

        // Agent RAG hook: published captions become avatar knowledge —
        // fire-and-forget, must never affect the publish result. El ctx ya
        // está resuelto arriba (sesión), no hace falta volver a resolverlo
        // por userId.
        if (caption.trim() && profile.avatar_id) {
            void (async () => {
                try {
                    await indexKnowledgeSource({
                        organizationId: ctx.organizationId,
                        avatarId: profile.avatar_id as string,
                        kind: 'post',
                        title: 'Social post',
                        content: caption,
                        sourceRef: `social_posts:${row.id}`,
                    })
                } catch (e) {
                    console.warn('[SocialService] knowledge index hook failed (non-fatal)', e)
                }
            })()
        }

        const [enriched] = await attachAvatarInfo(ctx, [row as SocialPostDbRow])
        return { success: true, data: enriched }
    } catch (e) {
        return fail(e)
    }
}

/**
 * generation_id → platforms it was published to (['instagram','x','fanvue']).
 * Drives the "Posted" badge in the gallery. Audio-muxed copies re-attribute to
 * their source generation via metadata.muxedFrom, so the ORIGINAL gallery item
 * shows as posted too.
 */
export async function getPostedGenerationMap(): Promise<SocialResult<Record<string, string[]>>> {
    try {
        const ctx = await getOrgContext()
        requirePermission(ctx, 'content:read')
        const map = new Map<string, Set<string>>()
        const add = (genId: string | null, labels: string[]) => {
            if (!genId || labels.length === 0) return
            const set = map.get(genId) ?? new Set<string>()
            labels.forEach((l) => set.add(l))
            map.set(genId, set)
        }

        // El badge "Posted" es de la galería compartida de la org (mismo
        // criterio que apiGetGenerations en AvatarForgeService, sin filtro
        // por user_id): si CUALQUIER miembro publicó la generación, se marca.
        const { data: socialPosts } = await orgTable(ctx, 'social_posts')
            .select('generation_id, platforms, status')
            .not('generation_id', 'is', null)
            .in('status', ['processing', 'scheduled', 'published'])
            .limit(1000)
        for (const post of socialPosts ?? []) {
            add(post.generation_id, [...toPlatformSet(post.platforms)])
        }

        const { data: fanvuePosts } = await orgTable(ctx, 'fanvue_posts')
            .select('generation_id, status')
            .in('status', ['published', 'scheduled'])
            .limit(1000)
        for (const post of fanvuePosts ?? []) {
            add(post.generation_id, ['fanvue'])
        }

        // Re-attribute muxed copies to their original generation.
        const postedIds = [...map.keys()]
        if (postedIds.length > 0) {
            const { data: gens } = await orgTable(ctx, 'generations')
                .select('id, metadata')
                .in('id', postedIds)
            for (const gen of gens ?? []) {
                const muxedFrom = (gen.metadata as { muxedFrom?: unknown } | null)?.muxedFrom
                if (typeof muxedFrom === 'string' && map.has(gen.id)) {
                    add(muxedFrom, [...(map.get(gen.id) ?? [])])
                }
            }
        }

        return {
            success: true,
            data: Object.fromEntries([...map].map(([k, v]) => [k, [...v]])),
        }
    } catch (e) {
        return fail(e)
    }
}

export async function listSocialPosts(): Promise<SocialResult<SocialPostRow[]>> {
    try {
        const ctx = await getOrgContext()
        requirePermission(ctx, 'content:read')
        const { data, error } = await orgTable(ctx, 'social_posts')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100)
        if (error) throw new Error(error.message)
        const enriched = await attachAvatarInfo(ctx, (data ?? []) as SocialPostDbRow[])
        return { success: true, data: enriched }
    } catch (e) {
        return fail(e)
    }
}

export async function cancelScheduledPost(postId: string): Promise<SocialResult<SocialPostRow>> {
    try {
        const ctx = await getOrgContext()
        requirePermission(ctx, 'publish:social')
        const { data: post } = await orgTable(ctx, 'social_posts')
            .select('*').eq('id', postId).single()
        if (!post) return { success: false, error: 'Post not found' }
        if (post.status !== 'scheduled') return { success: false, error: `Cannot cancel a ${post.status} post` }

        const cannotCancel = {
            success: false as const,
            error: 'Could not cancel on Upload-Post — the post may still publish. Try again or remove the connected account.',
        }

        // Resolve the profile this post went out through — the sub-user name
        // lives on the post's social profile; the key is the agency one.
        const { data: profile } = post.social_profile_id
            ? await orgTable(ctx, 'social_profiles')
                  .select('*')
                  .eq('id', post.social_profile_id)
                  .maybeSingle()
            : { data: null }
        if (!profile) return cannotCancel
        let provider
        try {
            assertActiveProfile(profile)
            provider = getSocialProvider()
        } catch (e) {
            console.warn('[SocialService] no usable profile to cancel with', e)
            return cannotCancel
        }
        const username = profile.upload_post_username

        // Resolve the provider job id: prefer the one backfilled at creation
        // time, else fall back to the same listScheduled match (covers rows
        // created before the backfill existed, or whose backfill missed).
        let jobId = post.upload_post_job_id
        // When no confident match is found, jobs scheduled near this post's
        // time (but not confidently matched) — used below to distinguish
        // "nothing exists remotely" from "something's there but ambiguous".
        let nearbyJobs: ScheduledPost[] | null = null
        if (!jobId && post.scheduled_at) {
            try {
                const scheduled = await provider.listScheduled(username)
                jobId = findMatchingScheduledJob(scheduled, post.scheduled_at, post.platforms)?.jobId ?? null
                if (!jobId) {
                    const targetMs = new Date(post.scheduled_at).getTime()
                    nearbyJobs = scheduled.filter((job) => {
                        const jobMs = new Date(job.scheduledAt).getTime()
                        return Number.isFinite(jobMs) && Math.abs(jobMs - targetMs) <= AMBIGUOUS_CANCEL_WINDOW_MS
                    })
                }
            } catch (e) {
                // Couldn't verify whether a remote job exists — do NOT mark
                // cancelled DB-only on an unverified guess (that's the exact
                // silent-failure bug this rewrite exists to close).
                console.warn('[SocialService] listScheduled lookup for cancel failed', e)
                return cannotCancel
            }
        }

        if (jobId) {
            try {
                await provider.cancelScheduled(jobId)
            } catch (e) {
                console.warn('[SocialService] provider cancel failed', e)
                return cannotCancel
            }
        } else if (nearbyJobs && nearbyJobs.length > 0) {
            // listScheduled succeeded and found jobs plausibly close (within
            // 10 minutes) to this post's scheduled time, but none confidently
            // matched (ambiguous or platform mismatch) — refuse to guess
            // which one is ours, and do NOT mark this row cancelled DB-only
            // while a live provider job may still be the real one and fire.
            return {
                success: false,
                error:
                    "Could not confidently identify this post's scheduled job on Upload-Post — cancel it from the Upload-Post dashboard, then refresh",
            }
        }
        // else: no plausible provider job at all near this post's scheduled
        // time (already fired, never made it to Upload-Post, or we had no
        // scheduled_at to check against) — nothing exists remotely to
        // cancel, so a DB-only cancel below is honest, not a guess.

        const { data: row, error } = await orgTable(ctx, 'social_posts')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('id', postId)
            .select('*')
            .single()
        if (error) throw new Error(error.message)
        const [enriched] = await attachAvatarInfo(ctx, [row as SocialPostDbRow])
        return { success: true, data: enriched }
    } catch (e) {
        return fail(e)
    }
}
