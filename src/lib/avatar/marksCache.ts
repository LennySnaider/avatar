import type { AvatarMarkRow } from '@/services/AvatarMarksService'

/**
 * Memoria de las marcas ya traídas, por avatar.
 *
 * El diálogo pedía la lista al servidor CADA vez que se abría, y hasta que
 * respondía no había nada que mirar: en el móvil eso es un giro de spinner de
 * varios segundos sobre una lista que ya conocíamos. Las marcas se cargan una
 * vez al abrir el avatar (AvatarStudioProvider); guardarlas aquí deja el
 * diálogo pintado al instante y la consulta pasa a ser una revalidación en
 * segundo plano.
 *
 * Vive en memoria del navegador a propósito: se pierde al recargar, que es
 * justo cuando el provider vuelve a traerlas. No hay nada que invalidar.
 */
const cache = new Map<string, AvatarMarkRow[]>()

export function cacheAvatarMarks(avatarId: string, rows: AvatarMarkRow[]): void {
    if (!avatarId) return
    cache.set(avatarId, rows)
}

export function cachedAvatarMarks(avatarId: string): AvatarMarkRow[] | null {
    if (!avatarId) return null
    return cache.get(avatarId) ?? null
}
