/**
 * Helpers COMPARTIDOS y PUROS de las rutas de imagen KIE.
 *
 * Regla de oro del refactor: NADA aquí es pre-procesamiento que "todos corren
 * por default". Cada helper es OPT-IN — una ruta lo llama SI lo necesita. Así,
 * editar el comportamiento de un modelo (su ruta) no puede filtrarse a otro.
 *
 * Este módulo NO es `'use server'` y NO importa Supabase ni la red: es puro,
 * determinista e importable desde un script de snapshot (verificación). La
 * subida real de refs entra inyectada por `ctx.uploadRef`.
 *
 * Extraído VERBATIM de KieService.ts (planExtraRefs, stripIdentityRedundancy,
 * el prelude de runWithPrompt y las cláusulas) para preservar el comportamiento
 * byte-a-byte mientras se migra a rutas por modelo.
 */

export type KieRefWithRole = {
    // Opcional desde que una ref puede llegar YA subida (`url`): el editor manda
    // la URL de R2 en vez de 4.6 MB de base64, que es lo que reventaba el tope
    // de body de Vercel con un 413. Quien necesite los BYTES debe comprobarlo.
    base64?: string
    mimeType: string
    /** Ref ya hospedada y pública. Excluyente con `base64` en la práctica. */
    url?: string
    role?: string
    // Solo para role:'clone' — ¿se difuminó la cara rival del clon? Wan lo usa
    // para decidir el reorden (clon SIN cara → orden normal; con cara → reordena).
    masked?: boolean
}

/**
 * Selección + orden CANÓNICO de los refs que acompañan a la cara en los
 * branches i2i multi-imagen (Seedream/Wan/FLUX.2), con su cláusula indexada
 * por imagen ("Image 3 is…" — la cara siempre es la imagen 1). Antes esos
 * branches solo leían body/asset y descartaban en silencio pose/scene/clone/
 * place aunque ya viajaban en referenceImages (mismo bug que los Assets:
 * "hoodie with logo" pintaba la palabra literal "LOGO"). Orden: body primero
 * (las cláusulas de cuerpo calibradas dicen "SECOND attached image"), clone
 * AL FINAL (igual que nano-banana-pro, el patrón que arregló GPT Image 2).
 */
