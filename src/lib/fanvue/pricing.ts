/**
 * Precio de un PPV de Fanvue. Fichero PURO: lo usan el diálogo (para validar
 * lo que se escribe) y el servicio (que lo vuelve a comprobar), así el rango
 * vive en un solo sitio — igual que `@/lib/telegram/mediaPricing` para Stars.
 *
 * Fanvue cobra en centavos de USD y no acepta un PPV por debajo de $3.00
 * (el mismo mínimo que ya exigía `sendPpvOffer`).
 */
export const MIN_PPV_CENTS = 300
export const MAX_PPV_CENTS = 100_000
/** Precio con que arranca el campo al elegir contenido de pago. */
export const DEFAULT_PPV_CENTS = 500

export function isValidPpvCents(cents: unknown): cents is number {
    return (
        typeof cents === 'number' &&
        Number.isInteger(cents) &&
        cents >= MIN_PPV_CENTS &&
        cents <= MAX_PPV_CENTS
    )
}

/** "6.50" → 650. Lo que no es un precio válido en rango → null. */
export function parseUsdToCents(raw: string): number | null {
    const trimmed = raw.trim().replace(',', '.')
    if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null
    const cents = Math.round(Number(trimmed) * 100)
    return isValidPpvCents(cents) ? cents : null
}

/** 650 → "6.50", para rellenar el campo. */
export function centsToUsd(cents: number): string {
    return (cents / 100).toFixed(2)
}
