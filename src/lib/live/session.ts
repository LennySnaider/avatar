/**
 * Ciclo de vida de una sesión en vivo: arrancar, autenticar cada petición,
 * heartbeat y cierre.
 *
 * SIN SESIÓN DE NEXTAUTH a propósito: el visitante del link público es
 * anónimo, así que las rutas /api/live/* no tienen cookie ni `OrgContext`.
 * La organización sale SIEMPRE de una fila ya resuelta —la de
 * `avatar_live_settings` al arrancar, la de `live_sessions` después— y cada
 * consulta la usa como filtro `.eq('organization_id', …)` explícito. Mismo
 * patrón que el webhook de Telegram. Exención escrita en
 * `scripts/check-tenant-access.mjs` y en `eslint.config.mjs`.
 *
 * El secreto de la sesión (32 bytes aleatorios) sólo viaja al navegador en
 * la respuesta de arranque; en la base se guarda su sha256 y se compara en
 * tiempo constante.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { orgSupabase } from '@/lib/org/orgTable'
import { hasModuleForOrg } from '@/lib/modules/entitlements'
import { resolveAvatarTargetById, touchFanMemory, upsertChat } from '@/lib/agent/inboxSync'
import type { Database } from '@/@types/database.generated'
import { decideSessionStart, LIVE_LIMITS, liveSessionState, remainingSessionSeconds } from './policy'
import { loadLiveSettings, loadLiveSettingsByPublicToken, type LiveSettings } from './settings'
import { mintFaceSession, type FaceClientConfig } from './face'
import { chargeLiveMinutes, hasLiveBalance } from './billing'

export const LIVE_MODULE_SLUG = 'live_avatar'
/** `agent_chats.platform` de las conversaciones en vivo. */
export const LIVE_PLATFORM = 'live'

export type LiveSessionRow = Database['public']['Tables']['live_sessions']['Row']

export class LiveSessionError extends Error {
    constructor(
        readonly code: string,
        message: string,
        readonly status = 400,
    ) {
        super(message)
        this.name = 'LiveSessionError'
    }
}

export interface StartLiveSessionInput {
    avatarId: string
    /** Si el llamador ya conoce la org (prueba interna con sesión), se exige que coincida. */
    expectedOrganizationId?: string
    source: 'internal' | 'public'
    visitorId: string
    displayName?: string | null
    ipHash?: string | null
    userAgent?: string | null
}

export interface StartedLiveSession {
    sessionId: string
    /** Secreto de la sesión: va en `Authorization: Bearer` de cada turno. */
    sessionSecret: string
    face: FaceClientConfig
    avatarName: string
    maxSessionSeconds: number
    heartbeatIntervalMs: number
}

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')

function startOfUtcDayIso(nowMs: number): string {
    const d = new Date(nowMs)
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString()
}

