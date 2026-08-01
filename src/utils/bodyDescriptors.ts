import type { PhysicalMeasurements, CurveLevel } from '@/@types/supabase'
import { deriveShapeFromMeasurements } from '@/utils/bodyShapes'
import type { BodyShape } from '@/@types/supabase'

// Cláusula por forma — nombre + lenguaje COMPARATIVO (los modelos siguen ratios,
// no cm). Ortogonal al tamaño (eso es BUILD_PHRASE).
const SHAPE_CLAUSE: Record<BodyShape, string> = {
    hourglass:
        'hourglass silhouette — shoulders and hips balanced in width, with a sharply cinched waist noticeably narrower than both the bust and the hips',
    pear: 'pear (triangle) shape — hips clearly wider than the shoulders and bust, with a defined waist and fuller lower body',
    apple: 'apple (round) shape — fuller midsection and broad bust, with a less defined waist and comparatively slimmer hips',
    rectangle:
        'straight rectangular shape — shoulders, waist and hips of similar width with little waist definition',
    'inverted-triangle':
        'inverted-triangle shape — shoulders and bust clearly wider than the hips, athletic upper body tapering to narrower hips',
    spoon: 'spoon shape — hips dramatically wider than the shoulders with a pronounced hip shelf, and a defined waist',
    diamond:
        'diamond shape — fuller midsection with narrower shoulders and narrower hips',
}

// Complexión general (1-5). NO contradice la forma: describe grasa/volumen.
const BUILD_PHRASE: Record<number, string> = {
    1: 'lean slim frame with minimal body fat, toned and slender',
    2: 'fit toned body with low body fat',
    3: 'balanced healthy body with soft natural curves',
    4: 'full curvy figure with soft natural body fat',
    5: 'plus-size full figure with generous soft body fat throughout',
}

/**
 * Descripción de cuerpo por FORMA + BUILD (rediseño). Reemplaza el lead de
 * tamaño de describeBody que contradecía las medidas. La forma sale de `m.shape`
 * (elección del usuario) o se deriva de ratios; el build de `m.build` (1-5).
 */
