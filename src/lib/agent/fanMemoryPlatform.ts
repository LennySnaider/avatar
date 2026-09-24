/**
 * En qué `platform` de `avatar_fan_memories` vive la memoria de un chat.
 *
 * Puro, sin imports. Coincide con lo que ya escribe el webhook de Telegram
 * en `touchFanMemory(..., 'telegram')`: si aquí se leyera otra clave, la
 * IA no recordaría nada de lo que ese webhook guarda. Para comentarios
 * sociales la memoria vive bajo la red pelada (`social:x` → `'x'`), no bajo
 * el `agent_chats.platform` completo: es la misma persona comentando,
 * venga el comentario del post que venga.
 */
export function fanMemoryPlatform(chatPlatform: string): string {
    if (chatPlatform.startsWith('social:')) return chatPlatform.slice('social:'.length)
    // Visitantes del modo en vivo (módulo live_avatar): memoria propia, no
    // mezclada con fans de Fanvue que casualmente compartan id.
    if (chatPlatform === 'live' || chatPlatform.startsWith('live:')) return 'live'
    return chatPlatform.startsWith('telegram') ? 'telegram' : 'fanvue'
}
