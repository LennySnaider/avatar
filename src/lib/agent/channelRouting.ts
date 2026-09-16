/**
 * Por qué canal se entrega un chat, según `agent_chats.platform`.
 *
 * Puro y sin imports. `platform` es `string` a secas en la tabla (sin
 * unión ni check), así que la decisión se toma por prefijo: `social:<red>`
 * sale por la respuesta pública de comentarios (Upload-Post), todo lo que
 * empiece por `telegram` sale por el Bot API, y todo lo demás por Fanvue,
 * que es exactamente lo que pasaba antes de existir este fichero.
 */
export type DeliveryChannel = 'telegram' | 'fanvue' | 'social_comment'

export function resolveDeliveryChannel(platform: string): DeliveryChannel {
    if (platform.startsWith('social:')) return 'social_comment'
    return platform.startsWith('telegram') ? 'telegram' : 'fanvue'
}

/**
 * Con qué CANAL DE PROMPT (`buildSystemPrompt`'s `channel`) se redacta el
 * borrador de un chat. Hoy coincide exactamente con `resolveDeliveryChannel`
 * — mismo prefijo, mismo resultado — pero es un concepto propio (Tarea 4,
 * `draftPipeline.ts`): antes esa decisión se tomaba inline dos veces con
 * `chat.platform.startsWith('telegram') ? 'telegram' : 'fanvue'`, que nunca
 * contempló `social:*` y le habría dado el prompt de Fanvue a un comentario
 * público. Un solo sitio para los dos evita que se desincronicen si algún
 * día divergen.
 */
export function promptChannelFor(platform: string): DeliveryChannel {
    return resolveDeliveryChannel(platform)
}
