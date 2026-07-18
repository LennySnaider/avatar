import type { PhysicalMeasurements, CurveLevel } from '@/@types/supabase'

/**
 * Translate raw body measurements into professional fashion/modeling
 * descriptors that image models actually follow (they largely ignore raw cm
 * numbers). Computed per-avatar from its OWN measurements — nothing hardcoded.
 *
 * Ported from GeminiService so every provider (KIE, Gateway, Flux, …) gets the
 * same body guidance, not just the direct Gemini path. Uses safe terminology
 * that won't trip content filters.
 */
export function getBodyDescriptors(m: PhysicalMeasurements): string {
    if (!m.waist) return ''
    const descriptors: string[] = []
    const hipWaistRatio = m.hips / m.waist
    const bustWaistRatio = m.bust / m.waist

    // Upper torso proportions
    if (m.bust >= 100) {
        descriptors.push('fuller upper silhouette', 'generous torso proportions')
    } else if (m.bust >= 90) {
        descriptors.push('balanced upper proportions', 'well-defined torso')
    } else if (m.bust <= 80) {
        descriptors.push('slender upper frame', 'petite torso')
    }

    // Midsection definition
    if (m.waist <= 60) {
        descriptors.push('very defined waistline', 'narrow midsection', 'cinched waist')
    } else if (m.waist <= 68) {
        descriptors.push('defined waist', 'tapered midsection')
    } else if (m.waist >= 80) {
        descriptors.push('straight waistline', 'less defined midsection')
    }

    // Lower body proportions
    if (m.hips >= 100) {
        descriptors.push('wide lower frame', 'generous hip width', 'full lower silhouette')
    } else if (m.hips >= 92) {
        descriptors.push('proportionate hips', 'balanced lower body')
    } else if (m.hips <= 85) {
        descriptors.push('narrow hip width', 'slim lower frame')
    }

    // Overall figure type (derived from ratios)
    if (hipWaistRatio >= 1.5 && bustWaistRatio >= 1.45) {
        descriptors.push('classic hourglass silhouette', 'defined waist-to-hip ratio')
    } else if (hipWaistRatio >= 1.35 || bustWaistRatio >= 1.35) {
        descriptors.push('hourglass body type', 'proportionate figure')
    } else if (hipWaistRatio <= 1.15 && bustWaistRatio <= 1.15) {
        descriptors.push('athletic body type', 'rectangular silhouette', 'straight figure')
    } else if (hipWaistRatio > bustWaistRatio + 0.15) {
        descriptors.push('pear body type', 'hip-emphasized proportions')
    } else if (bustWaistRatio > hipWaistRatio + 0.15) {
        descriptors.push('inverted triangle body type', 'shoulder-emphasized proportions')
    }

    // Body-mass anchor — fights the diffusion-model default of rendering a tiny
    // waist as an underweight fashion body. Only added when the specs imply a
    // fuller figure (full bust OR full hips OR a curvy/plus body type); slim /
    // petite / athletic avatars are intentionally left lean.
    const wantsFuller =
        m.bust >= 90 || m.hips >= 90 ||
        (m.bodyType && ['curvy', 'hourglass', 'plus-size'].includes(m.bodyType))
    if (wantsFuller) {
        descriptors.push('healthy natural body weight', 'soft feminine curves with natural body fat', 'NOT skinny or underweight')
    }

    // Leg shape (explicit selector wins; otherwise nothing is added here).
    const legs = getLegDescriptor(m.legType)
    if (legs) descriptors.push(legs)

    return descriptors.join(', ')
}

// Explicit leg-shape selector → prompt-ready phrase. Optional; when unset the
// legs simply follow the overall body type / hip descriptors.
const LEG_TYPE_PHRASE: Record<string, string> = {
    slim: 'slim slender legs',
    toned: 'toned smooth legs with soft definition',
    athletic: 'athletic muscular legs with defined calves',
    // Músculo centrado en MUSLOS (athletic marca pantorrillas). Calibrado a
    // ESTÉTICO tras reporte del usuario: la 1ª versión ("powerful gym-built
    // legs, strong quadriceps/hamstrings") producía piernas de culturista con
    // venas Y dominaba tanto el prompt que la pose se ignoraba. "Trabajadas
    // pero no súper fuertes" + guard anti-vascularidad.
    'muscular-thighs':
        'sculpted toned thighs with soft visible muscle definition, athletic yet feminine legs — natural smooth skin, NOT extreme bodybuilder muscle, no visible veins',
    long: 'long elongated legs',
    curvy: 'curvy shapely legs with full thighs',
    thick: 'thick full thighs with substantial leg volume, thighs touching (no thigh gap)',
}

