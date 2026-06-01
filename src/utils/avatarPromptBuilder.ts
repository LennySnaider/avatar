import type { PhysicalMeasurements } from '@/@types/supabase'
import { getBodyDescriptors } from '@/utils/bodyDescriptors'

/**
 * Shared avatar prompt recipe — a faithful port of the harness in
 * GeminiService.generateAvatar so EVERY provider (KIE Nano Banana Pro / GPT
 * Image 2 / Flux, …) sends the SAME rich instructions that make the direct
 * Gemini path nail identity/body/pose. Returns the two text blocks Gemini uses:
 * `systemPreamble` (goes first) and `finalPrompt` (goes last). KIE concatenates
 * them into a single `prompt`; Gemini can later adopt this as its single source.
 *
 * Image ordering convention (must match how the caller sends image_input[]):
 *   FACE_ANCHOR, ANGLE_SHEET, BODY_SHAPE, POSE_REF, STYLE, ASSET…
 */

export type RefRole = 'face' | 'angle' | 'body' | 'pose' | 'scene' | 'asset'

export interface AvatarPromptOptions {
    prompt: string
    aspectRatio: string
    measurements: PhysicalMeasurements
    faceDescription?: string
    identityWeight?: number
    styleWeight?: number
    cameraShot?: string
    cameraAngle?: string | null
    /** Roles present, in the SAME order images are sent to the model. */
    refRoles: RefRole[]
}

/**
 * Lean, natural prompt for OpenAI's GPT Image (and other models that prefer
 * concise instructions). Deliberately AVOIDS the verbose Gemini harness and the
 * words "deepfake/face swap" — those trip OpenAI moderation and bloat the
 * request (slow → timeout). The reference images carry the identity; the prompt
 * carries the scene. Mirrors how the same model clones faces in ChatGPT itself.
 */
export function buildLeanIdentityPrompt(prompt: string, refRoles: RefRole[]): string {
    if (!refRoles.includes('face')) return prompt
    const note =
        refRoles.length > 1
            ? 'Use the attached reference images as the subject: keep the exact same face, facial features and likeness as the person shown, and match their body proportions.'
            : 'Keep the exact same face, facial features and likeness as the person in the attached reference image.'
    return `Photorealistic editorial photograph. ${note}\n\n${prompt}`
}

