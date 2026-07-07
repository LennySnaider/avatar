import type { PhysicalMeasurements } from '@/@types/supabase'
import { getBodyDescriptors, getSkinToneDescription, getHairColorDescription } from '@/utils/bodyDescriptors'

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

export type RefRole = 'face' | 'angle' | 'body' | 'pose' | 'scene' | 'clone' | 'asset'

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
export function buildLeanIdentityPrompt(
    prompt: string,
    refRoles: RefRole[],
    // True when a REAL avatar face image is sent as a second reference
    // (gpt-image-2 = [clone, face]). False for single-input edits (Flux
    // Kontext = [clone] only) where the avatar face rides ONLY on the [FACE:]
    // text. ANY caller hitting the scene-first branch with a text-only face
    // MUST pass false — the default (true) emits an "Image 2 is the FACE" note
    // that misleads the model when no second image exists.
    faceIsImage = true,
): string {
    if (!refRoles.includes('face')) return prompt
    let note: string
    if (refRoles[0] === 'scene') {
        // Scene/Clone FIRST as the canvas, face SECOND as the swap source — a
        // face-swap EDIT. ADOPT the avatar face, DISCARD the face already in
        // Image 1, forbid any blend/average (gpt-image otherwise hybridizes the
        // two — losing distinctive features like green eyes/freckles).
        if (faceIsImage) {
            // gpt-image-2: real Image 2 face, ~no prompt-length limit. Verbose,
            // validated: ADOPT Image 2 100% + relight + preserve-skin + hands.
            const tail = `Match the new face's lighting, shadows and color temperature to Image 1's so the face integrates photorealistically and does NOT look pasted on or composited. For the new face only: re-light it with Image 1's own light (same direction, angle, intensity, contrast and warm/cool color temperature) and cast the scene's natural shadows onto the face where they fall, matching the existing shadow direction and softness — no studio-added or extra lighting. Blend the edges seamlessly at the hairline, ears, jawline and neck with a soft feathered transition — no visible seam, hard edge, outline, halo or fringe. Preserve the new face's OWN skin tone, undertone and complexion from Image 2 exactly as it is — do NOT re-tone, re-pigment or color-shift the face to match the body in Image 1; only match the scene's LIGHT on it (exposure, brightness, contrast and warm/cool color temperature), never the body's skin color. Then carry the face's own complexion down through the jaw and neck transition so the harmonized seam reads as one continuous surface — resolve any tone mismatch toward the SUBJECT's face color, not the body's, with no hard break at the jaw. Give the face the same film grain, noise, sharpness, focus and depth-of-field as the rest of Image 1 — not cleaner or sharper than the photo it sits in. The result must read as one single photograph taken in one shot with one camera, not a face stickered or overlaid onto another photo. Keep natural matte skin with realistic texture and pores, NOT over-exposed, smoothed or plastic-looking. Render hands anatomically correct with five natural fingers and natural skin color.`
            const opening = `Image 1 is the photo to recreate: keep its EXACT pose, outfit, body shape, framing, lighting and setting — but the FACE of the person in Image 1 is the WRONG identity and must be entirely replaced. Take the face and head identity ENTIRELY from Image 2. Completely DISCARD and ERASE Image 1's original face: do NOT keep, blend, average, mix, merge or interpolate ANY of its facial features (eyes, eyebrows, nose, lips, cheekbones, jaw, face shape, freckles, moles or skin marks). The output face must be 100% the person in Image 2 and 0% the person originally in Image 1 — recognizably the SAME individual as Image 2, never a hybrid of the two. Copy Image 2's defining features EXACTLY: the exact eye shape AND eye color (e.g. green, hazel, blue — match the precise hue), the eyebrow shape, every freckle, mole or beauty mark, the skin texture, and the overall face shape. If Image 1's original face had different eyes, brows, marks or face shape, OVERRIDE them with Image 2's. Replace ONLY the face/head; keep everything else in Image 1 identical.`
            note = `${opening} ${tail}`
        } else {
            // Flux Kontext: KIE HARD-CAPS the prompt at 3000 chars (422 otherwise)
            // AND Flux prefers concise edit instructions. COMPACT note; identity
            // rides on the [FACE:] description that follows (no Image 2 exists).
            note = `Recreate this photograph EXACTLY: keep the same pose, body, outfit, hands, held objects, framing, background, scene and lighting. Change ONLY the face and head. The face currently in the photo is the WRONG person — DISCARD it entirely and do NOT keep any of its features. Replace it with a face matching the [FACE:] description below PRECISELY: the exact eye shape and eye color, eyebrows, freckles or marks, face shape, nose and lips. Re-light the new face to the photo's own light and keep its own natural skin tone, blending the jaw and neck seam with no hard edge. Photorealistic, natural matte skin with real pores (not plastic or over-smoothed); hands with five natural fingers.`
        }
    } else if (refRoles.includes('scene')) {
        note = 'You are given two reference images. Image 1 is the FACE — keep this exact face, features and likeness. Image 2 is the SCENE — replicate its pose, outfit, body shape, framing and setting EXACTLY, but with the face and identity from Image 1.'
    } else if (refRoles.length > 1) {
        note = 'Use the attached reference images as the subject: keep the exact same face, facial features and likeness as the person shown, and match their body proportions.'
    } else {
        note = 'Keep the exact same face, facial features and likeness as the person in the attached reference image.'
    }
    return `Photorealistic editorial photograph. ${note}\n\n${prompt}`
}

