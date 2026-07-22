//
// Identity Lock — el prompt de escena NO debe dictar la identidad del avatar.
// stripSceneIdentity quita color de pelo, físico, piel, ojos, edad, tatuajes
// y ETNICIDAD de la escena (que llega como JSON estructurado o prosa, en
// INGLÉS o ESPAÑOL), dejando solo pose/outfit/lugar/luz/mood. El avatar
// (config + body ref + [BODY:]/[FACE:]) define la identidad. Escape: un tag
// [LOOK: …] apaga el saneador para looks intencionales (peluca, disfraz,
// shoot temático).
//
// Caso real que motivó la etnicidad + español (BD 2026-07-22): un prompt
// "una impresionante mujer coreana posando…" cambió la CARA del avatar en
// Qwen (editor literal que obedece el texto) — "coreana" es identidad, no
// escena. "restaurante coreano" / "Korean restaurant" sí es escena y se
// conserva (los patrones exigen un sustantivo de PERSONA adyacente).
//
// IMPORTANTE: este módulo SOLO importa tipos → corre bajo el test runner nativo
// de Node sin resolver alias @/ (los import type se strippean en runtime).

import type { PhysicalMeasurements } from '@/@types/supabase'

// Color de pelo (no estilo): "<color> ... hair" y la forma inversa.
export const HAIR_COLOR_RES: RegExp[] = [
    /\b(?:golden|dark|light|dirty|platinum|strawberry|jet)?[-\s]?(?:blonde|blond|brunette|brown|black|red|auburn|ginger|redhead|silver|grey|gray|raven)\b[^.,;:\n]{0,15}\bhair\b/gi,
    /\bhair\b[^.,;:\n]{0,15}\b(?:blonde|blond|brunette|brown|black|red|auburn|ginger|redhead|silver|grey|gray|raven)\b/gi,
    /\b(?:golden|dark|light|dirty|platinum|strawberry|jet)?[-\s]?(?:blonde|blond|brunette|brown|black|red|auburn|ginger|redhead|silver|grey|gray|raven)\b(?=\s+(?:woman|man|girl|boy|person|female|male|lady|guy)\b)/gi,
    // Español: "cabello castaño", "pelo largo negro" (color, no peinado —
    // "pelo recogido en coleta" NO matchea porque exige un color).
    /\b(?:cabello|pelo|melena|cabellera)\b(?:\s+[\wáéíóúüñÁÉÍÓÚÜÑ]+){0,2}?\s+(?:rubi[oa]s?|castañ[oa]s?|negr[oa]s?|moren[oa]s?|pelirroj[oa]s?|platinad[oa]s?|canos[oa]s?|azabache|cobriz[oa]s?|caoba|chocolate|oscur[oa]s?|clar[oa]s?)\b/gi,
]

// Etnicidad/nacionalidad de la PERSONA (identidad — la cara la define el
// avatar). Inglés: adjetivo ANTES del sustantivo de persona → lookahead
// (se borra solo el adjetivo, el sustantivo queda). "Korean woman" → "woman";
// "Korean restaurant" se conserva (restaurant no es persona).
export const ETHNICITY_EN_RE =
    /\b(?:korean|japanese|chinese|thai|vietnamese|filipin[ao]|asian|caucasian|latina|latino|hispanic|european|scandinavian|slavic|russian|ukrainian|brazilian|colombian|venezuelan|mexican|argentinian|indian|arab(?:ic)?|middle[-\s]eastern|african|ebony|american|french|italian|spanish|german|swedish|nordic|british|irish|turkish|persian|moroccan|egyptian)\b(?=[^.,;:\n]{0,20}\b(?:woman|man|girl|boy|model|lady|female|male|person|beauty|face|features|descent|ethnicity|appearance|looks)\b)/gi

