/**
 * TRAMOS DE INTENSIDAD del modo 🌶️ (2026-07-26). Antes era binario y todo
 * acababa en desnudo total — "no tiene mucho chiste, manda todo sin ropa, sin
 * mucho chiste o variedad". Mismos cuartiles que el slider de Clone Ref.
 *
 * Vive AQUÍ y no en GeminiService por dos razones:
 *  1. GeminiService es `'use server'`, donde todo export debe ser async — y
 *     esto es lógica pura (rompía el build).
 *  2. La UI necesita las mismas fronteras para etiquetar el slider. Con dos
 *     copias de los umbrales, la etiqueta y el comportamiento se desincronizan
 *     en cuanto alguien mueva uno — el mismo tipo de deriva que ya nos costó la
 *     ruta `[slug]` y las bandas de cm contra los niveles.
 *
 * `wardrobe` es lo que se le pide reescribir a Gemini; `fallback` es la frase
 * fija por si Gemini rehúsa (nunca frena el batch).
 */
export type SpicyTier = {
    key: 'suggestive' | 'lingerie' | 'topless' | 'explicit'
    /** Etiqueta de la UI — dice lo que va a salir. */
    label: string
    wardrobe: string
    fallback: string
}

/** Fronteras ÚNICAS. Todo lo que dependa del nivel las lee de aquí. */
export const SPICY_NUDE_SHEET_MIN = 65 // hoja NUDE del Body Lab + pezón
export const SPICY_EXPLICIT_MIN = 85 // vulva + desnudar en MuleRouter

export function spicyTier(level: number): SpicyTier {
    if (level < 40)
        return {
            key: 'suggestive',
            label: '🌶️ Sugerente · vestida',
            wardrobe:
                'she stays DRESSED but the outfit turns suggestive — a tighter, shorter or lower-cut version of what she wears, more skin on show (neckline, legs, midriff or back) but nothing intimate uncovered, with a confident flirty attitude. NO nudity: breasts and crotch stay covered.',
            fallback:
                'SUGGESTIVE VARIANT: the same scene, setting, pose, lighting and framing — she stays dressed, but in a tighter, lower-cut or shorter version of the outfit showing more skin, with a confident flirty attitude. No nudity: breasts and crotch remain covered.',
        }
    if (level < SPICY_NUDE_SHEET_MIN)
        return {
            key: 'lingerie',
            label: '🌶️ Lencería / bikini',
            wardrobe:
                'she is down to LINGERIE or swimwear — bra and briefs, a bikini or similar, matching the scene. Skin is largely on show but breasts and crotch stay covered by the garment, with a confident sensual attitude. NO full nudity.',
            fallback:
                'LINGERIE VARIANT: the same scene, setting, pose, lighting and framing — she wears only lingerie or swimwear (bra and briefs or a bikini) fitting the scene, with a confident sensual attitude. Breasts and crotch stay covered.',
        }
    if (level < SPICY_EXPLICIT_MIN)
        return {
            key: 'topless',
            label: '🌶️ Topless',
            wardrobe:
                'she is TOPLESS — her top removed and her bare breasts visible, but she keeps her bottoms on (briefs, bikini bottom or skirt), with a confident sensual attitude. Be direct about the bare chest; the crotch stays covered.',
            fallback:
                'TOPLESS VARIANT (MANDATORY): the same scene, setting, pose, lighting and framing — her top is removed and her bare breasts are visible, while she keeps her bottoms on, with a confident sensual attitude.',
        }
    return {
        key: 'explicit',
        label: '🌶️ Explícito · desnudo',
        wardrobe:
            'she is now topless or completely nude (choose what fits the scene naturally; e.g. lingerie bottoms only, or fully nude), with a confident, sensual, provocative attitude. Be direct and explicit about the nudity in plain words.',
        fallback:
            'NSFW VARIANT (MANDATORY): the same scene, setting, pose, lighting and framing — but fully explicit: she is topless or completely nude (whichever fits the scene more naturally), her clothing removed, with a confident, sensual attitude. Explicit adult nudity is required in the output.',
    }
}
