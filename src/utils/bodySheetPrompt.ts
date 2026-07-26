import type { PhysicalMeasurements } from '@/@types/supabase'
import {
    describeHair,
    describeBody,
    getSkinToneDescription,
    tanLinesClause,
    effectiveThighsLevel,
    isExaggeratedBody,
    BUST_SHAPE_PHRASE,
    GLUTES_SHAPE_PHRASE,
} from '@/utils/bodyDescriptors'

/**
 * Campos que NO cambian la FORMA del cuerpo → cambiarlos NO debe marcar la hoja
 * como desactualizada (regenerarla cuesta 2 generaciones: vestida + NSFW).
 *
 * - nipple*: el sheet vestido no los dibuja.
 * - pelo (color/tonos/tipo/LARGO) y ojos (2026-07-25, petición del usuario): la hoja
 *   es una referencia de CUERPO. Su pelo y ojos son decorado — en la generación
 *   la identidad viene del face ref y del hair/eye clause del avatar, que
 *   sobrescriben lo que muestre la hoja. Antes, teñir a un avatar obligaba a
 *   regenerar las dos hojas por nada.
 *
 * skinTone SÍ se queda fuera de esta lista: la hoja aporta la PIEL (la usamos
 * como ancla de piel natural en NSFW), así que un cambio de tono sí la invalida.
 */
const SHEET_IGNORED_KEYS = [
    'nippleColor',
    'nippleAreola',
    'hairColor',
    'hairColors',
    'hairStyle',
    'hairLength',
    'eyeColor',
] as const

/**
 * True si dos configs producen el MISMO cuerpo en el sheet — ignora los campos
 * de apariencia que el sheet no dibuja. Úsalo para el flag "desactualizado" en
 * vez de comparar el objeto de medidas entero.
 */
export function sameBodyShape(
    a?: PhysicalMeasurements | null,
    b?: PhysicalMeasurements | null,
): boolean {
    const strip = (m?: PhysicalMeasurements | null): string => {
        if (!m) return ''
        const clone: Record<string, unknown> = { ...m }
        for (const k of SHEET_IGNORED_KEYS) delete clone[k]
        return JSON.stringify(clone)
    }
    return strip(a) === strip(b)
}

/**
 * Mapas de curvas EXCLUSIVOS del Body Lab — más fuertes y con rango completo
 * (1 = sutil, 5 = dramático/exagerado) para dar CONTROL TOTAL del cuerpo del
 * sheet, incluidos cuerpos desproporcionados (meta multitenant). NO tocan los
 * mapas compartidos (`BUST_LEVEL_PHRASE`, etc.) que usa la generación normal, así
 * que ajustar la intensidad aquí no contamina el resto de la app.
 */
const SHEET_BUST_PHRASE: Record<number, string> = {
    1: 'small perky bust',
    2: 'modest natural bust',
    3: 'full rounded bust',
    4: 'large heavy bust with deep cleavage',
    5: 'extremely large, voluptuous, dramatically heavy bust with deep cleavage',
    // 6 = XXL más allá de lo natural (pedido multitenant 2026-07-23).
    6: 'ENORMOUS surgically-enhanced bust, comically oversized far beyond natural proportions, extreme cleavage dominating the torso',
}

const SHEET_GLUTES_PHRASE: Record<number, string> = {
    1: 'small subtle glutes',
    2: 'rounded firm glutes',
    3: 'full round lifted glutes',
    4: 'very large, prominent round glutes with a strong hip curve',
    5: 'extremely large, dramatic bubble-butt glutes that project strongly',
    6: 'MASSIVE exaggerated BBL-style glutes and hips far beyond natural anatomy — hips more than TWICE the width of her waist and clearly wider than her shoulders, extreme shelf-like projection seen from the side',
}

const SHEET_THIGHS_PHRASE: Record<number, string> = {
    1: 'slim slender thighs',
    2: 'toned smooth thighs',
    3: 'sculpted athletic thighs',
    4: 'thick, strong, full thighs that touch',
    5: 'extremely thick, heavy, massive thighs with dramatic volume, fully touching',
    6: 'COLOSSAL exaggerated thighs, each thigh nearly as wide as her waist, pressed together with an extreme outer-thigh curve continuing the hip line',
}

/**
 * Frase de curvas del sheet a partir de los sliders 1-5 + formas. Usa los mapas
 * dedicados (arriba) para el TAMAÑO y reutiliza en solo-lectura los mapas de
 * FORMA compartidos (descriptivos, no de intensidad).
 */
