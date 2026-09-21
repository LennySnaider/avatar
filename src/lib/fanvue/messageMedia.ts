/**
 * Medios de los mensajes de Fanvue en el Inbox. Fichero PURO, sin imports de
 * runtime: la IO (pedir las URLs firmadas) vive en `AgentInboxService`.
 *
 * `agent_messages.media` es un jsonb libre que comparten los canales:
 * Fanvue guarda `[{ uuid }]` (`ingestMessage`), Telegram guarda ofertas
 * `{ type: 'paid_media' | 'paid_media_offer' | …, itemId, … }`. Aquí sólo
 * interesan los uuids de Fanvue.
 */
import type { FanvueMediaVariant, FanvueResolvedMedia } from './types'

/** Páginas de medios del chat que se piden por hilo (50 por página): los
 *  medios más recientes, que son los de los mensajes que se ven. */
export const CHAT_MEDIA_MAX_PAGES = 2

/**
 * Uuids de medios de Fanvue guardados en `agent_messages.media`. Dos formas:
 * `{ uuid }` (lo ingerido y lo enviado por `sendAgentMessage`) y
 * `{ type: 'image' | 'video', mediaUuid, price }` (el PPV de `sendPpvOffer`).
 * Cualquier otro `type` es una oferta de Telegram y se ignora. Lo que no
 * calza se descarta sin tirar: la fila puede venir de cualquier versión.
 */
export function fanvueMediaUuids(media: unknown): string[] {
    if (!Array.isArray(media)) return []
    const out: string[] = []
    for (const item of media) {
        if (!item || typeof item !== 'object') continue
        const rec = item as Record<string, unknown>
        const uuid =
            rec.type === undefined
                ? rec.uuid
                : rec.type === 'image' || rec.type === 'video'
                  ? rec.mediaUuid
                  : undefined
        if (typeof uuid === 'string' && uuid.trim() !== '') out.push(uuid)
    }
    return out
}

/** Lo que el Inbox pinta de un medio: miniatura para la burbuja, principal al abrirlo. */
export interface InboxMediaItem {
    uuid: string
    mediaType: FanvueResolvedMedia['mediaType']
    thumbUrl: string | null
    fullUrl: string | null
}

function variantUrl(
    variants: FanvueMediaVariant[],
    order: FanvueMediaVariant['variantType'][],
): string | null {
    for (const type of order) {
        const hit = variants.find((v) => v.variantType === type && v.url)
        if (hit) return hit.url
    }
    return null
}

/**
 * Medios del chat (lo que devuelve Fanvue) → índice por uuid del MEDIO, que
 * es lo que guarda `agent_messages.media`. Se indexa por medio y no por
 * mensaje porque los envíos masivos repiten el mismo medio en varios
 * mensajes. La miniatura cae a la principal si no hay miniatura, y al revés;
 * `blurred` sólo como último recurso (contenido de pago no comprado: es lo
 * único que Fanvue enseña). Si un uuid llega repetido gana el primero, que
 * es el más reciente.
 */
export function indexChatMedia(
    items: FanvueResolvedMedia[],
): Record<string, InboxMediaItem> {
    const out: Record<string, InboxMediaItem> = {}
    for (const media of items) {
        if (!media?.uuid || out[media.uuid]) continue
        const variants = Array.isArray(media.variants) ? media.variants : []
        out[media.uuid] = {
            uuid: media.uuid,
            mediaType: media.mediaType,
            thumbUrl: variantUrl(variants, [
                'thumbnail',
                'thumbnail_gallery',
                'main',
                'blurred',
            ]),
            fullUrl: variantUrl(variants, ['main', 'thumbnail', 'blurred']),
        }
    }
    return out
}
