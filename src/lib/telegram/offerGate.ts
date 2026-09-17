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

/**
 * Qué puede ofrecer la IA por sí sola. Las TRES lecturas de `maxOfferStars`,
 * que son tres cosas distintas y no dos:
 *
 *  - `undefined` → sin tope: el creador no puso límite.
 *  - `0` → NO OFRECER NADA. Es lo que un creador espera de un campo
 *    "Max Stars" puesto a cero, y antes era justo lo contrario: el `> 0`
 *    de la condición desactivaba el filtro entero y se ofrecía el catálogo
 *    completo, el ítem de 500 Stars incluido.
 *  - `> 0` → tope INCLUSIVO: un ítem que cuesta exactamente el tope se
 *    ofrece (`stars <= max`).
 */
export function filterOfferCandidates(
    items: OfferCandidate[],
    opts: { maxOfferStars: number | undefined; purchasedItemIds: string[] },
): OfferCandidate[] {
    if (opts.maxOfferStars === 0) return []
    const bought = new Set(opts.purchasedItemIds)
    return items.filter((i) => {
        if (bought.has(i.id)) return false
        if (opts.maxOfferStars !== undefined && i.stars > opts.maxOfferStars)
            return false
        return true
    })
}

/**
 * `lastOfferAt` ISO o null; `nowMs` epoch ms.
 *
 * `cooldownHours` a `0` significa SIN enfriamiento (la ventana mide cero, así
 * que nada cae dentro), no "usa el default": quien decide el default es su
 * llamador (`offerEngine`, 6 h) y sólo cuando el ajuste viene ausente.
 */