export function getLegDescriptor(legType?: string): string {
    if (!legType) return ''
    return LEG_TYPE_PHRASE[legType] || legType.replace(/-/g, ' ') + ' legs'
}

// ── Curvas con nivel 1-5 (busto / glúteos / muslos) ─────────────────────────
// Control granular pedido por el usuario. SOLO viajan a modelos con trait
// `permissive` (gating en AvatarStudioMain): se inyectan vía bodyEmphasis en
// los anclas i2i de Seedream/Wan/FLUX.2 — NUNCA en el [BODY:] genérico que ven
// Gemini/nano/MiniMax. Nivel undefined/0 = Auto (no se inyecta nada).
export const BUST_LEVEL_PHRASE: Record<number, string> = {
    1: 'small perky bust',
    2: 'modest natural bust',
    3: 'full rounded bust',
    4: 'large heavy full bust, deep cleavage',
    5: 'very large voluptuous heavy bust, dramatic deep cleavage',
}

export const GLUTES_LEVEL_PHRASE: Record<number, string> = {
    1: 'subtle toned glutes',
    2: 'rounded firm glutes',
    3: 'full round lifted glutes',
    4: 'large prominent round glutes, deep hip curve',
    5: 'very large prominent bubble butt, dramatic glute projection',
}

export const THIGHS_LEVEL_PHRASE: Record<number, string> = {
    1: 'slim light thighs',
    2: 'toned smooth thighs with soft definition',
    3: 'sculpted toned thighs, visible but soft muscle tone, athletic yet feminine',
    4: 'full thick strong thighs, soft natural definition, thighs almost touching',
    5: 'very thick heavy thighs with substantial volume, thighs touching (no thigh gap)',
}

// FORMA (ortogonal al tamaño). Glúteos: taxonomía por silueta del usuario;
// mama: tipos por criterio médico. Se componen con el nivel en
// buildCurvesEmphasis y comparten su gating permisivo.
export const GLUTES_SHAPE_PHRASE: Record<string, string> = {
    square: 'square-shaped glutes — straight vertical line from waist to glutes with little side curve',
    'v-shape': 'V-shaped glutes — fuller at the top narrowing downward, slim hips with little lower fullness',
    'a-shape': 'A-shaped pear glutes — narrow at the top and widest at the bottom, volume concentrated low on the glutes and hips',
    round: 'perfectly round glutes — full and balanced in every direction, symmetric youthful shape',
    heart: 'heart-shaped glutes — voluminous curvy lower part tapering up to a narrow waist, upside-down-heart silhouette with wide hips',
}

export const BUST_SHAPE_PHRASE: Record<string, string> = {
    round: 'perfectly round breasts — even fullness in every direction with centered nipples, youthful round shape',
    athletic: 'athletic breasts — round firm base with a toned muscular look and less tissue volume',
    conical: 'conical breasts — rounded base tapering toward the nipple in a cone shape',
    teardrop: 'teardrop pear-shaped breasts — slimmer flatter upper pole with fuller lower quadrants, natural sloped profile',
    tuberous: 'tubular breasts — narrow constricted base, wide spacing between the breasts, prominent areolas',
}

// Listas para los chips de la UI (orden de despliegue)
export const GLUTES_SHAPES = ['square', 'v-shape', 'a-shape', 'round', 'heart'] as const
export const BUST_SHAPES = ['round', 'athletic', 'conical', 'teardrop', 'tuberous'] as const

/**
 * COHERENCIA ANATÓMICA glúteos→muslos: busto y glúteos pueden ir
 * desproporcionados (cirugía), pero glúteos llenos sobre piernas delgadas no
 * existen — comparten estructura. Piso automático: muslos efectivos =
 * max(elegidos, glúteos − 1). La MISMA regla la usan el prompt-builder y la
 * UI (hint bajo el slider de Thighs) — no duplicar la fórmula.
 */
export function effectiveThighsLevel(
    m: PhysicalMeasurements,
): number | undefined {
    const floor =
        m.glutesLevel && m.glutesLevel >= 2 ? m.glutesLevel - 1 : undefined
    if (!floor) return m.thighsLevel
    if (!m.thighsLevel || m.thighsLevel < floor) return floor
    return m.thighsLevel
}

/**
 * Frase combinada de los sliders de curvas (1-5). Vacía si todo está en Auto.
 * El caller decide si el provider la merece (trait permissive).
 */
