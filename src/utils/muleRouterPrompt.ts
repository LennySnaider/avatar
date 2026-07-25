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
    /** Roles de las imágenes EXTRA en el mismo orden en que se envían (la cara
     *  siempre es Image 1). El prompt nombra el índice REAL de cada una —
     *  nombrar mal el índice hace que el modelo mire la imagen equivocada.
     *  El API acepta 3 imágenes → como mucho 2 extras. */
    extraRoles?: Array<'clone' | 'body' | 'place'>
    /** Peso del Clone Ref (0-100) — el slider del Studio. Escala la FUERZA de
     *  la cláusula igual que planExtraRefs: ≥75 EXACT · 50-74 STRONG · 25-49
     *  MODERATE · <25 LOOSE. Sin esto, un clone al 15% ("LOOSE" en el badge) se
     *  reproducía exacto e ignoraba el slider. */
    cloneWeight?: number
}): { prompt: string; negativePrompt: string } {
    const m = params.measurements
    const parts: string[] = []

    // CÁMARA PRIMERO y COMPACTA (la composición pesa al inicio; la versión
    // verbosa de 200 chars agotó el presupuesto y dejó la desnudez fuera).
    // Respeta los chips del usuario. En AUTO: full-body con anti-corte… SALVO
    // que viaje un CLONE — ahí el encuadre lo manda la foto clonada (forzar
    // "full body" contradecía el "reproduce el framing de Image 2" y peleaba
    // con escenas de medio cuerpo).
    const explicitShot =
        !!params.cameraShot && params.cameraShot !== 'AUTO'
    const cloneDrivesFraming =
        !explicitShot && (params.extraRoles ?? []).includes('clone')
    const framing = explicitShot
        ? (MR_FRAMING[params.cameraShot as string] ?? '')
        : cloneDrivesFraming
          ? 'Photo'
          : MR_FRAMING.FULL_SHOT
    const angle = params.cameraAngle
        ? (MR_ANGLE[params.cameraAngle] ?? '')
        : ''
    const camLine = [framing, angle].filter(Boolean).join(' ')
    parts.push(
        `${camLine} of the woman in Image 1 — her face, facial features, freckles and hair MUST match Image 1 exactly; never use a face from any other image.`,
    )

    // Índices REALES de cada extra (la cara es Image 1).
    const roles = params.extraRoles ?? []
    const idxOf = (r: 'clone' | 'body' | 'place') => {
        const i = roles.indexOf(r)
        return i === -1 ? 0 : i + 2
    }
    const bodyIdx = idxOf('body')
    const cloneIdx = idxOf('clone')
    const placeIdx = idxOf('place')

    // CLONE como IMAGEN (2026-07-25): es lo que hace ganar a Seedream — la
    // pose/outfit/setting se copian de la foto, no de un texto truncable.
    if (cloneIdx) {
        const cw = params.cloneWeight ?? 100
        // NUNCA la palabra "mannequin"/"doll" en el POSITIVO: la difusión no
        // niega, PINTA — el output salía como muñeca articulada con juntas
        // visibles (reporte 2026-07-25 con imagen). Se expresa como qué SÍ
        // hacer: la persona sale del avatar, la foto solo aporta escena.
        const identityFromAvatar =
            ' Take NOTHING of the person in it: replace her completely — the face, hair and body proportions come from Image 1 and the body spec, never from this photo.'
        parts.push(
            cw >= 75
                ? `Image ${cloneIdx} is the CLONE source: recreate its EXACT outfit, pose, framing and setting.${identityFromAvatar}`
                : cw >= 50
                  ? `Image ${cloneIdx} is a STRONG reference: follow its outfit, pose, framing and setting closely, with natural variation.${identityFromAvatar}`
                  : cw >= 25
                    ? `Image ${cloneIdx} is a MODERATE reference: keep its outfit STYLE, general pose and setting but reinterpret the details freely — a variation, not a copy.${identityFromAvatar}`
                    : `Image ${cloneIdx} is a LOOSE mood reference: take only its general vibe, outfit style and kind of setting — reinterpret pose, framing and details freely.${identityFromAvatar}`,
        )
    }

    if (bodyIdx) {
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
                ? `Image ${bodyIdx} is a nude turnaround of the SAME woman — copy her exact body shape, proportions and natural skin${cmLine}; ignore its background and neutral pose.${hair ? ` Her hair: ${hair}.` : ''}`
                : `Use Image ${bodyIdx} ONLY for her body shape and proportions${cmLine} — copy the FIGURE, never its sports bra, underwear, face or background.${hair ? ` Her hair: ${hair}.` : ''}`,
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
            'She is COMPLETELY NUDE — no bra, top or underwear, bare skin all over. Realistic bare breasts with small skin-toned areolas and a natural vulva with soft closed labia, matte skin tone, anatomically real and softly detailed.',
        )
    }

    // LOCACIÓN por imagen: el texto [PLACE: …] se elimina abajo con el resto de
    // tags (el cap de 800 no lo aguanta), así que sin esto la locación se perdía
    // por completo en MuleRouter. El índice depende de si viajó la hoja.
    if (placeIdx) {
        parts.push(
            `Image ${placeIdx} is the LOCATION: place her in THAT exact environment (its architecture, furniture and lighting); ignore any person in it.`,
        )
    }

    // Escena limpia. CRÍTICO (2026-07-25, "todas las de Qwen salen iguales"):
    // en runs con Clone/Place la descripción REAL de la escena (outfit, pose,
    // setting) vive DENTRO de los tags [CLONE:…]/[PLACE:…]. Borrarlos enteros
    // dejaba a MuleRouter SIN escena → siempre la misma pose neutra, y sin
    // outfit copiaba el de la hoja (el bikini gris). Se PRESERVA su contenido y
    // solo se tiran los tags de identidad (que ya viajan en la zona fija).
    const cleanScene = params.scene
        .replace(/\[(?:CLONE|PLACE|POSE|SCENE):\s*([^\]]*)\]/gi, ' $1 ')
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
    // Anti-muñeca (2026-07-25): el output salía como doll articulada. Va en el
    // NEGATIVE, nunca en el positivo.
    const DOLL_NEG =
        'mannequin, doll, ball-jointed doll, action figure, visible joint seams, plastic skin, vinyl skin, toy figure, waxwork'
    const BODY_NEG =
        'oversized hips, thick heavy thighs, plus-size body, muscular bodybuilder physique, exaggerated hourglass, obese, skinny emaciated body'
    const FIXED_NEG =
        'watermark, text, logo, signature, extra fingers, deformed hands, missing limbs, amputated limbs'
    const NSFW_NEG =
        'clothes, clothing, dress, corset, top, pants, bra, panties, underwear, covered body, censored, censor bar, blurred crotch, smooth featureless crotch, doll-like genital area, pink areolas, blushed chest, open labia, gaping, oversized breasts'
    const negativePrompt = (
        params.nsfw
            ? `${DOLL_NEG}, ${NSFW_NEG}, ${BODY_NEG}, ${FIXED_NEG}`
            : `${DOLL_NEG}, ${BODY_NEG}, ${FIXED_NEG}`
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
