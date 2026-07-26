import type { PhysicalMeasurements } from '@/@types/supabase'
import {
    getEyeColorDescription,
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
    /** true → esta llamada es la FASE 1 de un run con clone: NO pide desnudez
     *  ni face-swap (los hace la fase 2). Pedirlo todo a la vez hacía que el
     *  editor eligiera lo más fácil: copiar el lienzo tal cual. */
    deferToPhase2?: boolean
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
    imageRoles?: Array<'face' | 'clone' | 'body' | 'place'>
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
        !explicitShot && (params.imageRoles ?? []).includes('clone')
    const framing = explicitShot
        ? (MR_FRAMING[params.cameraShot as string] ?? '')
        : cloneDrivesFraming
          ? 'Photo'
          : MR_FRAMING.FULL_SHOT
    const angle = params.cameraAngle
        ? (MR_ANGLE[params.cameraAngle] ?? '')
        : ''
    const camLine = [framing, angle].filter(Boolean).join(' ')

    // Índices REALES (1-based) de cada imagen enviada.
    const roles = params.imageRoles ?? ['face']
    const idxOf = (r: 'face' | 'clone' | 'body' | 'place') => {
        const i = roles.indexOf(r)
        return i === -1 ? 0 : i + 1
    }
    const faceIdx = idxOf('face')
    const bodyIdx = idxOf('body')
    const cloneIdx = idxOf('clone')
    const placeIdx = idxOf('place')
    const cw = params.cloneWeight ?? 100

    // CLONE COMO LIENZO (Image 1) — lección probada en la ruta Qwen de KIE:
    // "Qwen EDITA la primera imagen; con la CARA como imagen 1 anclaba la
    // composición del RETRATO e ignoraba la pose/fondo del clone".
    //
    // ORDEN (2026-07-25, reporte "al 100% no cambia la cara y el cuerpo no lo
    // pone en ninguna"): el face-swap y el cuerpo van ANTES de la fidelidad.
    // Con "Recreate Image 1 EXACTLY" al frente, el "exactly" arrastraba TAMBIÉN
    // la cara (a 65% "closely" dejaba holgura y sí la cambiaba) y el lienzo
    // pesaba más que la orden de cuerpo. Mismo orden que la ruta Qwen que sí
    // funciona: swap → cuerpo → fidelidad → escena.
    let pendingFidelity = ''
    if (cloneIdx === 1) {
        // Wording del path DEEPFAKE de Qwen KIE (el que "SÍ funciona" según el
        // comentario de esa ruta): nombra el MECANISMO (reemplazar la cara de
        // la 1ª por la de la 2ª) y prohíbe MEZCLAR — sin eso el editor
        // conservaba la cara del lienzo (reporte: 65% y 100% con la cara del
        // original).
        parts.push(
            `The SECOND image shows the person whose FACE to use. The FACE SWAP is MANDATORY: replace the face in the FIRST image with the face from Image ${faceIdx} — her exact features, freckles and likeness — never keep the original face. Do NOT blend the two images.`,
        )
        // En NSFW el outfit del lienzo se EXCLUYE: pedir "keep the outfit
        // EXACTLY" contradecía "she is COMPLETELY NUDE" y ganaba el lienzo
        // (reporte 2026-07-25: al 100% NSFW salía vestida con la ropa del clon).
        const deferred = params.deferToPhase2
        const keepOutfit = params.nsfw && !deferred ? '' : 'outfit, '
        pendingFidelity =
            cw >= 75
                ? `Keep Image 1's ${keepOutfit}pose, hands, framing, lighting and setting EXACTLY as they are${params.nsfw && !deferred ? ', but she wears NOTHING' : ''}.`
                : `Follow Image 1's ${keepOutfit}pose, framing and setting closely, with natural variation${params.nsfw && !deferred ? '; she wears NOTHING' : ''}.`
    } else {
        parts.push(
            `${camLine} of the woman in Image ${faceIdx} — her face, facial features, freckles and hair MUST match Image ${faceIdx} exactly; never use a face from any other image.`,
        )
    }

    // La ESCENA va TEMPRANO cuando no hay lienzo de clone (2026-07-25, "en 40 y
    // 15 super mal"): con cara(1)+hoja(2) y la escena al final, el modelo
    // copiaba la composición de la HOJA (de pie, fondo de estudio). Delante de
    // la hoja, la escena gana. Con lienzo NO hace falta (la composición ya
    // viene de la imagen 1).
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
    // Reserva para lo que aún falta emitir (cuerpo/anatomía/fidelidad) cuando la
    // escena va PRIMERO: sin esto se comería todo el presupuesto.
    const pushScene = (reserve: number) => {
        const room = 800 - parts.join(' ').length - reserve - 1
        if (room > 40 && cleanScene) {
            const hard = cleanScene.slice(0, room)
            const cut = hard.lastIndexOf(' ')
            parts.push(cut > room * 0.6 ? hard.slice(0, cut) : hard)
        }
    }
    if (cloneIdx !== 1) pushScene(420)

    // Si por alguna razón el clone NO quedó de lienzo, se describe indexado.
    if (cloneIdx > 1) {
        parts.push(
            `Image ${cloneIdx} sets the outfit, pose, framing and setting. Take NOTHING of the person in it — face, hair and proportions come from Image ${faceIdx} and the body spec.`,
        )
    }

    // El % TAMBIÉN manda cuando el clone viaja solo por TEXTO (<50). Sin esto
    // el prompt de 15% y 40% era IDÉNTICO — y con el seed estable salía la
    // MISMA imagen ("es como si no hubiera sistema de %", reporte 2026-07-25).
    if (!cloneIdx && /\[CLONE:/i.test(params.scene)) {
        parts.push(
            cw >= 25
                ? 'Use the outfit and setting described below as a general BASIS, reinterpreting the pose, framing and details freely — a clear variation, not a copy.'
                : 'Take only the general VIBE of the outfit and setting described below; reinterpret the pose, framing, composition and details completely freely.',
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
        const notFromCanvas = cloneIdx === 1
            ? ` Do NOT copy the body from Image 1 — it is slimmer than she really is.`
            : ''
        parts.push(
            params.bodySheetNude
                ? `Image ${bodyIdx} is a body-shape CHART of the same woman: take ONLY her proportions and skin${cmLine} from it — never its hair, eyes, pose, framing, background or lighting, which come from the scene below.${notFromCanvas}${hair ? ` Her hair: ${hair}.` : ''}`
                : `Image ${bodyIdx} is a body-shape CHART: take ONLY her proportions${cmLine} — never its sports bra, underwear, face, hair, pose or background.${notFromCanvas}${hair ? ` Her hair: ${hair}.` : ''}`,
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
                ' — exactly these proportions every time: never thicker or wider, never slimmer.' +
                (cloneIdx === 1
                    ? ' Do NOT copy the body from Image 1 — it is slimmer than she really is.'
                    : ''),
        )
    }

    if (pendingFidelity) parts.push(pendingFidelity)
    if (cloneIdx === 1) pushScene(0)

    // Ojos del avatar también en la ruta de 1 fase (sin clone la cara la decide
    // este prompt, no hay fase 2 que la corrija).
    if (!params.deferToPhase2 && m?.eyeColor) {
        const eye = getEyeColorDescription(m.eyeColor).split(',')[0]
        if (eye) parts.push(`Her eyes are ${eye}, natural and realistic.`)
    }

    if (params.nsfw && !params.deferToPhase2) {
        // DESNUDEZ GARANTIZADA (2026-07-25, "salió vestida"): antes la orden
        // "completely nude" vivía en la COLA de la escena y el truncado a 800
        // se la comía (diff del usuario: cortaba justo antes) → Qwen la vestía.
        // La orden va AQUÍ (zona no truncable) + ropa prohibida en el negative.
        // Vulva con el anti-doll batallado en compacto.
        // "vertical cleft line" (2026-07-25) → Edit Max lo dibujaba como una
        // LÍNEA vertical literal en el torso/ropa. Se describe la anatomía SIN
        // la palabra "line". Nudez reforzada (no top, no panti).
        parts.push(
            'She is COMPLETELY NUDE — no bra, top or underwear, bare skin all over. Realistic bare breasts with CLEARLY DEFINED nipples and small skin-toned areolas, and a natural vulva with soft closed labia, matte skin tone, anatomically real and softly detailed.',
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

    // Candado corporal SIEMPRE (antes solo NSFW → las gens SFW inflaban sin
    // freno). Acota ambos extremos: ni gruesa/musculosa ni esquelética.
    // Anti-muñeca (2026-07-25): el output salía como doll articulada. Va en el
    // NEGATIVE, nunca en el positivo.
    const DOLL_NEG =
        'mannequin, doll, visible joint seams, plastic skin, toy figure'
    const BODY_NEG =
        'oversized hips, plus-size body, bodybuilder physique, obese, emaciated'
    const FIXED_NEG =
        'watermark, text, logo, signature, extra fingers, deformed hands, missing limbs, amputated limbs'
    const NSFW_NEG =
        'clothes, bra, panties, underwear, covered body, censored, censor bar, blurred crotch, smooth featureless crotch, doll-like genital area, pink areolas, blushed chest, open labia, gaping, oversized breasts'
    // El API corta a 500 a MEDIA PALABRA: en NSFW la lista llegaba justo a 500 y
    // se perdían los fijos del final (watermark, deformed hands, missing/
    // amputated limbs — la red anti-mutilación que costó encontrar). Los
    // términos van compactados por prioridad y se recorta por TÉRMINO COMPLETO,
    // nunca a media palabra.
    const rawNegative = params.nsfw
        ? `${NSFW_NEG}, ${DOLL_NEG}, ${BODY_NEG}, ${FIXED_NEG}`
        : `${DOLL_NEG}, ${BODY_NEG}, ${FIXED_NEG}`
    let negativePrompt = rawNegative
    if (negativePrompt.length > 500) {
        const terms = negativePrompt.split(', ')
        negativePrompt = ''
        for (const t of terms) {
            const next = negativePrompt ? `${negativePrompt}, ${t}` : t
            if (next.length > 500) break
            negativePrompt = next
        }
    }

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

/**
 * FASE 2 del clone: face-swap PURO sobre el resultado de la fase 1.
 *
 * POR QUÉ DOS FASES (2026-07-25): con el clone de lienzo, Edit Max clava la
 * composición Y el cuerpo (verificado por el usuario: "al 100% puso el cuerpo
 * perfecto") pero se queda con la CARA del lienzo — ninguna orden de texto la
 * movió en 4 rondas. Separar el problema: la fase 1 arma la escena y la fase 2
 * solo cambia la cara, que es justo el patrón del path DEEPFAKE de Qwen (el que
 * el código documenta como "el que SÍ funciona").
 *
 * Prompt MÍNIMO a propósito: la escena ya está en la imagen, y describirla otra
 * vez diluye la orden de swap (misma lección que la 2-fases de KIE).
 */
export function buildMuleRouterFaceSwapPrompt(
    hairDesc?: string,
    opts?: { undress?: boolean; eyeDesc?: string; areolaDesc?: string },
): {
    prompt: string
    negativePrompt: string
} {
    const hair = hairDesc ? ` Keep her hair ${hairDesc.split(',')[0]}.` : ''
    // OJOS (2026-07-25, "los ojos se ven raros"): nunca viajaban a MuleRouter —
    // Seedream sí los recibe vía eyeClause y por eso salían bien. La fase 2 es
    // quien decide la cara, así que es SU sitio.
    const eyes = opts?.eyeDesc
        ? ` Her eyes are ${opts.eyeDesc.split(',')[0]} — natural realistic iris, not glowing or oversaturated.`
        : ''
    // DESVESTIR en la fase 2 (2026-07-25): pedir desnudez en la fase 1 peleaba
    // contra el lienzo VESTIDO del clone y ganaba el lienzo (salía con la ropa
    // del clon pese a "COMPLETELY NUDE"). Quitar ropa es una edición LOCAL, que
    // es justo lo que un editor hace bien — y aquí llega sin competencia.
    // PEZONES DEFINIDOS ("no están bien definidos"): la fase 1 difiere la
    // anatomía a la 2… y la 2 solo decía "natural realistic breasts". El detalle
    // del pezón/areola (y el de la vulva) tiene que viajar AQUÍ.
    const areola = opts?.areolaDesc ?? 'small'
    const undress = opts?.undress
        ? ` Also REMOVE all her clothing — she is completely nude, bare skin, same pose and framing. Natural breasts with CLEARLY DEFINED nipples and ${areola} skin-toned areolas, and a natural vulva with soft closed labia, anatomically real.`
        : ''
    const keepList = opts?.undress
        ? 'same body, pose, hands, framing, lighting and background'
        : 'same body, pose, outfit, hands, framing, lighting and background'
    return {
        prompt:
            `Keep the FIRST image EXACTLY — ${keepList}. The SECOND image shows the person whose FACE to use: replace the face in the FIRST image with hers — exact features, freckles and likeness — never keep the original face, never blend the two images.` +
            undress +
            hair +
            eyes,
        negativePrompt: opts?.undress
            ? 'blended faces, different person, clothes, bra, panties, underwear, censored, blurred crotch, smooth featureless crotch, mannequin, doll, plastic skin, deformed hands, watermark, text'
            : 'blended faces, different person, mannequin, doll, plastic skin, deformed hands, extra fingers, watermark, text, logo',
    }
}
