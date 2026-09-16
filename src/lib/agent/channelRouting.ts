/**
 * Por qué canal se entrega un chat, según `agent_chats.platform`.
 *
 * Puro y sin imports. `platform` es `string` a secas en la tabla (sin
 * unión ni check), así que la decisión se toma por prefijo: todo lo que
 * empiece por `telegram` sale por el Bot API, y todo lo demás por Fanvue,
 * que es exactamente lo que pasaba antes de existir este fichero.
 */
export type DeliveryChannel = 'telegram' | 'fanvue'

export function resolveDeliveryChannel(platform: string): DeliveryChannel {
    return platform.startsWith('telegram') ? 'telegram' : 'fanvue'
}
