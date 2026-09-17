/**
 * Regla ÚNICA de "cuánto cuesta un ítem de la galería de Telegram", en un
 * fichero puro (sin Supabase, sin sesión) para que se pueda probar de verdad.
 *
 * Es el espejo exacto del check de `telegram_paid_media_items` (Task 1):
 *
 *   (is_free and star_price = 0) or (not is_free and star_price between 1 and 25000)
 *
 * Vive aparte porque la misma decisión la toman TRES sitios — el servicio al
 * guardar (`upsertPaidMediaItem`), el diálogo de la galería al dar de alta o
 * editar, y el diálogo de envío al permitir un override de precio — y las tres
 * copias tienen que decir lo mismo: si se separan, la pantalla deja pasar algo
 * que Postgres rechaza y el usuario se come un error ilegible después de
 * rellenar el formulario entero.
 */

/** Tope de Telegram para `star_count` en `sendPaidMedia` (ver client.ts). */
export const MIN_STAR_PRICE = 1
export const MAX_STAR_PRICE = 25_000

/** ¿Es un precio de pago aceptable? Entero, dentro del rango de Telegram. */
export function isValidStarPrice(value: unknown): value is number {
    return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= MIN_STAR_PRICE &&
        value <= MAX_STAR_PRICE
    )
}

export type ItemPricing =
    | { ok: true; isFree: boolean; starPrice: number }
    | { ok: false; error: string }

/**
 * Resuelve el par `(is_free, star_price)` que se va a guardar.
 *
 * Gratis ⇒ el precio recibido se IGNORA y se guarda 0: un teaser con precio
 * pegado en el payload (porque el formulario lo traía de antes, o porque un
 * llamador lo mandó por costumbre) no puede acabar cobrando.
 */
export function resolveItemPricing(input: {
    isFree?: boolean
    starPrice?: number
}): ItemPricing {
    if (input.isFree === true) return { ok: true, isFree: true, starPrice: 0 }
    if (!isValidStarPrice(input.starPrice)) {
        return {
            ok: false,
            error: `El precio debe ser un entero entre ${MIN_STAR_PRICE} y ${MAX_STAR_PRICE} Stars (recibido: ${input.starPrice}).`,
        }
    }
    return { ok: true, isFree: false, starPrice: input.starPrice }
}
