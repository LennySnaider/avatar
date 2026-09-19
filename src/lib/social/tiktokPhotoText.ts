/**
 * Texto de un post de FOTOS en TikTok: título corto + descripción larga.
 *
 * TikTok separa `title` y `description` en las fotos, con topes distintos y
 * contados en "UTF-16 runes" (doc oficial, Content Posting API →
 * content-posting-api-reference-photo-post):
 *   · title       ≤ 90
 *   · description ≤ 4000
 * `String.length` en JS cuenta exactamente unidades UTF-16, así que un emoji
 * vale 2 — es lo que Upload-Post repite en su 400: "counted the way TikTok
 * does: an emoji counts as 2".
 *
 * Hasta el 2026-09-19 mandábamos caption + hashtags (178 unidades en el caso
 * reportado) como `title` genérico a todas las redes y TikTok lo rechazaba.
 * Aquí el título es el caption recortado en un límite de palabra, SIN
 * hashtags; los hashtags y el caption entero viajan en la descripción.
 */
import { appendHashtagsToCaption } from './hashtagHelpers'

export const TIKTOK_PHOTO_TITLE_MAX = 90
export const TIKTOK_PHOTO_DESCRIPTION_MAX = 4000

const ELLIPSIS = '…' // 1 unidad UTF-16
const HIGH_SURROGATE = /[\uD800-\uDBFF]/

/**
 * Recorta a `max` unidades UTF-16 dejando sitio para la elipsis, sin partir
 * un par sustituto (un emoji cortado por la mitad renderiza como U+FFFD) y,
 * si hay un espacio razonablemente cerca del corte, en límite de palabra.
 */
export function truncateUtf16(text: string, max: number): string {
    if (text.length <= max) return text
    let cut = max - ELLIPSIS.length
    if (cut > 0 && HIGH_SURROGATE.test(text[cut - 1])) cut -= 1
    const head = text.slice(0, cut)
    const lastSpace = head.lastIndexOf(' ')
    // Solo se retrocede a la palabra si no se pierde más del 40% del sitio:
    // un texto sin espacios (o con uno muy al principio) se corta a secas.
    const body =
        lastSpace >= Math.floor(cut * 0.6) ? head.slice(0, lastSpace) : head
    return `${body.trimEnd()}${ELLIPSIS}`
}

export function buildTikTokPhotoText(
    caption: string,
    hashtags: string[] | undefined,
): { title: string; description: string } {
    const cleanCaption = (caption ?? '').trim()
    return {
        title: truncateUtf16(cleanCaption, TIKTOK_PHOTO_TITLE_MAX),
        description: truncateUtf16(
            appendHashtagsToCaption(cleanCaption, hashtags ?? []),
            TIKTOK_PHOTO_DESCRIPTION_MAX,
        ),
    }
}