/**
 * For gpt-image-2 face-swap (image-to-image) the reference IMAGE is the sole
 * source of truth for body, pose, scene, framing and held/worn objects. The
 * Gemini text-to-image harness FIGHTS that: the `[BODY:]` cm measurements
 * re-impose the avatar's configured shape over the photo's real body (distorted
 * legs/proportions), and the auto `[CLONE:]` scene re-description is both
 * INCOMPLETE (it never detected the phone/necklace, so re-describing the scene
 * without them tells the model to drop them) and CONTRADICTORY ("medium shot"
 * reframes to waist-up, cutting the feet). OpenAI's own GPT Image edit guidance
 * is "change only X, keep everything else identical" — do NOT re-describe the
 * scene. So strip `[BODY:]` and `[CLONE:]`, keep `[FACE:]` (the swap target) and
 * the user's typed text, then append a GENERIC, subject-agnostic preserve list.
 * The list is deliberately generic — naming a specific object (e.g. "the phone")
 * would make the model HALLUCINATE it on clones that don't have one.
 */
export function stripHarnessForFaceSwap(fullPrompt: string): string {
    const cleaned = fullPrompt
        .replace(/\[BODY:[^\]]*\]/gi, '')
        .replace(/\[CLONE:[^\]]*\]/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
    const preserve =
        'Keep everything else from Image 1 exactly as-is: the full body including legs and feet, the exact pose and body proportions, any object held in the hands, any necklace or jewelry, the clothing, and the original camera framing and angle. Do not crop or re-frame the image. Change ONLY the face/head (and blend it into the scene as instructed above).'
    return cleaned ? `${cleaned}\n\n${preserve}` : preserve
}

// Skin-tone and hair-color descriptors now live in bodyDescriptors (imported
// at the top of this file) so this path and the direct-Gemini path stay in sync.

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
${hasPoseOrStyle ? `- [POSE_REF], [STYLE_REF] and [CLONE_REF] are ONLY for pose/style/scene - IGNORE their faces completely
- Treat [POSE_REF]/[STYLE_REF]/[CLONE_REF] as faceless mannequins with NO identity` : ''}

IDENTITY CHECKLIST (ALL MUST BE TRUE):
✓ Eye shape, nose, lips, jawline, skin tone and ethnicity match [FACE_ANCHOR]
✓ Overall face is the SAME PERSON as [FACE_ANCHOR]`
    }
    if (identityWeight > 50) {
        return `═══════════════════════════════════════════════════════════════
FACE IDENTITY: HIGH CONSISTENCY (Identity Weight: ${identityWeight}%)
═══════════════════════════════════════════════════════════════
- Use [FACE_ANCHOR] as the PRIMARY face reference
- The character must be clearly recognizable as the person in [FACE_ANCHOR]
${hasPoseOrStyle ? `- Do NOT copy faces from [POSE_REF], [STYLE_REF] or [CLONE_REF]; those are for pose/style/scene only` : ''}`
    }
    // Flexible (<=50): the slider's third zone — use the avatar as loose guidance,
    // prioritize scene/style over an exact-likeness lock. Maps the UI's "Flexible"
    // label (ReferencePanel / AvatarCreator) to actual prompt behavior.
    return `═══════════════════════════════════════════════════════════════
FACE IDENTITY: FLEXIBLE (Identity Weight: ${identityWeight}%)
═══════════════════════════════════════════════════════════════
- Use [FACE_ANCHOR] as loose inspiration and guidance for the face, NOT a strict template
- A general family resemblance to [FACE_ANCHOR] is enough — allow natural variation in features and expression
- Prioritize the scene, mood and style over exact likeness; the face does NOT need to be an exact match
${hasPoseOrStyle ? `- Do NOT copy faces from [POSE_REF], [STYLE_REF] or [CLONE_REF]; those are for pose/style/scene only` : ''}`
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
    clone: 'CLONE_REF',
    asset: 'ASSET',
}

const ROLE_DESC: Record<RefRole, string> = {
    face: 'IDENTITY SOURCE — copy this exact face, features, bone structure and likeness PRECISELY',
    angle: 'GEOMETRY SOURCE — multiple angles of the same face, for facial consistency',
    body: 'CRITICAL BODY REFERENCE — COPY THIS EXACT SILHOUETTE (waist, hips, bust, curves). MANDATORY',
    pose: 'POSE ONLY REFERENCE — copy ONLY the body position/pose, NOT the face or proportions',
    scene: 'STYLE/SCENE reference — use for setting/composition, REPLACE the subject with [FACE_ANCHOR]',
    clone: 'CLONE SOURCE — copy the EXACT pose, body position, outfit, hands, any object held (e.g. a phone), framing, camera angle, lighting and setting from this image. The person shown is a FACELESS MANNEQUIN — IGNORE their face/identity. Take the face ONLY from [FACE_ANCHOR].',
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
    const hasClone = refRoles.includes('clone')
    const hasPoseOrStyle = hasPose || hasScene || hasClone
    const isHighStyle = styleWeight > 85

    const inlineBody = buildInlineBodyDescription(measurements)
    const bodyAdjectives = getBodyDescriptors(measurements)

    // A UI-set hair color must beat the reference images / face description,
    // which otherwise show the original color and win by default (identity
    // bleed). Highest-priority override, injected last; keeps face identity.
    const hairColorSpecDesc = getHairColorDescription(measurements.hairColor)
    const hairColorOverride = hairColorSpecDesc ? `
