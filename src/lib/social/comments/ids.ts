/**
 * Identificadores y platform-string del "chat" que representa los
 * comentarios públicos de un post social (spec de comentarios-ia-social).
 *
 * Puro y sin imports. El diseño (ver global-constraints.md) mete cada red
 * social bajo su propio `agent_chats.platform = 'social:<red>'` y codifica
 * post + comentarista en un solo `external_chat_id = '<postId>:<commenterId>'`
 * para no tener que agregar columnas nuevas a `agent_chats`.
 *
 * @see docs/superpowers/specs — task-3-brief.md (comentarios-ia-social)
 */

/** `'instagram'` → `'social:instagram'`. La red llega tal cual (ya en
 *  minúsculas en el resto del código: instagram, x, tiktok, youtube...). */
export function toSocialChatPlatform(red: string): string {
    return `social:${red}`
}

/** `platform` empieza por `social:` → es un chat de comentarios públicos,
 *  no un chat privado de Fanvue/Telegram. */
export function isSocialCommentPlatform(platform: string): boolean {
    return platform.startsWith('social:')
}

/** `'social:x'` → `'x'`. Para lo que no es `social:*` no hay red que
 *  extraer (fanvue, telegram, telegram_business...), así que null. */
export function platformFromChat(platform: string): string | null {
    return isSocialCommentPlatform(platform) ? platform.slice('social:'.length) : null
}

/**
 * `'<postId>:<commenterId>'`. Se parte por el PRIMER ':' — el id del
 * comentarista puede traer sus propios dos puntos (URNs de LinkedIn, por
 * ejemplo), pero el postId no puede: si lo trae, se rechaza acá mismo.
 * LinkedIn queda fuera de alcance del v1; preferimos un error explícito a
 * un split silenciosamente roto que mezcle post y comentarista.
 */
export function encodeCommentChatId(postId: string, commenterId: string): string {
    if (postId.includes(':')) {
        throw new Error(
            `encodeCommentChatId: postId no puede contener ':' (llegó "${postId}") — ` +
                'post ids tipo URN (LinkedIn) no están soportados en v1',
        )
    }
    return `${postId}:${commenterId}`
}

/** Parte antes del primer ':', o null si el external_chat_id no lo trae
 *  (chats de Fanvue/Telegram, que nunca codifican un post). */
export function postIdFromChat(externalChatId: string): string | null {
    const i = externalChatId.indexOf(':')
    return i === -1 ? null : externalChatId.slice(0, i)
}

/**
 * Parte después del primer ':'. Si no hay ':' devuelve el string tal cual
 * (identidad) — así conviven los ids de Fanvue/Telegram, que nunca llevan
 * un post codificado, con los de comentarios sociales que sí lo llevan.
 */
export function commenterIdFromChat(externalChatId: string): string {
    const i = externalChatId.indexOf(':')
    return i === -1 ? externalChatId : externalChatId.slice(i + 1)
}