export function describeShapeAndBuild(m: PhysicalMeasurements): string {
    const shape: BodyShape = m.shape ?? deriveShapeFromMeasurements(m)
    const parts: string[] = [SHAPE_CLAUSE[shape]]
    const build = m.build ?? 3
    if (BUILD_PHRASE[build]) parts.push(BUILD_PHRASE[build])
    // Comparativa de intensidad de cintura (refuerza la forma con el ratio real).
    if (m.waist && m.hips) {
        const whr = m.waist / m.hips
        if (whr <= 1 / 2.2)
            // XXL (ratio cadera/cintura >= 2.2): más allá de lo natural —
            // MISMO borde que isExaggeratedBody (un solo acantilado, alineado).
            parts.push(
                'EXTREME exaggerated wasp waist — dramatically, unnaturally cinched, far smaller than her hips (a deliberate exaggerated-hourglass look)',
            )
        // Buckets RECALIBRADOS (2026-07-25, prueba de playground con el spec
        // crudo): el borde viejo whr<=0.68 regalaba "extremely/dramatically" a
        // ratios moderados (Raven 60/90=0.667 → los motores literales pintaban
        // wasp+ancha). La intensidad del TEXTO debe corresponder al NÚMERO —
        // un prompt que se contradice jamás es consistente entre motores.
        else if (whr <= 0.55)
            // ratio >= ~1.8 (Emily 45/85=0.53): wasp dramática REAL.
            parts.push('extremely small, dramatically cinched waist')
        else if (whr <= 0.68)
            // ratio 1.47-1.8 (Raven 60/90): marcada, no dramática.
            parts.push(
                'sharply cinched waist, clearly narrower than bust and hips',
            )
        else if (whr <= 0.78) parts.push('clearly defined narrow waist')
    }
    // Torso/piernas.
    if (typeof m.torsoLegRatio === 'number' && m.torsoLegRatio >= 1) {
        parts.push('long legs, elongated lower body')
    } else if (typeof m.torsoLegRatio === 'number' && m.torsoLegRatio <= -1) {
        parts.push('shorter legs, longer torso')
    }
    return parts.join(', ')
}

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

    // Upper torso proportions.
    //
    // DILUCIÓN DEL RELLENO NEUTRO (2026-07-26, reporte "el busto de la hoja no
    // corresponde al del avatar"): estas bandas de cm y las frases de NIVEL
    // (buildCurvesEmphasis) describen la MISMA zona, y el nivel se deriva de
    // los cm — son dos codificaciones del mismo número con vocabularios de
    // intensidad distintos. En el prompt real de MiaUltra viajaban juntas
    // "balanced upper proportions, well-defined torso" (banda) y "full rounded
    // bust" (nivel 3): el difusor promedia y gana la palabra NEUTRA, porque
    // "balanced" es su render por defecto. El glúteo sobrevivía al mismo choque
    // solo porque su frase grita ("very large, dramatic"); el busto en nivel
    // medio no.
    //
    // Las bandas EXTREMAS sí se conservan: refuerzan al nivel en la misma
    // dirección (bust>=100 ↔ nivel 4+, bust<=80 ↔ nivel 1-2). Solo se calla la
    // banda MEDIA, que no aporta información de ningún cuerpo —describe "el
    // promedio"— y es la única que puede contradecir. Sin nivel explícito el
    // comportamiento es exactamente el de antes.
    if (m.bust >= 100) {
        descriptors.push(
            'fuller upper silhouette',
            'generous torso proportions',
        )
    } else if (m.bust >= 90) {
        if (!m.bustLevel) {
            descriptors.push('balanced upper proportions', 'well-defined torso')
        }
    } else if (m.bust <= 80) {
        descriptors.push('slender upper frame', 'petite torso')
    }

    // Midsection definition
    if (m.waist <= 50) {
        descriptors.push(
            'extreme wasp waist',
            'dramatically cinched tiny midsection',
            'waist far narrower than natural proportions',
        )
    } else if (m.waist <= 60) {
        descriptors.push(
            'very defined waistline',
            'narrow midsection',
            'cinched waist',
        )
    } else if (m.waist <= 68) {
        descriptors.push('defined waist', 'tapered midsection')
    } else if (m.waist >= 80) {
        descriptors.push('straight waistline', 'less defined midsection')
    }

    // Lower body proportions (umbral dramático = 130, el XXL de las tablas
    // de tallas reales; 100-129 = wide natural, sin salto).
    if (m.hips >= 130) {
        descriptors.push(
            'dramatically wide exaggerated hips far beyond natural proportions',
            'hips clearly wider than her shoulders',
            'massive lower silhouette',
        )
    } else if (m.hips >= 100) {
        descriptors.push(
            'wide lower frame',
            'generous hip width',
            'full lower silhouette',
        )
    } else if (m.hips >= 92) {
        // Mismo relleno neutro que arriba: "proportionate hips, balanced lower
        // body" viajaba pegado a "very large prominent bubble butt" del nivel 5.
        // Con glutesLevel explícito manda el nivel.
        if (!m.glutesLevel) {
            descriptors.push('proportionate hips', 'balanced lower body')
        }
    } else if (m.hips <= 85) {
        // COHERENCIA con el slider de glúteos (2026-07-25, reporte con
        // imagen): 'slim lower frame' contradecía frontalmente un glúteo
        // grande — el spec pedía a la vez "narrow hip width, slim lower frame"
        // y "very large prominent bubble butt", y el modelo tenía que elegir
        // (Seedream seguía los cm y el glúteo salía chico). Con glúteos altos
        // la cadera estrecha se expresa como ANCHURA FRONTAL, dejando el
        // volumen en la PROYECCIÓN hacia atrás: así ambas cosas son
        // anatómicamente compatibles y ninguna se pisa.
        if ((m.glutesLevel ?? 0) >= 4) {
            descriptors.push(
                'narrow hip width seen from the front, with the lower-body volume concentrated in the glutes projecting BACKWARD rather than sideways',
            )
        } else {
            descriptors.push('narrow hip width', 'slim lower frame')
        }
    }

    // Overall figure type (derived from ratios)
    if (hipWaistRatio >= 1.5 && bustWaistRatio >= 1.45) {
        descriptors.push(
            'classic hourglass silhouette',
            'defined waist-to-hip ratio',
        )
    } else if (hipWaistRatio >= 1.35 || bustWaistRatio >= 1.35) {
        descriptors.push('hourglass body type', 'proportionate figure')
    } else if (hipWaistRatio <= 1.15 && bustWaistRatio <= 1.15) {
        descriptors.push(
            'athletic body type',
            'rectangular silhouette',
            'straight figure',
        )
    } else if (hipWaistRatio > bustWaistRatio + 0.15) {
        descriptors.push('pear body type', 'hip-emphasized proportions')
    } else if (bustWaistRatio > hipWaistRatio + 0.15) {
        descriptors.push(
            'inverted triangle body type',
            'shoulder-emphasized proportions',
        )
    }

    // Ancla de MASA CORPORAL — pelea el default del difusor de renderizar una
    // cintura minima como un cuerpo de pasarela desnutrido.
    //
    // RECALIBRADA (2026-07-26, reporte "ya no hacen match las generaciones de
    // Body Lab"): el gate era `bust >= 90 || hips >= 95 || build >= 4`, pero
    // bust 90 es el nivel 3 —el CENTRO exacto de la escala (BUST_LEVEL_TO_CM[3]
    // = 90)— y hips 95 esta por DEBAJO del nivel 3 (97). Es decir disparaba en
    // cuerpos promedio, justo lo contrario de lo que dice su propio comentario.
    // Solo era inofensivo porque el relleno neutro de las bandas de cm lo
    // contrapesaba; al quitarlo quedo suelto y engordo la hoja entera.
    //
    // La masa GLOBAL debe seguir al control GLOBAL: `build` (que el usuario
    // dejo en 3 · balanced). Un busto o un gluteo grandes son rasgos LOCALES y
    // ya se expresan en sus propias frases — no implican un cuerpo pesado, y
    // tomarlos como tal es lo que contradecia una cintura de 45cm.
    const build = m.build ?? 3
    const localFullness =
        (m.bustLevel ?? 0) >= 4 || (m.glutesLevel ?? 0) >= 4 || m.hips >= 106
    if (build >= 4) {
        // El usuario PIDIO un cuerpo mas lleno: ancla completa.
        descriptors.push(
            'healthy natural body weight',
            'soft feminine curves with natural body fat',
        )
    } else if (localFullness) {
        // Curvas locales sobre un build balanceado: basta el guard minimo
        // anti-esqueletico, sin mandato de grasa corporal.
        descriptors.push('healthy natural body weight')
    }
    // "NOT skinny or underweight" SALE del positivo: la difusion no procesa
    // negaciones —regla propia del proyecto, aprendida con mannequin/doll— y
    // aqui solo aportaba las palabras "skinny"/"underweight". La prohibicion
    // vive en el negative de cada ruta.

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
    // HUECO DE LA ESCALA (2026-07-26): era 'full rounded bust' — el ÚNICO
    // peldaño sin palabra de TAMAÑO (los demás dicen small / modest / large /
    // very large / ENORMOUS). "rounded" es forma y "full" es ambiguo, así que
    // el nivel medio no anclaba nada y en cuerpos de cintura extrema el busto
    // se renderizaba pequeño: compite contra media docena de superlativos de
    // cintura y pierde por no tener con qué. Ahora lleva tamaño explícito,
    // calibrado ENTRE modest y large — sin negaciones ("not large" se pinta).
    3: 'medium-full rounded bust with clear natural projection',
    4: 'large heavy full bust, deep cleavage',
    5: 'very large voluptuous heavy bust, dramatic deep cleavage',
    // 6 = XXL (más allá de lo natural — pedido multitenant 2026-07-23).
    6: 'ENORMOUS exaggerated surgically-enhanced bust, dramatically oversized beyond natural proportions, extreme deep cleavage',
}

