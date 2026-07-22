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
    base64: string
    mimeType: string
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
                      ? `Image ${n} = the CLONE source: recreate its EXACT pose, body position, outfit, hands, objects held, framing, camera angle, lighting and setting. Its person is a FACELESS MANNEQUIN — the face comes ONLY from image 1. Keep her FULLY dressed as shown; do NOT remove or reduce clothing. REMOVE overlaid stickers/watermarks/emojis — output a clean photo.`
                      : cloneWeight >= 50
                        ? `Image ${n} = a STRONG reference: follow its outfit, pose, framing and setting closely but allow natural variation (it need not be pixel-identical). Its person is a FACELESS MANNEQUIN — the face comes ONLY from image 1. Keep her fully dressed. REMOVE overlaid stickers/watermarks/emojis.`
                        : cloneWeight >= 25
                          ? `Image ${n} = a MODERATE reference: keep its overall outfit STYLE, general pose and setting, but freely reinterpret the exact details, framing and composition — a clear variation, NOT a copy. Its person is a FACELESS MANNEQUIN — the face comes ONLY from image 1. Keep her dressed.`
                          : `Image ${n} = a LOOSE style/mood reference: take only the general vibe, outfit style and setting cues — freely reinterpret the pose, framing and details. Its person is a FACELESS MANNEQUIN — the face comes ONLY from image 1.`
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
    return hairEmphasis
        ? ` Her hair colour is MANDATORY: ${hairEmphasis}. This OVERRIDES any other hair colour anywhere in this prompt — ignore any "blonde", "brunette", "red", "black" etc. stated in the scene description; if the reference photo or the scene suggests a different colour, RECOLOR her hair to exactly this.`
        : ''
}

/**
 * Override de ojos con guard anti-saturación (los editores single-image
 * qwen/grok NO lo envían). Verbatim de KieService:475-477.
 */
export function eyeClause(eyeEmphasis?: string): string {
    return eyeEmphasis
        ? ` Her eyes are ${eyeEmphasis} — natural realistic iris with subtle color variation, NOT oversaturated, NOT glowing, no contact-lens look.`
        : ''
}

/**
 * Fidelidad facial escalada por el slider de identidad. Verbatim de
 * KieService:481-488.
 */
export function faceFidelityClause(identityWeight?: number): string {
    return identityWeight === undefined
        ? ''
        : identityWeight > 85
          ? ' FACE FIDELITY: match the reference face EXACTLY — same bone structure, nose, eye shape and spacing, lips, jawline, freckles/moles; do NOT beautify or genericize it.'
          : identityWeight > 50
            ? ' Keep her face strongly consistent with the reference — no drift.'
            : ''
}
