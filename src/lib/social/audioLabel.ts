/**
 * Etiqueta de audio de una generación → el `audio_name` que Instagram muestra
 * bajo el Reel.
 *
 * Vive aparte de SocialService porque ese archivo es `'use server'`: ahí TODO
 * export debe ser async, y ni tsc ni eslint lo detectan — sólo el build.
 *
 * `generations.metadata` es jsonb: llegan filas viejas con metadata null y
 * filas escritas por otros flujos con cualquier forma. Por eso todo se valida
 * en vez de castearse.
 */

/** Pista horneada en el MP4, tal como la escribe el Video Editor al guardar. */
export interface GenerationAudioMeta {
    name?: string
    author?: string
    /** Id de la pista en su catálogo de origen, cuando lo hay. */
    trackId?: string
    source?: 'tiktok-cml' | 'trending-apify' | 'upload'
}

const clean = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
}

/**
 * Devuelve `"Canción · Artista"`, o sólo la canción si no hay artista, o
 * `undefined` si esta generación no lleva pista.
 *
 * `undefined` no es lo mismo que cadena vacía: significa "no mandes
 * `audio_name`". Mandarlo vacío pisaría la etiqueta con nada.
 */
export function audioLabelFromMetadata(metadata: unknown): string | undefined {
    if (!metadata || typeof metadata !== 'object') return undefined
    const audio = (metadata as { audio?: unknown }).audio
    if (!audio || typeof audio !== 'object') return undefined

    const name = clean((audio as GenerationAudioMeta).name)
    if (!name) return undefined

    const author = clean((audio as GenerationAudioMeta).author)
    return author ? `${name} · ${author}` : name
}