export function buildBodySheetCurves(m: PhysicalMeasurements): string {
    const parts: string[] = []
    if (m.bustLevel && SHEET_BUST_PHRASE[m.bustLevel]) {
        parts.push(SHEET_BUST_PHRASE[m.bustLevel])
    }
    if (m.bustShape && BUST_SHAPE_PHRASE[m.bustShape]) {
        parts.push(BUST_SHAPE_PHRASE[m.bustShape])
    }
    if (m.glutesLevel && SHEET_GLUTES_PHRASE[m.glutesLevel]) {
        parts.push(SHEET_GLUTES_PHRASE[m.glutesLevel])
    }
    if (m.glutesShape && GLUTES_SHAPE_PHRASE[m.glutesShape]) {
        parts.push(GLUTES_SHAPE_PHRASE[m.glutesShape])
    }
    const thighs = effectiveThighsLevel(m)
    if (thighs && SHEET_THIGHS_PHRASE[thighs]) {
        parts.push(SHEET_THIGHS_PHRASE[thighs])
    }
    // XXL (nivel 6 O medidas extremas: ratio >= 2.0 / cadera >= 118) → candado
    // anti-normalización (sin él los difusores regresan a proporciones
    // naturales — reporte: waist 45 / hips 120 sin niveles salía natural).
    if (isExaggeratedBody(m)) {
        if (m.waist && m.hips && m.hips / m.waist >= 2.2) {
            parts.push(
                `her hips (${m.hips}cm) are MORE THAN TWICE as wide as her wasp waist (${m.waist}cm) — MASSIVE exaggerated hips and oversized glutes dominating the silhouette, clearly wider than her shoulders, with heavy thighs pressed together`,
            )
        }
        parts.push(
            'these proportions are DELIBERATELY EXAGGERATED far beyond natural anatomy — render them at FULL intensity exactly as described, like a stylized social-media bombshell physique; do NOT tone them down or normalize toward average realistic proportions',
        )
    }
    return parts.join(', ')
}

/**
 * Prompt para el BODY ANGLE SHEET del avatar: una sola imagen con 3 vistas
 * (frente / perfil / espalda) de la MISMA mujer, de cuerpo completo, en
 * sports bra + briefs gris carbón (dos piezas), fondo neutro y luz pareja — o
 * DESNUDA si `opts.nude` (variante que solo viaja a motores permisivos).
 *
 * El PUNTO del sheet es que el cuerpo refleje FIELMENTE los sliders, así que la
 * spec física va explícita y MANDATORIA en el prompt (no solo por el ancla del
 * motor): describeBody (silueta por ratio) + buildCurvesEmphasis (frases de
 * nivel/forma de busto·glúteos·muslos) + las medidas en cm. Como el body sheet
 * SIEMPRE se genera con un motor permisivo, las curvas pueden ir directas aquí
 * (no aplica el gating permissive-only del prompt de generación normal).
 *
 * En dos-piezas deportivo a propósito (NO desnudo, NO "bikini" — xAI/Grok
 * bloquea el contexto swimwear con 431): el sheet se inyecta como body ref en
 * TODOS los motores, incl. no-permisivos — un ref desnudo los rompería.
 */