// Español: el adjetivo va DESPUÉS del sustantivo ("mujer coreana") → se
// captura el sustantivo (+hasta 2 palabras intermedias) y el replace deja
// '$1$2', borrando solo el gentilicio. "vajilla china" se conserva.
export const ETHNICITY_ES_RE =
    /\b(mujer|chica|joven|modelo|señorita|dama|hombre|chico|persona)((?:\s+[\wáéíóúüñÁÉÍÓÚÜÑ]+){0,2}?)\s+(?:corean[oa]|japones[oa]|chin[oa]|tailandes[oa]|vietnamita|filipin[oa]|asiátic[oa]|caucásic[oa]|latin[oa]|hispan[oa]|europe[oa]|eslav[oa]|rus[oa]|ucranian[oa]|brasileñ[oa]|colombian[oa]|venezolan[oa]|mexican[oa]|argentin[oa]|indi[oa]|árabe|african[oa]|american[oa]|estadounidense|frances[oa]|italian[oa]|español[oa]|aleman[oa]|suec[oa]|nórdic[oa]|británic[oa]|irlandes[oa]|turc[oa]|pers[oa]|marroquí|egipci[oa])\b/gi

// Físico: adjetivo de cuerpo + sustantivo de cuerpo, y descriptores sueltos.
export const BODY_RES: RegExp[] = [
    /\b(?:voluptuous|hourglass|slim|slender|petite|curvy|thick|toned|fit|athletic|muscular|lean|plus[-\s]?size)\b[^.,;:\n]{0,40}\b(?:figure|body|waist|thighs|abdomen|physique|build|bust|hips|silhouette)\b/gi,
    // Cadena de adjetivos con comas: "fit, tanned physique" (la coma rompe el
    // puente [^.,;:\n] de arriba). Solo encadena adjetivos del SET (+conectores)
    // → "fit gym, wide hips" NO matchea ("gym" corta la cadena).
    /\b(?:voluptuous|hourglass|slim|slender|petite|curvy|thick|toned|fit|athletic|muscular|lean|tanned|plus[-\s]?size)(?:(?:\s*,\s*|\s+and\s+|\s+)(?:voluptuous|hourglass|slim|slender|petite|curvy|thick|toned|fit|athletic|muscular|lean|tanned|defined|wide|narrow|full|prominent|round|natural|dramatic|deep|very|super|extremely))*\s+(?:figure|body|waist|thighs|abdomen|physique|build|bust|hips|silhouette)\b/gi,
    /\b(?:visible ribcage|visible hip bones?|flat stomach|toned abdomen|defined abs)\b/gi,
    /\b(?:voluptuous|hourglass|slim|slender|petite|curvy|thick|toned|fit|athletic|muscular|lean|plus[-\s]?size)\b(?=\s+(?:woman|man|girl|boy|person|female|male|lady|guy)\b)/gi,
]

export const SKIN_RE =
    /\b(?:fair|light|medium|olive|tan|tanned|dark|deep|porcelain|pale)\b(?:[-\s]to[-\s]\w+)?[^.,;:\n]{0,10}\bskin\b/gi

// Español: "piel clara/morena/bronceada…" (adjetivo después del sustantivo).
export const SKIN_ES_RE =
    /\bpiel\b(?:\s+[\wáéíóúüñÁÉÍÓÚÜÑ]+){0,2}?\s+(?:clar[ao]|moren[ao]|bronceada?|oscur[ao]|pálid[ao]|blanc[ao]|olivácea|canela|tostada)\b/gi

export const EYE_RE =
    /\b(?:blue|green|brown|hazel|grey|gray|amber|dark)\b[^.,;:\n]{0,10}\beyes?\b/gi

// Español: "ojos verdes/azules/…".
export const EYE_ES_RE =
    /\bojos\b(?:\s+[\wáéíóúüñÁÉÍÓÚÜÑ]+){0,2}?\s+(?:azules|verdes|marrones|cafés?|avellana|grises|oscuros|claros|negros|miel)\b/gi

export const AGE_RES: RegExp[] = [
    /\b(?:early|mid|late)?[-\s]?(?:teens|twenties|thirties|forties|20s|30s|40s)\b/gi,
    /\b(?:young adult|\d{2}\s?(?:years old|yo))\b/gi,
    // Español: "23 años", "veinteañera".
    /\b\d{2}\s*años\b/gi,
    /\b(?:veinteañer[ao]|treintañer[ao]|veintitantos|treinta y tantos)\b/gi,
]