export const GLUTES_LEVEL_PHRASE: Record<number, string> = {
    1: 'subtle toned glutes',
    2: 'rounded firm glutes',
    3: 'full round lifted glutes',
    // Nivel 4 des-acoplado de la anchura (2026-07-25): "deep hip curve" leía
    // como caderas ANCHAS en motores literales — el glúteo es PROYECCIÓN hacia
    // atrás, la anchura la fijan los cm de cadera.
    4: 'prominent round glutes with strong backward projection',
    5: 'very large prominent bubble butt, dramatic glute projection',
    6: 'MASSIVE exaggerated BBL-style glutes and hips, dramatically oversized beyond natural anatomy — hips far wider than her shoulders, extreme shelf-like glute projection',
}

/**
 * Frase de nivel de glúteo COHERENTE con los cm (2026-07-31). El texto fijo
 * del nivel 6 afirmaba ANCHURA ("hips far wider than her shoulders") aunque
 * los cm dijeran lo contrario (reporte: glúteos 6 con hips 96 / shoulders 85
 * → el spec se contradecía y el difusor resolvía POR VISTA: espalda ancha,
 * frente angosto — vistas que no corresponden). El nivel 4 ya había aprendido
 * la lección ("el glúteo es PROYECCIÓN hacia atrás, la anchura la fijan los
 * cm"); el 6 la violaba. Con cadera realmente XXL (>=130, el mismo borde de
 * isExaggeratedBody/getBodyDescriptors) la anchura es verdad y se conserva el
 * texto original; con cadera moderada TODO el volumen se declara como
 * proyección trasera — que es exactamente lo que promete el hint de la UI.
 */
export function glutesLevelPhrase(m: PhysicalMeasurements): string {
    const lvl = m.glutesLevel
    if (!lvl || !GLUTES_LEVEL_PHRASE[lvl]) return ''
    if (lvl >= 6 && (m.hips ?? 0) < 130) {
        return 'MASSIVE exaggerated BBL-style glutes, dramatically oversized beyond natural anatomy — ALL of the volume projects straight BACKWARD as an extreme shelf-like curve, most dramatic in the side and back views, while her frontal hip width stays true to her measured hips'
    }
    return GLUTES_LEVEL_PHRASE[lvl]
}

export const THIGHS_LEVEL_PHRASE: Record<number, string> = {
    1: 'slim light thighs',
    2: 'toned smooth thighs with soft definition',
    3: 'sculpted toned thighs, visible but soft muscle tone, athletic yet feminine',
    4: 'full thick strong thighs, soft natural definition, thighs almost touching',
    5: 'very thick heavy thighs with substantial volume, thighs touching (no thigh gap)',
    6: 'MASSIVE exaggerated thighs, each thigh nearly as wide as her waist, pressed firmly together with dramatic outer-thigh curve',
}

// FORMA (ortogonal al tamaño). Glúteos: taxonomía por silueta del usuario;
// mama: tipos por criterio médico. Se componen con el nivel en
// buildCurvesEmphasis y comparten su gating permisivo.
export const GLUTES_SHAPE_PHRASE: Record<string, string> = {
    square: 'square-shaped glutes — straight vertical line from waist to glutes with little side curve',
    'v-shape':
        'V-shaped glutes — fuller at the top narrowing downward, slim hips with little lower fullness',
    'a-shape':
        'A-shaped pear glutes — narrow at the top and widest at the bottom, volume concentrated low on the glutes and hips',
    round: 'perfectly round glutes — full and balanced in every direction, symmetric youthful shape',
    heart: 'heart-shaped glutes — voluminous curvy lower part tapering up to a narrow waist, upside-down-heart silhouette with wide hips',
}

export const BUST_SHAPE_PHRASE: Record<string, string> = {
    round: 'perfectly round breasts — even fullness in every direction with centered nipples, youthful round shape',
    athletic:
        'athletic breasts — round firm base with a toned muscular look and less tissue volume',
    conical:
        'conical breasts — rounded base tapering toward the nipple in a cone shape',
    teardrop:
        'teardrop pear-shaped breasts — slimmer flatter upper pole with fuller lower quadrants, natural sloped profile',
    tuberous:
        'tubular breasts — narrow constricted base, wide spacing between the breasts, prominent areolas',
}

