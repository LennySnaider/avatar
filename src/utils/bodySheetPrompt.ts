import type { PhysicalMeasurements } from '@/@types/supabase'
import {
    describeBody,
    getSkinToneDescription,
    getHairColorDescription,
    effectiveThighsLevel,
    BUST_SHAPE_PHRASE,
    GLUTES_SHAPE_PHRASE,
} from '@/utils/bodyDescriptors'

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
}

const SHEET_GLUTES_PHRASE: Record<number, string> = {
    1: 'small subtle glutes',
    2: 'rounded firm glutes',
    3: 'full round lifted glutes',
    4: 'very large, prominent round glutes with a strong hip curve',
    5: 'extremely large, dramatic bubble-butt glutes that project strongly',
}

const SHEET_THIGHS_PHRASE: Record<number, string> = {
    1: 'slim slender thighs',
    2: 'toned smooth thighs',
    3: 'sculpted athletic thighs',
    4: 'thick, strong, full thighs that touch',
    5: 'extremely thick, heavy, massive thighs with dramatic volume, fully touching',
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
    return parts.join(', ')
}

/**
 * Prompt para el BODY ANGLE SHEET del avatar: una sola imagen con 3 vistas
 * (frente / perfil / espalda) de la MISMA mujer, de cuerpo completo, en
 * mini-bikini simple, fondo de estudio neutro y luz pareja.
 *
 * El PUNTO del sheet es que el cuerpo refleje FIELMENTE los sliders, así que la
 * spec física va explícita y MANDATORIA en el prompt (no solo por el ancla del
 * motor): describeBody (silueta por ratio) + buildCurvesEmphasis (frases de
 * nivel/forma de busto·glúteos·muslos) + las medidas en cm. Como el body sheet
 * SIEMPRE se genera con un motor permisivo, las curvas pueden ir directas aquí
 * (no aplica el gating permissive-only del prompt de generación normal).
 *
 * En mini-bikini a propósito (NO desnudo): el sheet se inyecta como body ref en
 * TODOS los motores, incl. no-permisivos — un ref desnudo los rompería.
 */
export function buildBodySheetPrompt(m: PhysicalMeasurements): string {
    const body = describeBody(m)
    const curves = buildBodySheetCurves(m)
    const skin = getSkinToneDescription(m.skinTone)
    const hair = getHairColorDescription(m.hairColor)

    const person = [`${m.age ?? 22}-year-old woman`, body, skin, hair]
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
        // Tono piel/beige (NO "nude" — dispara el filtro NSFW de KIE) para leer la
        // silueta. Dos piezas explícito: los editores tienden a sacar enterizo.
        'Wearing a minimal bikini in a soft beige tone close to her own skin colour, a TWO-PIECE set (a separate bra top and a bikini bottom) so her full body shape — waist, hips, glutes and curves — reads clearly. It must be a two-piece bikini, NOT a one-piece swimsuit or bodysuit. No accessories, no props.',
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
export const BODY_TURNAROUND_TEMPLATE_URL = '/body/turnaround-template.jpg'

/** Modelo i2i para el refinado sobre la plantilla (mejor seguidor de curvas). */
export const BODY_SHEET_REFINE_MODEL = 'seedream/5-pro-image-to-image'

/**
 * Prompt para Seedream i2i sobre la plantilla fija: conservar las MISMAS vistas/
 * poses/fondo de la referencia, pero con el CUERPO del configurador (no el de la
 * plantilla). La ruta de Seedream además inyecta, vía bodyEmphasis, la cláusula
 * "su cuerpo real es X, renderízalo más lleno que la referencia".
 */
export function buildTurnaroundRefinePrompt(m: PhysicalMeasurements): string {
    const body = describeBody(m)
    const curves = buildBodySheetCurves(m)
    const skin = getSkinToneDescription(m.skinTone)
    const measurements =
        m.bust && m.waist && m.hips
            ? `bust ${m.bust}cm, waist ${m.waist}cm, hips ${m.hips}cm${
                  m.shoulders ? `, shoulders ${m.shoulders}cm` : ''
              }`
            : ''
    return [
        'The reference image is a full-body multi-view TURNAROUND of a woman on a plain beige studio background (four full-body views side by side: front, three-quarter, side, back).',
        'Recreate the EXACT same multi-view turnaround: same number of views, same poses, same camera angles, same framing and the same plain beige studio background.',
        `Render a woman whose BODY matches this spec exactly — do NOT copy the reference body; make it: ${[body, curves, measurements].filter(Boolean).join(', ')}. ${skin}.`,
        'Wearing a minimal beige two-piece bikini. Photorealistic, natural skin texture, 8k, sharp focus. Not an illustration.',
    ]
        .filter(Boolean)
        .join(' ')
}

// Las 3 vistas del sheet, en orden de izquierda a derecha.
export type BodyView = 'front' | 'side' | 'back'
export const BODY_VIEWS: BodyView[] = ['front', 'side', 'back']

const VIEW_CLAUSE: Record<BodyView, string> = {
    front: 'FRONT view: she faces the camera directly, standing straight, arms relaxed slightly away from the body — the FRONT of her body and her face are fully visible.',
    side: 'SIDE profile view: her whole body turned 90 degrees to the side, standing straight — her side silhouette (bust, belly, glute projection) is visible, face in profile.',
    back: 'BACK view: seen from directly BEHIND, her back to the camera, standing straight — her back, spine and glutes are visible; her face is NOT visible.',
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
    const hair = getHairColorDescription(m.hairColor)
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
        'Standing in a neutral relaxed pose, whole body head-to-toe in frame, centered, no cropping.',
        'Wearing a minimal bikini in a soft beige tone close to her own skin colour, a TWO-PIECE set (separate bra top and bikini bottom). It must be a two-piece bikini, NOT a one-piece swimsuit or bodysuit. No accessories, no props.',
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
    'deformed anatomy, extra limbs, extra legs, extra arms, extra fingers, fused limbs, malformed hands',
    'one-piece swimsuit, bodysuit, dress, full clothing',
    'text, labels, watermark, signature, logo, borders, grid lines, collage frames',
    'low quality, blurry, jpeg artifacts, cropped, out of frame',
    // Anti-repetición: forzar 3 ángulos DISTINTOS (no la misma pose 3 veces).
    'same pose repeated, three identical views, three identical angles, all front views, all profile views, duplicated identical figure',
].join(', ')