export function planExtraRefs(
    referenceImages: KieRefWithRole[] | undefined,
    maxExtras: number,
    deepfakeMode = false,
    // Peso del Clone Ref (0-100). Escala la FUERZA de la cláusula del clone en
    // 4 TRAMOS (cuartiles): ≥75 EXACT (recrea exacto, default) · 50-74 STRONG
    // (fiel con variación natural) · 25-49 MODERATE (misma base, reinterpreta
    // detalles) · <25 LOOSE (solo el vibe). Solo afecta al clause del clone.
    cloneWeight = 100,
    // ¿La escena pide desnudo? El clause del clone ordenaba "Keep her FULLY
    // dressed" SIEMPRE — en un run NSFW eso contradecia frontalmente a la
    // escena dentro del MISMO prompt (reporte con evidencia: "Keep her fully
    // dressed." conviviendo con "standing topless… bare breasts and nipples
    // are clearly visible"). El modelo tenia que elegir, y elegir mal era
    // gratis. El outfit del clone solo se conserva cuando NO hay desnudo.
    nsfwIntent = false,
): {
    extras: KieRefWithRole[]
    clauses: string
    hasBody: boolean
    hasClone: boolean
} {
    const byRole = (role: string) =>
        (referenceImages ?? []).filter((r) => r.role === role)
    const ordered = [
        ...byRole('body').slice(0, 3),
        ...byRole('bust').slice(0, 1),
        ...byRole('glutes').slice(0, 1),
        ...byRole('asset').slice(0, 3),
        ...byRole('pose').slice(0, 1),
        ...byRole('scene').slice(0, 1),
        ...byRole('place').slice(0, 1),
        ...byRole('clone').slice(0, 1),
    ].slice(0, maxExtras)
    const parts: string[] = []
    // Con CLONE presente, el OUTFIT viene del clone — las cláusulas de región
    // decían "outfit ONLY from the text" y contradecían al clone ("EXACT
    // outfit"): por esa grieta el énfasis de curvas DESVISTIÓ a la modelo
    // (leggings del clone → glúteos descubiertos, reporte del usuario).
    const hasClone = ordered.some((r) => r.role === 'clone')
    const outfitSrc = hasClone
        ? 'the CLONE image and the text description'
        : 'the text description'
    ordered.forEach((r, i) => {
        const n = i + 2
        switch (r.role) {
            // GUARD crítico en refs de región (aprendido en vivo: sin el
            // IGNORE, Seedream clonaba la ROPA/ESCENA/desnudez de la foto de
            // referencia y tiraba el [CLONE:] del texto — outputs en la playa
            // de la foto de glúteos o directamente desnuda).
            case 'bust':
                parts.push(
                    `Image ${n} = her real BUST: copy ONLY its size, shape and fullness. IGNORE that image's clothing/nudity, pose, scene and lighting — outfit, pose and scene come from ${outfitSrc}.`,
                )
                break
            case 'glutes':
                parts.push(
                    `Image ${n} = her real GLUTES and hips: copy ONLY their size, shape, fullness and projection (thighs proportionally full). IGNORE that image's clothing/nudity, pose, scene and lighting — outfit, pose and scene come from ${outfitSrc}.`,
                )
                break
            // La cláusula vieja ("print this EXACT design on her clothing")
            // era una orden imperativa SIN ámbito: con la escena decapitada el
            // modelo estampaba logos/texto-marca alucinado en la camiseta
            // (reporte: "LOXEANG" en Wan). Además el slot se usa también para
            // PRENDAS, no solo logos — la orden de "imprimir" convertía la
            // prenda en estampado forzado.
            case 'asset':
                parts.push(
                    `Image ${n} = product ASSET. If it is a garment/accessory: dress her in this EXACT item (same cut, fabric, colors and prints). If it is a logo/graphic: print it with faithful shapes and colors ONLY where the scene text places it — nowhere else. NEVER add any other logos, brand names or invented text on clothing or props; never write placeholder text like "LOGO".`,
                )
                break
            case 'pose':
                parts.push(
                    `Image ${n} = POSE reference: copy ONLY the body position — not its face, proportions or clothing.`,
                )
                break
            case 'scene':
                parts.push(
                    `Image ${n} = STYLE/SCENE reference: use for setting, lighting and composition; REPLACE its subject with her.`,
                )
                break
            case 'place':
                parts.push(
                    `Image ${n} = the LOCATION: place her in THIS exact environment (architecture, furniture, lighting); IGNORE any person in it.`,
                )
                break
            case 'clone': {
                // Fuerza del clone escalada por cloneWeight (slider del Studio).
                const cloneClause = deepfakeMode
                    ? `Image ${n} = the ORIGINAL photo: reproduce it EXACTLY (body, outfit, pose, hands, framing, lighting, background). MANDATORY face swap: the output face MUST be the person from image 1 — never keep the original face. Do NOT alter clothing. REMOVE overlaid stickers/watermarks/emojis — output a clean photo.`
                    : cloneWeight >= 75
                      ? `Image ${n} = the CLONE source: recreate its EXACT pose, body position, ${nsfwIntent ? '' : 'outfit, '}hands, objects held, framing, camera angle, lighting and setting. Its person is a FACELESS MANNEQUIN — the face comes ONLY from image 1. ${nsfwIntent ? 'IGNORE its clothing — follow the nudity described in the scene below.' : 'Keep her FULLY dressed as shown; do NOT remove or reduce clothing.'} REMOVE overlaid stickers/watermarks/emojis — output a clean photo.`
                      : cloneWeight >= 50
                        ? `Image ${n} = a STRONG reference: follow its ${nsfwIntent ? '' : 'outfit, '}pose, framing and setting closely but allow natural variation (it need not be pixel-identical). Its person is a FACELESS MANNEQUIN — the face comes ONLY from image 1. ${nsfwIntent ? 'IGNORE its clothing — follow the nudity described in the scene below.' : 'Keep her fully dressed.'} REMOVE overlaid stickers/watermarks/emojis.`
                        : cloneWeight >= 25
                          ? `Image ${n} = a MODERATE reference: keep its ${nsfwIntent ? 'general pose and setting' : 'overall outfit STYLE, general pose and setting'}, but freely reinterpret the exact details, framing and composition — a clear variation, NOT a copy. Its person is a FACELESS MANNEQUIN — the face comes ONLY from image 1. ${nsfwIntent ? 'IGNORE its clothing — follow the nudity described in the scene below.' : 'Keep her dressed.'}`
                          : `Image ${n} = a LOOSE style/mood reference: take only the general vibe, ${nsfwIntent ? '' : 'outfit style and '}setting cues — freely reinterpret the pose, framing and details. Its person is a FACELESS MANNEQUIN — the face comes ONLY from image 1.`
                parts.push(cloneClause)
                break
            }
        }
    })
    return {
        extras: ordered,
        clauses: parts.length > 0 ? ` ${parts.join(' ')}` : '',
        hasBody: ordered.some((r) => r.role === 'body'),
        hasClone,
    }
}

