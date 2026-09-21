/**
 * Cuántas llamadas de publicación hacen falta cuando hay música de por medio.
 *
 * Upload-Post manda UN archivo por llamada, y las plataformas no quieren el
 * mismo:
 *
 *   - TikTok quiere el MP4 LIMPIO + `tiktok_music_id`: pista nativa de la
 *     Commercial Music Library, con página de sonido y sin riesgo de muteo.
 *   - Instagram (y el resto) quieren el MP4 CON la música horneada, porque
 *     Upload-Post no expone todavía la Audio API de Meta.
 *
 * Dos archivos distintos = dos llamadas. Pero partir cuando no hace falta
 * gasta una publicación de más, así que aquí se decide una sola vez y con
 * tests, en vez de repartir condiciones por SocialService.
 *
 * Vive en lib/ porque SocialService es `'use server'`: ahí todo export debe
 * ser async y no lo detectan ni tsc ni eslint — sólo el build.
 */
import type { Platform } from '@/@types/social'

export interface MusicDispatchInput {
    platforms: Platform[]
    /** Lo que se publica por defecto (con la música horneada, si la hay). */
    videoUrl: string
    /** Versión SIN música horneada, cuando existe una distinta. */
    cleanVideoUrl?: string | null
    /** Pista nativa elegida de la CML de TikTok. */
    tiktokMusicId?: string | null
}

/** Una llamada a Upload-Post: un archivo para un grupo de plataformas. */
export interface MusicDispatchLeg {
    platforms: Platform[]
    videoUrl: string
    /** Viaja como `tiktok_music_id`; sólo en la llamada que lleva TikTok. */
    tiktokMusicId?: string
}

export function planMusicDispatch(input: MusicDispatchInput): MusicDispatchLeg[] {
    const { platforms, videoUrl } = input
    if (platforms.length === 0) return []

    const musicId = input.tiktokMusicId || undefined
    const goesToTikTok = platforms.includes('tiktok')

    // Sin pista nativa, o con una pista que no le toca a nadie: como siempre.
    if (!musicId || !goesToTikTok) {
        return [{ platforms, videoUrl }]
    }

    // Hay pista nativa y TikTok la va a recibir. Sólo tiene sentido mandarle
    // un archivo distinto si existe uno LIMPIO de verdad: mandarle el horneado
    // haría sonar las dos pistas a la vez.
    const clean =
        input.cleanVideoUrl && input.cleanVideoUrl !== videoUrl
            ? input.cleanVideoUrl
            : null

    if (!clean) {
        // El archivo ya sirve para todos: TikTok lo recibe con pista nativa y
        // el resto sin música. Partir sería mandar dos veces lo mismo.
        return [{ platforms, videoUrl, tiktokMusicId: musicId }]
    }

    const rest = platforms.filter((p) => p !== 'tiktok')
    const tiktokLeg: MusicDispatchLeg = {
        platforms: ['tiktok'],
        videoUrl: clean,
        tiktokMusicId: musicId,
    }
    if (rest.length === 0) return [tiktokLeg]

    return [tiktokLeg, { platforms: rest, videoUrl }]
}
