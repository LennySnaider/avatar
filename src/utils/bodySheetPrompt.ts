import type { PhysicalMeasurements } from '@/@types/supabase'
import {
    describeBody,
    buildCurvesEmphasis,
    getSkinToneDescription,
    getHairColorDescription,
} from '@/utils/bodyDescriptors'

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
    const curves = buildCurvesEmphasis(m)
    const skin = getSkinToneDescription(m.skinTone)
    const hair = getHairColorDescription(m.hairColor)

    const person = [`${m.age ?? 22}-year-old woman`, body, skin, hair]
        .filter(Boolean)
        .join(', ')

    // Medidas exactas — los modelos siguen mejor una spec numérica explícita que
    // un ratio implícito. Solo si las tres están presentes.
    const measurements =
        m.bust && m.waist && m.hips
            ? `Exact body measurements — reproduce them literally and faithfully, NOT an idealised average: bust ${m.bust}cm, waist ${m.waist}cm, hips ${m.hips}cm — a clearly defined waist with bust and hips visibly fuller than the waist.`
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
        'Photorealistic, ultra high detail, sharp focus. No text, no labels, no borders, no grid lines, no watermark.',
    ]
        .filter(Boolean)
        .join(' ')
}