/**
 * En los branches i2i de Seedream/Wan la identidad física YA viaja en el ANCLA
 * (imagen 1 + bodyEmphasis/hair/eye), pero el prompt que llega del Studio trae
 * además el preámbulo de difusión ("A 21 year old woman…") y los bloques
 * [BODY:]/[FACE:] — ~1,300 chars duplicados. Con el presupuesto duro de ~2,750
 * y el recorte por el FINAL, la redundancia sobrevivía y la ESCENA del usuario
 * (outfit/pose/lugar/luz) se decapitaba — medido live en 5-lite: solo 155
 * chars de escena llegaron al modelo, cortados justo antes de la ropa (por eso
 * "hacía lo que quería": nunca leyó el prompt). Se quita AQUÍ la redundancia
 * para que la escena completa quepa en el presupuesto.
 * `bodyInAnchor` = el ancla ya carga el cuerpo (bodyEmphasis / Body Ref /
 * deepfake): solo entonces es seguro tirar el texto de cuerpo; [FACE:] siempre
 * sobra — la cara va en la imagen 1 y el texto solo pelea con la foto.
 */
export function stripIdentityRedundancy(
    text: string,
    bodyInAnchor: boolean,
): string {
    let out = text
    if (bodyInAnchor) {
        out = out
            .replace(/\bA \d+ year old woman\b[^]*?(?=\[(?:BODY|FACE):)/i, '')
            .replace(/\[BODY:[^\]]*\]/gi, ' ')
    }
    return out
        .replace(/\[FACE:[^\]]*\]/gi, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
}

/**
 * ALIAS de tier → id real de KIE. 'nano-banana-2-lite' NO existe como modelo en
 * KIE (solo 'nano-banana-2'); es un alias interno para forzar resolution=1K. El
 * resto del código ramifica por el alias; solo el id que viaja a KIE se traduce.
 * (Verbatim de KieService:519.)
 */
export function resolveModelAlias(model: string): string {
    return model === 'nano-banana-2-lite' ? 'nano-banana-2' : model
}

/**
 * El `[POSE: ...]` que el Studio appendea al FINAL del prompt moría en los caps
 * (recortan por el final; Grok/Qwen ~1800 ni lo veían → salían paradas). Esta
 * función lo reubica al INICIO como mandato ANTES de cualquier cap. OPT-IN: la
 * familia nano-banana-2 NO la llama (conserva la imagen de pose + [POSE_REF]).
 * (Verbatim de KieService:541-547.)
 */
export function relocatePoseTag(promptText: string): string {
    const poseTag = promptText.match(/\[POSE:\s*([^\]]+)\]/i)
    if (!poseTag) return promptText
    return `POSE (MANDATORY — her EXACT body position): ${poseTag[1].trim()}. ${promptText
        .replace(/\[POSE:[^\]]*\]/gi, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()}`
}

/**
 * Recorte a límite de longitud por borde de palabra (los caps de KIE por
 * modelo). Verbatim de KieService:563-569 (incluye el warn).
 */
/**
 * Corta preferentemente en FIN DE FRASE (2026-07-25): `capAtWordBoundary` corta
 * en palabra y dejaba clauses colgando a media idea — el usuario vio el ancla de
 * Seedream terminando en "…which looks slimmer than she". Si no hay un punto
 * razonablemente cerca del tope, cae al corte por palabra de siempre.
 */