export function buildCurvesEmphasis(m: PhysicalMeasurements): string {
    const parts: string[] = []
    if (m.bustLevel && BUST_LEVEL_PHRASE[m.bustLevel]) {
        parts.push(BUST_LEVEL_PHRASE[m.bustLevel])
    }
    if (m.bustShape && BUST_SHAPE_PHRASE[m.bustShape]) {
        parts.push(BUST_SHAPE_PHRASE[m.bustShape])
    }
    if (m.glutesLevel && GLUTES_LEVEL_PHRASE[m.glutesLevel]) {
        parts.push(GLUTES_LEVEL_PHRASE[m.glutesLevel])
    }
    if (m.glutesShape && GLUTES_SHAPE_PHRASE[m.glutesShape]) {
        parts.push(GLUTES_SHAPE_PHRASE[m.glutesShape])
    }
    const thighs = effectiveThighsLevel(m)
    if (thighs && THIGHS_LEVEL_PHRASE[thighs]) {
        parts.push(THIGHS_LEVEL_PHRASE[thighs])
    }
    // Puente de continuidad: con glúteos llenos, la curva glúteo→muslo debe
    // ser UNA sola — evita el mismatch "butt grande sobre piernas flacas"
    // aunque el legType diga slim.
    if (m.glutesLevel && m.glutesLevel >= 4) {
        parts.push(
            'her full glutes flow into proportionally full thighs in one continuous natural curve — never slim or skinny legs under full glutes',
        )
    }
    return parts.join(', ')
}

// ── Mapeo nivel 1-5 ↔ cm (control UNIFICADO por zona) ───────────────────────
// El slider 1-5 MANDA: al moverlo escribe el cm mapeado en measurements
// (bust/hips); escribir cm manual deriva el nivel más cercano. Una sola
// fuente por zona — sin controles duplicados.
export const BUST_LEVEL_TO_CM: Record<number, number> = {
    1: 75,
    2: 82,
    3: 90,
    4: 100,
    5: 110,
}

export const GLUTES_LEVEL_TO_CM: Record<number, number> = {
    1: 82,
    2: 90,
    3: 97,
    4: 106,
    5: 116,
}

const nearestLevel = (map: Record<number, number>, cm: number): CurveLevel => {
    let best = 1
    let bestDiff = Infinity
    for (const [lvl, v] of Object.entries(map)) {
        const d = Math.abs(v - cm)
        if (d < bestDiff) {
            bestDiff = d
            best = Number(lvl)
        }
    }
    return best as CurveLevel
}

export const cmToBustLevel = (cm: number): CurveLevel =>
    nearestLevel(BUST_LEVEL_TO_CM, cm)
export const cmToGlutesLevel = (cm: number): CurveLevel =>
    nearestLevel(GLUTES_LEVEL_TO_CM, cm)

// Tooltips para los selectores de UI (creator + edit drawer): la frase EXACTA
// que se inyecta al prompt, para que el usuario sepa qué pide cada opción.
// Body Type combina la frase líder (BODY_TYPE_PHRASE) + la línea de
// proporciones de BODY_TYPE_DESCRIPTIONS (avatarPromptBuilder) — mantener en
// sync si esos mapas cambian.
export const BODY_TYPE_TOOLTIP: Record<string, string> = {
    petite: 'petite delicate frame — small-boned, compact proportions',
    slim: 'slim slender figure — lean, elongated proportions',
    athletic: 'athletic toned physique — muscular definition, sporty build',
    average: 'average balanced figure — proportionate, natural build',
    curvy: 'curvy voluptuous figure — fuller proportions with defined curves',
    hourglass:
        'classic hourglass figure, pin-up proportions — narrow waist with fuller bust and hips',
    'plus-size': 'plus-size full figure — generous proportions throughout',
}

export const LEG_TYPE_TOOLTIP: Record<string, string> = {
    auto: 'no explicit phrase — legs follow the Body Type and hip descriptors',
    ...LEG_TYPE_PHRASE,
}

// Lead phrase for the explicit body-type selector, so a user's choice is
// honored even when the computed ratios land in a different bucket.
const BODY_TYPE_PHRASE: Record<string, string> = {
    petite: 'petite delicate frame',
    slim: 'slim slender figure',
    athletic: 'athletic toned physique',
    average: 'average balanced figure',
    curvy: 'curvy voluptuous figure',
    hourglass: 'classic hourglass figure',
    'plus-size': 'plus-size full figure',
}

/**
 * Build a single descriptive body phrase from an avatar's measurements:
 * explicit body type (leads) + ratio-derived descriptors. Per-avatar; changing
 * the avatar's specs changes the output.
 */
