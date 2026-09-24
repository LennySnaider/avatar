'use server'

/**
 * Pestaña "Live" del agente de un avatar — módulo premium `live_avatar`.
 *
 * TODA acción empieza igual que las de Telegram: permiso → módulo →
 * propiedad del avatar (ver `src/lib/org/guards.ts`). Sin el módulo
 * instalado ninguna acción hace nada y la pestaña ni se pinta.
 *
 * Este fichero NO toca nada de la generación de avatares: sólo lee el avatar,
 * su persona y su voz, y escribe en `avatar_live_settings`.
 *
 * Todos los exports son async porque el fichero es `'use server'`.
 */
import { randomBytes } from 'node:crypto'
import { getOrgContext, type OrgContext } from '@/lib/tenant/getOrgContext'
import { orgTable, orgUpsert } from '@/lib/org/orgTable'
import { requireModule } from '@/lib/modules/entitlements'
import { ctxCan, isExpectedDenial, requirePermission } from '@/lib/org/guards'
import { loadLiveSettingsForOrg, type LiveSettings, type LiveSttProvider } from '@/lib/live/settings'
import { LiveSessionError, startLiveSession, type StartedLiveSession } from '@/lib/live/session'
import { isFaceProviderConfigured } from '@/lib/live/face'
import { FACE_PROVIDERS, isFaceProvider, type FaceProvider } from '@/lib/live/face/types'
import { createAnamAvatarFromImage, isAnamAvatarReady } from '@/lib/live/face/anamAvatars'
import { getReferenceMediaUrl } from '@/lib/storagePaths'

const MODULE_SLUG = 'live_avatar'

export interface LiveResult<T> {
    success: boolean
    data?: T
    error?: string
}

export interface LiveTabData {
    settings: LiveSettings | null
    /** Secreto del link público. Sólo para quien puede gestionar conexiones. */
    publicToken: string | null
    hasPersona: boolean
    hasVoice: boolean
    voiceName: string | null
    /** Qué proveedores de cara tienen API key en este entorno. */
    configuredProviders: FaceProvider[]
    canManage: boolean
    canTest: boolean
}

export interface LiveSettingsPatch {
    enabled?: boolean
    faceProvider?: FaceProvider
    faceId?: string | null
    greeting?: string | null
    sttProvider?: LiveSttProvider | null
    publicEnabled?: boolean
    maxSessionSeconds?: number
    maxConcurrentSessions?: number
    dailyMinutesCap?: number
    allowedOrigins?: string[]
}

function fail<T>(where: string, e: unknown): LiveResult<T> {
    if (!isExpectedDenial(e) && !(e instanceof LiveSessionError)) console.error(`[AgentLiveService] ${where}`, e)
    return { success: false, error: e instanceof Error ? e.message : 'Error inesperado' }
}

/** Mismo patrón que `assertOwnedAvatar` de AgentTelegramService.ts. */
async function assertOwnedAvatar(ctx: OrgContext, avatarId: string): Promise<{ default_voice_id: string | null }> {
    const { data, error } = await orgTable(ctx, 'avatars')
        .select('id, default_voice_id')
        .eq('id', avatarId)
        .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new Error('Avatar no encontrado en tu organización.')
    return data as { default_voice_id: string | null }
}

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
    const n = Math.round(Number(v))
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

export async function getLiveTabData(avatarId: string): Promise<LiveResult<LiveTabData>> {
    try {
        const ctx = await getOrgContext()
        requirePermission(ctx, 'content:read')
        await requireModule(ctx, MODULE_SLUG)
        const avatar = await assertOwnedAvatar(ctx, avatarId)

        const [loaded, personaRes, voiceRes] = await Promise.all([
            loadLiveSettingsForOrg(ctx, avatarId),
            orgTable(ctx, 'avatar_personas').select('id').eq('avatar_id', avatarId).maybeSingle(),
            avatar.default_voice_id
                ? orgTable(ctx, 'cloned_voices').select('name, status').eq('id', avatar.default_voice_id).maybeSingle()
                : Promise.resolve({ data: null }),
        ])
        const voice = voiceRes.data as { name: string; status: string } | null
        const canManage = ctxCan(ctx, 'connection:manage')
        return {
            success: true,
            data: {
                settings: loaded?.settings ?? null,
                publicToken: canManage ? (loaded?.publicToken ?? null) : null,
                hasPersona: Boolean(personaRes.data),
                hasVoice: voice?.status === 'ready',
                voiceName: voice?.name ?? null,
                configuredProviders: FACE_PROVIDERS.filter(isFaceProviderConfigured),
                canManage,
                canTest: ctxCan(ctx, 'generation:create'),
            },
        }
    } catch (e) {
        return fail('getLiveTabData', e)
    }
}