export function capAtSentenceBoundary(
    text: string,
    promptCap: number,
    model: string,
): string {
    if (text.length <= promptCap) return text
    // 1) ¿La frase termina JUSTO después del tope? Completarla cuesta ≤80 chars
    //    y evita dejar la idea colgando ("…looks slimmer than she"). Es el caso
    //    real del ancla de Seedream, donde el clause es una frase larga.
    const ahead = text.indexOf('. ', promptCap)
    if (ahead !== -1 && ahead - promptCap <= 80) {
        return text.slice(0, ahead + 1)
    }
    // 2) Si no, cerrar en la última frase completa (si no queda demasiado corto).
    const slice = text.slice(0, promptCap)
    const lastDot = slice.lastIndexOf('. ')
    if (lastDot > promptCap * 0.6) {
        const capped = slice.slice(0, lastDot + 1)
        console.warn(
            `[KIE] Prompt capped ${text.length}→${capped.length} for ${model} (sentence)`,
        )
        return capped
    }
    // 3) Último recurso: corte por palabra de siempre.
    return capAtWordBoundary(text, promptCap, model)
}

export function capAtWordBoundary(
    text: string,
    promptCap: number,
    model: string,
): string {
    if (text.length <= promptCap) return text
    let capped = text.slice(0, promptCap)
    const lastSpace = capped.lastIndexOf(' ')
    if (lastSpace > promptCap * 0.85) capped = capped.slice(0, lastSpace)
    console.warn(
        `[KIE] Prompt capped ${text.length}→${capped.length} for ${model}`,
    )
    return capped
}

/**
 * Aspect ratio del Studio → el enum `image_size` que algunos modelos quieren.
 * Verbatim de KieService:572-585 (asImageSize).
 */
export function aspectToImageSize(aspectRatio: string): string {
    switch (aspectRatio) {
        case '16:9':
            return 'landscape_16_9'
        case '9:16':
            return 'portrait_16_9'
        case '4:3':
            return 'landscape_4_3'
        case '3:4':
            return 'portrait_4_3'
        default:
            return 'square_hd'
    }
}

/**
 * Override de pelo compartido por las anclas i2i (seedream/wan): recolorea
 * aunque el ref o la escena sugieran otro tono. Verbatim de KieService:468-470.
 */
export function hairClause(hairEmphasis?: string): string {
    // AUTORITATIVO: los prompts de escena repiten el color de pelo varias veces
    // (hair.color + description + must_keep) → una mención suave perdía por
    // volumen (Wan/Qwen salían rubios cuando el avatar no lo es). Se declara
    // MANDATORIO y que ANULA cualquier otro color, negando explícitamente los
    // colores que la escena pueda pedir.
    // 2026-07-26: la frase hablaba SOLO de "colour" (tres veces) y enumeraba
    // colores. El emphasis trae ademas LARGO y TEXTURA ("very long waist-length
    // straight black hair"), pero al ir envueltos en una orden declarada de
    // color viajaban de polizon: el modelo honraba el color y descartaba el
    // resto (reporte: se pidio pelo hasta la cintura y salio a media espalda).
    // Ahora la orden reclama la descripcion ENTERA y niega los tres ejes.
    return hairEmphasis
        ? ` Her hair is MANDATORY and must match this description EXACTLY: ${hairEmphasis} — its LENGTH, its texture and its colour, all three. This OVERRIDES anything else in this prompt about her hair: ignore any "blonde", "brunette", "red", "black", any "short"/"long"/"bob", and any "straight"/"wavy"/"curly" stated in the scene description. If the reference photo or the scene shows different hair, change it to match this exactly — including growing or shortening it to the stated length.`
        : ''
}

/** Variante compacta del override de pelo para Qwen (cap 800 chars). */
export function hairClauseCompact(hairEmphasis?: string): string {
    return hairEmphasis
        ? ` Her hair MUST be ${hairEmphasis} — that exact LENGTH, texture and colour; ignore any other hair stated in the scene.`
        : ''
}

/**
 * Cuerpo COMPLETO e intacto — anti-mutilación para los anclas i2i (2026-07-23,
 * los cuerpos XXL empujan al modelo a recortar extremidades). Compacta: va en
 * el tail del ancla de seedream/wan/flux2 (Qwen recibe el negative nativo).
 */
