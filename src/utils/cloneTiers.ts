/**
 * TRAMOS DEL CLONE REF — qué significa de verdad cada porcentaje.
 *
 * EL PROBLEMA QUE RESUELVE (2026-08-20, reporte "el % de clonación no sirve"):
 * el slider tenía 4 etiquetas y solo DOS comportamientos. El único cambio
 * estructural era «¿se adjunta la imagen?», que ocurría al cruzar 50; todo lo
 * demás era UNA frase de texto. Contra los píxeles el texto pierde siempre —la
 * propia base de datos lo dejó por escrito: «entre cw 15 y 100 solo cambiaba
 * UNA frase»— así que 100 y 65 salían idénticas. Y por debajo de 50 la imagen
 * NO viajaba, con lo que el único portador de contexto era la descripción; en
 * runs 🌶️ esa descripción es el fallback genérico (Gemini se niega a describir
 * desnudos y Qwen VL Max de MuleRouter también, medido con control), o sea
 * CERO información. De ahí que 40 y 15 «hicieran lo que querían».
 *
 * EL PRINCIPIO: el peso decide el ROL ESTRUCTURAL de la imagen, nunca un
 * adjetivo. Es la misma lección que ya funcionó al introducir el modo lienzo
 * (los guards puramente textuales perdían contra los píxeles); aquí se extiende
 * a los tramos de abajo en vez de resolverlos tirando la imagen.
 *
 * DOS palancas físicas, las dos monótonas:
 *
 *  1. QUÉ SLOT ocupa el clon. Los motores i2i pesan la imagen 1 muchísimo más
 *     que las siguientes: ser el lienzo que se edita no es lo mismo que ser una
 *     referencia que se consulta. Ese salto es real, no retórico.
 *  2. CUÁNTO DETALLE lleva. Menos píxeles = menos que copiar. En los tramos
 *     bajos el clon viaja reescalado: sobreviven composición, colores y
 *     ambiente; se pierde la textura que invita a calcar.
 *
 * La imagen viaja en LOS CUATRO tramos. 15 % significa «toma menos de ella»,
 * nunca «ignórala» — perder el contexto no era el diseño, era el bug.
 */

export type CloneTierKey = 'exact' | 'strong' | 'moderate' | 'loose'

export type CloneTier = {
    key: CloneTierKey
    /** Etiqueta del slider — dice lo que va a salir. */
    label: string
    /** Frase de una línea para el tooltip: qué esperar de este tramo. */
    hint: string
    /**
     * ¿El clon es el LIENZO (imagen 1) que se recrea, con la cara entrando por
     * face-swap? SOLO el tramo exacto. Debajo, la imagen 1 vuelve a ser la CARA
     * del avatar (ella es el sujeto) y el clon baja a referencia.
     */
    canvas: boolean
    /**
     * Lado mayor al que se reescala el clon antes de enviarlo. `null` = tal
     * cual. Es la segunda palanca: en MODERATE/LOOSE hay literalmente menos
     * detalle que copiar, así que la variación deja de depender de que el
     * motor obedezca un adjetivo.
     */
    maxSide: number | null
}

/**
 * Fronteras ÚNICAS. Las lee la UI (para etiquetar), el cliente (para decidir
 * cómo manda la imagen) y las rutas (para redactar su cláusula). Con dos copias
 * de estos umbrales, etiqueta y comportamiento se desincronizan en cuanto
 * alguien mueva uno — la misma deriva que ya nos costó las bandas de cm.
 */
export const CLONE_EXACT_MIN = 75
export const CLONE_STRONG_MIN = 50
export const CLONE_MODERATE_MIN = 25

/** Las 4 posiciones canónicas del slider (una centrada en cada tramo). */
export const CLONE_STOPS = [15, 40, 65, 100] as const

export function cloneTier(weight: number): CloneTier {
    if (weight >= CLONE_EXACT_MIN)
        return {
            key: 'exact',
            label: 'EXACT',
            hint: 'La misma foto, con la cara y el cuerpo de tu avatar',
            canvas: true,
            maxSide: null,
        }
    if (weight >= CLONE_STRONG_MIN)
        return {
            key: 'strong',
            label: 'STRONG',
            hint: 'Mismo outfit, pose y lugar — pero otra toma',
            canvas: false,
            maxSide: null,
        }
    if (weight >= CLONE_MODERATE_MIN)
        return {
            key: 'moderate',
            label: 'MOD',
            hint: 'La misma idea, reinterpretada con libertad',
            canvas: false,
            maxSide: 640,
        }
    return {
        key: 'loose',
        label: 'LOOSE',
        hint: 'Solo el ambiente: luz, paleta y estilo',
        canvas: false,
        maxSide: 384,
    }
}

/** Posición del slider → peso canónico del tramo (snap de 4 paradas). */
export const cloneWeightFromRatio = (ratio: number): number => {
    const r = Math.max(0, Math.min(1, ratio))
    return r >= 0.75 ? 100 : r >= 0.5 ? 65 : r >= 0.25 ? 40 : 15
}