// ── Reglas de pezón POR AVATAR (consistencia NSFW) ─────────────────────────
// Cada modelo inventaba color/areola distintos entre generaciones topless
// (reporte con batch: Seedream café, Wan rosa, Qwen oscuras grandes). Mismo
// patrón que hair/eyeClause: spec fija del avatar, frase CONDICIONAL para no
// empujar desnudez en escenas vestidas. Solo viaja a permisivos (va dentro de
// buildCurvesEmphasis, que ya tiene ese gating).
// 'rosy' recalibrado (2026-07-24): 'natural rosy' seguía saliendo rosa
// SATURADO/lipstick en Qwen — en un editor literal la palabra de color domina
// sobre el guard suave del final. Fraseo RELATIVO A SU PIEL (mismo patrón que
// la eyeClause 58a0957): describe el tono como mezcla con la piel, no un rosa.
export const NIPPLE_COLOR_PHRASE: Record<string, string> = {
    // v4 (2026-07-25): NI 'rosy-tan' sobrevivió — con el front-load, CUALQUIER
    // palabra de la familia rosa se pinta como rubor en el seno (Raven fair lo
    // evidenció). Receta final = la que funcionó en piel/ojos: CERO color
    // nombrable, solo relación con su piel.
    rosy: 'light skin-toned (only a shade deeper and warmer than her surrounding skin)',
    peach: 'a soft peach-tan, gently warmer than her surrounding skin',
    'light-brown': 'light brown',
    brown: 'medium brown',
    dark: 'deep dark-brown',
}

// Tamaños RELATIVOS y directivos: 'small neat' era demasiado débil contra el
// prior busto-grande→areola-grande (verificado en Qwen con specs XXL: color
// obedecía, tamaño no — misma oración, así que el texto SÍ llegaba).
export const NIPPLE_AREOLA_PHRASE: Record<string, string> = {
    small: 'small compact areolas, tight around the nipple — noticeably smaller than average for her bust',
    medium: 'medium proportionate areolas',
    large: 'large wide areolas spanning much of the breast tip',
    puffy: 'puffy raised areolas projecting softly outward',
}

export const NIPPLE_COLORS = [
    'rosy',
    'peach',
    'light-brown',
    'brown',
    'dark',
] as const
export const NIPPLE_AREOLAS = ['small', 'medium', 'large', 'puffy'] as const

/** Cláusula condicional de pezones — vacía si el avatar no fijó reglas.
 * COMPACTA a propósito (~155 chars): vive dentro del body clause de Seedream,
 * que tiene techo duro de 900 — cada char compite con el spec del cuerpo.
 * Guard de realismo ("not oversaturated candy-pink"): Qwen es un editor
 * literal y pintaba un rosa saturado FAKE — mismo patrón que la eyeClause
 * suavizada (58a0957: describir con naturalidad, no color plano imperativo). */
export function nippleClause(m: PhysicalMeasurements): string {
    const color = m.nippleColor ? NIPPLE_COLOR_PHRASE[m.nippleColor] : ''
    const areola = m.nippleAreola ? NIPPLE_AREOLA_PHRASE[m.nippleAreola] : ''
    if (!color && !areola) return ''
    const spec = [color && `${color} nipples`, areola]
        .filter(Boolean)
        .join(' with ')
    // Candado de tamaño: desacopla la areola del tamaño del busto (el prior
    // que la infla). Solo se paga cuando hay regla de areola.
    const sizeLock = areola
        ? ' — areola size EXACTLY as stated, independent of her bust size'
        : ''
    // AUDITORÍA 2026-07-25 (F1, "negation blindness"): la difusión NO procesa
    // negaciones en el prompt positivo — "never bright pink / NEVER flushed,
    // blushed or tinted pink" ponía 8 palabras-pigmento AL FRENTE y Qwen las
    // PINTABA (rubor rosa). El positivo solo dice QUÉ pintar; toda prohibición
    // vive en el negative_prompt (antiPinkNegative de la ruta Qwen).
    // AUDITORÍA 2026-07-27 ("el color no se respeta" en Seedream): la cláusula
    // se contradecía a sí misma. Decía TRES veces "igual que su piel" —
    // la propia frase de color (que en rosy/peach ya es RELATIVA a propósito),
    // más "blends naturally with her skin", más "keeps her normal skin tone".
    // Los dos últimos nacieron como guardas anti-saturación del incidente del
    // rubor, pero pasaron de "no satures" a "fúndelo", que es otra cosa: el
    // modelo obedecía y pintaba el pezón del color de la piel.
    //
    // Queda UNA sola mención de la piel, y con su papel bien delimitado — que
    // el color no se DERRAME al pecho, no que se disuelva en él. `matte` se
    // conserva porque habla del acabado, no de la identidad con la piel.
    //
    // También cae el "only when uncovered" de cabecera: esto solo viaja desde
    // nivel 65 (topless o desnudo), o sea que el pecho está descubierto por
    // definición. Era un condicional muerto al FRENTE de la orden, y un hedge
    // delantero diluye en los motores literales (misma lección que la v2 de
    // la vulva).
    return `${spec}, matte finish. This tone stays STRICTLY on the nipple and areola; the surrounding breast skin keeps her own even skin tone${sizeLock}`
}

/** ¿La escena declara desnudez TOTAL explícita? Regex estricta a propósito:
 * "nude" solo calificado (fully/completely…) para no disparar con "nude heels"
 * o "bare shoulders" — un falso positivo aquí empujaría desnudez en una escena
 * que no la pide. "naked"/"bottomless" sí son inequívocos. */
const EXPLICIT_FULL_NUDE_RE =
    /\b(?:fully|completely|entirely|totally)\s+(?:nude|naked)\b|\bnaked\b|\bbottomless\b|\b(?:body|figure)\s+(?:fully\s+|explicitly\s+)?exposed\b|\bno\s+clothes\b/i