export const INTACT_BODY_CLAUSE =
    ' Her body is COMPLETE and intact — both arms, both legs, hands and feet fully rendered; never amputated, truncated or cropped limbs.'

/**
 * Variante CONSCIENTE DEL ENCUADRE del anti-mutilacion. Nacio en la ruta de
 * clone de Qwen y se eleva aqui (2026-07-26) porque hacia falta en TODAS las
 * rutas al editar.
 *
 * El clause de arriba exige "hands and feet fully rendered": eso no describe,
 * ORDENA — para cumplirlo el motor tiene que alejar la camara hasta que quepan
 * los pies. Al generar da igual (el encuadre lo decide el prompt), pero al
 * EDITAR una foto recortada obliga a un zoom out y se pierde el encuadre
 * original (reporte: "hacen zoom out, se ve el cuerpo completo en lugar del
 * encuadre de la imagen"). Esta version ataca el modo de fallo REAL —esconder o
 * cortar un miembro— sin tocar el encuadre.
 */
export const INTACT_BODY_IN_FRAME_CLAUSE =
    ' Every limb the pose shows must be anatomically COMPLETE — both arms with both hands, and legs with feet wherever the framing includes them; never sever, amputate, truncate or tuck a limb out of sight behind her body.'

/**
 * Ancla de EDICION. Sustituye al ancla de generacion (que presenta la imagen
 * como "referencia de cara", re-especifica el cuerpo y exige cuerpo entero):
 * al editar, la imagen ES la foto y todo eso reencuadra o redibuja lo que
 * deberia quedarse quieto.
 */
export const EDIT_ANCHOR_CLAUSE =
    'This image IS the photo to edit: keep the SAME person, pose, body position, framing, crop, camera distance, lighting and background exactly as they are.' +
    INTACT_BODY_IN_FRAME_CLAUSE +
    ' Apply ONLY this change:'

/**
 * Override de ojos con guard anti-saturación (los editores single-image
 * qwen/grok NO lo envían). Verbatim de KieService:475-477.
 */
export function eyeClause(eyeEmphasis?: string): string {
    // 2026-07-26: llevaba "NOT oversaturated, NOT glowing, no contact-lens
    // look" en el POSITIVO. La difusión no procesa negaciones ahi — solo ve
    // "oversaturated", "glowing", "contact-lens", o sea que invocaba justo el
    // artefacto que pretendia evitar (reporte: ojos verdes fosforescentes en
    // Qwen). Misma leccion que mannequin/doll, el rosa del pezon y freckles.
    // El positivo describe lo que SI queremos; las prohibiciones viven en
    // EYE_NEGATIVE_TERMS, que va por el canal de negative_prompt.
    return eyeEmphasis
        ? ` Her eyes are ${eyeEmphasis} — natural realistic iris with subtle colour variation and soft catchlights, the tone muted and true to life.`
        : ''
}

/**
 * Artefactos de PIEL que nunca se quieren: manchas, sarpullidos, moteado por
 * el cuerpo. Van al NEGATIVE.
 *
 * OJO con lo que NO esta aqui: no se prohiben "freckles" ni "moles". Si el
 * avatar los tiene de verdad, vienen en su foto de referencia y prohibirlos
 * los borraria. Solo se niegan los artefactos que no son de nadie.
 */
export const SKIN_ARTIFACT_NEGATIVE_TERMS =
    'blotchy skin, skin rash, red blotches on body, spots all over the body, skin blemishes, mottled skin, acne, ' +
    // FUGA DE PECAS (2026-07-26, segundo reporte): la fuente ya no es nuestro
    // codigo sino el `face_description` del avatar, que el Auto-Analyze escribe
    // con "prominent freckles" o "freckles on nose/cheeks". Es correcto —las
    // tienen de verdad— pero el modelo ignora el ambito anatomico y las
    // reparte al escote y los hombros.
    //
    // Por eso NO se prohiben las pecas: se prohibe su UBICACION equivocada.
    // Prohibirlas a secas borraria las de la cara, que si son de la persona.
    'freckles on chest, freckles on décolletage, freckles on shoulders, freckles on body, spots on chest, speckled chest'

