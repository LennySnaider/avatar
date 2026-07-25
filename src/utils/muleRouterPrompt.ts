import type { PhysicalMeasurements } from '@/@types/supabase'
import {
    getHairColorDescription,
    getSkinToneDescription,
} from '@/utils/bodyDescriptors'
// Mapas COMPACTOS propios (los DIFFUSION_* de avatarPromptBuilder son
// verbosos — aquí cada char compite contra el límite de 800 y una línea de
// cámara de 200 chars dejó la desnudez fuera del presupuesto → salió VESTIDA).
const MR_FRAMING: Record<string, string> = {
    EXTREME_CLOSE_UP: 'Extreme close-up of her face',
    CLOSE_UP: 'Close-up portrait, head and shoulders',
    MEDIUM_CLOSE_UP: 'Medium close-up from the chest up',
    MEDIUM_SHOT: 'Medium shot from the waist up',
    MEDIUM_FULL: 'Medium-full shot from the knees up',
    FULL_SHOT:
        'Full-body shot, her whole body with head and feet fully in frame',
    WIDE_SHOT:
        'Wide full-body shot, whole body with head and feet in frame plus surroundings',
    EXTREME_WIDE: 'Extreme wide shot, subject small in a vast environment',
}
const MR_ANGLE: Record<string, string> = {
    LOW_ANGLE: 'from a low angle',
    HIGH_ANGLE: 'from a high angle looking down',
    DUTCH_ANGLE: 'dutch tilted angle',
    BIRDS_EYE: "bird's-eye from above",
    WORMS_EYE: "worm's-eye from below",
    OVER_SHOULDER: 'over-the-shoulder',
    POV: 'POV shot',
    PROFILE: 'in profile view',
    THREE_QUARTER: 'in three-quarter view',
}

/**
 * Prompt COMPACTO para MuleRouter Qwen Edit Max (límite duro: 800 chars,
 * negative 500). No se puede mandar el spec completo (~1.1KB) — esta es la
 * versión destilada que produjo el test decisivo (Raven retrato→cuerpo entero
 * con cuerpo correcto, 2026-07-25). El presupuesto: cara+encuadre (~110) +
 * cuerpo por cm (~230) + anatomía NSFW (~105) + escena (el resto).
 *
 * Principios heredados de la saga (memoria avatar-kie-cloning-state):
 * - cm + frases coherentes con el número (nunca amplificadores sueltos)
 * - glúteo = proyección hacia ATRÁS, no anchura
 * - CERO palabras-pigmento en el positivo; prohibiciones al negative
 * - escena sin tags [XXX] ni cláusulas largas de watermark (van al negative)
 */