╔═══════════════════════════════════════════════════════════════╗
║  🎨 HAIR COLOR OVERRIDE — HIGHEST PRIORITY (READ LAST)         ║
╚═══════════════════════════════════════════════════════════════╝
The reference images and any hair color written in the facial description may
show a DIFFERENT hair color. That is intentional — you MUST RECOLOR the hair.
→ The character's hair (head hair AND eyebrows) MUST be: ${hairColorSpecDesc.toUpperCase()}
→ This OVERRIDES any hair color visible in the reference images or written in
  the description. Do NOT keep the reference hair color.
→ Change ONLY the hair COLOR. Keep the exact face identity, bone structure,
  hairstyle, length and texture from the references.` : ''
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
${faceDescription.trim() ? `\nFACIAL FEATURES (HARD CONSTRAINT):\n- ${faceDescription.trim()}${hairColorSpecDesc ? '\n⚠️ Ignore any HAIR COLOR mentioned above — it is overridden by the HAIR COLOR OVERRIDE section.' : ''}` : ''}

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

    const cloneBlock = hasClone
        ? `╔═══════════════════════════════════════════════════════════════╗
║ CLONE REFERENCE: [CLONE_REF] — RECREATE THIS PHOTO            ║
╚═══════════════════════════════════════════════════════════════╝
[CLONE_REF] is the photo to recreate. Copy its EXACT pose, body position, limb/hand placement, any object held in the hands (e.g. a phone), the clothing/outfit, the framing, camera angle, lighting and the full scene/background.${hasPose ? '\n[CLONE_REF] is the PRIMARY source for the pose; treat [POSE_REF] as secondary.' : ''}
🚨 FORBIDDEN: the person in [CLONE_REF] is a FACELESS MANNEQUIN — do NOT copy their face, facial features, skin tone, hair or identity. Take the face and identity ONLY from [FACE_ANCHOR]. Replace the mannequin's head/face with [FACE_ANCHOR]; keep EVERYTHING else in [CLONE_REF] identical.`
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
${cloneBlock}
${cameraInstructions}

RENDERING ORDER (FOLLOW STRICTLY):
1. BODY FIRST: ${hasBody ? 'Clone the body from [BODY_SHAPE] image' : inlineBody}
2. FACE SECOND: Apply face from [FACE_ANCHOR]${faceDescription.trim() ? `: ${faceDescription.trim()}` : ''}
${hasPose ? '3. POSE: Apply EXACT pose from [POSE_REF] (position only, not the face)' : ''}
${hasClone ? `${hasPose ? '4' : '3'}. CLONE: Replicate the EXACT pose, outfit, hands, held objects, framing, lighting and scene from [CLONE_REF] — keep everything except the face identical to [CLONE_REF]` : ''}

⛔ FAILURE CONDITIONS (ABSOLUTELY FORBIDDEN):
- Using a face that is NOT from [FACE_ANCHOR] → CRITICAL FAILURE
${hasPose ? '- Copying the face from [POSE_REF] → CRITICAL FAILURE' : ''}
${hasClone ? '- Copying the face from [CLONE_REF] (it is a faceless mannequin) → CRITICAL FAILURE\n- Substituting a generic pose instead of the EXACT pose/scene in [CLONE_REF] → FAILURE' : ''}
- Average/slim body when curvy is specified, or ignoring the body proportions → WRONG

✅ SUCCESS CRITERIA:
- Face is IDENTICAL to [FACE_ANCHOR] (same person)
- Body proportions match ${hasBody ? '[BODY_SHAPE] reference' : 'the specifications above'}
${hasPose ? '- Pose matches [POSE_REF] (position only, not the person)' : ''}
${hasClone ? '- Pose, outfit, held objects, framing and scene match [CLONE_REF] exactly; only the face is from [FACE_ANCHOR]' : ''}
${hairColorSpecDesc ? `- Hair color is ${hairColorSpecDesc} (RECOLORED from the reference, NOT the reference's color)` : ''}
${hairColorOverride}`

    return { systemPreamble, finalPrompt }
}