export const TATTOO_RE =
    /\b(?:tattoos?|tattooed|inked|sleeve tattoo|tatuajes?|tatuad[oa]s?)\b/gi

// Orden importa: HAIR_COLOR_RES debe correr antes que BODY_RES — el lookahead
// de frase corporal ("curvy woman") depende de que el color de pelo ya haya
// sido eliminado (p.ej. "curvy blonde woman" → tras el pase de pelo queda
// "curvy woman", y ahí "curvy" queda adyacente a "woman").
// ETHNICITY_ES_RE va APARTE (necesita replace '$1$2' para conservar el
// sustantivo de persona, no el ' ' uniforme de esta lista).
const ALL_IDENTITY_RES: RegExp[] = [
    ...HAIR_COLOR_RES,
    ...BODY_RES,
    SKIN_RE,
    SKIN_ES_RE,
    EYE_RE,
    EYE_ES_RE,
    ...AGE_RES,
    TATTOO_RE,
    ETHNICITY_EN_RE,
]

// Keys de identidad en el JSON. CORE (match exacto) se borra SIEMPRE, aunque
// el valor sea un objeto ("hair": {color, style} → fuera entero). SOFT
// (face/age) se borra si es escalar ("face": "sharp jawline" = identidad)
// pero si es OBJETO se recorre — "face": {expression, gaze} es DIRECCIÓN DE
// ESCENA (sonrisa/mirada), no identidad. COMPOUND (core + separador:
// "body_features", "skin_tone") igual: escalar → fuera; objeto → recursión
// ("body_and_pose" contiene la POSE junto al physique — borrarlo entero
// mataría la pose; la recursión borra solo el physique de adentro).
const CORE_IDENTITY_KEY_RE =
    /^(?:hair|body|physique|skin|demographics?|tattoos?|ethnicity|race|nationality)$/i
const SOFT_IDENTITY_KEY_RE = /^(?:face|age)$/i
const COMPOUND_IDENTITY_KEY_RE =
    /^(?:hair|body|physique|skin|demographics?|tattoos?|ethnicity|race|nationality|face|age)[_\-.]/i
// stripProse solo corre en CONTEXTO DE PERSONA (subject/description/story…
// o dentro de una key de identidad). Correrlo sobre TODA string del JSON
// destrozaba escena legítima (review adversarial: "slim-fit blazer hugging
// the waist" → "", "warm peach and tan skin tones" → mangled, y vaciaba
// entradas de negative_prompt como "slim hips" — invirtiendo su intención).
// La ropa/paleta/luz/negativos NO se tocan; la identidad prosaica vive en
// los campos de persona.
const PERSON_CONTEXT_KEY_RE =
    /^(?:subject|description|persons?|character|model|appearance|looks?|vibe|story|the_vibe|prompt|scene|caption)$/i
// Sufijos de prosa libre: "scene_description", "image_prompt" — también son
// contexto persona (prosa completa que puede describir a la persona).
const PERSON_SUFFIX_KEY_RE = /[_\-.](?:description|prompt|caption|story)$/i
// Keys claramente de ESCENA: RESETEAN el contexto persona para su subárbol.
// Sin esto, el latch inPerson se pegaba a TODO descendiente de `subject` y
// re-comía subject.wardrobe/palette/accessories (2º review adversarial).
// Tradeoff aceptado: identidad escondida BAJO una key de escena
// ("clothing": "she is a slim korean woman…") se escapa — la cubre el ancla
// anti-etnicidad de Qwen y el [BODY:]/[FACE:] autoritativos.
const SCENE_CONTEXT_KEY_RE =
    /^(?:clothing|wardrobe|outfit|apparel|attire|palette|lighting|light|accessor(?:y|ies)|colors?|camera|photography|environment|background|setting|props?|quality|style|composition|mood|atmosphere)(?:[_\-.]|$)/i