export function buildBodySheetPrompt(
    m: PhysicalMeasurements,
    opts?: { nude?: boolean },
): string {
    const body = describeBody(m)
    const curves = buildBodySheetCurves(m)
    const skin = getSkinToneDescription(m.skinTone)
    const hair = describeHair(m)
    // Marcas de bronceado SOLO en la variante NUDE: en la vestida el sports bra
    // cubre justo donde caen, asi que mencionarlas ahi solo invita a pintarlas
    // ENCIMA de la ropa. La hoja nude es ademas la que FIJA donde van, para que
    // no bailen entre generaciones.
    const tan = opts?.nude ? tanLinesClause(m) : ''

    const person = [`${m.age ?? 22}-year-old woman`, body, skin, hair, tan]
        .filter(Boolean)
        .join(', ')

    // Medidas exactas — los modelos siguen mejor una spec numérica explícita que
    // un ratio implícito. Solo si las tres están presentes.
    const measurements =
        m.bust && m.waist && m.hips
            ? `Exact body proportions — reproduce them literally, NOT an idealised average: bust ${m.bust}cm, waist ${m.waist}cm, hips ${m.hips}cm${
                  m.shoulders ? `, shoulders ${m.shoulders}cm wide` : ''
              }. The waist is the reference for the silhouette; render the bust, hips and shoulders relative to it exactly as specified.`
            : ''

    return [
        `A set of three REAL PHOTOREALISTIC full-body studio PHOTOGRAPHS of ONE ${person}, placed side by side in one wide image (a real photo contact sheet — NOT an illustration, drawing or cartoon).`,
        'The image contains EXACTLY THREE full-body photographs of the SAME woman, evenly spaced left-to-right, and each is a DIFFERENT camera angle:',
        'LEFT view = full FRONT view, she faces the camera directly (front of her body and face visible).',
        'CENTER view = full SIDE profile, her body turned 90 degrees to the side (side silhouette visible, one side of the face in profile).',
        'RIGHT view = full BACK view, she is turned around with her back to the camera (her back, spine and glutes visible, face NOT visible).',
        'These MUST be three clearly different angles (front, side, back) — do NOT repeat the same pose or angle three times, do NOT render three front views or three profiles.',
        // Spec de CUERPO mandatoria + CONTROL TOTAL: reproducir EXACTO, sin
        // normalizar/promediar, aunque quede exagerado (meta multitenant: quien
        // quiera cuerpos desproporcionados debe poder lograrlos con los sliders).
        curves
            ? `MANDATORY BODY SHAPE — reproducing the exact measurements and curves below is the single most important goal of this image. Render them precisely; do NOT normalise, average out or slim them toward a generic fashion-model body, EVEN IF the resulting figure looks striking, exaggerated or disproportionate: ${curves}.`
            : '',
        measurements,
        'Standing in a neutral relaxed A-pose, arms slightly away from the body, feet shoulder-width apart.',
        // Dos piezas explícito: los editores tienden a sacar enterizo. Gris
        // carbón (no beige/tono piel) — ver CLOTHED_SHEET_CLAUSE.
        opts?.nude ? NUDE_SHEET_CLAUSE : CLOTHED_SHEET_CLAUSE,
        'Plain seamless light-gray studio background, soft even frontal lighting, no harsh shadows.',
        'The body shape, bust, waist, hips, glutes and thighs must be IDENTICAL across all three views and must match the measurements and body shape described above.',
        'Full body visible head-to-toe in every view, whole figure in frame, no cropping.',
        // Anclas de FOTORREALISMO (neutras — sin escena): textura de piel real +
        // óptica neutra (50mm, sin distorsión de proporciones) + quality tags.
        'Photorealistic raw photo, natural skin texture with visible pores, subtle imperfections and soft peach fuzz, subsurface scattering, even soft studio lighting, shot on a 50mm lens (no lens distortion), 8k, ultra high detail, sharp focus.',
        'No text, no labels, no borders, no grid lines, no collage separators, no watermark.',
    ]
        .filter(Boolean)
        .join(' ')
}

/**
 * Plantilla FIJA de turnaround (imagen bundleada en public/). Seedream Pro i2i
 * la usa como referencia de POSES/LAYOUT (4 vistas limpias y consistentes) y
 * renderiza el cuerpo del config encima. 1 sola generación. Si el archivo no
 * existe, el drawer cae a Wan t2i.
 */
/**
 * Vestuario de la hoja CANÓNICA (variante SFW). Gris carbón, NO beige
 * (2026-07-25): la hoja beige era la fuente del bug "se ve desnuda" — su ropa
 * color piel se filtraba al resultado en Seedream+Wan+Qwen (el mismo vacío que
 * documenta BODY_SPEC_NOT_WARDROBE_CLAUSE, que prohíbe justo lo que la hoja
 * mostraba). El gris cumple igual su función (leer la silueta, no romper a los
 * motores no permisivos) y cuando se filtra es VISIBLE, no se disfraza de piel.
 */
const CLOTHED_SHEET_CLAUSE =
    'She wears a simple charcoal-grey sports bra and matching charcoal-grey sport briefs (a modest TWO-PIECE athletic set in a clearly non-skin colour) so her full body shape — waist, hips, glutes and curves — reads clearly. NOT a one-piece swimsuit or bodysuit. No accessories, no props.'