/** Prohibiciones del ojo — van al NEGATIVE, nunca al positivo. */
export const EYE_NEGATIVE_TERMS =
    'glowing eyes, neon eyes, oversaturated iris, radioactive eye colour, contact-lens look, unnatural eye colour'

/**
 * Fidelidad facial escalada por el slider de identidad. Verbatim de
 * KieService:481-488.
 */
export function faceFidelityClause(identityWeight?: number): string {
    // `>= 85` (no `> 85`): el DEFAULT del store es 85 (avatarStudioStore:408),
    // así que con `> 85` el caso más común caía en la cláusula DÉBIL ("no drift")
    // en vez de la fuerte ("match the reference face EXACTLY") → la cara del
    // avatar salía genérica en Seedream/Wan/Flux/Grok. El slider al máximo por
    // defecto DEBE disparar la fidelidad máxima.
    return identityWeight === undefined
        ? ''
        : identityWeight >= 85
          ? ' FACE FIDELITY: match the reference face EXACTLY — same bone structure, nose, eye shape and spacing, lips, jawline, ; do NOT beautify or genericize it.'
          : identityWeight > 50
            ? ' Keep her face strongly consistent with the reference — no drift.'
            : ''
}

/**
 * Aplana un bloque JSON embebido en el prompt a PROSA "clave: valor".
 *
 * Herramientas externas de prompting entregan el prompt como un objeto JSON
 * ({"subject": {...}, "apparel": {...}}). Seedream lo lee bien, pero Wan lo
 * ignora (llaves/comillas lo descarrilan → salida genérica) y en Qwen el cap
 * de 800 chars lo DECAPITA a mitad de sintaxis: sobrevive solo el envoltorio
 * ("prompt_configuration", "strict_mode") y CERO escena (reporte 2026-07-22:
 * ambos sacaban retratos genéricos con el JSON completo en el prompt). Además
 * cada llave/comilla es presupuesto quemado. Solo wan/qwen lo usan — la ruta
 * seedream NO (su comportamiento con JSON está verificado bueno; no tocar).
 *
 * Busca el PRIMER bloque {...} balanceado (respetando strings), lo parsea y
 * reemplaza in-place por prosa: hojas string/number como "clave: valor" en
 * orden del documento (booleans = config, se omiten). Si no parsea, devuelve
 * el prompt intacto.
 */
export function flattenJsonPromptToProse(prompt: string): string {
    const start = prompt.indexOf('{')
    if (start === -1) return prompt
    let depth = 0
    let end = -1
    let inStr = false
    for (let i = start; i < prompt.length; i++) {
        const c = prompt[i]
        if (inStr) {
            if (c === '\\') i++
            else if (c === '"') inStr = false
            continue
        }
        if (c === '"') inStr = true
        else if (c === '{') depth++
        else if (c === '}') {
            depth--
            if (depth === 0) {
                end = i
                break
            }
        }
    }
    if (end === -1) return prompt
    let parsed: unknown
    try {
        parsed = JSON.parse(prompt.slice(start, end + 1))
    } catch {
        return prompt
    }
    if (typeof parsed !== 'object' || parsed === null) return prompt
    const parts: string[] = []
    const walk = (node: unknown, key?: string) => {
        if (node === null || node === undefined || typeof node === 'boolean')
            return
        if (typeof node === 'string' || typeof node === 'number') {
            const text = String(node).trim()
            if (!text) return
            const label = key ? key.replace(/[_-]+/g, ' ').trim() : ''
            parts.push(label ? `${label}: ${text}` : text)
            return
        }
        if (Array.isArray(node)) {
            for (const v of node) walk(v, key)
            return
        }
        for (const [k, v] of Object.entries(node)) walk(v, k)
    }
    walk(parsed)
    if (parts.length === 0) return prompt
    return `${prompt.slice(0, start)}${parts.join('. ')}${prompt.slice(end + 1)}`
        .replace(/\s{2,}/g, ' ')
        .trim()
}