/**
 * Guarda los ajustes. Encender el modo en vivo abre el periodo facturable
 * (`enabled_at`, sólo la PRIMERA vez) y apagarlo lo cierra (`disabled_at`,
 * sólo si estaba encendido) — mismo criterio que connected_at /
 * disconnected_at en Telegram.
 */
export async function updateLiveSettings(
    avatarId: string,
    patch: LiveSettingsPatch,
): Promise<LiveResult<LiveSettings>> {
    try {
        const ctx = await getOrgContext()
        requirePermission(ctx, 'connection:manage')
        await requireModule(ctx, MODULE_SLUG)
        await assertOwnedAvatar(ctx, avatarId)

        const current = (await loadLiveSettingsForOrg(ctx, avatarId))?.settings ?? null
        const now = new Date().toISOString()
        const row: Record<string, unknown> = { avatar_id: avatarId, updated_at: now }

        if (patch.faceProvider !== undefined) {
            if (!isFaceProvider(patch.faceProvider)) throw new Error('Proveedor de cara no válido.')
            row.face_provider = patch.faceProvider
        }
        if (patch.faceId !== undefined) {
            const id = patch.faceId?.trim() || null
            if (id && !/^[A-Za-z0-9_\-/.:]{4,200}$/.test(id)) throw new Error('El face id no tiene un formato válido.')
            row.face_id = id
            row.face_status = id ? 'ready' : 'none'
            row.face_error = null
        }
        if (patch.greeting !== undefined) row.greeting = patch.greeting?.trim().slice(0, 300) || null
        if (patch.sttProvider !== undefined) {
            row.stt_provider = patch.sttProvider === 'minimax' || patch.sttProvider === 'gemini' ? patch.sttProvider : null
        }
        if (patch.publicEnabled !== undefined) row.public_enabled = Boolean(patch.publicEnabled)
        if (patch.maxSessionSeconds !== undefined) row.max_session_seconds = clampInt(patch.maxSessionSeconds, 60, 3600, 600)
        if (patch.maxConcurrentSessions !== undefined) {
            row.max_concurrent_sessions = clampInt(patch.maxConcurrentSessions, 1, 50, 3)
        }
        if (patch.dailyMinutesCap !== undefined) row.daily_minutes_cap = clampInt(patch.dailyMinutesCap, 0, 100000, 120)
        if (patch.allowedOrigins !== undefined) {
            row.allowed_origins = patch.allowedOrigins
                .map((o) => o.trim().replace(/\/+$/, ''))
                .filter((o) => /^https?:\/\/[^\s/]+$/i.test(o))
                .slice(0, 20)
        }
        if (patch.enabled !== undefined) {
            if (patch.enabled) {
                const faceId = (row.face_id as string | null | undefined) ?? current?.faceId
                if (!faceId) throw new Error('Pega primero el face id de la cara en vivo.')
                row.enabled = true
                row.disabled_at = null
                if (!current?.enabledAt) row.enabled_at = now
            } else {
                row.enabled = false
                if (current?.enabled) row.disabled_at = now
            }
        }

        const { error } = await orgUpsert(ctx, 'avatar_live_settings', row as never, { onConflict: 'avatar_id' })
        if (error) throw new Error(error.message)
        const saved = await loadLiveSettingsForOrg(ctx, avatarId)
        if (!saved) throw new Error('No se pudieron leer los ajustes guardados.')
        return { success: true, data: saved.settings }
    } catch (e) {
        return fail('updateLiveSettings', e)
    }
}

/** Nuevo secreto para el link público: el anterior deja de funcionar al instante. */
export async function rotateLivePublicToken(avatarId: string): Promise<LiveResult<{ publicToken: string }>> {
    try {
        const ctx = await getOrgContext()
        requirePermission(ctx, 'connection:manage')
        await requireModule(ctx, MODULE_SLUG)
        await assertOwnedAvatar(ctx, avatarId)
        const publicToken = randomBytes(24).toString('hex')
        const { data, error } = await orgTable(ctx, 'avatar_live_settings')
            .update({ public_token: publicToken, updated_at: new Date().toISOString() })
            .eq('avatar_id', avatarId)
            .select('id')
        if (error) throw new Error(error.message)
        if (!data?.length) throw new Error('Guarda primero los ajustes del modo en vivo.')
        return { success: true, data: { publicToken } }
    } catch (e) {
        return fail('rotateLivePublicToken', e)
    }
}