export async function startLiveSession(input: StartLiveSessionInput): Promise<StartedLiveSession> {
    const settings = await loadLiveSettings(input.avatarId)
    if (!settings) throw new LiveSessionError('disabled', 'El modo en vivo de este avatar no está configurado.', 404)
    if (input.expectedOrganizationId && settings.organizationId !== input.expectedOrganizationId) {
        throw new LiveSessionError('not_found', 'Avatar no encontrado.', 404)
    }
    const organizationId = settings.organizationId
    if (!(await hasModuleForOrg(organizationId, LIVE_MODULE_SLUG))) {
        throw new LiveSessionError('module', 'El módulo Avatar en vivo no está instalado.', 403)
    }
    if (!(await hasLiveBalance(organizationId))) {
        throw new LiveSessionError('no_tokens', 'La organización no tiene tokens para llamadas en vivo.', 402)
    }

    const supabase = orgSupabase()
    const nowMs = Date.now()
    const [avatarRes, personaRes, activeRes, todayRes] = await Promise.all([
        supabase
            .from('avatars')
            .select('id, name, default_voice_id')
            .eq('organization_id', organizationId)
            .eq('id', input.avatarId)
            .maybeSingle(),
        supabase
            .from('avatar_personas')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('avatar_id', input.avatarId)
            .maybeSingle(),
        supabase
            .from('live_sessions')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', organizationId)
            .eq('avatar_id', input.avatarId)
            .eq('status', 'active')
            .gt('last_seen_at', new Date(nowMs - LIVE_LIMITS.staleAfterMs).toISOString()),
        supabase
            .from('live_sessions')
            .select('started_at, last_seen_at, ended_at')
            .eq('organization_id', organizationId)
            .eq('avatar_id', input.avatarId)
            .gte('started_at', startOfUtcDayIso(nowMs)),
    ])
    const avatar = avatarRes.data
    if (!avatar) throw new LiveSessionError('not_found', 'Avatar no encontrado.', 404)

    let hasVoice = false
    if (avatar.default_voice_id) {
        const { data: voice } = await supabase
            .from('cloned_voices')
            .select('id, status')
            .eq('organization_id', organizationId)
            .eq('id', avatar.default_voice_id)
            .maybeSingle()
        hasVoice = voice?.status === 'ready'
    }

    const minutesToday = (todayRes.data ?? []).reduce((acc, s) => {
        const end = Date.parse(s.ended_at ?? s.last_seen_at)
        const start = Date.parse(s.started_at)
        return Number.isFinite(end) && Number.isFinite(start) ? acc + Math.max(0, end - start) / 60_000 : acc
    }, 0)

    const decision = decideSessionStart({
        enabled: settings.enabled,
        faceId: settings.faceId,
        hasVoice,
        hasPersona: Boolean(personaRes.data),
        activeCount: activeRes.count ?? 0,
        maxConcurrent: settings.maxConcurrentSessions,
        minutesToday,
        dailyCapMinutes: settings.dailyMinutesCap,
    })
    if (!decision.ok) {
        const status = decision.reason === 'concurrency' || decision.reason === 'daily_cap' ? 429 : 409
        throw new LiveSessionError(decision.reason, decision.message, status)
    }

    const target = await resolveAvatarTargetById(input.avatarId)
    if (!target || target.organizationId !== organizationId) {
        throw new LiveSessionError('not_found', 'Avatar no encontrado.', 404)
    }
    const displayName = input.displayName?.trim() || `Visitor ${input.visitorId.slice(-4)}`
    const chat = await upsertChat({
        target,
        fanUuid: input.visitorId,
        fanDisplayName: displayName,
        platform: LIVE_PLATFORM,
        // `off`: ni borradores ni autopilot tocan una conversación en vivo.
        defaultMode: 'off',
        lastMessageAt: new Date(nowMs).toISOString(),
    })
    await touchFanMemory(target, input.visitorId, displayName, LIVE_PLATFORM)

    const secret = randomBytes(32).toString('hex')
    const { data: row, error } = await supabase
        .from('live_sessions')
        .insert({
            organization_id: organizationId,
            avatar_id: input.avatarId,
            chat_id: chat.id,
            source: input.source,
            visitor_id: input.visitorId,
            secret_hash: sha256(secret),
            stt_provider: settings.sttProvider,
            ip_hash: input.ipHash ?? null,
            user_agent: input.userAgent?.slice(0, 300) ?? null,
        })
        .select('id')
        .single()
    if (error || !row) throw new Error(`live_sessions insert: ${error?.message ?? 'sin fila'}`)

    let face: FaceClientConfig
    try {
        face = await mintFaceSession({
            provider: settings.faceProvider,
            faceId: settings.faceId as string,
            maxSessionSeconds: settings.maxSessionSeconds,
            maxIdleSeconds: LIVE_LIMITS.faceMaxIdleSeconds,
        })
    } catch (e) {
        await markEnded(organizationId, row.id, 'face_error')
        console.error('[live] no se pudo abrir la sesión de cara', { avatarId: input.avatarId }, e)
        throw new LiveSessionError(
            'face_error',
            'No se pudo conectar con el proveedor de la cara. Revisa el face id y la API key.',
            502,
        )
    }

    return {
        sessionId: row.id,
        sessionSecret: secret,
        face,
        avatarName: avatar.name,
        maxSessionSeconds: settings.maxSessionSeconds,
        heartbeatIntervalMs: LIVE_LIMITS.heartbeatIntervalMs,
    }
}

