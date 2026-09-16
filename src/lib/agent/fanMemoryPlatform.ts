/**
 * En qué `platform` de `avatar_fan_memories` vive la memoria de un chat.
 *
 * Puro, sin imports. Coincide con lo que ya escribe el webhook de Telegram
 * en `touchFanMemory(..., 'telegram')`: si aquí se leyera otra clave, la
 * IA no recordaría nada de lo que ese webhook guarda.
 */
export function fanMemoryPlatform(chatPlatform: string): string {
    return chatPlatform.startsWith('telegram') ? 'telegram' : 'fanvue'
}