/**
 * MARCAS DE BRONCEADO. Rasgo de PIEL del avatar (como el tono), no de la
 * escena: si baila entre generaciones deja de ser la misma persona.
 *
 * Tono RELATIVO, nunca absoluto — misma leccion que el pezon y la vulva: los
 * motores literales saturan las palabras de color ("white", "pale") y pintan
 * parches. Se describe como un CONTRASTE con su propia piel.
 *
 * El alcance va explicito ("solo donde la piel esta descubierta") porque sin
 * el, los motores dibujaban las lineas ENCIMA de la ropa.
 */
export function tanLinesClause(m: PhysicalMeasurements): string {
    if (!m.tanLines) return ''
    // Mismo arreglo que el vello púbico (2026-07-27): "never drawn over
    // clothing" duplicaba en negativo lo que "visible ONLY where her skin is
    // bare" ya dice en positivo — y metía `clothing` en la escena.
    return 'natural bikini tan lines: the strips of skin normally covered by a bikini top and bottoms are a shade lighter than her surrounding tanned skin, with soft blended edges — visible ONLY where her skin is bare'
}

/**
 * VELLO PÚBICO. Tres ejes: forma, densidad y color.
 *
 * Lecciones ya pagadas, aplicadas de entrada:
 *  - Color RELATIVO al cabello, nunca absoluto. Los motores literales saturan
 *    las palabras de color (nos paso con el pezon y con "freckles"): decir
 *    "matching the hair on her head" no puede sobresaturar nada.
 *  - Alcance EXPLICITO ("only where she is bare below the waist"), o se dibuja
 *    sobre la ropa — mismo fallo que las marcas de bronceado.
 *  - En 'shaved' NO se nombra el vello: nombrarlo es invocarlo. Se describe la
 *    piel, que es lo que de verdad debe salir.
 */
const PUBIC_STYLE_PHRASE: Record<string, string> = {
    // "with no stubble" nombraba justo lo que quería evitar. "smooth and bare"
    // + "freshly shaved" ya lo dicen en positivo, sin invocar nada.
    shaved: 'her pubic area is completely smooth and bare, freshly shaved skin',
    strip: 'a narrow vertical strip of pubic hair above her vulva, the sides bare and cleanly groomed',
    triangle:
        'a small neat triangle of pubic hair above her vulva, tidily trimmed at the edges',
    natural: 'a natural, untrimmed patch of pubic hair above her vulva',
    full: 'a full, thick and completely untrimmed bush of pubic hair',
}
const PUBIC_AMOUNT_PHRASE: Record<number, string> = {
    1: 'very sparse and fine',
    2: 'light',
    3: 'moderate',
    4: 'dense',
    5: 'very dense and thick',
}

export function pubicHairClause(m: PhysicalMeasurements): string {
    const style = m.pubicStyle
    if (!style) return ''
    const shape = PUBIC_STYLE_PHRASE[style]
    if (!shape) return ''
    // En rasurado no hay densidad ni color que describir: hablar de vello ahi
    // solo puede invocarlo.
    if (style === 'shaved') {
        return `${shape} — visible ONLY where she is bare below the waist`
    }
    // "…cleanly groomed, moderate, the same colour…" dejaba el adjetivo
    // colgando entre comas, sin sujeto al que agarrarse. Con "of X density"
    // la densidad vuelve a describir el vello y no al aire.
    const density =
        m.pubicAmount && PUBIC_AMOUNT_PHRASE[m.pubicAmount]
            ? `, of ${PUBIC_AMOUNT_PHRASE[m.pubicAmount]} density`
            : ''
    // Color RELATIVO: 'hair' (lo normal) se ancla al pelo de la cabeza; un
    // color propio se nombra pero SIEMPRE acotado a esa zona.
    const color =
        !m.pubicColor || m.pubicColor === 'hair'
            ? ', the same colour as the hair on her head'
            : `, ${String(m.pubicColor).replace(/-/g, ' ')} in colour`
    // AUDITORÍA 2026-07-27: "never drawn through clothing" era una NEGACIÓN
    // que además metía el token `clothing` en un prompt cuyo objetivo es que
    // no la lleve — y encima redundante: "visible ONLY where she is bare below
    // the waist" ya dice lo mismo en positivo, que es la única forma en que la
    // difusión lo procesa. El alcance se queda; la prohibición sobra.
    //
    // El condicional SÍ es imprescindible aquí, al revés que en el pezón: esto
    // viaja desde nivel 85, y ese tramo permite "topless o desnudo total", así
    // que las bragas pueden seguir puestas. Sin acotar, el vello se pintaría
    // encima de la tela.
    return `${shape}${density}${color} — visible ONLY where she is bare below the waist`
}

/** Cláusula de la zona íntima (2026-07-24, "no se nota"): la difusión suaviza
 * la vulva a un monte LISO de muñeca sin hendidura. Mismos trucos validados con
 * el pezón: tono RELATIVO a la piel (nada de palabras de color absolutas →
 * Qwen literal las satura), prohibición del rosa brillante, consistencia
 * ("always the same"). Viaja SOLO en runs NSFW (mismo gating que nippleClause).
 *
 * v2 (verificado por recordInfo 67cafd24…): la v1 condicional ("only when
 * fully nude…") SÍ viajaba pero Qwen la ignoraba — el hedge diluye la orden en
 * un editor literal. Cuando la ESCENA ya declara desnudo total, la cláusula es
 * IMPERATIVA (la escena manda, el hedge sobra); si no, conserva el condicional
 * para no empujar desnudez en escenas vestidas. */
