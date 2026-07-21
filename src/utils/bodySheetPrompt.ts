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
            ? `Exact body measurements to render faithfully: bust ${m.bust}cm, waist ${m.waist}cm, hips ${m.hips}cm — a clearly defined waist with bust and hips visibly fuller than the waist.`
            : ''

    return [
        `Full-body character reference sheet of ONE ${person}.`,
        'Three full-body views of the SAME woman side by side in a single image, left to right: front view, side profile view, back view.',
        // Spec de CUERPO mandatoria — es el objetivo del sheet: que las curvas de
        // los sliders se vean, sin que el modelo caiga en un cuerpo de modelo slim.
        curves
            ? `MANDATORY BODY SHAPE — this is the priority of the image; render these curves clearly and accurately, do NOT slim them down or default to a generic thin fashion-model body: ${curves}.`
            : '',
        measurements,
        'Standing in a neutral relaxed A-pose, arms slightly away from the body, feet shoulder-width apart.',
        'Wearing a minimal skin-toned nude-beige TWO-PIECE micro bikini (a separate bra top and bikini bottom) that closely matches her skin colour, so her full body shape, waist, hips, glutes and curves read clearly. It must be a two-piece bikini — NOT a one-piece swimsuit or bodysuit. No accessories, no props.',
        'Plain seamless light-gray studio background, soft even frontal lighting, no harsh shadows.',
        'The body shape, bust, waist, hips, glutes and thighs must be IDENTICAL across all three views and must match the measurements and body shape described above.',
        'Full body visible head-to-toe in every view, whole figure in frame, no cropping.',
        'Photorealistic, ultra high detail, sharp focus. No text, no labels, no borders, no grid lines, no watermark.',
    ]
        .filter(Boolean)
        .join(' ')
}
