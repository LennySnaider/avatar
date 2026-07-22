//
// Identity Lock — el prompt de escena NO debe dictar la identidad del avatar.
// stripSceneIdentity quita color de pelo, físico, piel, ojos, edad y tatuajes
// de la escena (que llega como JSON estructurado o prosa), dejando solo
// pose/outfit/lugar/luz/mood. El avatar (config + body ref + [BODY:]/[FACE:])
// define la identidad. Escape: un tag [LOOK: …] apaga el saneador para looks
// intencionales (peluca, disfraz, shoot temático).
//
// IMPORTANTE: este módulo SOLO importa tipos → corre bajo el test runner nativo
// de Node sin resolver alias @/ (los import type se strippean en runtime).

import type { PhysicalMeasurements } from '@/@types/supabase'

// Color de pelo (no estilo): "<color> ... hair" y la forma inversa.
export const HAIR_COLOR_RES: RegExp[] = [
    /\b(?:golden|dark|light|dirty|platinum|strawberry|jet)?[-\s]?(?:blonde|blond|brunette|brown|black|red|auburn|ginger|redhead|silver|grey|gray|raven)\b[^.,;:\n]{0,15}\bhair\b/gi,
    /\bhair\b[^.,;:\n]{0,15}\b(?:blonde|blond|brunette|brown|black|red|auburn|ginger|redhead|silver|grey|gray|raven)\b/gi,
    /\b(?:golden|dark|light|dirty|platinum|strawberry|jet)?[-\s]?(?:blonde|blond|brunette|brown|black|red|auburn|ginger|redhead|silver|grey|gray|raven)\b(?=\s+(?:woman|man|girl|boy|person|female|male|lady|guy)\b)/gi,
]

// Físico: adjetivo de cuerpo + sustantivo de cuerpo, y descriptores sueltos.
export const BODY_RES: RegExp[] = [
    /\b(?:voluptuous|hourglass|slim|slender|petite|curvy|thick|toned|fit|athletic|muscular|lean|plus[-\s]?size)\b[^.,;:\n]{0,40}\b(?:figure|body|frame|waist|thighs|abdomen|physique|build|bust|hips|silhouette)\b/gi,
    /\b(?:visible ribcage|visible hip bones?|flat stomach|toned abdomen|defined abs)\b/gi,
    /\b(?:voluptuous|hourglass|slim|slender|petite|curvy|thick|toned|fit|athletic|muscular|lean|plus[-\s]?size)\b(?=\s+(?:woman|man|girl|boy|person|female|male|lady|guy)\b)/gi,
]

export const SKIN_RE =
    /\b(?:fair|light|medium|olive|tan|tanned|dark|deep|porcelain|pale)\b(?:[-\s]to[-\s]\w+)?[^.,;:\n]{0,10}\bskin\b/gi

export const EYE_RE =
    /\b(?:blue|green|brown|hazel|grey|gray|amber|dark)\b[^.,;:\n]{0,10}\beyes?\b/gi

export const AGE_RES: RegExp[] = [
    /\b(?:early|mid|late)?[-\s]?(?:teens|twenties|thirties|forties|20s|30s|40s)\b/gi,
    /\b(?:young adult|\d{2}\s?(?:years old|yo))\b/gi,
]

export const TATTOO_RE = /\b(?:tattoos?|tattooed|inked|sleeve tattoo)\b/gi

// Orden importa: HAIR_COLOR_RES debe correr antes que BODY_RES — el lookahead
// de frase corporal ("curvy woman") depende de que el color de pelo ya haya
// sido eliminado (p.ej. "curvy blonde woman" → tras el pase de pelo queda
// "curvy woman", y ahí "curvy" queda adyacente a "woman").
const ALL_IDENTITY_RES: RegExp[] = [
    ...HAIR_COLOR_RES,
    ...BODY_RES,
    SKIN_RE,
    EYE_RE,
    ...AGE_RES,
    TATTOO_RE,
]

// Keys de identidad borradas del JSON parseado (nivel superior).
const IDENTITY_KEYS = ['hair', 'body', 'physique', 'skin', 'demographics', 'tattoos']
// Keys de identidad dentro de `subject`.
const SUBJECT_IDENTITY_KEYS = ['age', 'face', 'physique', 'demographics', 'hair', 'body', 'skin']

