import type { PhysicalMeasurements } from '@/@types/supabase'
import {
    describeBody,
    getSkinToneDescription,
    getHairColorDescription,
} from '@/utils/bodyDescriptors'

/**
 * Prompt para el BODY ANGLE SHEET del avatar: una sola imagen con 3 vistas
 * (frente / perfil / espalda) de la MISMA mujer, de cuerpo completo, en
 * mini-bikini simple, fondo de estudio neutro y luz pareja. Reutiliza los
 * descriptores de cuerpo/piel/pelo ya existentes para que el sheet respete los
 * sliders de Physical Attributes.
 *
 * En mini-bikini a propósito (NO desnudo): el sheet se inyecta como body ref en
 * TODOS los motores, incl. no-permisivos — un ref desnudo los rompería.
 */
export function buildBodySheetPrompt(m: PhysicalMeasurements): string {
    const body = describeBody(m)
    const skin = getSkinToneDescription(m.skinTone)
    const hair = getHairColorDescription(m.hairColor)

    const person = [
        `${m.age ?? 22}-year-old woman`,
        body,
        skin,
        hair,
    ]
        .filter(Boolean)
        .join(', ')

    return [
        `Full-body character reference sheet of ONE ${person}.`,
        'Three full-body views of the SAME woman side by side in a single image, left to right: front view, side profile view, back view.',
        'Standing in a neutral relaxed A-pose, arms slightly away from the body, feet shoulder-width apart.',
        'Wearing a simple plain micro bikini (matte solid color), no accessories, no props.',
        'Plain seamless light-gray studio background, soft even frontal lighting, no harsh shadows.',
        'Consistent identical body shape, proportions and skin tone across all three views.',
        'Full body visible head-to-toe in every view, whole figure in frame, no cropping.',
        'Photorealistic, ultra high detail, sharp focus. No text, no labels, no borders, no grid lines, no watermark.',
    ].join(' ')
}