/**
 * Variante NUDE de la hoja (solo se envía a motores permisivos en runs NSFW).
 * Hereda las lecciones de la saga de anatomía (memoria del proyecto):
 * - CERO palabras-pigmento en positivo (pink/rosy se PINTAN como rubor).
 * - Nunca "line"/"vertical" para la vulva (se dibuja una línea literal).
 * - Anti-doll explícito (si no, monte liso de muñeca).
 * - Encuadre CLÍNICO: es una referencia anatómica, no una pose erótica — así
 *   la hoja no inyecta "mood sensual" en las generaciones que la usan de ancla.
 *
 * TIPO DE VULVA (2026-07-26): la hoja salía tipo "mariposa" (labios menores
 * sobresaliendo). El estándar de la plataforma es "ojo cerrado": los labios
 * MAYORES son grandes y tapan por completo a los menores. El positivo de antes
 * ("soft closed labia") era demasiado tibio para fijar el tipo, y el negativo
 * de la hoja no llevaba los términos anti-mariposa que la ruta de ESCENA sí
 * tiene desde la saga de anatomía — la hoja es el ANCLA de los runs NSFW, así
 * que su mariposa se propagaba a todo lo generado. Ahora el tipo se declara
 * explícito en positivo Y se prohíbe el contrario en negativo.
 */
const NUDE_SHEET_CLAUSE =
    'She is COMPLETELY NUDE in every view — no bra, no briefs, no garments at all, bare skin from head to toe, so her full body shape reads with nothing covering it. Natural realistic anatomy: bare breasts with small skin-toned areolas, and a vulva of the fully CLOSED type — plump full outer labia pressed together that completely conceal the inner labia, everything tucked inside, a soft narrow closed cleft in matte skin tone — real anatomy, never a smooth featureless doll-like blank. This is a CLINICAL anatomical body reference: neutral expression, relaxed stance, no seduction and no erotic posing.'

export const BODY_TURNAROUND_TEMPLATE_URL = '/body/turnaround-template.png'

/**
 * Modelo i2i-ONLY (Seedream 5 Pro): necesita imagen sí o sí. El refine sobre la
 * plantilla usa el modelo SELECCIONADO; esta constante solo marca cuál NO puede
 * hacer t2i, para que el fallback SIN plantilla caiga a Wan en vez de dar 500.
 */
export const BODY_SHEET_REFINE_MODEL = 'seedream/5-pro-image-to-image'

/**
 * Prompt para Seedream i2i sobre la plantilla fija: conservar las MISMAS vistas/
 * poses/fondo de la referencia, pero con el CUERPO del configurador (no el de la
 * plantilla). La ruta de Seedream además inyecta, vía bodyEmphasis, la cláusula
 * "su cuerpo real es X, renderízalo más lleno que la referencia".
 */
