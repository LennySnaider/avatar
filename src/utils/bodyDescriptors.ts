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
