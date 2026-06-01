import type { PhysicalMeasurements } from '@/@types/supabase'

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

    return descriptors.join(', ')
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