/** Saca el secreto de `Authorization: Bearer …`. */
export function bearerSecret(header: string | null): string | null {
    if (!header) return null
    const m = /^Bearer\s+([0-9a-f]{64})$/i.exec(header.trim())
    return m ? m[1] : null
}

/**
 * Carga la sesión y comprueba el secreto en tiempo constante. `null` si no
 * existe o no coincide: la ruta responde lo mismo en los dos casos.
 */
export async function authenticateLiveSession(
    sessionId: string,
    secret: string | null,
): Promise<LiveSessionRow | null> {
    if (!sessionId || !secret || !/^[0-9a-f-]{36}$/i.test(sessionId)) return null
    const { data } = await orgSupabase().from('live_sessions').select('*').eq('id', sessionId).maybeSingle()
    // Se compara SIEMPRE, exista o no la fila (contra un hash ficticio si
    // hace falta): el tiempo de respuesta no delata si el id existe.
    const expected = Buffer.from(data?.secret_hash ?? sha256(randomBytes(16).toString('hex')), 'hex')
    const given = Buffer.from(sha256(secret), 'hex')
    const ok = expected.length === given.length && timingSafeEqual(expected, given)
    return ok && data ? data : null
}

export interface UsableSession {
    session: LiveSessionRow
    settings: LiveSettings
}

/**
 * La sesión autenticada, si todavía puede usarse: activa, con heartbeat
 * reciente, dentro de su tope, con el módulo instalado y el modo en vivo
 * encendido. Si ya no, la cierra con el motivo y lanza.
 */
export async function requireUsableSession(session: LiveSessionRow): Promise<UsableSession> {
    const settings = await loadLiveSettings(session.avatar_id)
    if (!settings || settings.organizationId !== session.organization_id) {
        await markEnded(session.organization_id, session.id, 'settings_missing')
        throw new LiveSessionError('ended', 'La sesión terminó.', 410)
    }
    const state = liveSessionState({
        status: session.status,
        startedAt: session.started_at,
        lastSeenAt: session.last_seen_at,
        maxSessionSeconds: settings.maxSessionSeconds,
        nowMs: Date.now(),
    })
    if (state !== 'ok') {
        if (state !== 'ended') await markEnded(session.organization_id, session.id, state, 'expired')
        throw new LiveSessionError(
            state,
            state === 'too_long' ? 'Se acabó el tiempo de la llamada.' : 'La sesión terminó.',
            410,
        )
    }
    if (!settings.enabled) {
        await markEnded(session.organization_id, session.id, 'disabled')
        throw new LiveSessionError('disabled', 'El modo en vivo de este avatar se apagó.', 410)
    }
    if (!(await hasModuleForOrg(session.organization_id, LIVE_MODULE_SLUG))) {
        await markEnded(session.organization_id, session.id, 'module_uninstalled')
        throw new LiveSessionError('module', 'El módulo Avatar en vivo ya no está instalado.', 410)
    }
    return { session, settings }
}

/**
 * Reclama el turno `seq` de forma ATÓMICA: sólo pasa si es MAYOR que el
 * último aceptado. Un reenvío del mismo turno (o uno viejo) ve 0 filas y se
 * rechaza, así que nunca se paga dos veces el mismo audio. Se toleran huecos
 * a propósito: un turno que el navegador abortó (barge-in) antes de que
 * llegara aquí consume su número sin reclamarlo, y exigir `seq - 1` exacto
 * bloquearía todos los turnos siguientes de la llamada.
 */
export async function claimTurn(session: LiveSessionRow, seq: number): Promise<boolean> {
    if (!Number.isInteger(seq) || seq < 1) return false
    const { data } = await orgSupabase()
        .from('live_sessions')
        .update({ turns: seq, last_seen_at: new Date().toISOString() })
        .eq('organization_id', session.organization_id)
        .eq('id', session.id)
        .eq('status', 'active')
        .lt('turns', seq)
        .select('id')
    return (data ?? []).length === 1
}