export function buildTurnaroundRefinePrompt(
    m: PhysicalMeasurements,
    opts?: { nude?: boolean },
): string {
    const body = describeBody(m)
    const curves = buildBodySheetCurves(m)
    const skin = getSkinToneDescription(m.skinTone)
    const measurements =
        m.bust && m.waist && m.hips
            ? `bust ${m.bust}cm, waist ${m.waist}cm, hips ${m.hips}cm${
                  m.shoulders ? `, shoulders ${m.shoulders}cm` : ''
              }`
            : ''
    // XXL (nivel 6 O medidas extremas): la plantilla es de proporciones
    // NATURALES y el i2i ancla a su silueta — hay que AUTORIZAR el remodelado
    // dramático explícitamente o el modelo promedia plantilla vs spec y el
    // XXL sale natural.
    const isXXL = isExaggeratedBody(m)
    return [
        'The reference image is a full-body multi-view TURNAROUND of a woman on a plain beige studio background (four full-body views side by side: front, three-quarter, side, back).',
        'Recreate the EXACT same multi-view turnaround: same number of views, same poses, same camera angles, same framing and the same plain beige studio background.',
        // VESTUARIO/DESNUDO ANTES del spec (2026-07-23): iba al FINAL y los
        // caps cortos (Grok 1800) lo decapitaban con specs XXL → sheet SIN
        // instrucción de ropa. Wording "sports bra" y no "bikini": xAI bloquea
        // el contexto swimwear (431 aun sanitizado).
        // GRIS CARBÓN, no beige (2026-07-25): la hoja beige ERA la fuente del
        // bug "se ve desnuda" — su ropa color piel se filtraba al resultado
        // (BODY_SPEC_NOT_WARDROBE_CLAUSE prohíbe justo lo que la hoja mostraba).
        // Si el gris se filtra, se ve y se corrige; el beige se disfrazaba de piel.
        opts?.nude ? NUDE_SHEET_CLAUSE : CLOTHED_SHEET_CLAUSE,
        `Render a woman whose BODY matches this spec exactly — do NOT copy the reference body; make it: ${[body, curves, measurements].filter(Boolean).join(', ')}. ${[skin, opts?.nude ? tanLinesClause(m) : ''].filter(Boolean).join('. ')}.`,
        // Consistencia ENTRE VISTAS: el sesgo frontal normalizaba el cuerpo en
        // la vista de FRENTE (caderas angostas + thigh gap) mientras lado/
        // espalda sí rendían el spec (reporte con imagen 2026-07-23). La vista
        // frontal necesita su anatomía EXPLÍCITA, no solo la de perfil.
        // Simetría ENTRE vistas en ambas direcciones: la 1ª ronda normalizaba
        // el FRENTE; al darle anatomía explícita solo al frente, la 2ª ronda
        // volteó el sesgo (frente enorme, espalda corta). Regla: la exageración
        // se describe POR VISTA, con el vocabulario de cada ángulo, y NINGUNA
        // vista puede ser más delgada NI más exagerada que las otras.
        'CONSISTENCY (CRITICAL): all four views depict THE EXACT SAME woman with IDENTICAL body proportions — hip width, glute size and thigh thickness must be EQUAL across every view; no view may look slimmer OR more exaggerated than the others.',
        'ANATOMY (CRITICAL): every figure is COMPLETE and intact — both arms, both legs, both hands and both feet fully rendered head-to-toe in EVERY view; never amputated, cropped, truncated or hidden limbs.',
        isXXL
            ? 'IMPORTANT: her body is DRAMATICALLY different from the reference — RESHAPE it completely to the spec above (far curvier and more exaggerated than the template woman); the reference is ONLY for the poses, views, framing and background, NEVER for the body proportions. The SAME exaggerated proportions in EVERY view: FRONT — hips flare dramatically wider than her shoulders, inner thighs touching, no thigh gap; THREE-QUARTER and SIDE — extreme glute projection with a deep lower-back curve; BACK — MASSIVE round glutes and hips dominating the frame, exactly as wide as they appear in the front view.'
            : '',
        'Photorealistic, natural skin texture, 8k, sharp focus. Not an illustration.',
    ]
        .filter(Boolean)
        .join(' ')
}

// Las 3 vistas del sheet, en orden de izquierda a derecha.
export type BodyView = 'front' | 'side' | 'back'
export const BODY_VIEWS: BodyView[] = ['front', 'side', 'back']

const VIEW_CLAUSE: Record<BodyView, string> = {
    front: 'FRONT view: she faces the camera directly, standing straight, arms relaxed slightly away from the body — the FRONT of her body and her face are fully visible. Her hip WIDTH, thigh thickness and waist-to-hip flare must be fully expressed facing the camera (the frontal silhouette shows the same proportions as any other angle — no slimming from the front).',
    side: 'SIDE profile view: her whole body turned 90 degrees to the side, standing straight — her side silhouette (bust, belly, glute projection) is visible, face in profile.',
    back: 'BACK view: seen from directly BEHIND, her back to the camera, standing straight — her back, spine and glutes are visible; her face is NOT visible. Her glute size, hip width and thigh thickness from behind match the other views EXACTLY (no slimming from the back).',
}

/**
 * Prompt de UNA sola vista del cuerpo (frente / lado / espalda). Se genera una
 * imagen por vista y luego se unen en el sheet — un solo modelo t2i (Qwen) NO
 * logra 3 vistas ortográficas distintas en una imagen (probado: repetía la
 * misma pose). Cada llamada es una vista limpia; el cuerpo (medidas/curvas) es
 * idéntico entre vistas porque el spec es el mismo, solo cambia el ángulo.
 */