/**
 * DECISION VALIDADA (2026-07-26) — la clausula queda APAGADA.
 *
 * Se apago como prueba A/B tras el reporte "en seedream la vulva se veia
 * siempre bien, pero ahora se ve super mal, esta mal posicionada (muy arriba)",
 * y el usuario confirmo la mejora sin ella.
 *
 * EL HALLAZGO, que vale para lo que venga: describir una anatomia con detalle
 * POSICIONAL empeoraba el resultado. Cada ronda de ajuste añadia precision
 * aparente y le quitaba al modelo la libertad de colocarla donde toca — su
 * prior anatomico acierta mas que nuestras instrucciones acumuladas.
 *
 * Apaga las CUATRO apariciones a la vez (escena, fase 1 y 2 de MuleRouter, y
 * hoja NUDE); se hizo asi para que la comparacion fuera limpia.
 *
 * El codigo NO se borra: si un motor nuevo la necesitara, encenderla es cambiar
 * una palabra. La red de seguridad nunca se quito — el NEGATIVE sigue
 * prohibiendo mariposa, labios abiertos, censura y entrepierna lisa.
 */
export const VULVA_CLAUSE_ENABLED = false

export function vulvaClause(scenePrompt?: string): string {
    if (!VULVA_CLAUSE_ENABLED) return ''
    // v3 "cerradito" (2026-07-24): lever 3 logró que Qwen renderice, pero salía
    // ABIERTA y rosada = irreal. Calibración entre los dos modos de fallo:
    // monte-liso-doll ←→ abierta/explícita. El punto medio: hendidura CERRADA
    // de una sola línea, nada visible por dentro, tono piel mate (el rosa
    // reapareció — prohibirlo sin matiz "bright").
    // F1 auditoría: "(never pink, red or glossy)" fuera del positivo — la
    // difusión no niega, pinta. La prohibición vive en el negative de la ruta.
    const spec = `a small CLOSED compact cleft — a single delicate vertical line between full soft outer labia, inner labia fully tucked inside and not visible, nothing protruding, open or spread; matte tone matching her surrounding skin, neat, discreet and realistic as in a real photograph — yet never a featureless doll-like mound with no cleft at all, always the same exact anatomy`
    if (scenePrompt && EXPLICIT_FULL_NUDE_RE.test(scenePrompt)) {
        return `her vulva IS fully visible and anatomically real: ${spec}`
    }
    return `only when fully nude below the waist: her vulva shows ${spec}; when wearing bottoms the area stays smoothly covered with no explicit detail through fabric`
}

// Listas para los chips de la UI (orden de despliegue)
export const GLUTES_SHAPES = [
    'square',
    'v-shape',
    'a-shape',
    'round',
    'heart',
] as const
export const BUST_SHAPES = [
    'round',
    'athletic',
    'conical',
    'teardrop',
    'tuberous',
] as const

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
 * ¿Cuerpo DELIBERADAMENTE exagerado (más allá de anatomía natural)? Dispara
 * por nivel 6 en cualquier zona O por medidas extremas (ratio cadera/cintura
 * >= 2.0, o cadera >= 118cm) — el usuario puede llegar al XXL solo con los
 * sliders de cm (reporte 2026-07-23: waist 45 / hips 120 sin niveles → las
 * capas XXL no disparaban y el sheet salía natural).
 */
export function isExaggeratedBody(m: PhysicalMeasurements): boolean {
    const ratio = m.waist && m.hips ? m.hips / m.waist : 0
    // Umbrales RECALIBRADOS a tablas de tallas reales (2026-07-23, aportadas
    // por el usuario): cadera 100-104 = talla M (natural), el XXL real empieza
    // ~130 (talla 52/XXL). El gate viejo (ratio 2.0 / hips 118) creaba un
    // ACANTILADO: con cintura 50, pasar cadera de 100→101 cruzaba 2.0 y caían
    // de golpe XXL+anti-normalize+RESHAPE (reporte: "el salto no corresponde
    // con la realidad"). ratio 2.2 == whr 0.4545 (alineado con la frase wasp
    // extrema de describeBody — un solo borde, no dos).
    return (
        (m.bustLevel ?? 0) >= 6 ||
        (m.glutesLevel ?? 0) >= 6 ||
        (effectiveThighsLevel(m) ?? 0) >= 6 ||
        ratio >= 2.2 ||
        (m.hips ?? 0) >= 130
    )
}

/**
 * ¿Cuerpo de curvas FUERTES aunque no XXL? El tier intermedio que faltaba
 * (2026-07-31): la recalibración del gate XXL a ratio 2.2 dejó a la banda
 * 1.8-2.2 (wasp dramática según describeBody: whr ≤ 0.55) y a los niveles 5
 * SIN ninguna autorización de remodelado contra la plantilla del Body Lab —
 * todo o nada. Reporte real: bust 83 / waist 45 / hips 94 (ratio 2.09) +
 * glúteos 5 → la hoja salía con el cuerpo NATURAL de la plantilla (cintura
 * sin reducir, glúteos promedio, peor en la vista frontal). Bordes ALINEADOS
 * con los existentes (un solo acantilado por dimensión): whr 0.55 = el borde
 * de "extremely small, dramatically cinched waist" de describeShapeAndBuild;
 * nivel 5 = el último peldaño natural de los sliders.
 */
export function isStrongCurvesBody(m: PhysicalMeasurements): boolean {
    const whr = m.waist && m.hips ? m.waist / m.hips : 1
    return (
        whr <= 0.55 ||
        (m.bustLevel ?? 0) >= 5 ||
        (m.glutesLevel ?? 0) >= 5 ||
        (effectiveThighsLevel(m) ?? 0) >= 5
    )
}