/** Quita frases de identidad de texto libre y limpia espacios/puntuación. */
export function stripProse(text: string): string {
    let out = text
    for (const re of ALL_IDENTITY_RES) out = out.replace(re, ' ')
    return out
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([.,;:])/g, '$1')
        .replace(/([.,;:])\1+/g, '$1')
        .trim()
}

/** true si la cadena contiene algún atributo de identidad. */
function matchesIdentity(s: string): boolean {
    return ALL_IDENTITY_RES.some((re) => {
        re.lastIndex = 0
        return re.test(s)
    })
}

function sanitizeJsonObject(obj: Record<string, unknown>): void {
    for (const k of IDENTITY_KEYS) delete obj[k]

    const subject = obj.subject
    if (subject && typeof subject === 'object' && !Array.isArray(subject)) {
        const s = subject as Record<string, unknown>
        for (const k of SUBJECT_IDENTITY_KEYS) delete s[k]
        if (typeof s.description === 'string') s.description = stripProse(s.description)
    }

    const constraints = obj.constraints
    if (constraints && typeof constraints === 'object' && !Array.isArray(constraints)) {
        const c = constraints as Record<string, unknown>
        for (const key of ['must_keep', 'avoid']) {
            const arr = c[key]
            if (Array.isArray(arr)) {
                c[key] = arr.filter(
                    (item) => typeof item !== 'string' || !matchesIdentity(item),
                )
            }
        }
    }
}

/**
 * Quita la identidad del avatar del prompt de escena. JSON → borra keys;
 * prosa → regex. `[LOOK: …]` → devuelve intacto (override intencional).
 */
export function stripSceneIdentity(prompt: string): string {
    if (!prompt) return prompt
    if (/\[LOOK:/i.test(prompt)) return prompt

    const trimmed = prompt.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
            const parsed = JSON.parse(trimmed)
            if (Array.isArray(parsed)) {
                for (const item of parsed) {
                    if (item && typeof item === 'object' && !Array.isArray(item)) {
                        sanitizeJsonObject(item as Record<string, unknown>)
                    }
                }
                return JSON.stringify(parsed)
            }
            if (parsed && typeof parsed === 'object') {
                sanitizeJsonObject(parsed as Record<string, unknown>)
                return JSON.stringify(parsed)
            }
        } catch {
            // JSON inválido (editado a mano) → cae a prosa.
        }
    }
    return stripProse(prompt)
}

/** Cláusula anti-watermark universal (in-prompt) — Seedream/Wan no tienen
 *  parámetro negative en KIE, así que va como texto para los 3 motores. */
export const ANTI_WATERMARK_CLAUSE =
    'Do NOT add any watermark, logo, brand name, readable text, caption or signature anywhere in the image.'

const FIXED_NEGATIVE =
    'watermark, logo, brand text, readable text, signature, caption, extra fingers, deformed hands'

// El avatar es curvy si busto/caderas o el nivel `build` están sobre el promedio.
// Umbrales alineados con los presets: bust≥95cm / hips≥100cm / build≥4.
function isCurvy(m?: Partial<PhysicalMeasurements> | null): boolean {
    if (!m) return false
    if (typeof m.bust === 'number' && m.bust >= 95) return true
    if (typeof m.hips === 'number' && m.hips >= 100) return true
    if (typeof m.build === 'number' && m.build >= 4) return true
    return false
}

/**
 * negative_prompt derivado del config para las rutas que lo soportan nativo
 * (Qwen hoy). Anti-slimming si el avatar es curvy + fijos (watermark/manos).
 * En Seedream/Wan el anti-slimming ya lo cubre el [BODY:] autoritativo y el
 * anti-watermark va por ANTI_WATERMARK_CLAUSE in-prompt.
 */
export function buildIdentityNegative(
    m?: Partial<PhysicalMeasurements> | null,
): string {
    const parts: string[] = []
    if (isCurvy(m)) {
        parts.push(
            'small chest, flat chest, reduced bust volume, normalized anatomy, athletic slimness, slim hips',
        )
    }
    parts.push(FIXED_NEGATIVE)
    return parts.join(', ')
}
