/**
 * Reglas PURAS del módulo en vivo: el tope de contenido, los límites de la
 * llamada y la decisión de si una sesión puede arrancar. Sin imports de
 * base ni de proveedores, para poder probarlas con `npm test`.
 */
import type { NsfwLevel } from '../agent/types'

/**
 * Simli (y todo proveedor de cara en tiempo real) prohíbe contenido sexual
 * en sus términos: el canal en vivo NUNCA pasa de `suggestive`, diga lo que
 * diga la persona guardada. Se aplica en el servidor, al armar el prompt.
 */
export function capNsfwForLive(level: NsfwLevel): NsfwLevel {
    return level === 'explicit' ? 'suggestive' : level
}

export const LIVE_LIMITS = {
    /** Cada cuánto el navegador avisa de que sigue ahí. */
    heartbeatIntervalMs: 20_000,
    /** Sin heartbeat durante esto, la sesión se da por muerta. */
    staleAfterMs: 120_000,
    /** Simli corta por su cuenta si no llega audio en este tiempo. */
    simliMaxIdleSeconds: 120,
    /** Una frase del visitante nunca dura más que esto (se fuerza el corte). */
    maxUtteranceSeconds: 30,
    /** Cuántos mensajes previos ve el modelo en cada turno. */
    historyLimit: 12,
    /** Tope de tokens de salida: una respuesta hablada es corta. */
    maxOutputTokens: 160,
    /** Cada cuántos turnos se refresca la memoria del visitante. */
    memoryEveryTurns: 4,
    /** Tamaño máximo del audio de una frase (30 s de WAV 16 kHz mono ≈ 960 KB). */
    maxUtteranceBytes: 2_000_000,
} as const

export type SessionStartRefusal =
    | 'disabled'
    | 'no_face'
    | 'no_voice'
    | 'no_persona'
    | 'concurrency'
    | 'daily_cap'

export interface SessionStartInput {
    enabled: boolean
    faceId: string | null
    hasVoice: boolean
    hasPersona: boolean
    activeCount: number
    maxConcurrent: number
    minutesToday: number
    dailyCapMinutes: number
}

export type SessionStartDecision =
    | { ok: true }
    | { ok: false; reason: SessionStartRefusal; message: string }

const REFUSAL_MESSAGE: Record<SessionStartRefusal, string> = {
    disabled: 'El modo en vivo de este avatar está apagado.',
    no_face: 'Este avatar todavía no tiene cara en Simli (pega el face id en la pestaña Live).',
    no_voice: 'Este avatar no tiene voz por defecto: clona una en Voice Studio y márcala como principal.',
    no_persona: 'Este avatar no tiene persona: créala en la pestaña Persona.',
    concurrency: 'Hay demasiadas conversaciones en curso con este avatar. Inténtalo en un momento.',
    daily_cap: 'Este avatar ya agotó sus minutos de hoy.',
}

/** Orden fijo: configuración antes que topes, para que el mensaje sea útil. */
export function decideSessionStart(input: SessionStartInput): SessionStartDecision {
    const refuse = (reason: SessionStartRefusal): SessionStartDecision => ({
        ok: false,
        reason,
        message: REFUSAL_MESSAGE[reason],
    })
    if (!input.enabled) return refuse('disabled')
    if (!input.faceId) return refuse('no_face')
    if (!input.hasVoice) return refuse('no_voice')
    if (!input.hasPersona) return refuse('no_persona')
    if (input.activeCount >= input.maxConcurrent) return refuse('concurrency')
    if (input.dailyCapMinutes > 0 && input.minutesToday >= input.dailyCapMinutes) return refuse('daily_cap')
    return { ok: true }
}

export type LiveSessionState = 'ok' | 'ended' | 'stale' | 'too_long'

/**
 * ¿Sigue viva una sesión? Sin heartbeat en `staleAfterMs` se da por muerta
 * (el navegador se cerró sin avisar), y ninguna sesión pasa de su tope.
 */
export function liveSessionState(input: {
    status: string
    startedAt: string
    lastSeenAt: string
    maxSessionSeconds: number
    nowMs: number
}): LiveSessionState {
    if (input.status !== 'active') return 'ended'
    const lastSeen = Date.parse(input.lastSeenAt)
    if (Number.isFinite(lastSeen) && input.nowMs - lastSeen > LIVE_LIMITS.staleAfterMs) return 'stale'
    const started = Date.parse(input.startedAt)
    if (Number.isFinite(started) && input.nowMs - started > input.maxSessionSeconds * 1000) return 'too_long'
    return 'ok'
}

/** Segundos que le quedan a la sesión antes de su tope (nunca negativo). */
export function remainingSessionSeconds(startedAt: string, maxSessionSeconds: number, nowMs: number): number {
    const started = Date.parse(startedAt)
    if (!Number.isFinite(started)) return 0
    return Math.max(0, Math.floor(maxSessionSeconds - (nowMs - started) / 1000))
}

/**
 * ¿Puede esta web embeber el widget? Lista vacía = cualquiera. El origen lo
 * informa NUESTRA página dentro del iframe (`location.ancestorOrigins` o el
 * referrer), que no puede alterar la web que la embebe. Abrir el link
 * directo (sin iframe) siempre está permitido: el link ES público.
 */
export function isEmbedAllowed(allowedOrigins: string[], embedderOrigin: string | null, embedded: boolean): boolean {
    if (!embedded || allowedOrigins.length === 0) return true
    if (!embedderOrigin) return false
    const origin = embedderOrigin.replace(/\/+$/, '').toLowerCase()
    return allowedOrigins.some((o) => o.toLowerCase() === origin)
}

/** Minutos empezados entre el inicio y `untilMs`, sin pasar del tope de la sesión. */
export function billableMinutes(startedAt: string, untilMs: number, maxSessionSeconds: number): number {
    const started = Date.parse(startedAt)
    if (!Number.isFinite(started)) return 0
    const seconds = Math.min(Math.max(0, (untilMs - started) / 1000), maxSessionSeconds)
    return seconds < 1 ? 0 : Math.ceil(seconds / 60)
}