/**
 * Frase combinada de los sliders de curvas (1-6). Vacía si todo está en Auto.
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
    // Vía glutesLevelPhrase (no el mapa directo): el nivel 6 con cadera
    // moderada habla de PROYECCIÓN trasera, no de anchura — ver su doc.
    const glutesPhrase = glutesLevelPhrase(m)
    if (glutesPhrase) {
        parts.push(glutesPhrase)
    }
    if (m.glutesShape && GLUTES_SHAPE_PHRASE[m.glutesShape]) {
        parts.push(GLUTES_SHAPE_PHRASE[m.glutesShape])
    }
    const thighs = effectiveThighsLevel(m)
    if (thighs && THIGHS_LEVEL_PHRASE[thighs]) {
        parts.push(THIGHS_LEVEL_PHRASE[thighs])
    }
    // Pezón QUITADO de aquí (2026-07-25): viajaba DOBLE — aquí (dentro del
    // bodyEmphasis) Y en el append "Her anatomy:" de AvatarStudioMain (nsfwRun).
    // Tras el front-load de Qwen ambas copias quedaban AL FRENTE → doble señal
    // de color = rubor rosa en el busto que la contención no frenaba. Fuente
    // única: el append (gated a NSFW — en SFW el pezón no pinta nada y solo
    // metía palabras de color al prompt).
    // Puente de continuidad: con glúteos llenos, la curva glúteo→muslo debe
    // ser UNA sola — evita el mismatch "butt grande sobre piernas flacas"
    // aunque el legType diga slim.
    if (m.glutesLevel && m.glutesLevel >= 4) {
        // Continuidad SIN mandato de grosor (2026-07-25): "full thighs — never
        // slim legs" contradecía piernas atléticas/cm modestos y los motores
        // literales engrosaban todo el tren inferior.
        parts.push(
            'her glutes taper smoothly into her thighs in one continuous natural line',
        )
    }
    // XXL (nivel 6 O medidas extremas) → candado anti-normalización: sin esta
    // orden los difusores regresan a proporciones naturales.
    if (isExaggeratedBody(m)) {
        if (m.waist && m.hips && m.hips / m.waist >= 2.2) {
            parts.push(
                `her hips (${m.hips}cm) are MORE THAN TWICE as wide as her wasp waist (${m.waist}cm) — an extreme exaggerated hourglass with massive hips, oversized glutes and heavy thighs`,
            )
        }
        parts.push(
            'these proportions are DELIBERATELY EXAGGERATED beyond natural anatomy — render them at FULL intensity exactly as described; do NOT tone them down or normalize toward average realistic proportions',
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
    6: 122,
}

export const GLUTES_LEVEL_TO_CM: Record<number, number> = {
    1: 82,
    2: 90,
    3: 97,
    4: 106,
    5: 116,
    6: 132,
}

// cm → nivel por BANDAS alineadas a tablas de tallas reales (2026-07-23), NO
// por "ancla más cercana": el punto medio entre las anclas 90 y 100 caía en
// 95 — la zona MÁS usada — y escribir busto 95→96 brincaba el nivel 3→4
// ("full rounded" → "large heavy, DEEP CLEAVAGE") en 1cm (mismo bug de clase
// que el acantilado de cadera 100→101). Los bordes van entre tallas: 3/4 en
// 97/98 (talla 42→44, territorio copa C donde "large" sí es defendible).
const bandedLevel = (bounds: number[], cm: number): CurveLevel => {
    // bounds[i] = límite SUPERIOR (inclusive) del nivel i+1.
    for (let i = 0; i < bounds.length; i++) {
        if (cm <= bounds[i]) return (i + 1) as CurveLevel
    }
    return 6
}

// Tallas (Full Bust): <80 XS · 80-87 S · 88-97 M/42 · 98-107 44-46 (copa C) ·
// 108-118 48-50 (D/E) · >118 XXL. Level→cm (slider) cae dentro de su banda:
// 3→90 ✓ · 4→100 ✓ · 5→110 ✓ · 6→122 ✓.
export const cmToBustLevel = (cm: number): CurveLevel =>
    bandedLevel([79, 87, 97, 107, 118], cm)
// Tallas (Hip): <86 XS · 86-93 S · 94-101 M · 102-111 L · 112-123 XL · >123
// XXL. Level→cm: 3→97 ✓ · 4→106 ✓ · 5→116 ✓ · 6→132 ✓. (Hoy la UI no deriva
// glutesLevel desde cm — la cadera tiene su slider propio — pero la banda
// queda alineada por si se re-cablea.)
export const cmToGlutesLevel = (cm: number): CurveLevel =>
    bandedLevel([85, 93, 101, 111, 123], cm)

export const LEG_TYPE_TOOLTIP: Record<string, string> = {
    auto: 'no explicit phrase — legs follow the Body Type and hip descriptors',
    ...LEG_TYPE_PHRASE,
}

/**
 * Build a single descriptive body phrase from an avatar's measurements:
 * shape + build + comparatives (leads) + ratio-derived descriptors. Per-avatar;
 * changing the avatar's specs changes the output. No longer leads with a
 * fixed body-type size-word phrase — that lead is what contradicted the
 * measurements (e.g. "slim slender figure" fighting a cinched-waist hourglass).
 */
