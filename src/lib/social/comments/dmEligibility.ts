/**
 * ¿Toca mandar el DM privado de Instagram tras responder en público a un
 * comentario? Fichero PURO, sin imports (mismo estilo que `gate.ts`): toda
 * la IO (leer `social_profiles`, comprobar `social_comment_dms`, llamar al
 * proveedor) vive en `privateReply.ts`, que es quien arma este input.
 *
 * @see docs/superpowers/specs — global-constraints.md (comentarios-ia-social)
 */

export type CommentDmEligibilityReason =
    | 'not_instagram'
    | 'dm_disabled'
    | 'empty_text'
    | 'already_sent'
    | 'comment_too_old'
    | 'ok'

export interface CommentDmEligibilityInput {
    /** Red del post (derivada de `agent_chats.platform` con `platformFromChat`).
     *  El DM privado sólo existe en la API de Instagram. */
    platform: string | null
    /** `social_profiles.ai_comment_dm_enabled` de la red concreta del post. */
    dmEnabled: boolean
    /** `social_profiles.ai_comment_dm_text`. Sin texto configurado no hay qué mandar. */
    dmText: string | null
    /** `external_created_at` del comentario público que se está respondiendo.
     *  `null` cuenta como "demasiado viejo": Meta rechaza DMs sobre
     *  comentarios de más de 7 días y, sin timestamp, no hay forma de
     *  demostrar que no lo es. */
    commentTimestamp: string | null
    now: Date
    /** Ya existe una fila en `social_comment_dms` para este
     *  (avatar, post, comentarista) — un DM por comentarista y post. */
    alreadySent: boolean
}

export interface CommentDmEligibilityResult {
    eligible: boolean
    reason: CommentDmEligibilityReason
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export function commentDmEligibility(input: CommentDmEligibilityInput): CommentDmEligibilityResult {
    if (input.platform !== 'instagram') return { eligible: false, reason: 'not_instagram' }
    if (!input.dmEnabled) return { eligible: false, reason: 'dm_disabled' }
    if (!input.dmText || input.dmText.trim() === '') return { eligible: false, reason: 'empty_text' }
    if (input.alreadySent) return { eligible: false, reason: 'already_sent' }

    if (!input.commentTimestamp) return { eligible: false, reason: 'comment_too_old' }
    const commentTime = new Date(input.commentTimestamp).getTime()
    if (Number.isNaN(commentTime)) return { eligible: false, reason: 'comment_too_old' }
    // Un comentario "futuro" (reloj desfasado entre sistemas) no es viejo —
    // sólo lo bloquea una diferencia POSITIVA mayor a 7 días.
    if (input.now.getTime() - commentTime > SEVEN_DAYS_MS) {
        return { eligible: false, reason: 'comment_too_old' }
    }

    return { eligible: true, reason: 'ok' }
}

/**
 * `social_profiles.ai_comment_dm_buttons` (jsonb, forma libre en la BD) →
 * botones válidos para `sendInstagramPrivateReply` (doc de Instagram: máx 3,
 * `title` no vacío de ≤20 caracteres, `url` http(s)). Todo lo que no cumpla
 * se descarta en silencio aquí — quien llama loguea un warning si hubo
 * descartes, porque saberlo es de configuración, no de este helper puro.
 */
export interface InstagramDmButtonLike {
    title: string
    url: string
}

export function sanitizeDmButtons(raw: unknown): InstagramDmButtonLike[] {
    if (!Array.isArray(raw)) return []
    const out: InstagramDmButtonLike[] = []
    for (const item of raw) {
        if (out.length >= 3) break
        if (!item || typeof item !== 'object') continue
        const title = (item as Record<string, unknown>).title
        const url = (item as Record<string, unknown>).url
        if (typeof title !== 'string' || title.trim() === '' || title.length > 20) continue
        if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) continue
        out.push({ title, url })
    }
    return out
}