/** Llamada de prueba desde la app: mismo núcleo que el link público. */
export async function startInternalLiveSession(avatarId: string): Promise<LiveResult<StartedLiveSession>> {
    try {
        const ctx = await getOrgContext()
        requirePermission(ctx, 'generation:create')
        await requireModule(ctx, MODULE_SLUG)
        await assertOwnedAvatar(ctx, avatarId)
        const started = await startLiveSession({
            avatarId,
            expectedOrganizationId: ctx.organizationId,
            source: 'internal',
            visitorId: `internal:${ctx.userId}`,
            displayName: 'Prueba interna',
        })
        return { success: true, data: started }
    } catch (e) {
        return fail('startInternalLiveSession', e)
    }
}

/**
 * Crea la cara en vivo (Anam) desde la foto `face` más reciente del avatar,
 * la misma que usa el estudio. Queda `pending` hasta que Anam termine
 * (<2 min); `refreshLiveFaceStatus` la pasa a `ready`.
 */
export async function createLiveFaceFromAvatar(avatarId: string): Promise<LiveResult<LiveSettings>> {
    try {
        const ctx = await getOrgContext()
        requirePermission(ctx, 'connection:manage')
        await requireModule(ctx, MODULE_SLUG)
        await assertOwnedAvatar(ctx, avatarId)

        const [{ data: avatarRow }, { data: refs }] = await Promise.all([
            orgTable(ctx, 'avatars').select('name').eq('id', avatarId).maybeSingle(),
            orgTable(ctx, 'avatar_references')
                .select('type, storage_path, storage_provider, created_at')
                .eq('avatar_id', avatarId)
                .in('type', ['face', 'general'])
                .order('created_at', { ascending: false }),
        ])
        const list = (refs ?? []) as { type: string; storage_path: string; storage_provider: string | null }[]
        const ref = list.find((r) => r.type === 'face') ?? list[0]
        if (!ref) throw new Error('Este avatar no tiene foto de cara: súbela en Avatar Forge.')

        const { id, ready } = await createAnamAvatarFromImage({
            displayName: (avatarRow as { name?: string } | null)?.name ?? 'Avatar',
            imageUrl: getReferenceMediaUrl(ref.storage_path, ref.storage_provider),
        })
        const { error } = await orgUpsert(
            ctx,
            'avatar_live_settings',
            {
                avatar_id: avatarId,
                face_provider: 'anam',
                face_id: id,
                face_status: ready ? 'ready' : 'pending',
                face_error: null,
                updated_at: new Date().toISOString(),
            } as never,
            { onConflict: 'avatar_id' },
        )
        if (error) throw new Error(error.message)
        const saved = await loadLiveSettingsForOrg(ctx, avatarId)
        if (!saved) throw new Error('No se pudieron leer los ajustes guardados.')
        return { success: true, data: saved.settings }
    } catch (e) {
        return fail('createLiveFaceFromAvatar', e)
    }
}

/** ¿Terminó Anam de preparar la cara? Pasa `pending` → `ready`. */
export async function refreshLiveFaceStatus(avatarId: string): Promise<LiveResult<LiveSettings>> {
    try {
        const ctx = await getOrgContext()
        requirePermission(ctx, 'content:read')
        await requireModule(ctx, MODULE_SLUG)
        await assertOwnedAvatar(ctx, avatarId)
        const loaded = await loadLiveSettingsForOrg(ctx, avatarId)
        if (!loaded) throw new Error('Guarda primero los ajustes del modo en vivo.')
        const s = loaded.settings
        if (s.faceProvider === 'anam' && s.faceId && s.faceStatus === 'pending' && (await isAnamAvatarReady(s.faceId))) {
            await orgTable(ctx, 'avatar_live_settings')
                .update({ face_status: 'ready', updated_at: new Date().toISOString() })
                .eq('avatar_id', avatarId)
            const again = await loadLiveSettingsForOrg(ctx, avatarId)
            return { success: true, data: again?.settings ?? s }
        }
        return { success: true, data: s }
    } catch (e) {
        return fail('refreshLiveFaceStatus', e)
    }
}
