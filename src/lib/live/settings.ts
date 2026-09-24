/**
 * Carga de `avatar_live_settings` — el modo en vivo de un avatar (1:1).
 *
 * Mismo reparto que `src/lib/telegram/settings.ts`:
 *  - `loadLiveSettings(avatarId)`: SIN sesión, para las rutas /api/live/*
 *    (el visitante es anónimo). Usa `orgSupabase()` filtrando por
 *    `avatar_id`, que es UNIQUE en esta tabla, así que identifica una fila
 *    exacta sin organizationId de entrada; la org que haga falta después
 *    sale de la propia fila.
 *  - `loadLiveSettingsByPublicToken(token)`: SIN sesión, para el link
 *    público (Fase 2). `public_token` también es UNIQUE.
 *  - `loadLiveSettingsForOrg(ctx, avatarId)`: CON contexto, vía `orgTable`.
 *
 * `public_token` NO viaja en el DTO por defecto: es el secreto del link.
 * Sólo `toLiveSettingsWithToken` (para la pestaña de ajustes, con sesión y
 * permiso) lo incluye.
 *
 * Exenciones (candado F4.2 / `check:tenant`): usa `orgSupabase()` crudo en
 * las variantes sin sesión — motivo escrito en `scripts/check-tenant-access.mjs`
 * y en el bloque `no-restricted-syntax` de `eslint.config.mjs`.
 */
import { orgSupabase, orgTable } from '@/lib/org/orgTable'
import type { OrgContext } from '@/lib/tenant/getOrgContext'
import type { Database } from '@/@types/database.generated'
import { isFaceProvider, type FaceProvider } from './face/types'

export type LiveSettingsRow = Database['public']['Tables']['avatar_live_settings']['Row']

export type FaceStatus = 'none' | 'pending' | 'ready' | 'failed'
export type LiveSttProvider = 'minimax' | 'gemini'

export interface LiveSettings {
    avatarId: string
    organizationId: string
    enabled: boolean
    enabledAt: string | null
    disabledAt: string | null
    faceProvider: FaceProvider
    faceId: string | null
    faceStatus: FaceStatus
    faceError: string | null
    greeting: string | null
    sttProvider: LiveSttProvider | null
    publicEnabled: boolean
    maxSessionSeconds: number
    maxConcurrentSessions: number
    dailyMinutesCap: number
    allowedOrigins: string[]
    createdAt: string
    updatedAt: string
}

/** Único punto fila → DTO. `public_token` se omite aquí a propósito. */
export function toLiveSettings(row: LiveSettingsRow): LiveSettings {
    return {
        avatarId: row.avatar_id,
        organizationId: row.organization_id,
        enabled: row.enabled,
        enabledAt: row.enabled_at,
        disabledAt: row.disabled_at,
        faceProvider: isFaceProvider(row.face_provider) ? row.face_provider : 'anam',
        faceId: row.face_id,
        faceStatus: (row.face_status as FaceStatus) ?? 'none',
        faceError: row.face_error,
        greeting: row.greeting,
        sttProvider:
            row.stt_provider === 'minimax' || row.stt_provider === 'gemini' ? row.stt_provider : null,
        publicEnabled: row.public_enabled,
        maxSessionSeconds: row.max_session_seconds,
        maxConcurrentSessions: row.max_concurrent_sessions,
        dailyMinutesCap: row.daily_minutes_cap,
        allowedOrigins: row.allowed_origins ?? [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

/** Variante SIN sesión (rutas /api/live/*). `avatar_id` es UNIQUE. */
export async function loadLiveSettings(avatarId: string): Promise<LiveSettings | null> {
    const { data, error } = await orgSupabase()
        .from('avatar_live_settings')
        .select('*')
        .eq('avatar_id', avatarId)
        .maybeSingle()
    if (error) throw new Error(error.message)
    return data ? toLiveSettings(data) : null
}

/** Variante SIN sesión para el link público. `public_token` es UNIQUE. */
export async function loadLiveSettingsByPublicToken(token: string): Promise<LiveSettings | null> {
    if (!token) return null
    const { data, error } = await orgSupabase()
        .from('avatar_live_settings')
        .select('*')
        .eq('public_token', token)
        .maybeSingle()
    if (error) throw new Error(error.message)
    return data ? toLiveSettings(data) : null
}

/** Variante CON contexto — `orgTable` inyecta `organization_id = ctx.organizationId`. */
export async function loadLiveSettingsForOrg(
    ctx: OrgContext,
    avatarId: string,
): Promise<{ settings: LiveSettings; publicToken: string } | null> {
    const { data, error } = await orgTable(ctx, 'avatar_live_settings')
        .select('*')
        .eq('avatar_id', avatarId)
        .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    const row = data as LiveSettingsRow
    return { settings: toLiveSettings(row), publicToken: row.public_token }
}
