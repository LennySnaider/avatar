/**
 * Normalizadores puros para comentarios/historial de Upload-Post.
 *
 * Por qué existen aparte del provider: la doc de Upload-Post avisa
 * explícitamente que "each network returns its own shape" para comentarios
 * (https://docs.upload-post.com/api/comments.md) — mezclar el parseo
 * defensivo con las llamadas HTTP haría el provider intestable sin red.
 * Estas funciones son puras (sin fetch) para poder cubrirlas con
 * node:test sin pegarle a la API real.
 *
 * @see docs/superpowers/specs — task-2-brief.md (comentarios-ia-social)
 */

import type { Platform, SocialComment, SocialCommentsPage, UploadPostHistoryEntry } from '@/@types/social'

/** Primer valor no undefined/null/'' de la lista, o undefined si ninguno sirve. */
function pick(...values: unknown[]): unknown {
    for (const v of values) {
        if (v !== undefined && v !== null && v !== '') return v
    }
    return undefined
}

function toStringOrNull(v: unknown): string | null {
    return v === undefined || v === null ? null : String(v)
}

function asRecord(v: unknown): Record<string, unknown> {
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

/** Frontera epoch segundos vs. milisegundos: 1e12 ms = 2001-09-09. Cualquier
 *  epoch en SEGUNDOS que nos importe (2001..33658) queda por debajo, y
 *  cualquier epoch en MILISEGUNDOS moderno queda por encima. */
const EPOCH_MS_THRESHOLD = 1e12

/**
 * Cualquier forma de timestamp que devuelva una red → ISO 8601 UTC, o `null`
 * si no hay forma de interpretarla.
 *
 * Por qué: estos valores terminan en columnas `timestamptz`
 * (`agent_messages.external_created_at`, `agent_chats.last_message_at`). Un
 * epoch numérico (Instagram/Facebook mandan segundos en varios endpoints) o
 * una cadena basura pasada tal cual rompe el INSERT y ese target queda sin
 * poder ingerir NUNCA MÁS — un fallo permanente por un campo cosmético. Mejor
 * `null` (la columna lo acepta) que un INSERT que revienta.
 *
 * Reglas: número o cadena puramente numérica → epoch (`< 1e12` se toma como
 * SEGUNDOS, si no como milisegundos); cualquier otra cosa → `Date.parse`;
 * inválido → `null`.
 */
export function toIsoTimestamp(raw: unknown): string | null {
    if (raw === undefined || raw === null || raw === '') return null

    let ms: number
    if (typeof raw === 'number') {
        if (!Number.isFinite(raw)) return null
        ms = raw < EPOCH_MS_THRESHOLD ? raw * 1000 : raw
    } else if (typeof raw === 'string' && /^-?\d+(\.\d+)?$/.test(raw.trim())) {
        const n = Number(raw.trim())
        if (!Number.isFinite(n)) return null
        ms = n < EPOCH_MS_THRESHOLD ? n * 1000 : n
    } else if (raw instanceof Date) {
        ms = raw.getTime()
    } else if (typeof raw === 'string') {
        ms = Date.parse(raw)
    } else {
        return null
    }

    if (!Number.isFinite(ms)) return null
    try {
        return new Date(ms).toISOString()
    } catch {
        // Fuera del rango representable de Date (±8.64e15 ms).
        return null
    }
}

/** `toIsoTimestamp` + un aviso cuando venía ALGO y no se pudo interpretar:
 *  un timestamp perdido en silencio es el tipo de cosa que después nadie
 *  sabe dónde mirar. */
function toIsoTimestampLogged(platform: string, raw: unknown): string | null {
    const iso = toIsoTimestamp(raw)
    if (iso === null && raw !== undefined && raw !== null && raw !== '') {
        console.warn(
            `[social/comments] ${platform}: timestamp no interpretable, se guarda null —`,
            typeof raw === 'object' ? JSON.stringify(raw).slice(0, 120) : String(raw).slice(0, 120),
        )
    }
    return iso
}

/**
 * Normaliza un comentario crudo de cualquier plataforma. Nunca tira: una
 * forma desconocida (o sin id) se descarta con un console.warn compacto en
 * vez de romper el resto de la página — un solo comentario raro de una red
 * no puede tumbar el listado entero.
 */
export function normalizeComment(platform: Platform, raw: unknown): SocialComment | null {
    const r = asRecord(raw)

    const idRaw = pick(r.id, r.comment_id)
    if (idRaw === undefined) {
        console.warn(
            `[social/comments] ${platform}: comentario sin id, se descarta —`,
            JSON.stringify(raw).slice(0, 300),
        )
        return null
    }

    const user = asRecord(r.user)
    const from = asRecord(r.from)

    const textRaw = pick(r.text, r.message)
    const timestampRaw = pick(r.timestamp, r.created_at, r.created_time)
    const authorIdRaw = pick(user.id, from.id, r.author_id, r.user_id)
    const authorUsernameRaw = pick(user.username, from.username, r.username, r.author_username)

    return {
        id: String(idRaw),
        text: textRaw === undefined ? '' : String(textRaw),
        timestamp: toIsoTimestampLogged(platform, timestampRaw),
        authorId: toStringOrNull(authorIdRaw),
        authorUsername: toStringOrNull(authorUsernameRaw),
    }
}

/**
 * Normaliza la respuesta completa de GET /api/uploadposts/comments.
 * Para X (Twitter) una página puede venir vacía con has_next=true — eso NO
 * es un error, es el proveedor diciendo "seguí pidiendo con el cursor".
 */
export function normalizeCommentsPage(platform: Platform, body: unknown): SocialCommentsPage {
    const b = asRecord(body)
    const rawComments = Array.isArray(b.comments) ? b.comments : []
    const comments = rawComments
        .map((c) => normalizeComment(platform, c))
        .filter((c): c is SocialComment => c !== null)

    const pagination = asRecord(b.pagination)

    return {
        comments,
        nextCursor: toStringOrNull(pagination.next_cursor),
        hasNext: Boolean(pagination.has_next),
        source: toStringOrNull(b.source),
    }
}

/**
 * Normaliza una entrada de GET /api/uploadposts/history. La respuesta cruda
 * trae más campos (media_type, failure_stage, post_title,
 * request_total_platforms) que este módulo no necesita todavía — se dejan
 * fuera a propósito, ver UploadPostHistoryEntry en @/@types/social.
 */
export function normalizeHistoryEntry(raw: unknown): UploadPostHistoryEntry {
    const r = asRecord(raw)
    const platform = String(r.platform ?? '')
    return {
        platform,
        success: Boolean(r.success),
        errorCode: toStringOrNull(r.error_code),
        platformPostId: toStringOrNull(r.platform_post_id),
        postUrl: toStringOrNull(r.post_url),
        postCaption: toStringOrNull(r.post_caption),
        requestId: toStringOrNull(r.request_id),
        jobId: toStringOrNull(r.job_id),
        uploadTimestamp: toIsoTimestampLogged(platform || 'history', r.upload_timestamp),
    }
}

/**
 * Detecta si un error de Upload-Post significa "hay que reconectar la
 * cuenta". Medido en vivo hoy (2026-09-16) contra Instagram con la sesión
 * vencida: 401 + `{ success:false, code:"instagram_reauth_required", ... }`.
 * También se cubre `error_code` (nombre alternativo que usa /history) y un
 * `reauth_required:true` explícito, por si el proveedor lo manda así en
 * otra plataforma. Solo se considera en 400/401/409 — un 500 con un code
 * que matchee por casualidad no es esto.
 */
export function isReauthRequiredBody(status: number, body: unknown): boolean {
    if (status !== 400 && status !== 401 && status !== 409) return false
    const b = asRecord(body)
    if (b.reauth_required === true) return true
    const code = b.code
    const errorCode = b.error_code
    if (typeof code === 'string' && code.endsWith('_reauth_required')) return true
    if (typeof errorCode === 'string' && errorCode.endsWith('_reauth_required')) return true
    return false
}