/**
 * VACÍO DE VESTUARIO (bug verificado live 2026-07-24 en Seedream+Wan+Qwen a la
 * vez): con un prompt que solo describe POSE, los 3 motores devolvían el
 * VESTUARIO Y FONDO de la plantilla del Body Lab (sujetador y braguita beige
 * sobre fondo liso — bodySheetPrompt L166). El spec del cuerpo llenaba el hueco:
 * por IMAGEN en los que reciben el sheet (seedream/wan/flux2) y por TEXTO en
 * Qwen (las curvas + "only when uncovered"). El guard viejo ("la ropa viene
 * SOLO del texto") no bastaba: si el texto NO nombra ropa, no hay nada que gane.
 * Este cierra el hueco dando el FALLBACK explícito: inventar acorde al mood.
 */
export const BODY_SPEC_NOT_WARDROBE_CLAUSE =
    ' The body spec is PROPORTIONS only, never wardrobe or setting: do NOT default to plain underwear, a neutral two-piece or an empty studio backdrop. If the text names no outfit or location, invent ones that suit its mood, and give every garment a DEFINITE colour that reads clearly against her skin — never a nude, beige or skin-tone garment unless the text explicitly names that colour.'

/**
 * Guard-hardening (2026-07-24): cuando el prompt NO nombra NINGUNA prenda
 * (prompt reusado/tipeado sin outfit), un motor LITERAL como Qwen rellena el
 * vacío con nude/beige — el guard blando de arriba ("invent an outfit") no
 * basta. Esto INYECTA un outfit concreto con color. Devuelve '' si el prompt ya
 * nombra ropa o si hay intención NSFW (ahí NO se viste). En clone/deepfake el
 * outfit viene de la IMAGEN, así que el dispatcher NO lo llama.
 */
const GARMENT_WORDS =
    /\b(dress|gown|skirt|shirt|blouse|top|tee|t-shirt|sweater|cardigan|hoodie|jacket|coat|blazer|suit|trousers?|pants?|jeans?|shorts?|leggings?|bodysuit|swimsuit|bikini|lingerie|bra|bralette|corset|jumpsuit|romper|overalls?|uniform|robe|kimono|activewear|leotard|tank|crop|turtleneck|halter|camisole|slip|nightgown|pyjamas?|pajamas?|underwear|panties|briefs|thong|outfit|wearing|dressed|clad|garment|clothes|clothing|attire|costume|wardrobe|denim|leather|lace)\b/i
export const hasNudityIntent = (prompt?: string) =>
    !!prompt && NUDITY_WORDS.test(prompt)
const NUDITY_WORDS =
    /\b(nude|naked|topless|bottomless|bare[- ]?(chest|breast|body|skin)|undressed|explicit|nsfw|see[- ]?through|sheer)\b/i
// 12 outfits DIVERSOS (2026-07-25): con 5 y `length % 5` el reparto se
// agrupaba brutal y el primero (verde + jeans) salía una y otra vez — el
// usuario lo reportó como "contamina las generaciones con jeans y playera
// verde". Más opciones + hash por CONTENIDO (no por longitud) = variedad real.
const FALLBACK_OUTFITS = [
    'a burgundy wrap blouse and tailored charcoal trousers',
    'a scarlet-red fitted midi dress',
    'a black ribbed turtleneck and a mustard-yellow midi skirt',
    'a cobalt-blue knit top and black straight-leg jeans',
    'a cream-free ivory-free deep-teal jumpsuit',
    'a soft lilac blouse and dark plum wide-leg trousers',
    'a rust-orange cardigan over a white tee with indigo denim',
    'a forest-green silk shirt tucked into camel-free black tailored pants',
    'a navy-blue slip dress with thin straps',
    'an oversized grey wool coat over a black polo neck',
    'a coral pink sundress with a cinched waist',
    'a chocolate-brown leather jacket over a white ribbed tank and dark denim',
]

/** Hash estable por CONTENIDO: el mismo prompt siempre elige el mismo outfit
 *  (reproducible), pero prompts distintos se reparten de verdad. */
function outfitHash(s: string): number {
    let h = 0
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100000
    return h
}
export function concreteOutfitClause(prompt: string): string {
    if (!prompt || NUDITY_WORDS.test(prompt) || GARMENT_WORDS.test(prompt))
        return ''
    const pick =
        FALLBACK_OUTFITS[outfitHash(prompt) % FALLBACK_OUTFITS.length]
    return ` No outfit is described — dress her in ${pick}, or something similar that suits the scene, in clearly defined colours; never a nude, beige or skin-tone garment.`
}
