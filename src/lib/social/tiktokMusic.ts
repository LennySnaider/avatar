/**
 * Commercial Music Library de TikTok, servida por Upload-Post
 * (`GET /api/uploadposts/tiktok/music/trending`).
 *
 * Es la ÚNICA música que se puede adjuntar de verdad por API: pista nativa,
 * licenciada para uso comercial, con página de sonido y sin riesgo de muteo.
 * Hornear el audio en el MP4 sigue siendo lo que toca en Instagram y en el
 * resto de plataformas.
 *
 * LA TRAMPA: cada track trae DOS ids. El que se adjunta es `id`; mandar
 * `commercial_music_id` hace que TikTok RECHACE el post público. Por eso el
 * segundo ni siquiera entra en el DTO — lo que no existe no se puede mandar
 * por error.
 *
 * Límite real del endpoint: son charts de trending, NO hay búsqueda por
 * título ni artista. Para ampliar se cambia género, país o periodo.
 *
 * Vive en lib/ porque SocialService es `'use server'`: ahí todo export debe
 * ser async, y no lo detectan ni tsc ni eslint — sólo el build.
 */

export const TIKTOK_MUSIC_DATE_RANGES = ['1DAY', '7DAY', '30DAY', '90DAY'] as const
export type TikTokMusicDateRange = (typeof TIKTOK_MUSIC_DATE_RANGES)[number]

/** Un subconjunto manejable de los géneros que acepta el endpoint. */
export const TIKTOK_MUSIC_GENRES = [
    'ALL',
    'POP',
    'LATIN',
    'HIP_HOP/RAP',
    'ELECTRONIC',
    'ROCK',
    'R&B/SOUL',
    'ALTERNATIVE/INDIE',
    'COUNTRY',
    'JAZZ',
] as const

export const DEFAULT_TIKTOK_MUSIC_GENRE = 'ALL'
export const DEFAULT_TIKTOK_MUSIC_COUNTRY = 'US'
export const DEFAULT_TIKTOK_MUSIC_DATE_RANGE: TikTokMusicDateRange = '7DAY'

/** Pista tal como la consume nuestra UI. `id` es lo que viaja como `tiktok_music_id`. */
export interface TikTokMusicTrack {
    id: string
    title: string
    artist: string | null
    duration: number | null
    rank: number | null
    coverUrl: string | null
    /** Audio corto de la pista. Sirve para escucharla Y para hornearla en la
     *  copia que va a Instagram (el mux loopea, así que basta). */
    previewUrl: string | null
}

const str = (value: unknown): string | null => {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

const num = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null

/**
 * Normaliza un track crudo. Devuelve null cuando la fila no sirve —sin `id` no
 * se puede adjuntar, sin `title` no se puede mostrar— para que una respuesta
 * con basura no tumbe la lista entera.
 */
export function normalizeTikTokMusicTrack(raw: unknown): TikTokMusicTrack | null {
    if (!raw || typeof raw !== 'object') return null
    const r = raw as Record<string, unknown>

    const id = str(r.id)
    const title = str(r.title)
    if (!id || !title) return null

    return {
        id,
        title,
        artist: str(r.artist),
        duration: num(r.duration),
        rank: num(r.rank),
        coverUrl: str(r.cover_url),
        previewUrl: str(r.preview_url),
    }
}

export interface TikTokMusicQueryInput {
    /** Username de Upload-Post del avatar. Obligatorio para el proveedor. */
    profile: string
    genre?: string
    countryCode?: string
    dateRange?: TikTokMusicDateRange
}

/**
 * Query string del endpoint, con los defaults del proveedor. Un rango
 * inventado cae al default en vez de viajar y provocar un 4xx.
 */
export function buildTikTokMusicQuery(input: TikTokMusicQueryInput): {
    profile: string
    genre: string
    country_code: string
    date_range: TikTokMusicDateRange
} {
    const dateRange = TIKTOK_MUSIC_DATE_RANGES.includes(
        input.dateRange as TikTokMusicDateRange,
    )
        ? (input.dateRange as TikTokMusicDateRange)
        : DEFAULT_TIKTOK_MUSIC_DATE_RANGE

    return {
        profile: input.profile,
        genre: str(input.genre) ?? DEFAULT_TIKTOK_MUSIC_GENRE,
        country_code: str(input.countryCode) ?? DEFAULT_TIKTOK_MUSIC_COUNTRY,
        date_range: dateRange,
    }
}