export function buildMuleRouterEditMaxPrompt(params: {
    measurements?: PhysicalMeasurements | null
    /** Escena/pose del run (puede traer tags y cláusulas — se limpian). */
    scene: string
    nsfw: boolean
    /** Chips de la UI (Framing/Angle) — la cámara va PRIMERO: al final de la
     *  escena el truncado a 800 se los comía y el modelo los ignoraba. */
    cameraShot?: string
    cameraAngle?: string | null
    /** true → la hoja del Body Lab viaja como Image 2: el cuerpo se ancla por
     *  IMAGEN (la razón de ser del Body Lab) y el spec textual baja a cm
     *  compactos — libera ~150 chars para la escena. */
    hasBodySheet?: boolean
    /** true → esa hoja es la variante NUDE: no hay ropa que prohibir y encima
     *  aporta la piel/anatomía reales (fin del "no se ve natural"). */
    bodySheetNude?: boolean
}): { prompt: string; negativePrompt: string } {
    const m = params.measurements
    const parts: string[] = []

    // CÁMARA PRIMERO y COMPACTA (la composición pesa al inicio; la versión
    // verbosa de 200 chars agotó el presupuesto y dejó la desnudez fuera).
    // Respeta los chips; AUTO cae a full-body con anti-corte de cabeza/pies.
    const framing =
        params.cameraShot && params.cameraShot !== 'AUTO'
            ? (MR_FRAMING[params.cameraShot] ?? '')
            : MR_FRAMING.FULL_SHOT
    const angle = params.cameraAngle
        ? (MR_ANGLE[params.cameraAngle] ?? '')
        : ''
    const camLine = [framing, angle].filter(Boolean).join(' ')
    parts.push(
        `${camLine} of the woman in Image 1 — keep her EXACT face, hair and identity unchanged.`,
    )

    if (params.hasBodySheet) {
        // CUERPO POR IMAGEN (la razón de ser del Body Lab): la hoja turnaround
        // viaja como Image 2 — receta ganadora de Seedream. El texto queda en
        // cm compactos (cinturón y tirantes) + pelo/piel.
        const cmLine =
            m?.waist && m?.hips && m?.bust
                ? ` (bust ${m.bust}cm, waist ${m.waist}cm, hips ${m.hips}cm)`
                : ''
        const hair = m
            ? getHairColorDescription(m.hairColor).split(',')[0]
            : ''
        // Image 2 = cuerpo. Con la hoja NUDE se copia además la PIEL y la
        // anatomía reales (lo que el texto no lograba: "no se ve natural").
        // Con la hoja VESTIDA hay que prohibir su ropa por nombre — el
        // "IGNORE clothing" genérico no bastaba y salía con la panti beige.
        parts.push(
            params.bodySheetNude
                ? `Image 2 is a nude turnaround of the SAME woman — copy her exact body shape, proportions and natural skin${cmLine}; ignore its background and neutral pose.${hair ? ` Her hair: ${hair}.` : ''}`
                : `Use Image 2 ONLY for her body shape and proportions${cmLine} — copy the FIGURE, never Image 2's sports bra, underwear, face or background.${hair ? ` Her hair: ${hair}.` : ''}`,
        )
    } else if (m?.waist && m?.hips && m?.bust) {
        const shape = (m.shape ?? m.bodyType ?? 'hourglass').replace(/-/g, ' ')
        const bodyBits: string[] = [
            `Her body: ${shape} figure, cinched ${m.waist}cm waist clearly narrower than her ${m.bust}cm bust and ${m.hips}cm hips`,
        ]
        if ((m.glutesLevel ?? 0) >= 4)
            bodyBits.push('round glutes projecting strongly backward')
        else if ((m.glutesLevel ?? 0) === 3) bodyBits.push('full round glutes')
        const legShort: Record<string, string> = {
            athletic: 'athletic toned legs',
            slim: 'slim legs',
            toned: 'toned legs',
            'muscular-thighs': 'sculpted thighs',
            long: 'long legs',
            curvy: 'shapely legs',
            thick: 'full thighs',
        }
        if (m.legType && legShort[m.legType])
            bodyBits.push(legShort[m.legType])
        const hair = getHairColorDescription(m.hairColor).split(',')[0]
        if (hair) bodyBits.push(hair)
        const skin = getSkinToneDescription(m.skinTone).split(',')[0]
        if (skin) bodyBits.push(skin)
        // Candado bidireccional COMPACTO (varianza: la semántica de escena se
        // derrama al cuerpo). Los cm mandan en ambas direcciones, siempre.
        parts.push(
            bodyBits.join(', ') +
                ' — exactly these proportions every time: never thicker or wider, never slimmer.',
        )
    }

    if (params.nsfw) {
        // DESNUDEZ GARANTIZADA (2026-07-25, "salió vestida"): antes la orden
        // "completely nude" vivía en la COLA de la escena y el truncado a 800
        // se la comía (diff del usuario: cortaba justo antes) → Qwen la vestía.
        // La orden va AQUÍ (zona no truncable) + ropa prohibida en el negative.
        // Vulva con el anti-doll batallado en compacto.
        // "vertical cleft line" (2026-07-25) → Edit Max lo dibujaba como una
        // LÍNEA vertical literal en el torso/ropa. Se describe la anatomía SIN
        // la palabra "line". Nudez reforzada (no top, no panti).
        parts.push(
            'She is COMPLETELY NUDE — no bra, top or underwear, bare skin all over. Realistic bare breasts with small skin-toned areolas and a natural vulva with soft closed labia, matte skin tone — real anatomy, not a smooth doll-like blank.',
        )
    }

    // Escena limpia: fuera tags [XXX] y la cláusula larga de watermark (esa
    // prohibición vive en el negative), espacios colapsados.
    const cleanScene = params.scene
        .replace(/\[[^\]]*\]/g, ' ')
        .replace(/Do NOT add any watermark[^.]*\./gi, ' ')
        .replace(/Her anatomy:[\s\S]*$/i, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
    const used = parts.join(' ').length
    const room = 800 - used - 1
    if (room > 40 && cleanScene) {
        const hard = cleanScene.slice(0, room)
        const cut = hard.lastIndexOf(' ')
        parts.push(cut > room * 0.6 ? hard.slice(0, cut) : hard)
    }

    // Candado corporal SIEMPRE (antes solo NSFW → las gens SFW inflaban sin
    // freno). Acota ambos extremos: ni gruesa/musculosa ni esquelética.
    const BODY_NEG =
        'oversized hips, thick heavy thighs, plus-size body, muscular bodybuilder physique, exaggerated hourglass, obese, skinny emaciated body'
    const FIXED_NEG =
        'watermark, text, logo, signature, extra fingers, deformed hands, missing limbs, amputated limbs'
    const NSFW_NEG =
        'clothes, clothing, dress, corset, top, pants, bra, panties, underwear, covered body, censored, censor bar, blurred crotch, smooth featureless crotch, doll-like genital area, pink areolas, blushed chest, open labia, gaping, oversized breasts'
    const negativePrompt = (
        params.nsfw
            ? `${NSFW_NEG}, ${BODY_NEG}, ${FIXED_NEG}`
            : `${BODY_NEG}, ${FIXED_NEG}`
    ).slice(0, 500)

    return { prompt: parts.join(' ').slice(0, 800), negativePrompt }
}

/**
 * Seed ESTABLE por avatar: mismo avatar → mismo seed → el sampler parte del
 * mismo punto y el CUERPO varía menos entre generaciones (la escena sigue
 * mandando en pose/fondo). El API dice que el seed "ayuda a la consistencia"
 * sin garantizar identidad exacta — es un estabilizador, no un candado.
 */
export function avatarStableSeed(avatarId?: string | null): number | undefined {
    if (!avatarId) return undefined
    let h = 0
    for (let i = 0; i < avatarId.length; i++) {
        h = (h * 31 + avatarId.charCodeAt(i)) % 2147483647
    }
    return h
}

/** Mapa aspectRatio → size de MuleRouter ("w*h", ambos [512,2048]). */
export const MULEROUTER_SIZE: Record<string, string> = {
    '9:16': '928*1664',
    '16:9': '1664*928',
    '1:1': '1328*1328',
    '3:4': '1104*1472',
    '4:3': '1472*1104',
}