export async function heartbeatLiveSession(usable: UsableSession): Promise<{ remainingSeconds: number }> {
    const { session, settings } = usable
    const nowMs = Date.now()
    await orgSupabase()
        .from('live_sessions')
        .update({ last_seen_at: new Date(nowMs).toISOString() })
        .eq('organization_id', session.organization_id)
        .eq('id', session.id)
        .eq('status', 'active')
    // Cobro por minuto empezado (aparte de la cuota del módulo), y corte si
    // la org se quedó sin saldo con ENFORCE_LIMITS encendido.
    await chargeLiveMinutes(session, nowMs, settings.maxSessionSeconds)
    if (!(await hasLiveBalance(session.organization_id))) {
        await markEnded(session.organization_id, session.id, 'no_tokens')
        throw new LiveSessionError('no_tokens', 'Se acabaron los tokens para llamadas en vivo.', 410)
    }
    return {
        remainingSeconds: remainingSessionSeconds(session.started_at, settings.maxSessionSeconds, Date.now()),
    }
}

/** Cierra la sesión si seguía activa. Devuelve el chat para refrescar la memoria. */
export async function endLiveSession(
    session: LiveSessionRow,
    reason: string,
): Promise<{ chatId: string | null; ended: boolean }> {
    const ended = await markEnded(session.organization_id, session.id, reason)
    if (ended) {
        // Colgar es un gesto del visitante: estaba ahí hasta ahora mismo.
        const settings = await loadLiveSettings(session.avatar_id).catch(() => null)
        await chargeLiveMinutes(session, Date.now(), settings?.maxSessionSeconds ?? 3600)
    }
    return { chatId: session.chat_id, ended }
}

async function markEnded(
    organizationId: string,
    sessionId: string,
    reason: string,
    status: 'ended' | 'expired' = 'ended',
): Promise<boolean> {
    const now = new Date().toISOString()
    const { data } = await orgSupabase()
        .from('live_sessions')
        .update({ status, ended_at: now, end_reason: reason.slice(0, 60) })
        .eq('organization_id', organizationId)
        .eq('id', sessionId)
        .eq('status', 'active')
        .select('id')
    return (data ?? []).length === 1
}

/** Suma lo hablado en un turno (para calibrar el coste por minuto). */
export async function addSpokenChars(session: LiveSessionRow, chars: number): Promise<void> {
    if (chars <= 0) return
    // Leer-y-escribir: una sesión sólo tiene un turno en curso a la vez
    // (`claimTurn`), así que no hay dos escrituras compitiendo.
    const supabase = orgSupabase()
    const { data } = await supabase
        .from('live_sessions')
        .select('spoken_chars')
        .eq('organization_id', session.organization_id)
        .eq('id', session.id)
        .maybeSingle()
    await supabase
        .from('live_sessions')
        .update({ spoken_chars: (data?.spoken_chars ?? 0) + chars })
        .eq('organization_id', session.organization_id)
        .eq('id', session.id)
}

/** Interruptor global del link público (independiente del módulo). */
export function isPublicLiveEnabled(): boolean {
    return process.env.LIVE_PUBLIC_ENABLED !== 'false'
}

const PUBLIC_TOKEN_RE = /^[0-9a-f]{48}$/

/**
 * Lo mínimo que la página pública `/live/[token]` puede enseñar: el nombre
 * del avatar. `null` para CUALQUIER motivo de rechazo (token desconocido,
 * público apagado, módulo desinstalado…): la página responde igual en todos
 * los casos y no delata cuál es.
 */
export async function getPublicLiveProfile(
    token: string,
): Promise<{ avatarId: string; organizationId: string; avatarName: string; allowedOrigins: string[] } | null> {
    if (!isPublicLiveEnabled() || !PUBLIC_TOKEN_RE.test(token)) return null
    const settings = await loadLiveSettingsByPublicToken(token)
    if (!settings || !settings.enabled || !settings.publicEnabled) return null
    if (!(await hasModuleForOrg(settings.organizationId, LIVE_MODULE_SLUG))) return null
    const { data: avatar } = await orgSupabase()
        .from('avatars')
        .select('name')
        .eq('organization_id', settings.organizationId)
        .eq('id', settings.avatarId)
        .maybeSingle()
    if (!avatar) return null
    return {
        avatarId: settings.avatarId,
        organizationId: settings.organizationId,
        avatarName: avatar.name,
        allowedOrigins: settings.allowedOrigins,
    }
}

