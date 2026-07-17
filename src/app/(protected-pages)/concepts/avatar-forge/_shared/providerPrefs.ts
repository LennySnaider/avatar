'use client'

/**
 * Preferencias de providers compartidas entre la página AI Providers y los
 * selectores del Studio (ProviderManagerDrawer / dropdown de edición):
 * favoritos, ocultos y orden manual. Todo vive en localStorage (igual que el
 * default-por-modo del drawer). La key de FAVORITOS es la MISMA que usaba el
 * drawer, así la ⭐ es una sola en toda la app.
 */

const FAVORITES_KEY = 'avatar-studio:favorite-providers'
const HIDDEN_KEY = 'avatar-forge:hidden-providers'
const ORDER_KEY = 'avatar-forge:provider-order'

function readIds(key: string): string[] {
    if (typeof window === 'undefined') return []
    try {
        const raw = window.localStorage.getItem(key)
        const parsed = raw ? JSON.parse(raw) : []
        return Array.isArray(parsed)
            ? parsed.filter((x) => typeof x === 'string')
            : []
    } catch {
        return []
    }
}

function writeIds(key: string, ids: string[]) {
    try {
        window.localStorage.setItem(key, JSON.stringify(ids))
    } catch {
        /* ignore (private mode / disabled storage) */
    }
}

export const readFavoriteIds = () => readIds(FAVORITES_KEY)
export const writeFavoriteIds = (ids: string[]) => writeIds(FAVORITES_KEY, ids)

export const readHiddenIds = () => readIds(HIDDEN_KEY)
export const writeHiddenIds = (ids: string[]) => writeIds(HIDDEN_KEY, ids)

export const readProviderOrder = () => readIds(ORDER_KEY)
export const writeProviderOrder = (ids: string[]) => writeIds(ORDER_KEY, ids)

/**
 * Ordena una lista por el orden manual del usuario. Los ids sin posición
 * guardada conservan su orden de catálogo, DESPUÉS de los ordenados. Sort
 * estable (spec ES2019+): usable como orden base antes de otros rankings.
 */
export function sortByUserOrder<T extends { id: string }>(list: T[]): T[] {
    const order = readProviderOrder()
    if (order.length === 0) return list.slice()
    const idx = new Map(order.map((id, i) => [id, i]))
    return list
        .slice()
        .sort(
            (a, b) =>
                (idx.get(a.id) ?? order.length + list.indexOf(a)) -
                (idx.get(b.id) ?? order.length + list.indexOf(b)),
        )
}