export function describeBody(m: PhysicalMeasurements): string {
    const parts: string[] = [describeShapeAndBuild(m)]
    // Se conservan los descriptores derivados por ratio (torso/hombros/etc.),
    // PERO ya no el lead de bodyType (era la fuente del conflicto slim-vs-curvy).
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
        2: 'fair skin, light porcelain complexion with cool undertones',
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
        black: 'jet black hair, dark raven colored hair',
        'dark-brown': 'dark brown hair, deep brunette hair',
        brown: 'brown hair, medium brunette hair',
        'light-brown': 'light brown hair, chestnut colored hair',
        'dark-blonde':
            'dark blonde hair, dirty blonde hair, honey colored hair',
        blonde: 'blonde hair, golden blonde hair',
        'platinum-blonde':
            'platinum blonde hair, very light blonde, almost white hair',
        red: 'red hair, deep red colored hair',
        auburn: 'auburn hair, reddish brown hair',
        ginger: 'ginger hair, bright orange-red hair, copper colored hair',
        gray: 'gray hair, salt and pepper hair',
        silver: 'silver hair, metallic gray hair',
        white: 'white hair, snow white hair',
        // Fashion colors
        purple: 'vibrant purple hair, violet dyed hair',
        pink: 'pink hair, rose pink dyed hair',
        blue: 'blue hair, electric blue dyed hair',
        green: 'green hair, emerald green dyed hair',
        teal: 'teal hair, blue-green dyed hair',
        lavender: 'lavender hair, pastel purple dyed hair',
        'rose-gold': 'rose gold hair, pinkish blonde dyed hair',
        burgundy: 'burgundy hair, deep wine red dyed hair',
    }
    // Free-text custom colors fall through to a "<name> hair" description.
    return descriptions[hairColor] || hairColor.replace(/-/g, ' ') + ' hair'
}

/**
 * Translate an eye-color value into prompt-ready text. Handles natural colors,
 * fashion/colored-contact values, and any free-text color via the `"<name> eyes"`
 * fallback. Shared by both prompt builders so they stay in sync.
 */
/**
 * Largo de cabello 1-7 → frase de prompt. Escala pedida por el usuario
 * (2026-07-25): de rapado a pasando la cintura. 4 = por los hombros (default
 * implícito cuando el avatar no lo define, para no imponer un largo).
 */
export const HAIR_LENGTH_PHRASE: Record<number, string> = {
    1: 'buzz-cut shaved',
    2: 'very short pixie-cut',
    3: 'short chin-length',
    4: 'shoulder-length',
    5: 'long chest-length',
    6: 'very long waist-length',
    7: 'extremely long past-the-waist',
}

/** Etiqueta corta para el slider de la UI. */
export const HAIR_LENGTH_LABEL: Record<number, string> = {
    1: 'Rapado',
    2: 'Pixie',
    3: 'Corto (mentón)',
    4: 'Hombros',
    5: 'Largo (pecho)',
    6: 'Muy largo (cintura)',
    7: 'Extralargo',
}

/**
 * Descriptor de cabello COMPLETO: largo + textura + color, en una frase.
 *
 * Fuente ÚNICA (2026-07-25): antes cada sitio componía el pelo a su manera y
 * `hairStyle` no llegaba a NINGÚN prompt — el editor tomaba la textura del
 * lienzo y la fundía con el color del avatar (pelo mitad liso, mitad rizado).
 * El largo se suma aquí para que viaje por el mismo carril.
 */
export function describeHair(m: {
    hairColor?: string
    hairStyle?: string
    hairLength?: number
}): string {
    const color = getHairColorDescription(m.hairColor).split(',')[0]
    const lower = color.toLowerCase()
    // No duplicar si el color compuesto ya trae textura/largo.
    const tex =
        m.hairStyle && !lower.includes(m.hairStyle.toLowerCase())
            ? m.hairStyle
            : ''
    const len =
        m.hairLength && HAIR_LENGTH_PHRASE[m.hairLength]
            ? HAIR_LENGTH_PHRASE[m.hairLength]
            : ''
    if (!color) {
        const bare = [len, tex].filter(Boolean).join(' ')
        return bare ? `${bare} hair` : ''
    }
    // "shoulder-length straight blonde hair"
    return [len, tex, color].filter(Boolean).join(' ')
}

export function getEyeColorDescription(eyeColor?: string): string {
    if (!eyeColor) return ''
    const descriptions: Record<string, string> = {
        'dark-brown': 'dark brown eyes',
        brown: 'warm brown eyes',
        amber: 'amber golden-brown eyes',
        hazel: 'hazel eyes, green-brown blend',
        green: 'green eyes',
        blue: 'blue eyes',
        'light-blue': 'light ice-blue eyes',
        gray: 'gray eyes',
        // Fashion / colored contacts
        violet: 'violet colored contact-lens eyes',
        aqua: 'aqua turquoise colored eyes',
        red: 'red colored contact-lens eyes',
    }
    return descriptions[eyeColor] || eyeColor.replace(/-/g, ' ') + ' eyes'
}

const NATURAL_HAIR_COLORS = new Set([
    'black',
    'dark-brown',
    'brown',
    'light-brown',
    'dark-blonde',
    'blonde',
    'platinum-blonde',
    'red',
    'auburn',
    'ginger',
    'gray',
    'silver',
    'white',
])

/**
 * True for fashion/unnatural or free-text hair colors (purple, pink, blue,
 * lavender, custom names…). Used so the generation prompt tints only the head
 * hair for these — eyebrows must stay a natural neutral tone, not dyed pink.
 */
export function isFashionHairColor(hairColor?: string): boolean {
    return !!hairColor && !NATURAL_HAIR_COLORS.has(hairColor)
}
