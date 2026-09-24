/**
 * Marcas permanentes del avatar: tatuajes, cicatrices, lunares.
 *
 * QUÉ RESUELVE: una marca es ANATOMÍA, no escena. Tiene que salir en toda
 * generación futura sin que nadie la escriba en el prompt, y por eso vive en
 * el avatar (tabla `avatar_marks`) y no en el texto de la toma.
 *
 * Este fichero es PURO a propósito — lo importan el servidor, el store del
 * estudio y la UI, y sus tres decisiones se testean sin base de datos:
 *
 *  1. La zona sale de una LISTA CERRADA. Con texto libre, cada generación
 *     describe el sitio de otra forma y el modelo lo coloca en otro sitio.
 *  2. El LADO es un campo aparte, no parte de la zona. Es el dato que los
 *     modelos más se inventan (además espejean la imagen), así que la frase
 *     que viaja al prompt lo dice explícito: `inner right forearm`.
 *  3. La visibilidad se mide por ROPA, no por NSFW. La ingle se ve en bañador
 *     y un bañador no es contenido adulto: gatear esto por el modo NSFW del
 *     estudio sería el criterio equivocado. Ver `MarkExposure`.
 */

export type MarkSide = 'right' | 'left'

/** Qué ropa hace falta para que la zona se vea. NO es una clasificación de
 *  contenido: es geometría de la toma. */
export type MarkExposure =
    /** Se ve salvo manga larga o guantes: antebrazos, manos, cuello. */
    | 'always'
    /** Tirantes, shorts, escote: hombros, brazos, muslos, espalda. */
    | 'skin'
    /** Bikini, lencería o ropa corta: ingle, cadera, abdomen, glúteos. */
    | 'swim'

export interface MarkZone {
    id: string
    /** Etiqueta en la UI, sin el lado (lo añade `zoneLabel`). */
    label: string
    /** Frase que viaja al modelo. `{side}` se sustituye por right/left. */
    phrase: string
    /** false = zona central (esternón, nuca, columna, lumbar, abdomen). */
    lateral: boolean
    exposure: MarkExposure
    /** Concordancia de la etiqueta en castellano: "Ingle derecha", no
     *  "Ingle derecho". Sin marcar = masculino singular. */
    fem?: true
    plural?: true
}

export const MARK_ZONES: readonly MarkZone[] = [
    // Cuello y cabeza
    { id: 'cuello_lateral', label: 'Cuello lateral', phrase: '{side} side of the neck', lateral: true, exposure: 'always' },
    { id: 'nuca', label: 'Nuca', phrase: 'nape of the neck', lateral: false, exposure: 'always' },
    { id: 'detras_oreja', label: 'Detrás de la oreja', phrase: 'behind the {side} ear', fem: true, lateral: true, exposure: 'always' },

    // Brazos y manos
    { id: 'hombro', label: 'Hombro', phrase: '{side} shoulder', lateral: true, exposure: 'skin' },
    { id: 'brazo_exterior', label: 'Brazo exterior', phrase: 'outer {side} upper arm', lateral: true, exposure: 'skin' },
    { id: 'brazo_interior', label: 'Brazo interior', phrase: 'inner {side} upper arm', lateral: true, exposure: 'skin' },
    { id: 'antebrazo_interior', label: 'Antebrazo interior', phrase: 'inner {side} forearm', lateral: true, exposure: 'always' },
    { id: 'antebrazo_exterior', label: 'Antebrazo exterior', phrase: 'outer {side} forearm', lateral: true, exposure: 'always' },
    { id: 'muneca', label: 'Muñeca', phrase: '{side} wrist', fem: true, lateral: true, exposure: 'always' },
    { id: 'dorso_mano', label: 'Dorso de la mano', phrase: 'back of the {side} hand', fem: true, lateral: true, exposure: 'always' },
    { id: 'dedos', label: 'Dedos', phrase: '{side} fingers', plural: true, lateral: true, exposure: 'always' },

    // Torso delantero
    { id: 'esternon', label: 'Esternón', phrase: 'sternum, center of the chest', lateral: false, exposure: 'skin' },
    { id: 'pecho', label: 'Pecho', phrase: '{side} chest', lateral: true, exposure: 'skin' },
    { id: 'bajo_pecho', label: 'Bajo el pecho', phrase: 'under the {side} breast', lateral: true, exposure: 'swim' },
    { id: 'costillas', label: 'Costillas', phrase: '{side} ribs', fem: true, plural: true, lateral: true, exposure: 'swim' },
    { id: 'abdomen', label: 'Abdomen', phrase: 'stomach, below the navel', lateral: false, exposure: 'swim' },
    { id: 'cadera', label: 'Cadera', phrase: '{side} hip', fem: true, lateral: true, exposure: 'swim' },
    { id: 'ingle', label: 'Ingle', phrase: '{side} groin, bikini line', fem: true, lateral: true, exposure: 'swim' },

    // Torso trasero
    { id: 'espalda_alta', label: 'Espalda alta', phrase: 'upper back', lateral: false, exposure: 'skin' },
    { id: 'omoplato', label: 'Omóplato', phrase: '{side} shoulder blade', lateral: true, exposure: 'skin' },
    { id: 'columna', label: 'Columna', phrase: 'along the spine', lateral: false, exposure: 'swim' },
    { id: 'lumbar', label: 'Lumbar', phrase: 'lower back', lateral: false, exposure: 'swim' },
    { id: 'gluteo', label: 'Glúteo', phrase: '{side} buttock', lateral: true, exposure: 'swim' },

    // Piernas
    { id: 'muslo_frontal', label: 'Muslo frontal', phrase: 'front of the {side} thigh', lateral: true, exposure: 'skin' },
    { id: 'muslo_exterior', label: 'Muslo exterior', phrase: 'outer {side} thigh', lateral: true, exposure: 'skin' },
    { id: 'muslo_interior', label: 'Muslo interior', phrase: 'inner {side} thigh', lateral: true, exposure: 'swim' },
    { id: 'pantorrilla', label: 'Pantorrilla', phrase: '{side} calf', fem: true, lateral: true, exposure: 'skin' },
    { id: 'tobillo', label: 'Tobillo', phrase: '{side} ankle', lateral: true, exposure: 'skin' },
    { id: 'pie', label: 'Pie', phrase: 'top of the {side} foot', lateral: true, exposure: 'skin' },
] as const

