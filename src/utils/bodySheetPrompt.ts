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
function buildBodySheetCurves(m: PhysicalMeasurements): string {
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
        `Full-body character reference sheet of ONE ${person}.`,
        'Three full-body views of the SAME woman side by side in a single image, left to right: front view, side profile view, back view.',
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
 * Negative prompt del body sheet — lo que NO queremos (patrón de los prompts de
 * alta fidelidad del usuario). Sube calidad y limpia defectos: mata el look
 * plástico/3D, fuerza dos-piezas (no enterizo), y quita texto/marcas/collage.
 */
export const BODY_SHEET_NEGATIVE_PROMPT = [
    'cartoon, illustration, 3d render, anime, cgi, stylized, airbrushed',
    'plastic skin, doll-like, over-smoothed skin, heavy makeup',
    'deformed anatomy, extra limbs, extra legs, extra arms, extra fingers, fused limbs, malformed hands',
    'one-piece swimsuit, bodysuit, dress, full clothing',
    'text, labels, watermark, signature, logo, borders, grid lines, collage frames',
    'low quality, blurry, jpeg artifacts, cropped, out of frame',
].join(', ')
