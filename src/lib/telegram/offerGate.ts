/**
 * Decisiones puras del motor de oferta. Sin imports, con test.
 *
 * Lo que decide el modelo (¿ofrecer ahora? ¿cuál?) vive en offerEngine.ts;
 * lo que decide la aritmética (qué es candidato, si estamos enfriando, si
 * un borrador ya lleva oferta) vive aquí, donde se puede probar sin red.
 */
export interface OfferCandidate {
    id: string
    title: string
    stars: number
}

/**
 * Forma del elemento que el motor añade a `agent_messages.media`. Es una
 * INTENCIÓN de venta, no una venta: quien la cobra es la entrega
 * (`sendAgentMessage` → `deliverPaidMedia`), que es la única que produce un
 * `sold_by = 'ai'`.
 */
export interface PaidMediaOffer {
    type: 'paid_media_offer'
    itemId: string
    stars: number
    caption: string
}

export function filterOfferCandidates(
    items: OfferCandidate[],
    opts: { maxOfferStars: number | undefined; purchasedItemIds: string[] },
): OfferCandidate[] {
    const bought = new Set(opts.purchasedItemIds)
    return items.filter((i) => {
        if (bought.has(i.id)) return false
        if (opts.maxOfferStars !== undefined && opts.maxOfferStars > 0 && i.stars > opts.maxOfferStars) return false
        return true
    })
}

/** `lastOfferAt` ISO o null; `nowMs` epoch ms; `cooldownHours` > 0. */
export function isOfferOnCooldown(lastOfferAt: string | null, nowMs: number, cooldownHours: number): boolean {
    if (!lastOfferAt) return false
    const last = Date.parse(lastOfferAt)
    if (!Number.isFinite(last)) return false
    return nowMs - last < cooldownHours * 3_600_000
}

/**
 * El elemento de oferta dentro de un `media` cualquiera, o null.
 *
 * `media` entra como `unknown` a propósito: en la base es una columna `Json`,
 * así que lo que llega puede ser un array, un objeto, una cadena o null.
 */
export function findPaidMediaOffer(media: unknown): PaidMediaOffer | null {
    if (!Array.isArray(media)) return null
    const hit = media.find((m) => m && typeof m === 'object' && (m as { type?: string }).type === 'paid_media_offer')
    return (hit as PaidMediaOffer | undefined) ?? null
}

/**
 * ¿Este `media` lleva una oferta? Devuelve `boolean` A PROPÓSITO, no un type
 * predicate `media is PaidMediaOffer[]`: el array es MIXTO (una oferta puede
 * viajar junto a imágenes), así que estrechar el tipo del array entero le
 * mentiría al compilador sobre los demás elementos. Quien necesite el
 * elemento tipado usa `findPaidMediaOffer`, que devuelve sólo ese.
 */
export function hasPaidMediaOffer(media: unknown): boolean {
    return findPaidMediaOffer(media) !== null
}