// 1-9 skin tone scale → complexion description (verbatim from GeminiService).
function getSkinToneDescription(tone?: number): string {
    if (!tone) return ''
    const map: Record<number, string> = {
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
    return map[tone] || ''
}

function getHairColorDescription(hairColor?: string): string {
    if (!hairColor) return ''
    const map: Record<string, string> = {
        black: 'jet black hair, dark raven colored hair',
        'dark-brown': 'dark brown hair, deep brunette hair',
        brown: 'brown hair, medium brunette hair',
        'light-brown': 'light brown hair, chestnut colored hair',
        'dark-blonde': 'dark blonde hair, dirty blonde hair, honey colored hair',
        blonde: 'blonde hair, golden blonde hair',
        'platinum-blonde': 'platinum blonde hair, very light blonde, almost white hair',
        red: 'red hair, deep red colored hair',
        auburn: 'auburn hair, reddish brown hair',
        ginger: 'ginger hair, bright orange-red hair, copper colored hair',
        gray: 'gray hair, salt and pepper hair',
        silver: 'silver hair, metallic gray hair',
        white: 'white hair, snow white hair',
    }
    return map[hairColor] || hairColor.replace('-', ' ') + ' hair'
}

function getHeightDesc(height: number): string {
    if (height < 155) return "petite height (under 5'1\")"
    if (height < 163) return "short to average height (5'1\"-5'4\")"
    if (height < 170) return "average height (5'4\"-5'7\")"
    if (height < 178) return "tall (5'7\"-5'10\")"
    return "very tall, model height (5'10\"+)"
}

const BODY_TYPE_DESCRIPTIONS: Record<string, { desc: string; proportion: string }> = {
    petite: { desc: 'petite, delicate frame', proportion: 'small-boned, compact proportions' },
    slim: { desc: 'slim, slender figure', proportion: 'lean, elongated proportions' },
    athletic: { desc: 'athletic, toned physique', proportion: 'muscular definition, sporty build' },
    average: { desc: 'average, balanced figure', proportion: 'proportionate, natural build' },
    curvy: { desc: 'curvy, voluptuous figure', proportion: 'fuller proportions with defined curves' },
    hourglass: { desc: 'classic hourglass figure, pin-up proportions', proportion: 'narrow waist with fuller bust and hips' },
    'plus-size': { desc: 'plus-size, full-figured', proportion: 'generous proportions throughout' },
}

function buildInlineBodyDescription(m: PhysicalMeasurements): string {
    const hipWaistRatio = m.hips / m.waist
    const bustWaistRatio = m.bust / m.waist
    const height = m.height || 165
    const selectedBodyType = m.bodyType || 'average'

    let bodyTypeDesc = ''
    let proportionDesc = ''
    if (selectedBodyType && BODY_TYPE_DESCRIPTIONS[selectedBodyType]) {
        bodyTypeDesc = BODY_TYPE_DESCRIPTIONS[selectedBodyType].desc
        proportionDesc = BODY_TYPE_DESCRIPTIONS[selectedBodyType].proportion
    } else if (hipWaistRatio >= 1.6 && bustWaistRatio >= 1.5) {
        bodyTypeDesc = 'glamour model physique, dramatic hourglass silhouette'
        proportionDesc = 'extremely cinched waist creating dramatic curves, very full figure on top and bottom'
    } else if (hipWaistRatio >= 1.45 || bustWaistRatio >= 1.45) {
        bodyTypeDesc = 'classic hourglass figure, pin-up model proportions'
        proportionDesc = 'noticeably narrow waist with fuller proportions above and below'
    } else if (hipWaistRatio >= 1.3) {
        bodyTypeDesc = 'soft hourglass body type'
        proportionDesc = 'defined waist with balanced proportions'
    } else {
        bodyTypeDesc = 'athletic straight silhouette'
        proportionDesc = 'lean athletic build'
    }

    const upperDesc = m.bust >= 100 ? 'very full chest area' : m.bust >= 95 ? 'full, ample chest' : m.bust >= 88 ? 'well-developed chest' : 'moderate chest'
    const waistDesc = m.waist <= 58 ? 'extremely tiny waist (corseted look)' : m.waist <= 62 ? 'very slim, cinched waist' : m.waist <= 68 ? 'slim defined waist' : 'natural waist'
    const hipDesc = m.hips >= 100 ? 'very wide, full hips and thighs' : m.hips >= 95 ? 'wide, shapely hips' : m.hips >= 88 ? 'proportionate hips' : 'slim hips'
    const heightDesc = getHeightDesc(height)
    const skinToneDesc = getSkinToneDescription(m.skinTone)
    const hairColorDesc = getHairColorDescription(m.hairColor)

    let fullDesc = `${m.age || 25} year old woman`
    if (skinToneDesc) fullDesc += ` with ${skinToneDesc}`
    if (hairColorDesc) fullDesc += skinToneDesc ? ` and ${hairColorDesc}` : ` with ${hairColorDesc}`
    fullDesc += `, ${heightDesc}, with ${bodyTypeDesc}. Physical build: ${upperDesc}, ${waistDesc}, ${hipDesc}. ${proportionDesc}`
    return fullDesc
}

// Emphatic body specification block (used when there's NO body reference image).
function buildBodySpecification(m: PhysicalMeasurements): string {
    const height = m.height || 165
    const selectedBodyType = m.bodyType || 'average'
    const heightLabel = height < 160 ? 'PETITE/SHORT' : height < 170 ? 'AVERAGE HEIGHT' : 'TALL'
    const bodyTypeLabel = BODY_TYPE_DESCRIPTIONS[selectedBodyType]?.desc.toUpperCase() || 'AVERAGE BUILD'

    const bustDesc = m.bust >= 100 ? 'VERY LARGE, FULL BUST - visibly voluminous, ample cleavage area, prominent chest' : m.bust >= 95 ? 'LARGE, FULL BUST - noticeably full, generous chest proportions' : m.bust >= 90 ? 'MEDIUM-FULL BUST - balanced, feminine chest' : 'proportionate chest'
    const waistDesc = m.waist <= 58 ? 'EXTREMELY NARROW WAIST - dramatically cinched, corset-like appearance, very slim midsection' : m.waist <= 62 ? 'VERY NARROW WAIST - visibly slim, well-defined midsection' : m.waist <= 68 ? 'NARROW WAIST - tapered, defined' : 'defined waist'
    const hipsDesc = m.hips >= 100 ? 'VERY WIDE HIPS & FULL LOWER CURVES - prominent lower body, rounded silhouette' : m.hips >= 95 ? 'WIDE HIPS & FULL LOWER CURVES - curvy lower body, rounded shape, feminine hips' : m.hips >= 90 ? 'CURVY HIPS - balanced, feminine lower body' : 'proportionate lower body'
    const thighsDesc = m.hips >= 100 ? 'THICK, FULL THIGHS - meaty upper legs, substantial leg volume, no thigh gap, legs touch' : m.hips >= 95 ? 'FULL, CURVY THIGHS - thick upper legs, feminine leg volume, soft inner thighs' : m.hips >= 90 ? 'SOFT, FEMININE THIGHS - some thickness, natural curves' : 'proportionate legs'
    const skin = getSkinToneDescription(m.skinTone)
    const hair = getHairColorDescription(m.hairColor)
    const whr = (m.hips / m.waist).toFixed(2)

    return `╔═══════════════════════════════════════════════════════════════════════════════╗
║  🚨 MANDATORY BODY SPECIFICATIONS - READ CAREFULLY 🚨                          ║
╚═══════════════════════════════════════════════════════════════════════════════╝

HEIGHT: ${heightLabel} (${height}cm)
BODY TYPE: ${bodyTypeLabel}
${skin ? `\n▓▓▓ SKIN TONE ▓▓▓\n${skin.toUpperCase()}\nThis is the EXACT skin complexion the character MUST have.` : ''}
${hair ? `\n▓▓▓ HAIR COLOR ▓▓▓\n${hair.toUpperCase()}\nThe character's hair (head hair, eyebrows) MUST be this color.` : ''}

▓▓▓ BUST/CHEST ▓▓▓
${bustDesc}
Measurements: ${m.bust}cm bust

▓▓▓ WAIST/MIDSECTION ▓▓▓
${waistDesc}
Measurements: ${m.waist}cm waist

▓▓▓ HIPS/LOWER BODY ▓▓▓
${hipsDesc}
Measurements: ${m.hips}cm hips

▓▓▓ THIGHS/LEGS ▓▓▓
${thighsDesc}
⚠️ DO NOT make legs thin/skinny when hips are wide - this looks unnatural!

▓▓▓ OVERALL SILHOUETTE ▓▓▓
This character has a ${selectedBodyType.toUpperCase()} body type. The waist-to-hip ratio is ${whr} - this creates ${m.hips / m.waist >= 1.4 ? 'a DRAMATIC HOURGLASS shape' : 'visible curves'}.

⛔ DO NOT GENERATE: slim/athletic body when curvy is specified, small chest when large bust is specified, straight waist when narrow/cinched is specified, thin legs when curvy hips are specified.`
}

function buildIdentityInstructions(identityWeight: number, hasPoseOrStyle: boolean): string {
    if (identityWeight > 85) {
        return `╔═══════════════════════════════════════════════════════════════╗
║ 🚨 FACE IDENTITY: ABSOLUTE PRIORITY - DEEPFAKE MODE 🚨          ║
╚═══════════════════════════════════════════════════════════════╝

THIS IS A FACE SWAP / DEEPFAKE OPERATION:
- [FACE_ANCHOR] is the ONLY source for the face. NO EXCEPTIONS.
- Copy EXACT facial features: eye shape, nose structure, lips, jawline, skin tone, ethnicity
- The face MUST be 100% recognizable as the same person in [FACE_ANCHOR]
${hasPoseOrStyle ? `- [POSE_REF] and [STYLE_REF] are ONLY for pose/style - IGNORE their faces completely
- Treat [POSE_REF]/[STYLE_REF] as faceless mannequins with NO identity` : ''}

IDENTITY CHECKLIST (ALL MUST BE TRUE):
✓ Eye shape, nose, lips, jawline, skin tone and ethnicity match [FACE_ANCHOR]
✓ Overall face is the SAME PERSON as [FACE_ANCHOR]`
    }
    return `═══════════════════════════════════════════════════════════════
FACE IDENTITY: HIGH CONSISTENCY (Identity Weight: ${identityWeight}%)
═══════════════════════════════════════════════════════════════
- Use [FACE_ANCHOR] as the PRIMARY face reference
- The character must be clearly recognizable as the person in [FACE_ANCHOR]
${hasPoseOrStyle ? `- Do NOT copy faces from [POSE_REF] or [STYLE_REF]; those are for pose/style only` : ''}`
}

const FRAMING_DESCRIPTIONS: Record<string, string> = {
    EXTREME_CLOSE_UP: 'EXTREME CLOSE-UP: Frame only the face, eyes and facial details.',
    CLOSE_UP: 'CLOSE-UP: Frame head and shoulders. Face is the main focus.',
    MEDIUM_CLOSE_UP: 'MEDIUM CLOSE-UP: Frame from chest up.',
    MEDIUM_SHOT: 'MEDIUM SHOT: Frame from waist up.',
    MEDIUM_FULL: 'MEDIUM FULL SHOT: Frame from knees up.',
    FULL_SHOT: 'FULL SHOT: Frame entire body from head to feet.',
    WIDE_SHOT: 'WIDE SHOT: Full body with significant environment visible.',
    EXTREME_WIDE: 'EXTREME WIDE SHOT: Environment dominates, subject is smaller in frame.',
}

const ANGLE_DESCRIPTIONS: Record<string, string> = {
    LOW_ANGLE: 'LOW ANGLE: Camera below subject, looking UP. Powerful, dominant.',
    HIGH_ANGLE: 'HIGH ANGLE: Camera above subject, looking DOWN.',
    DUTCH_ANGLE: 'DUTCH ANGLE: Camera tilted diagonally. Creates tension/energy.',
    BIRDS_EYE: "BIRD'S EYE VIEW: Camera directly above, looking straight down.",
    WORMS_EYE: "WORM'S EYE VIEW: Camera at ground level, looking straight up.",
    OVER_SHOULDER: 'OVER THE SHOULDER: Camera behind one person, looking at subject.',
    POV: 'POV: First-person perspective.',
    PROFILE: 'PROFILE SHOT: Side view of face at 90 degrees.',
    THREE_QUARTER: '3/4 VIEW: Face turned 45 degrees from camera.',
}

function buildCameraInstructions(cameraShot: string, cameraAngle: string | null): string {
    if (cameraShot === 'AUTO' && !cameraAngle) return ''
    let out = `═══════════════════════════════════════════════════════════════\nCAMERA SETTINGS:\n═══════════════════════════════════════════════════════════════`
    if (cameraShot !== 'AUTO') out += `\nFRAMING: ${cameraShot}\n${FRAMING_DESCRIPTIONS[cameraShot] || ''}`
    if (cameraAngle) out += `\nANGLE: ${cameraAngle}\n${ANGLE_DESCRIPTIONS[cameraAngle] || ''}`
    out += `\n⚠️ MANDATORY: The camera framing and angle MUST match these specifications exactly.`
    return out
}

const ROLE_LABEL: Record<RefRole, string> = {
    face: 'FACE_ANCHOR',
    angle: 'ANGLE_SHEET',
    body: 'BODY_SHAPE',
    pose: 'POSE_REF',
    scene: 'STYLE_REF',
    asset: 'ASSET',
}

const ROLE_DESC: Record<RefRole, string> = {
    face: 'IDENTITY SOURCE — copy this exact face, features, bone structure and likeness PRECISELY',
    angle: 'GEOMETRY SOURCE — multiple angles of the same face, for facial consistency',
    body: 'CRITICAL BODY REFERENCE — COPY THIS EXACT SILHOUETTE (waist, hips, bust, curves). MANDATORY',
    pose: 'POSE ONLY REFERENCE — copy ONLY the body position/pose, NOT the face or proportions',
    scene: 'STYLE/SCENE reference — use for setting/composition, REPLACE the subject with [FACE_ANCHOR]',
    asset: 'Item to include',
}

/**
 * Build the full avatar prompt as Gemini does, returned as the two parts it
 * uses. `refRoles` must list the roles in the exact order images are sent.
 */
export function buildAvatarPrompt(opts: AvatarPromptOptions): { systemPreamble: string; finalPrompt: string } {
    const {
        prompt,
        aspectRatio,
        measurements,
        faceDescription = '',
        identityWeight = 85,
        styleWeight = 50,
        cameraShot = 'AUTO',
        cameraAngle = null,
        refRoles,
    } = opts

    const hasBody = refRoles.includes('body')
    const hasPose = refRoles.includes('pose')
    const hasScene = refRoles.includes('scene')
    const hasPoseOrStyle = hasPose || hasScene
    const isHighStyle = styleWeight > 85

    const inlineBody = buildInlineBodyDescription(measurements)
    const bodyAdjectives = getBodyDescriptors(measurements)
    const selectedBodyType = (measurements.bodyType || 'average').toUpperCase()
    const heightLabel = (measurements.height || 165) < 160 ? 'PETITE/SHORT' : (measurements.height || 165) < 170 ? 'AVERAGE HEIGHT' : 'TALL'

    const physicalInstructions = `═══════════════════════════════════════════════════════════════
CHARACTER PHYSICAL SPECIFICATIONS (MANDATORY - CONSISTENCY CRITICAL)
═══════════════════════════════════════════════════════════════

THE CHARACTER MUST BE: ${inlineBody}

BODY TYPE: ${selectedBodyType}
HEIGHT: ${measurements.height || 165}cm (${heightLabel})

BODY TYPE DETAILS:
${bodyAdjectives}
${faceDescription.trim() ? `\nFACIAL FEATURES (HARD CONSTRAINT):\n- ${faceDescription.trim()}` : ''}

⚠️ CRITICAL: These body proportions are NON-NEGOTIABLE and must be CONSISTENT across all generations.`

    const identityInstructions = buildIdentityInstructions(identityWeight, hasPoseOrStyle)

    const systemPreamble = `SYSTEM COMMANDS (HIGHEST PRIORITY):
1. OUTPUT ASPECT RATIO: ${aspectRatio}.
2. MODE: ${isHighStyle && hasScene ? 'VISUAL RECONSTRUCTION' : 'TEXT-TO-IMAGE WITH AVATAR'}.
3. PHOTOREALISM: Output must be 8k, highly detailed.

${physicalInstructions}
${identityInstructions}`

    // Reference mapping (Image N [LABEL]: desc) — matches the order of image_input[].
    const refMapping = refRoles
        .map((role, i) => `- Image ${i + 1} [${ROLE_LABEL[role]}]: ${ROLE_DESC[role]}`)
        .join('\n')

    const enhancedPrompt = `A ${inlineBody}. ${prompt}`

    const bodyBlock = hasBody
        ? `[BODY_SHAPE] IMAGE IS PROVIDED — COPY the EXACT body proportions, silhouette, curves, waist, hips and bust from it.`
        : buildBodySpecification(measurements)

    const poseBlock = hasPose
        ? `╔═══════════════════════════════════════════════════════════════╗
║ POSE REFERENCE: [POSE_REF] — BODY POSITION ONLY                ║
╚═══════════════════════════════════════════════════════════════╝
[POSE_REF] is a FACELESS MANNEQUIN. Copy ONLY its body position, limb positions, posture and gesture.
🚨 FORBIDDEN: do NOT copy the face, facial features, skin tone or proportions from [POSE_REF] — use [FACE_ANCHOR] for the face.`
        : ''

    const cameraInstructions = buildCameraInstructions(cameraShot, cameraAngle)

    const finalPrompt = `═══════════════════════════════════════════════════════════════
⚠️ FIRST PRIORITY: BODY SHAPE SPECIFICATIONS ⚠️
═══════════════════════════════════════════════════════════════
${bodyBlock}

═══════════════════════════════════════════════════════════════
TASK: Generate a photorealistic image of this EXACT character:
═══════════════════════════════════════════════════════════════

"${enhancedPrompt}"

REFERENCE MAPPING:
${refMapping}
${poseBlock}
${cameraInstructions}

RENDERING ORDER (FOLLOW STRICTLY):
1. BODY FIRST: ${hasBody ? 'Clone the body from [BODY_SHAPE] image' : inlineBody}
2. FACE SECOND: Apply face from [FACE_ANCHOR]${faceDescription.trim() ? `: ${faceDescription.trim()}` : ''}
${hasPose ? '3. POSE: Apply EXACT pose from [POSE_REF] (position only, not the face)' : ''}

⛔ FAILURE CONDITIONS (ABSOLUTELY FORBIDDEN):
- Using a face that is NOT from [FACE_ANCHOR] → CRITICAL FAILURE
${hasPose ? '- Copying the face from [POSE_REF] → CRITICAL FAILURE' : ''}
- Average/slim body when curvy is specified, or ignoring the body proportions → WRONG

✅ SUCCESS CRITERIA:
- Face is IDENTICAL to [FACE_ANCHOR] (same person)
- Body proportions match ${hasBody ? '[BODY_SHAPE] reference' : 'the specifications above'}
${hasPose ? '- Pose matches [POSE_REF] (position only, not the person)' : ''}`

    return { systemPreamble, finalPrompt }
}