/** Los ids válidos, en el mismo orden que el CHECK de la migración. */
export const MARK_ZONE_IDS: readonly string[] = MARK_ZONES.map((z) => z.id)

export function findZone(id: string): MarkZone | null {
    for (const zone of MARK_ZONES) if (zone.id === id) return zone
    return null
}

/** Una marca tal como la guarda `avatar_marks` (lo mínimo para el prompt). */
export interface AvatarMarkInput {
    zone: string
    side?: MarkSide | null
    content: string
    inkStyle?: string | null
    coverage?: string | null
    orientation?: string | null
}

/**
 * Frase de la zona para el prompt, con el lado ya resuelto.
 *
 * Una zona lateral SIN lado no se descarta: se deja sin lado antes que
 * inventárselo, porque un lado equivocado es peor que ninguno — el modelo
 * pintaría la marca en el brazo que no es y eso rompe la continuidad entre
 * generaciones más que omitirla.
 */
export function markPhrase(mark: Pick<AvatarMarkInput, 'zone' | 'side'>): string {
    const zone = findZone(mark.zone)
    if (!zone) return ''
    if (!zone.lateral) return zone.phrase
    const side = mark.side === 'right' || mark.side === 'left' ? mark.side : null
    return side
        ? zone.phrase.replace('{side}', side)
        : zone.phrase.replace('{side} ', '').replace(' {side}', '')
}

/** Etiqueta para la UI: "Antebrazo interior derecho". */
export function zoneLabel(mark: Pick<AvatarMarkInput, 'zone' | 'side'>): string {
    const zone = findZone(mark.zone)
    if (!zone) return ''
    if (!zone.lateral) return zone.label
    if (mark.side !== 'right' && mark.side !== 'left') return zone.label
    const raiz = mark.side === 'right' ? 'derech' : 'izquierd'
    const sufijo = `${zone.fem ? 'a' : 'o'}${zone.plural ? 's' : ''}`
    return `${zone.label} ${raiz}${sufijo}`
}

export function exposureLabel(exposure: MarkExposure): string {
    if (exposure === 'swim') return 'Se ve en bañador'
    if (exposure === 'always') return 'Se ve siempre'
    return 'Se ve con ropa ligera'
}

/** Una línea del tag: la zona, qué es y con qué tinta. */
function markLine(mark: AvatarMarkInput): string {
    const phrase = markPhrase(mark)
    if (!phrase) return ''
    const parts = [mark.content.trim()]
    if (mark.inkStyle?.trim()) parts.push(mark.inkStyle.trim())
    if (mark.coverage?.trim()) parts.push(mark.coverage.trim())
    if (mark.orientation?.trim()) parts.push(mark.orientation.trim())
    return `${phrase} — ${parts.filter(Boolean).join(', ')}`
}

/**
 * El tag que se inyecta en CADA generación, junto a `[FACE:]` y `[BODY:]`.
 *
 * Dos cláusulas que no son adorno:
 *  - "not clothing": sin ella el modelo estampa el diseño en la camiseta
 *    (es lo que le pasa al rol `asset`, cuya cláusula habla de ropa).
 *  - "only when that area is in frame and uncovered": una marca del antebrazo
 *    no existe en un primer plano de cara ni bajo manga larga, y forzarla hace
 *    que el modelo recorte raro o invente ropa transparente.
 *
 * Devuelve '' sin marcas: el llamador no añade tag vacío.
 */
export function buildMarksTag(marks: readonly AvatarMarkInput[]): string {
    const lines = marks.map(markLine).filter(Boolean)
    if (lines.length === 0) return ''
    return (
        '[MARKS — permanent tattoos and marks on her skin, part of her body, not clothing: ' +
        lines.join('; ') +
        '. Reproduce each one ONLY when that area is in frame and uncovered; never print them on clothing.]'
    )
}

/** Forma mínima de una fila de `avatar_marks` (snake_case, como la devuelve PostgREST). */
export interface AvatarMarkRowLike {
    zone: string
    side: string | null
    content: string
    ink_style?: string | null
    coverage?: string | null
    orientation?: string | null
}

/**
 * Fila de base de datos → lo que necesita el tag. Vive aquí, y no en el
 * componente, porque lo usan dos sitios: el diálogo que las edita y el panel
 * que las carga al abrir el avatar.
 */
export function markFromRow(row: AvatarMarkRowLike): AvatarMarkInput {
    return {
        zone: row.zone,
        side: row.side === 'right' || row.side === 'left' ? row.side : null,
        content: row.content,
        inkStyle: row.ink_style ?? null,
        coverage: row.coverage ?? null,
        orientation: row.orientation ?? null,
    }
}