export function buildBodyViewPrompt(
    m: PhysicalMeasurements,
    view: BodyView,
): string {
    const body = describeBody(m)
    const curves = buildBodySheetCurves(m)
    const skin = getSkinToneDescription(m.skinTone)
    const hair = describeHair(m)
    const person = [`${m.age ?? 22}-year-old woman`, body, skin, hair]
        .filter(Boolean)
        .join(', ')
    const measurements =
        m.bust && m.waist && m.hips
            ? `Exact body proportions — reproduce them literally, NOT an idealised average: bust ${m.bust}cm, waist ${m.waist}cm, hips ${m.hips}cm${
                  m.shoulders ? `, shoulders ${m.shoulders}cm wide` : ''
              }. The waist is the reference for the silhouette.`
            : ''

    return [
        `Single full-body studio photo of ONE ${person}.`,
        `Camera angle — ${VIEW_CLAUSE[view]}`,
        curves
            ? `MANDATORY BODY SHAPE — render these curves precisely; do NOT normalise, average out or slim them toward a generic fashion-model body, EVEN IF the figure looks striking, exaggerated or disproportionate: ${curves}.`
            : '',
        measurements,
        'Standing in a neutral relaxed pose, whole body head-to-toe in frame, centered, no cropping. Her body is COMPLETE and intact: both arms, both legs, both hands and both feet fully rendered — never amputated, truncated or cropped.',
        CLOTHED_SHEET_CLAUSE,
        'Plain seamless light-gray studio background, soft even lighting, no harsh shadows.',
        'Photorealistic raw photo, natural skin texture with visible pores, subtle imperfections, subsurface scattering, shot on a 50mm lens (no lens distortion), 8k, ultra high detail, sharp focus.',
        'ONE single woman only, one pose, no duplicated figures, no text, no watermark.',
    ]
        .filter(Boolean)
        .join(' ')
}

/**
 * Negative prompt del body sheet — lo que NO queremos (patrón de los prompts de
 * alta fidelidad del usuario). Sube calidad y limpia defectos: mata el look
 * plástico/3D, fuerza dos-piezas (no enterizo), y quita texto/marcas/collage.
 */
export const BODY_SHEET_NEGATIVE_PROMPT = [
    'cartoon, illustration, drawing, sketch, concept art, character sheet, line art, vector art, comic, cel-shaded, painting, anime, 3d render, cgi, stylized, airbrushed',
    'plastic skin, doll-like, over-smoothed skin, heavy makeup',
    // Anti-esqueletico (2026-07-26): sustituye al "NOT skinny or underweight"
    // que vivia en el POSITIVO, donde la difusion no procesa la negacion y solo
    // aportaba las palabras "skinny"/"underweight". Solo extremos — "slim" o
    // "thin" son legitimos y no se prohiben, o se peleaba con los builds bajos.
    'emaciated, anorexic, skeletal, visible ribcage, gaunt',
    'deformed anatomy, extra limbs, extra legs, extra arms, extra fingers, fused limbs, malformed hands',
    // Anti-mutilación (2026-07-23): con cuerpos XXL el modelo "resuelve"
    // recortando/amputando — prohibirlo explícito.
    'missing limbs, missing arms, missing legs, missing hands, missing feet, amputated limbs, severed limbs, cut-off limbs, truncated legs, stump, dismembered, incomplete body',
    'one-piece swimsuit, bodysuit, dress, full clothing',
    'text, labels, watermark, signature, logo, borders, grid lines, collage frames',
    'low quality, blurry, jpeg artifacts, cropped, out of frame',
    // Anti-repetición: forzar 3 ángulos DISTINTOS (no la misma pose 3 veces).
    'same pose repeated, three identical views, three identical angles, all front views, all profile views, duplicated identical figure',
].join(', ')

/**
 * Negative de la variante NUDE: hereda todo el de calidad/anatomía pero cambia
 * las prohibiciones de vestuario (en nude sobra "one-piece swimsuit…" y hay que
 * prohibir la ROPA en sí) y añade el anti-censura/anti-doll que costó toda la
 * saga de anatomía — más el anti-rubor (las palabras de color se pintan).
 *
 * Anti-MARIPOSA (2026-07-26): estos términos ya vivían en el negative de la
 * ruta de ESCENA (sceneSanitizer) pero nunca se replicaron aquí, así que la
 * hoja —que es el ancla de los runs NSFW— podía salir mariposa y contaminaba
 * todo lo generado a partir de ella. La difusión NO procesa negaciones en el
 * positivo: prohibir el tipo contrario solo funciona desde el negative.
 */
export const BODY_SHEET_NUDE_NEGATIVE_PROMPT = BODY_SHEET_NEGATIVE_PROMPT.replace(
    'one-piece swimsuit, bodysuit, dress, full clothing',
    'clothes, clothing, sports bra, briefs, underwear, panties, bikini, swimsuit, bodysuit, dress, covered body, censored, censor bar, mosaic censoring, blurred crotch, smooth featureless crotch, doll-like genital area, pink areolas, blushed chest, protruding inner labia, long labia minora, visible inner labia, open labia, spread labia, gaping, everted vulva, butterfly vulva, horseshoe vulva',
)