// Negativos ("negative_prompt", "negatives"): NUNCA se tocan — sanearlos
// invertía su intención (borraba "slim hips" del anti-slimming).
const NEGATIVE_KEY_RE = /negative/i
// Arrays bajo estas keys se FILTRAN por entrada (una entrada de apariencia
// desaparece completa); otros arrays solo sanean strings en contexto persona.
const FILTERED_ARRAY_KEYS = new Set(['must_keep', 'avoid'])
const MAX_JSON_DEPTH = 5

/** Quita frases de identidad de texto libre y limpia espacios/puntuación. */
export function stripProse(text: string): string {
    let out = text
    for (const re of ALL_IDENTITY_RES) out = out.replace(re, ' ')
    // Etnicidad ES: conserva el sustantivo de persona ($1) y las palabras
    // intermedias ($2); borra solo el gentilicio.
    out = out.replace(ETHNICITY_ES_RE, '$1$2')
    return out
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([.,;:])/g, '$1')
        .replace(/([.,;:])\1+/g, '$1')
        .trim()
}

/** true si la cadena contiene algún atributo de identidad. */
function matchesIdentity(s: string): boolean {
    const all = [...ALL_IDENTITY_RES, ETHNICITY_ES_RE]
    return all.some((re) => {
        re.lastIndex = 0
        return re.test(s)
    })
}

/**
 * Saneo RECURSIVO del JSON de escena (antes solo nivel superior + `subject`:
 * un "body_features" top-level o un "subject.hair" anidado se escapaban —
 * caso real: prompt de playa con "body_features" en BD 2026-07-22). Reglas:
 * key CORE → delete; SOFT/COMPOUND → delete salvo objeto (se recorre, en
 * contexto persona); string → stripProse SOLO en contexto persona; array
 * bajo must_keep/avoid → filtra entradas de identidad; otros arrays →
 * stripProse solo en contexto persona; objeto → recursión (tope
 * MAX_JSON_DEPTH, propagando el contexto persona).
 */
function sanitizeJsonObject(
    obj: Record<string, unknown>,
    depth = 0,
    inPerson = false,
): void {
    if (depth >= MAX_JSON_DEPTH) return
    for (const key of Object.keys(obj)) {
        const value = obj[key]
        const isObj =
            value !== null && typeof value === 'object' && !Array.isArray(value)
        // Negativos primero: jamás se borran ni se sanean (string/array/objeto).
        if (NEGATIVE_KEY_RE.test(key)) continue
        if (CORE_IDENTITY_KEY_RE.test(key)) {
            delete obj[key]
            continue
        }
        const softOrCompound =
            SOFT_IDENTITY_KEY_RE.test(key) ||
            COMPOUND_IDENTITY_KEY_RE.test(key)
        if (softOrCompound && !isObj) {
            delete obj[key]
            continue
        }
        // Prioridad: identidad > escena (resetea el latch) > persona/herencia.
        const childInPerson = softOrCompound
            ? true
            : SCENE_CONTEXT_KEY_RE.test(key)
              ? false
              : inPerson ||
                PERSON_CONTEXT_KEY_RE.test(key) ||
                PERSON_SUFFIX_KEY_RE.test(key)
        if (isObj) {
            sanitizeJsonObject(
                value as Record<string, unknown>,
                depth + 1,
                childInPerson,
            )
            continue
        }
        if (typeof value === 'string') {
            if (childInPerson) obj[key] = stripProse(value)
            continue
        }
        if (Array.isArray(value)) {
            if (FILTERED_ARRAY_KEYS.has(key.toLowerCase())) {
                obj[key] = value.filter(
                    (item) =>
                        typeof item !== 'string' || !matchesIdentity(item),
                )
            } else if (childInPerson) {
                obj[key] = value.map((item) =>
                    typeof item === 'string' ? stripProse(item) : item,
                )
            }
            // Arrays fuera de contexto persona (negative_prompt, props,
            // elements…) quedan INTACTOS.
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