export function describeBody(m: PhysicalMeasurements): string {
    const parts: string[] = []
    if (m.bodyType && BODY_TYPE_PHRASE[m.bodyType]) {
        parts.push(BODY_TYPE_PHRASE[m.bodyType])
    }
    const derived = getBodyDescriptors(m)
    if (derived) parts.push(derived)
    return parts.join(', ')
}

/**
 * Translate a 1–9 skin-tone value into prompt-ready complexion text.
 * Shared by both prompt builders (direct-Gemini and KIE) so they stay in sync.
 */
export function getSkinToneDescription(skinTone?: number): string {
    if (!skinTone) return ''
    const descriptions: Record<number, string> = {
        1: 'very fair porcelain skin, pale ivory complexion',
        2: 'fair skin, light complexion with pink undertones',
        3: 'light skin, cream colored complexion',
        4: 'light-medium skin, warm beige complexion',
        5: 'medium skin, golden warm complexion',
        6: 'medium-tan skin, warm olive complexion',
        7: 'tan skin, caramel brown complexion',
        8: 'dark skin, rich brown complexion',
        9: 'very dark skin, deep ebony complexion',
    }
    return descriptions[skinTone] || ''
}

/**
 * Translate a hair-color value into prompt-ready text. Handles the 13 natural
 * colors, the fashion colors, and any free-text custom color via the
 * `"<name> hair"` fallback. Shared by both prompt builders so they stay in sync.
 */
export function getHairColorDescription(hairColor?: string): string {
    if (!hairColor) return ''
    const descriptions: Record<string, string> = {
        'black': 'jet black hair, dark raven colored hair',
        'dark-brown': 'dark brown hair, deep brunette hair',
        'brown': 'brown hair, medium brunette hair',
        'light-brown': 'light brown hair, chestnut colored hair',
        'dark-blonde': 'dark blonde hair, dirty blonde hair, honey colored hair',
        'blonde': 'blonde hair, golden blonde hair',
        'platinum-blonde': 'platinum blonde hair, very light blonde, almost white hair',
        'red': 'red hair, deep red colored hair',
        'auburn': 'auburn hair, reddish brown hair',
        'ginger': 'ginger hair, bright orange-red hair, copper colored hair',
        'gray': 'gray hair, salt and pepper hair',
        'silver': 'silver hair, metallic gray hair',
        'white': 'white hair, snow white hair',
        // Fashion colors
        'purple': 'vibrant purple hair, violet dyed hair',
        'pink': 'pink hair, rose pink dyed hair',
        'blue': 'blue hair, electric blue dyed hair',
        'green': 'green hair, emerald green dyed hair',
        'teal': 'teal hair, blue-green dyed hair',
        'lavender': 'lavender hair, pastel purple dyed hair',
        'rose-gold': 'rose gold hair, pinkish blonde dyed hair',
        'burgundy': 'burgundy hair, deep wine red dyed hair',
    }
    // Free-text custom colors fall through to a "<name> hair" description.
    return descriptions[hairColor] || hairColor.replace(/-/g, ' ') + ' hair'
}

/**
 * Translate an eye-color value into prompt-ready text. Handles natural colors,
 * fashion/colored-contact values, and any free-text color via the `"<name> eyes"`
 * fallback. Shared by both prompt builders so they stay in sync.
 */
export function getEyeColorDescription(eyeColor?: string): string {
    if (!eyeColor) return ''
    const descriptions: Record<string, string> = {
        'dark-brown': 'dark brown eyes',
        'brown': 'warm brown eyes',
        'amber': 'amber golden-brown eyes',
        'hazel': 'hazel eyes, green-brown blend',
        'green': 'green eyes',
        'blue': 'blue eyes',
        'light-blue': 'light ice-blue eyes',
        'gray': 'gray eyes',
        // Fashion / colored contacts
        'violet': 'violet colored contact-lens eyes',
        'aqua': 'aqua turquoise colored eyes',
        'red': 'red colored contact-lens eyes',
    }
    return descriptions[eyeColor] || eyeColor.replace(/-/g, ' ') + ' eyes'
}

const NATURAL_HAIR_COLORS = new Set([
    'black', 'dark-brown', 'brown', 'light-brown', 'dark-blonde', 'blonde',
    'platinum-blonde', 'red', 'auburn', 'ginger', 'gray', 'silver', 'white',
])

/**
 * True for fashion/unnatural or free-text hair colors (purple, pink, blue,
 * lavender, custom names…). Used so the generation prompt tints only the head
 * hair for these — eyebrows must stay a natural neutral tone, not dyed pink.
 */
export function isFashionHairColor(hairColor?: string): boolean {
    return !!hairColor && !NATURAL_HAIR_COLORS.has(hairColor)
}