export function isOfferOnCooldown(
    lastOfferAt: string | null,
    nowMs: number,
    cooldownHours: number,
): boolean {
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
    const hit = media.find(
        (m) =>
            m &&
            typeof m === 'object' &&
            (m as { type?: string }).type === 'paid_media_offer',
    )
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

/**
 * Forma del elemento que el motor añade a `agent_messages.media` para un
 * teaser GRATIS. Mismo criterio que `PaidMediaOffer`: es una INTENCIÓN, no
 * una entrega — quien la manda de verdad es `deliverFreeMedia` (freeMedia.ts,
 * Tarea 3), que es la única que produce el envío real y bloquea repetirlo.
 */
export interface FreeMediaOffer {
    type: 'free_media_offer'
    itemId: string
    caption: string
}

/** Equivalente de `findPaidMediaOffer` para el teaser gratis — mismo criterio
 *  de `media` como `unknown` (columna `Json`, forma no garantizada). */
export function findFreeMediaOffer(media: unknown): FreeMediaOffer | null {
    if (!Array.isArray(media)) return null
    const hit = media.find(
        (m) =>
            m &&
            typeof m === 'object' &&
            (m as { type?: string }).type === 'free_media_offer',
    )
    return (hit as FreeMediaOffer | undefined) ?? null
}

/** Equivalente de `hasPaidMediaOffer` para el teaser gratis. Devuelve `false`
 *  para un `media` que sólo lleva `paid_media_offer`/`paid_media` — son tipos
 *  distintos a propósito (ver `hasPaidMediaOffer` más arriba), el autopilot
 *  depende de que NO se mezclen (test explícito en offerGate.test.ts). */
export function hasFreeMediaOffer(media: unknown): boolean {
    return findFreeMediaOffer(media) !== null
}

/**
 * Candidatos gratis para ESTE fan: el catálogo gratis del avatar menos lo que
 * ya se le mandó a esta conversación. A diferencia de `filterOfferCandidates`
 * (pago) no hay tope de Stars que aplicar — un teaser gratis no cuesta nada,
 * así que la única regla es "nunca dos veces el mismo ítem al mismo fan"
 * (ver global-constraints.md).
 */
export function filterFreeCandidates<T extends { id: string; title: string }>(
    items: T[],
    alreadySentItemIds: string[],
): T[] {
    const sent = new Set(alreadySentItemIds)
    return items.filter((i) => !sent.has(i.id))
}

/** Los cuatro `type` de `agent_messages.media` que cuentan como "hubo oferta"
 *  para el enfriamiento común — ver `isOfferMedia`. */
const OFFER_MEDIA_TYPES = new Set([
    'paid_media_offer',
    'paid_media',
    'free_media_offer',
    'free_media',
])

/**
 * ¿Este `media` lleva CUALQUIER oferta — pagada o gratis, sólo prometida
 * (`*_offer`) o ya entregada? La Tarea 4 la usa para calcular el enfriamiento
 * COMÚN (`offerCooldownHours`): pagado y gratis comparten una sola ventana de
 * "no ofrecer nada más por un rato" (global-constraints.md), así que el motor
 * necesita saber "¿hubo oferta de cualquier tipo?" sin repetir la búsqueda
 * cuatro veces con `findPaidMediaOffer`/`findFreeMediaOffer` por separado.
 */
export function isOfferMedia(media: unknown): boolean {
    if (!Array.isArray(media)) return false
    return media.some(
        (m) =>
            m &&
            typeof m === 'object' &&
            OFFER_MEDIA_TYPES.has((m as { type?: string }).type ?? ''),
    )
}

/**
 * Los estados de `agent_messages` que cuentan como "esto llegó al fan, o va a
 * llegar" cuando el motor reconstruye el historial de salida de un chat.
 *
 * Vive aquí, exportada, y no como literal suelto dentro de la consulta de
 * `offerEngine`, porque lo importante es lo que DEJA FUERA y eso hay que
 * poder verlo y probarlo: un borrador `discarded` (el creador lo tiró) o
 * `failed` (el envío reventó) nunca llegó al fan. Sin este filtro, el
 * `free_media_offer` que ese borrador llevaba pegado quemaba el teaser PARA
 * SIEMPRE —`collectFreeMediaItemIds` lo daba por enviado— y además enfriaba
 * la siguiente oferta durante `offerCooldownHours`. Una oferta que no salió
 * no gasta ni el teaser ni la ventana.
 *
 * `approved` sí cuenta: es un envío a punto de ocurrir, igual que un `draft`
 * en cola (mismo criterio que la cabecera de `collectFreeMediaItemIds`).
 */
export const OFFER_HISTORY_STATUSES = ['draft', 'approved', 'sent'] as const

/**
 * Lo que el modelo respondió, tal cual salió del `JSON.parse` — todo
 * `unknown` a propósito: es texto de un LLM, no un contrato.
 */
export interface ParsedOfferDecision {
    action?: unknown
    index?: unknown
}

/**
 * Valida la decisión del modelo contra las DOS listas que se le enseñaron.
 *
 * Existe porque el modelo puede decir `free` cuando la lista gratis está
 * vacía (le enseñamos sólo la de pago y aun así se inventa la otra), o dar un
 * índice de la lista equivocada. Cualquiera de esas dos cosas, sin esta
 * comprobación, elegiría un ítem que no es el que el modelo creía estar
 * eligiendo: se mandaría gratis algo de pago, o al revés. Ante la duda: null
 * (no se ofrece nada). Quien loguea el aviso es `offerEngine`, que sabe qué
 * `draftMessageId` estaba juzgando; esta función es pura y muda.
 */
export function resolveOfferAction(
    parsed: ParsedOfferDecision,
    freeCount: number,
    paidCount: number,
): { kind: 'free' | 'paid'; index: number } | null {
    const action = parsed.action
    if (action !== 'free' && action !== 'paid') return null
    const total = action === 'free' ? freeCount : paidCount
    if (total <= 0) return null
    // El tipo se comprueba ANTES de coaccionar: `Number(null)`, `Number('')`,
    // `Number(false)` y `Number([])` valen todos 0, que es un índice válido —
    // un modelo que respondiera `"index": null` acabaría ofreciendo el primer
    // ítem de la lista sin haberlo elegido. Un `"1"` en texto tampoco pasa:
    // si el modelo no respetó el tipo, no se le adivina la intención.
    if (typeof parsed.index !== 'number') return null
    const index = parsed.index
    if (!Number.isInteger(index) || index < 0 || index >= total) return null
    return { kind: action, index }
}

/**
 * Los ids de ítem gratis que ya viajaron a un chat, leídos de los `media` de
 * sus mensajes de salida. Cuenta tanto `free_media` (entregado) como
 * `free_media_offer` (prometido en un borrador que quizá aún no salió): si un
 * borrador pendiente ya lleva el teaser f1, el motor no debe elegir f1 otra
 * vez para el siguiente borrador — la regla es UNA VEZ por fan
 * (global-constraints.md), y un borrador en cola es un envío casi hecho.
 *
 * Sin dedupe explícito: el `Set` conserva el orden de primera aparición.
 */
export function collectFreeMediaItemIds(mediaList: unknown[]): string[] {
    const ids = new Set<string>()
    for (const media of mediaList) {
        if (!Array.isArray(media)) continue
        for (const m of media) {
            if (!m || typeof m !== 'object') continue
            const entry = m as { type?: string; itemId?: unknown }
            if (entry.type !== 'free_media' && entry.type !== 'free_media_offer') continue
            if (typeof entry.itemId === 'string' && entry.itemId) ids.add(entry.itemId)
        }
    }
    return [...ids]
}
