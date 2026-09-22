/**
 * Copia el audio de cada sonido del chart a NUESTRO almacén durante el refresh.
 *
 * Es el único momento en que la play_url de TikTok sirve: caduca a ~1 h (ver
 * soundUrl.ts). Sin la copia, cualquier sonido elegido en el Video Editor
 * más tarde fallaba al hornear la música. La copia vive en
 * `trending-sounds/<soundId>` (content-addressed por sonido: un tema que repite
 * en el chart se sobrescribe, no se duplica) y su URL sustituye a la de TikTok.
 *
 * Nunca lanza: si un sonido no se puede copiar se queda con la URL de TikTok
 * (sirve esa hora) y el resto sigue.
 */
import { createHash } from 'node:crypto'
import { putMediaObject } from '@/lib/mediaStore'
import type { NormalizedSound } from './apifyTikTok'

// Las mismas cabeceras con las que el proxy /api/trends/sound-audio conseguía
// el audio del CDN de TikTok.
const TIKTOK_HEADERS = {
    'User-Agent': 'Mozilla/5.0',
    Referer: 'https://www.tiktok.com/',
}
// Un sonido de TikTok son segundos de audio: >15 MB no es un sonido.
const MAX_AUDIO_BYTES = 15 * 1024 * 1024
const DOWNLOAD_TIMEOUT_MS = 20_000
const CONCURRENCY = 5

function storageKey(sound: NormalizedSound, playUrl: string): string {
    if (sound.soundId && /^[\w-]+$/.test(sound.soundId)) return sound.soundId
    // Sin soundId: el path de la URL (sin la firma, que cambia en cada fetch)
    // identifica el objeto en el CDN.
    const { origin, pathname } = new URL(playUrl)
    return createHash('sha1').update(origin + pathname).digest('hex')
}

async function copyOne(sound: NormalizedSound): Promise<string | null> {
    const playUrl = sound.playUrl
    if (!playUrl) return null
    try {
        const res = await fetch(playUrl, {
            headers: TIKTOK_HEADERS,
            signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        })
        if (!res.ok) return null
        const body = Buffer.from(await res.arrayBuffer())
        if (body.byteLength === 0 || body.byteLength > MAX_AUDIO_BYTES) return null
        const contentType =
            res.headers.get('content-type')?.split(';')[0].trim() || 'audio/mpeg'
        const ext = contentType.includes('mpeg') ? 'mp3' : 'm4a'
        const { url } = await putMediaObject({
            path: `trending-sounds/${storageKey(sound, playUrl)}.${ext}`,
            body,
            contentType,
            upsert: true,
        })
        return url
    } catch (e) {
        console.warn(
            `[trends] no se pudo copiar el audio de "${sound.name}":`,
            e instanceof Error ? e.message : e,
        )
        return null
    }
}

/** Devuelve los sonidos con `playUrl` apuntando a la copia propia cuando se pudo. */
export async function persistSoundAudio(
    sounds: NormalizedSound[],
): Promise<{ sounds: NormalizedSound[]; copied: number }> {
    const out = [...sounds]
    let copied = 0
    let next = 0
    const worker = async () => {
        while (next < out.length) {
            const i = next++
            const durable = await copyOne(out[i])
            if (durable) {
                out[i] = { ...out[i], playUrl: durable }
                copied++
            }
        }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker))
    return { sounds: out, copied }
}
