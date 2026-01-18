'use server'

import { GoogleGenAI, Type } from '@google/genai'
import type { PhysicalMeasurements, AspectRatio } from '@/@types/supabase'
import { filterKnownSafeCorrections } from '@/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_constants/knownSafeWords'

// Types for the service
export interface ImageData {
    base64: string
    mimeType: string
}

export interface ReferenceImage extends ImageData {
    id: string
    url: string
}

export interface PromptAnalysisResult {
    isSafe: boolean
    corrections: { term: string; alternatives: string[] }[]
    optimizedPrompt: string
    reason: string
}

export type VideoResolution = '480p' | '720p' | '1080p'
export type CameraMotion = 'NONE' | 'PUSH_IN' | 'PULL_OUT' | 'PAN_LEFT' | 'PAN_RIGHT' | 'TILT_UP' | 'TILT_DOWN' | 'ORBIT_LEFT' | 'ORBIT_RIGHT'
export type SubjectAction = 'NONE' | 'WALKING' | 'RUNNING' | 'DANCING' | 'TALKING' | 'GESTURING' | 'SITTING' | 'STANDING'
export type CameraShot =
    | 'AUTO' | 'EXTREME_CLOSE_UP' | 'CLOSE_UP' | 'MEDIUM_CLOSE_UP' | 'MEDIUM_SHOT' | 'MEDIUM_FULL' | 'FULL_SHOT' | 'WIDE_SHOT' | 'EXTREME_WIDE'
    | 'LOW_ANGLE' | 'HIGH_ANGLE' | 'DUTCH_ANGLE' | 'BIRDS_EYE' | 'WORMS_EYE' | 'OVER_SHOULDER' | 'POV' | 'PROFILE' | 'THREE_QUARTER'

// Get API Key from environment
const getApiKey = (): string => {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not configured in environment variables')
    }
    return apiKey
}

// Helper to convert skin tone number (1-9) to descriptive text
const getSkinToneDescription = (skinTone?: number): string => {
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

// Helper to convert hair color to descriptive text
const getHairColorDescription = (hairColor?: string): string => {
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
    }

    return descriptions[hairColor] || hairColor.replace('-', ' ') + ' hair'
}

// Helper to translate measurements to professional fashion/modeling body descriptors
// Uses safe terminology that won't trigger content filters
const getBodyDescriptors = (m: PhysicalMeasurements): string => {
    const descriptors: string[] = []
    const hipWaistRatio = m.hips / m.waist
    const bustWaistRatio = m.bust / m.waist

    // Upper torso proportions (fashion terminology)
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

    // Lower body proportions (fashion terminology)
    if (m.hips >= 100) {
        descriptors.push('wide lower frame', 'generous hip width', 'full lower silhouette')
    } else if (m.hips >= 92) {
        descriptors.push('proportionate hips', 'balanced lower body')
    } else if (m.hips <= 85) {
        descriptors.push('narrow hip width', 'slim lower frame')
    }

    // Overall figure type (standard fashion industry terms)
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

// Clean base64 data by removing data URI prefix if present
const cleanBase64Data = (base64: string): string => {
    // Check if base64 is provided
    if (!base64) {
        throw new Error('Invalid base64 image data: base64 string is null or undefined. Make sure the image was loaded correctly.')
    }

    // Remove data URI prefix if present (e.g., "data:image/jpeg;base64,")
    const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64

    // Validate that the remaining string is not empty
    if (!cleanBase64 || cleanBase64.trim() === '') {
        throw new Error('Invalid base64 image data: empty after cleaning. The image may not have been loaded from storage.')
    }

    return cleanBase64
}

// Supported MIME types for Gemini API
const GEMINI_SUPPORTED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
]

// Extract MIME type from base64 data URI
const getMimeTypeFromBase64 = (base64: string): string => {
    if (base64.startsWith('data:')) {
        const match = base64.match(/^data:([^;]+);base64,/)
        if (match) {
            return match[1]
        }
    }
    return 'image/jpeg' // Default fallback
}

// Convert unsupported image formats (like AVIF) to JPEG using canvas
const convertToSupportedFormat = async (
    base64: string,
    targetFormat: 'image/jpeg' | 'image/png' = 'image/jpeg'
): Promise<{ data: string; mimeType: string }> => {
    const mimeType = getMimeTypeFromBase64(base64)

    // If already supported, just return cleaned data
    if (GEMINI_SUPPORTED_MIME_TYPES.includes(mimeType)) {
        return {
            data: cleanBase64Data(base64),
            mimeType: mimeType,
        }
    }

    // For unsupported formats (like AVIF), convert using canvas
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'

        img.onload = () => {
            const canvas = document.createElement('canvas')
            canvas.width = img.naturalWidth
            canvas.height = img.naturalHeight

            const ctx = canvas.getContext('2d')
            if (!ctx) {
                reject(new Error('Failed to get canvas context'))
                return
            }

            ctx.drawImage(img, 0, 0)

            // Convert to target format
            const convertedDataUrl = canvas.toDataURL(targetFormat, 0.95)
            const convertedData = convertedDataUrl.split(',')[1]

            resolve({
                data: convertedData,
                mimeType: targetFormat,
            })
        }

        img.onerror = () => {
            reject(new Error(`Failed to load image for conversion from ${mimeType}`))
        }

        // Set source - ensure it has data URI prefix
        img.src = base64.startsWith('data:') ? base64 : `data:${mimeType};base64,${base64}`
    })
}

// Clean and validate base64 image data for API
const resizeBase64Image = async (base64: string): Promise<string> => {
    return cleanBase64Data(base64)
}

// =============================================
// PROMPT ENHANCEMENT
// =============================================

export async function enhancePrompt(
    currentPrompt: string,
    contextImage: ImageData | null = null
): Promise<string> {
    const apiKey = getApiKey()
    const ai = new GoogleGenAI({ apiKey })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parts: any[] = []

    if (contextImage) {
        parts.push({
            inlineData: {
                mimeType: contextImage.mimeType,
                data: cleanBase64Data(contextImage.base64),
            },
        })
    }

    const instructions = `
    You are an expert Prompt Engineer for High-End AI Image/Video Generation models.

    YOUR TASK:
    Rewrite the user's short prompt into a "Premium", highly detailed, cinematic prompt.

    GUIDELINES:
    1. VISUALS: Describe lighting (e.g., golden hour, cinematic), camera angles, and texture.
    2. ACTION: Expand on the movement described. Make it natural and fluid.
    3. CONTEXT: If an image is provided, use it to describe the SUBJECT and SETTING strictly.
    4. SAFETY: Ensure the prompt is safe (SFW) and avoids controversial terms.
    5. LENGTH: The output should be 2-4 sentences long.

    User's Raw Input: "${currentPrompt}"

    Output ONLY the enhanced prompt string. No intro, no quotes.
  `

    parts.push({ text: instructions })

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts },
        })
        return response.text?.trim() || currentPrompt
    } catch (e) {
        console.error('Magic Prompt Failed', e)
        return currentPrompt
    }
}

// =============================================
// IMAGE DESCRIPTION
// =============================================

export async function describeImageForPrompt(image: ReferenceImage): Promise<string> {
    const apiKey = getApiKey()
    const ai = new GoogleGenAI({ apiKey })

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    {
                        inlineData: {
                            mimeType: image.mimeType,
                            data: cleanBase64Data(image.base64),
                        },
                    },
                    {
                        text: `Describe this image in detail to be used as an AI image generation prompt.

FOCUS ON:
- Clothing and accessories in detail
- Setting and background
- Lighting and atmosphere
- Artistic style and color palette
- Composition and framing
- Hair STYLE (not color) - describe length, texture, styling

DO NOT DESCRIBE (CRITICAL - THESE ARE PROVIDED BY AVATAR SETTINGS):
- Body pose or position (standing, sitting, arm positions, etc.)
- Body orientation or angles
- Gestures or movements
- SKIN TONE / SKIN COLOR / COMPLEXION - do not mention fair, tan, dark, pale, olive, etc.
- HAIR COLOR - do not mention blonde, brunette, black, red, brown, etc.
- Face shape or facial features
- Body type, measurements, or proportions
- Age or ethnicity

The avatar's physical characteristics (skin tone, hair color, body type, face) are configured separately.
Only describe: outfit, setting, lighting, mood, composition.

Keep it concise, descriptive, and high-quality. Output only the description, no explanations.`,
                    },
                ],
            },
        })
        return response.text || ''
    } catch (e) {
        console.error('Image Description Failed', e)
        throw new Error('Failed to describe image.')
    }
}

// =============================================
// SAFETY ANALYSIS
// =============================================

export async function analyzePromptSafety(userPrompt: string): Promise<PromptAnalysisResult> {
    const apiKey = getApiKey()
    const ai = new GoogleGenAI({ apiKey })

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `You are a strict content safety analyzer for AI image generation. Analyze this prompt for Gemini Image Generation safety compliance.

## STRICT POLICY - Flag ANY of these:

### CLOTHING & BODY (HIGH RISK)
- Revealing clothing descriptions: bralette, crop top, lingerie, bikini, swimsuit, bodysuit, corset, bustier, tube top, halter, backless, strapless, low-cut, plunging neckline, mini skirt, short shorts, hot pants, form-fitting, tight-fitting, body-hugging, skin-tight, sheer, see-through, mesh, lace trim, spaghetti strap, off-shoulder
- Body emphasis: cleavage, curves, bust, hips emphasis, waist emphasis, legs emphasis, thighs, midriff, bare skin, exposed, accentuating, highlighting physique, toned physique, shapely, voluptuous
- Poses: seductive, provocative, sensual, alluring, sultry, bedroom eyes, come-hither, lying down, reclining suggestively

### EXPLICIT TERMS (BLOCK)
- Any nudity references: nude, naked, topless, bottomless, bare chest, undressed
- Sexual terms: sexy, hot, erotic, intimate, passionate embrace, kissing, making out
- Adult content: NSFW, adult, mature content, explicit

### OTHER RESTRICTIONS
- Real celebrities/public figures by name
- Violence: blood, gore, weapons aimed at people, injury
- Minors in any suggestive context
- Hate symbols or offensive content

## PROMPT TO ANALYZE:
"${userPrompt}"

## YOUR TASK:
1. Be STRICT - flag anything that MIGHT trigger Gemini's image safety filters
2. For each risky term, provide 3 SAFE alternatives that convey similar meaning without risk
3. Provide a fully rewritten "optimizedPrompt" that is guaranteed to pass safety filters
4. If the prompt is about fashion/modeling, suggest elegant/professional alternatives

BE CONSERVATIVE - it's better to flag something safe than miss something risky.
`,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        isSafe: { type: Type.BOOLEAN },
                        corrections: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    term: { type: Type.STRING },
                                    alternatives: { type: Type.ARRAY, items: { type: Type.STRING } },
                                },
                            },
                        },
                        optimizedPrompt: { type: Type.STRING },
                        reason: { type: Type.STRING },
                    },
                },
            },
        })

        const text = response.text
        if (!text) throw new Error('Empty analysis response')

        const result = JSON.parse(text) as PromptAnalysisResult

        // Filter out known safe words from corrections
        const filteredCorrections = filterKnownSafeCorrections(result.corrections)

        return {
            ...result,
            corrections: filteredCorrections,
            // If all corrections were filtered out, mark as safe
            isSafe: filteredCorrections.length === 0 ? true : result.isSafe,
        }
    } catch (e) {
        console.error('Safety Analysis Failed', e)
        return {
            isSafe: true,
            corrections: [],
            optimizedPrompt: userPrompt,
            reason: 'Analysis service unavailable',
        }
    }
}

// =============================================
// FACE ANALYSIS
// =============================================

export async function analyzeFaceFromImages(images: { base64: string; mimeType: string }[]): Promise<string> {
    const apiKey = getApiKey()
    if (images.length === 0) return ''

    const ai = new GoogleGenAI({ apiKey })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parts: any[] = []

    images.slice(0, 3).forEach((img) => {
        parts.push({
            inlineData: {
                mimeType: img.mimeType,
                data: cleanBase64Data(img.base64),
            },
        })
    })

    parts.push({
        text: `Analyze these images and describe ONLY the permanent physical facial features.

    CRITICAL DETAILS TO EXTRACT:
    1. Eye shape and exact color.
    2. Eyebrow shape and thickness.
    3. Nose shape (bridge, tip).
    4. Lip shape (upper/lower fullness).
    5. Jawline definition and chin shape.
    6. Distinctive marks (freckles, moles, scars, dimples).

    Output as a concise, comma-separated descriptive string.`,
    })

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts },
        })

        const text = response.text?.trim()
        if (!text) {
            throw new Error('No face description generated from the analysis')
        }

        return text
    } catch (e) {
        console.error('Face Analysis Failed', e)
        throw e instanceof Error ? e : new Error('Face analysis failed')
    }
}

// =============================================
// POSE ANALYSIS
// =============================================

export async function analyzePoseFromImage(image: { base64: string; mimeType: string }): Promise<string> {
    const apiKey = getApiKey()
    const ai = new GoogleGenAI({ apiKey })

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    {
                        inlineData: {
                            mimeType: image.mimeType,
                            data: cleanBase64Data(image.base64),
                        },
                    },
                    {
                        text: `Analyze this image and describe ONLY the body pose/position in precise detail.

FOCUS ON:
1. Overall body orientation (standing, sitting, lying, kneeling, crouching)
2. Head position and tilt (looking up, down, left, right, straight)
3. Arm positions (raised, lowered, crossed, extended, hands placement)
4. Leg positions (together, apart, crossed, bent, straight)
5. Body angle (frontal, profile, three-quarter, back view)
6. Weight distribution and posture (relaxed, tense, dynamic, static)
7. Any specific gestures or hand positions

DO NOT DESCRIBE:
- The person's face or identity
- Clothing details
- Background or setting
- Physical appearance or body type

Output a CONCISE, comma-separated description of the pose that can be used in an image generation prompt.
Example: "standing pose, weight on left leg, right hand on hip, left arm relaxed at side, head tilted slightly right, looking at camera, three-quarter body angle, relaxed confident posture"`,
                    },
                ],
            },
        })

        const text = response.text?.trim()
        if (!text) {
            throw new Error('No pose description generated from the analysis')
        }

        return text
    } catch (e) {
        console.error('Pose Analysis Failed', e)
        throw e instanceof Error ? e : new Error('Pose analysis failed')
    }
}

// =============================================
// CLONE IMAGE ANALYSIS
// =============================================

/**
 * Analyzes an image to extract everything EXCEPT face and body type
 * (those come from the avatar). Used for "Clone Ref" feature.
 */
export async function analyzeImageForClone(image: { base64: string; mimeType: string }): Promise<string> {
    const apiKey = getApiKey()
    const ai = new GoogleGenAI({ apiKey })

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    {
                        inlineData: {
                            mimeType: image.mimeType,
                            data: cleanBase64Data(image.base64),
                        },
                    },
                    {
                        text: `Analyze this image and describe EVERYTHING needed to recreate it, EXCEPT the person's face and body type.

DESCRIBE IN DETAIL:
1. CLOTHING & ACCESSORIES
   - Exact outfit description (style, fit, fabric, patterns)
   - All accessories (jewelry, bags, hats, glasses, etc.)
   - Footwear
   - Hair style and color

2. POSE & POSITION
   - Body orientation and angle
   - Arm and hand positions
   - Leg positions
   - Head tilt and gaze direction
   - Overall posture (relaxed, dynamic, elegant, etc.)

3. SETTING & BACKGROUND
   - Location/environment (studio, outdoor, indoor, etc.)
   - Background elements and colors
   - Props or objects in scene

4. LIGHTING & ATMOSPHERE
   - Light direction and quality (soft, hard, dramatic, etc.)
   - Color temperature (warm, cool, neutral)
   - Shadows and highlights
   - Overall mood/atmosphere

5. COMPOSITION & FRAMING
   - Camera angle (eye level, low angle, high angle)
   - Shot type (full body, 3/4, portrait)
   - Subject placement in frame

6. ARTISTIC STYLE
   - Photography style (fashion, editorial, casual, etc.)
   - Color palette and grading
   - Overall aesthetic

DO NOT DESCRIBE (CRITICAL - THESE COME FROM AVATAR SETTINGS):
- The person's face or facial features
- Body measurements or body type (thin, curvy, muscular, etc.)
- Age appearance
- SKIN TONE / SKIN COLOR / COMPLEXION (fair, tan, dark, pale, olive, etc.)
- HAIR COLOR (blonde, brunette, black, red, etc.)
- Any ethnicity-related appearance features

These properties (skin tone, hair color, face, body type) will be provided by the avatar configuration.
Only describe clothing, pose, setting, lighting - NOT the person's inherent physical characteristics.

Output a detailed, comma-separated description that can be used to recreate this exact image with a DIFFERENT person.
Be specific and thorough - this description should capture the essence of the image.`,
                    },
                ],
            },
        })

        const text = response.text?.trim()
        if (!text) {
            throw new Error('No clone description generated from the analysis')
        }

        return text
    } catch (e) {
        console.error('Clone Analysis Failed', e)
        throw e instanceof Error ? e : new Error('Clone analysis failed')
    }
}

/**
 * Analyzes an image to extract place/scene/location description
 * This is used for Place Ref to set the environment where the avatar will be placed
 */
export async function analyzeImageForPlace(image: { base64: string; mimeType: string }): Promise<string> {
    const apiKey = getApiKey()
    const ai = new GoogleGenAI({ apiKey })

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    {
                        inlineData: {
                            mimeType: image.mimeType,
                            data: cleanBase64Data(image.base64),
                        },
                    },
                    {
                        text: `Analyze this image and describe ONLY the place/location/scene/environment.
Focus on describing the setting so that a person can be placed in this exact environment.

DESCRIBE IN DETAIL:

1. LOCATION TYPE
   - Indoor/outdoor
   - Type of place (beach, cafe, studio, street, forest, office, etc.)
   - Geographic feel (tropical, urban, rural, etc.)

2. ENVIRONMENT ELEMENTS
   - Architecture or natural features
   - Furniture, objects, decorations
   - Ground/floor type
   - Background elements (buildings, trees, sky, etc.)

3. LIGHTING CONDITIONS
   - Time of day (golden hour, midday, night, etc.)
   - Natural or artificial light
   - Light direction and quality
   - Shadows and highlights

4. ATMOSPHERE & MOOD
   - Color palette and tones
   - Weather conditions if applicable
   - Overall feeling (cozy, dramatic, elegant, casual, etc.)

5. DEPTH & PERSPECTIVE
   - Foreground, middle ground, background elements
   - Depth of field characteristics

DO NOT DESCRIBE:
- Any people in the image
- Faces, bodies, or clothing
- Personal accessories or items worn

Output a concise, comma-separated description of the location/scene that can be used to place a different person in this environment.
Focus on the atmosphere, setting, and visual elements that define this place.`,
                    },
                ],
            },
        })

        const text = response.text?.trim()
        if (!text) {
            throw new Error('No place description generated from the analysis')
        }

        return text
    } catch (e) {
        console.error('Place Analysis Failed', e)
        throw e instanceof Error ? e : new Error('Place analysis failed')
    }
}

// =============================================
// IMAGE GENERATION
// =============================================

export async function generateAvatar(params: {
    prompt: string
    avatarReferences: ImageData[]
    assetReferences: ImageData[]
    sceneReference: ImageData | null
    faceRefImage: ImageData | null
    bodyRefImage: ImageData | null
    angleRefImage: ImageData | null
    poseRefImage: ImageData | null
    aspectRatio: AspectRatio
    cameraShot?: CameraShot // Framing (close-up, medium, full, etc.)
    cameraAngle?: CameraShot | null // Angle (low, high, dutch, etc.)
    identityWeight?: number
    styleWeight?: number
    measurements?: PhysicalMeasurements
    faceDescription?: string
    modelName?: string
}): Promise<{ url: string; fullApiPrompt: string }> {
    const {
        prompt,
        avatarReferences,
        assetReferences,
        sceneReference,
        faceRefImage,
        bodyRefImage,
        angleRefImage,
        poseRefImage,
        aspectRatio,
        cameraShot = 'AUTO',
        cameraAngle = null,
        identityWeight = 85,
        styleWeight = 50,
        measurements = { age: 25, height: 165, bodyType: 'average' as const, bust: 90, waist: 60, hips: 90 },
        faceDescription = '',
        modelName = 'gemini-3-pro-image-preview',
    } = params

    const apiKey = getApiKey()
    const ai = new GoogleGenAI({ apiKey })

    // Auto-generate face description if not provided
    let activeFaceDescription = faceDescription
    if (!activeFaceDescription && (faceRefImage || avatarReferences.length > 0)) {
        try {
            const sourceForAnalysis = faceRefImage ? [faceRefImage] : [avatarReferences[0]]
            activeFaceDescription = await analyzeFaceFromImages(sourceForAnalysis)
        } catch {
            console.warn('Auto-face analysis failed')
        }
    }

    const isHighStyleWeight = styleWeight > 85

    // Build identity instructions - ALWAYS prioritize avatar identity
    const hasPoseOrStyle = poseRefImage !== null || sceneReference !== null
    let identityInstructions = ''

    if (identityWeight > 85) {
        identityInstructions = `
    ╔═══════════════════════════════════════════════════════════════╗
    ║ 🚨🚨🚨 FACE IDENTITY: ABSOLUTE PRIORITY - DEEPFAKE MODE 🚨🚨🚨  ║
    ╚═══════════════════════════════════════════════════════════════╝

    THIS IS A FACE SWAP / DEEPFAKE OPERATION:
    - [FACE_ANCHOR] is the ONLY source for the face. NO EXCEPTIONS.
    - Copy EXACT facial features: eye shape, nose structure, lips, jawline, skin tone, ethnicity
    - The face MUST be 100% recognizable as the same person in [FACE_ANCHOR]
    - This is like replacing a face in a photo - the face comes ONLY from [FACE_ANCHOR]

    ${hasPoseOrStyle ? `
    ⛔⛔⛔ CRITICAL WARNING - OTHER IMAGES PRESENT ⛔⛔⛔
    - [POSE_REF] and [STYLE_REF] are ONLY for pose/style - IGNORE their faces completely
    - If you see a face in [POSE_REF] or [STYLE_REF], DELETE it mentally
    - Think of [POSE_REF]/[STYLE_REF] as faceless mannequins - they have NO identity
    - The ONLY face that exists for this task is [FACE_ANCHOR]
    - Even if [STYLE_REF] has a beautiful face, DO NOT USE IT - use [FACE_ANCHOR]
    ` : ''}

    IDENTITY CHECKLIST (ALL MUST BE TRUE):
    ✓ Eye shape matches [FACE_ANCHOR]
    ✓ Nose matches [FACE_ANCHOR]
    ✓ Lips match [FACE_ANCHOR]
    ✓ Jawline matches [FACE_ANCHOR]
    ✓ Skin tone matches [FACE_ANCHOR]
    ✓ Ethnicity matches [FACE_ANCHOR]
    ✓ Overall face is SAME PERSON as [FACE_ANCHOR]
    `
    } else {
        identityInstructions = `
    ═══════════════════════════════════════════════════════════════
    FACE IDENTITY: HIGH CONSISTENCY (Identity Weight: ${identityWeight}%)
    ═══════════════════════════════════════════════════════════════
    - Use [FACE_ANCHOR] as the PRIMARY face reference
    - The character must be clearly recognizable as the person in [FACE_ANCHOR]
    ${hasPoseOrStyle ? `
    ⛔ WARNING: [POSE_REF] and [STYLE_REF] contain OTHER people's faces
    - Do NOT copy faces from [POSE_REF] or [STYLE_REF]
    - Those images are for pose/style ONLY, their faces are irrelevant
    ` : ''}
    `
    }

    // Build physical instructions using professional fashion/modeling terminology
    const bodyAdjectives = getBodyDescriptors(measurements)
    const hipWaistRatio = measurements.hips / measurements.waist

    // Body type descriptions for explicit selector
    const bodyTypeDescriptions: Record<string, { desc: string; proportion: string }> = {
        'petite': { desc: 'petite, delicate frame', proportion: 'small-boned, compact proportions' },
        'slim': { desc: 'slim, slender figure', proportion: 'lean, elongated proportions' },
        'athletic': { desc: 'athletic, toned physique', proportion: 'muscular definition, sporty build' },
        'average': { desc: 'average, balanced figure', proportion: 'proportionate, natural build' },
        'curvy': { desc: 'curvy, voluptuous figure', proportion: 'fuller proportions with defined curves' },
        'hourglass': { desc: 'classic hourglass figure, pin-up proportions', proportion: 'narrow waist with fuller bust and hips' },
        'plus-size': { desc: 'plus-size, full-figured', proportion: 'generous proportions throughout' },
    }

    // Height descriptions
    const getHeightDesc = (height: number): string => {
        if (height < 155) return 'petite height (under 5\'1")'
        if (height < 163) return 'short to average height (5\'1"-5\'4")'
        if (height < 170) return 'average height (5\'4"-5\'7")'
        if (height < 178) return 'tall (5\'7"-5\'10")'
        return 'very tall, model height (5\'10"+)'
    }

    // Build inline body description with STRONG visual terms that AI models understand
    const buildInlineBodyDescription = (): string => {
        const bustWaistRatio = measurements.bust / measurements.waist
        const height = measurements.height || 165
        const selectedBodyType = measurements.bodyType || 'average'

        // Use explicit body type if selected, otherwise calculate from measurements
        let bodyTypeDesc = ''
        let proportionDesc = ''

        // Prefer explicit body type selector
        if (selectedBodyType && bodyTypeDescriptions[selectedBodyType]) {
            bodyTypeDesc = bodyTypeDescriptions[selectedBodyType].desc
            proportionDesc = bodyTypeDescriptions[selectedBodyType].proportion
        }
        // Fallback to calculated ratios
        else if (hipWaistRatio >= 1.6 && bustWaistRatio >= 1.5) {
            bodyTypeDesc = 'glamour model physique, dramatic hourglass silhouette'
            proportionDesc = 'extremely cinched waist creating dramatic curves, very full figure on top and bottom'
        }
        else if (hipWaistRatio >= 1.45 || bustWaistRatio >= 1.45) {
            bodyTypeDesc = 'classic hourglass figure, pin-up model proportions'
            proportionDesc = 'noticeably narrow waist with fuller proportions above and below'
        }
        else if (hipWaistRatio >= 1.3) {
            bodyTypeDesc = 'soft hourglass body type'
            proportionDesc = 'defined waist with balanced proportions'
        }
        else {
            bodyTypeDesc = 'athletic straight silhouette'
            proportionDesc = 'lean athletic build'
        }

        // Build specific body parts description
        const upperDesc = measurements.bust >= 100 ? 'very full chest area' :
                         measurements.bust >= 95 ? 'full, ample chest' :
                         measurements.bust >= 88 ? 'well-developed chest' : 'moderate chest'

        const waistDesc = measurements.waist <= 58 ? 'extremely tiny waist (corseted look)' :
                         measurements.waist <= 62 ? 'very slim, cinched waist' :
                         measurements.waist <= 68 ? 'slim defined waist' : 'natural waist'

        const hipDesc = measurements.hips >= 100 ? 'very wide, full hips and thighs' :
                       measurements.hips >= 95 ? 'wide, shapely hips' :
                       measurements.hips >= 88 ? 'proportionate hips' : 'slim hips'

        const heightDesc = getHeightDesc(height)

        // Get skin tone and hair color descriptions
        const skinToneDesc = getSkinToneDescription(measurements.skinTone)
        const hairColorDesc = getHairColorDescription(measurements.hairColor)

        // Build the full description with skin and hair
        let fullDesc = `${measurements.age || 25} year old woman`

        // Add skin tone
        if (skinToneDesc) {
            fullDesc += ` with ${skinToneDesc}`
        }

        // Add hair color
        if (hairColorDesc) {
            fullDesc += skinToneDesc ? ` and ${hairColorDesc}` : ` with ${hairColorDesc}`
        }

        fullDesc += `, ${heightDesc}, with ${bodyTypeDesc}. Physical build: ${upperDesc}, ${waistDesc}, ${hipDesc}. ${proportionDesc}`

        return fullDesc
    }

    const inlineBodyDescription = buildInlineBodyDescription()

    // Get selected body type description
    const selectedBodyType = measurements.bodyType || 'average'
    const bodyTypeLabel = bodyTypeDescriptions[selectedBodyType]?.desc.toUpperCase() || 'AVERAGE BUILD'
    const height = measurements.height || 165
    const heightLabel = height < 160 ? 'PETITE/SHORT' : height < 170 ? 'AVERAGE HEIGHT' : 'TALL'

    // Build strong body specification for the prompt
    // Explicit descriptors based on measurements
    const bustDesc = measurements.bust >= 100
        ? 'VERY LARGE, FULL BUST - visibly voluminous, ample cleavage area, prominent chest'
        : measurements.bust >= 95
            ? 'LARGE, FULL BUST - noticeably full, generous chest proportions'
            : measurements.bust >= 90
                ? 'MEDIUM-FULL BUST - balanced, feminine chest'
                : 'proportionate chest'

    const waistDesc = measurements.waist <= 58
        ? 'EXTREMELY NARROW WAIST - dramatically cinched, corset-like appearance, very slim midsection'
        : measurements.waist <= 62
            ? 'VERY NARROW WAIST - visibly slim, well-defined midsection'
            : measurements.waist <= 68
                ? 'NARROW WAIST - tapered, defined'
                : 'defined waist'

    const hipsDesc = measurements.hips >= 100
        ? 'VERY WIDE HIPS & FULL LOWER CURVES - prominent lower body, rounded silhouette'
        : measurements.hips >= 95
            ? 'WIDE HIPS & FULL LOWER CURVES - curvy lower body, rounded shape, feminine hips'
            : measurements.hips >= 90
                ? 'CURVY HIPS - balanced, feminine lower body'
                : 'proportionate lower body'

    // Thighs/Legs descriptor - based on hips (curvy hips = thick thighs)
    const thighsDesc = measurements.hips >= 100
        ? 'THICK, FULL THIGHS - meaty upper legs, substantial leg volume, no thigh gap, legs touch'
        : measurements.hips >= 95
            ? 'FULL, CURVY THIGHS - thick upper legs, feminine leg volume, soft inner thighs'
            : measurements.hips >= 90
                ? 'SOFT, FEMININE THIGHS - some thickness, natural curves'
                : 'proportionate legs'

    // Get skin and hair descriptions for body spec
    const skinToneSpecDesc = getSkinToneDescription(measurements.skinTone)
    const hairColorSpecDesc = getHairColorDescription(measurements.hairColor)

    const bodySpecification = `
╔═══════════════════════════════════════════════════════════════════════════════╗
║  🚨 MANDATORY BODY SPECIFICATIONS - READ CAREFULLY 🚨                          ║
╚═══════════════════════════════════════════════════════════════════════════════╝

HEIGHT: ${heightLabel} (${height}cm / ${Math.floor(height/30.48)}'${Math.round((height/2.54) % 12)}")
BODY TYPE: ${bodyTypeLabel}
${skinToneSpecDesc ? `\n▓▓▓ SKIN TONE ▓▓▓\n${skinToneSpecDesc.toUpperCase()}\nThis is the EXACT skin complexion the character MUST have.` : ''}
${hairColorSpecDesc ? `\n▓▓▓ HAIR COLOR ▓▓▓\n${hairColorSpecDesc.toUpperCase()}\nThe character's hair (head hair, eyebrows, body hair) MUST be this color.` : ''}

▓▓▓ BUST/CHEST ▓▓▓
${bustDesc}
Measurements: ${measurements.bust}cm bust

▓▓▓ WAIST/MIDSECTION ▓▓▓
${waistDesc}
Measurements: ${measurements.waist}cm waist

▓▓▓ HIPS/LOWER BODY ▓▓▓
${hipsDesc}
Measurements: ${measurements.hips}cm hips

▓▓▓ THIGHS/LEGS ▓▓▓
${thighsDesc}
The legs MUST have volume proportional to the hips - ${measurements.hips >= 95 ? 'thick, meaty thighs that match the curvy lower body' : 'legs matching body type'}.
⚠️ DO NOT make legs thin/skinny when hips are wide - this looks unnatural!

▓▓▓ OVERALL SILHOUETTE ▓▓▓
This character has a ${selectedBodyType.toUpperCase()} body type with these EXACT proportions.
The waist-to-hip ratio is ${(measurements.hips / measurements.waist).toFixed(2)} - this creates ${measurements.hips / measurements.waist >= 1.4 ? 'a DRAMATIC HOURGLASS shape' : 'visible curves'}.

⛔ DO NOT GENERATE:
- Slim/athletic body when curvy is specified
- Small chest when large bust is specified
- Flat/small lower body when full curves are specified
- Straight waist when narrow/cinched is specified
- THIN/SKINNY LEGS when curvy hips are specified - legs must be THICK
- Generic "model" body - USE THE EXACT SPECIFICATIONS ABOVE
${skinToneSpecDesc ? `- DIFFERENT SKIN TONE than specified - character MUST have ${skinToneSpecDesc}` : ''}
${hairColorSpecDesc ? `- DIFFERENT HAIR COLOR than specified - character MUST have ${hairColorSpecDesc}` : ''}

✅ THE BODY MUST CLEARLY SHOW:
- The bust size as specified (${measurements.bust}cm)
- The waist narrowness as specified (${measurements.waist}cm)
- The hip width and lower body fullness as specified (${measurements.hips}cm)
- THICK THIGHS that match the hip width - NOT thin legs
${skinToneSpecDesc ? `- EXACT SKIN TONE: ${skinToneSpecDesc}` : ''}
${hairColorSpecDesc ? `- EXACT HAIR COLOR: ${hairColorSpecDesc}` : ''}
`

    let physicalInstructions = `
    ═══════════════════════════════════════════════════════════════
    CHARACTER PHYSICAL SPECIFICATIONS (MANDATORY - CONSISTENCY CRITICAL)
    ═══════════════════════════════════════════════════════════════

    THE CHARACTER MUST BE: ${inlineBodyDescription}

    BODY TYPE: ${selectedBodyType.toUpperCase()}
    HEIGHT: ${height}cm (${heightLabel})

    BODY TYPE DETAILS:
    ${bodyAdjectives}

    ⚠️ CRITICAL: These body proportions are NON-NEGOTIABLE and must be CONSISTENT across all generations.
    ⚠️ The character's body type, height, and proportions MUST remain identical in every image.
    ═══════════════════════════════════════════════════════════════
  `

    if (activeFaceDescription.trim()) {
        physicalInstructions += `
    FACIAL FEATURES (HARD CONSTRAINT):
    - ${activeFaceDescription}
    `
    }

    // Build style directives
    let styleLabel = 'STYLE_REF'
    let styleDirectives = ''
    if (sceneReference) {
        if (styleWeight < 30) {
            styleLabel = 'COLOR_PALETTE_REF'
            styleDirectives = 'Extract only color palette and mood.'
        } else if (styleWeight < 85) {
            styleLabel = 'COMPOSITION_GUIDE'
            styleDirectives = 'Use lighting and angle. REPLACE the subject.'
        } else {
            styleLabel = 'VISUAL_CLONE_SOURCE'
            styleDirectives = 'STRICT_VISUAL_CLONE - Copy outfit, pose, background.'
        }
    }

    // Build parts array
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parts: any[] = []
    let refIndex = 1
    let refMappingText = ''

    const appendImage = async (img: ImageData, desc: string, label: string) => {
        refMappingText += `- Image ${refIndex} [${label}]: ${desc}\n`
        refIndex++
        const optimizedBase64 = await resizeBase64Image(img.base64)
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: optimizedBase64 } })
    }

    // System preamble
    const systemPreamble = `
    SYSTEM COMMANDS (HIGHEST PRIORITY):
    1. OUTPUT ASPECT RATIO: ${aspectRatio}.
    2. MODE: ${isHighStyleWeight && sceneReference ? 'VISUAL RECONSTRUCTION' : 'TEXT-TO-IMAGE WITH AVATAR'}.
    3. PHOTOREALISM: Output must be 8k, highly detailed.

    ${physicalInstructions}
    ${identityInstructions}
  `
    parts.push({ text: systemPreamble })

    // Add reference images
    if (faceRefImage) {
        await appendImage(faceRefImage, 'IDENTITY SOURCE (FRONT)', 'FACE_ANCHOR')
    } else if (avatarReferences.length > 0) {
        await appendImage(avatarReferences[0], 'IDENTITY SOURCE', 'FACE_ANCHOR')
    }

    if (angleRefImage) {
        await appendImage(angleRefImage, 'GEOMETRY SOURCE', 'ANGLE_SHEET')
    }

    if (bodyRefImage) {
        await appendImage(bodyRefImage, 'CRITICAL BODY REFERENCE - COPY THIS EXACT SILHOUETTE. Match waist narrowness, hip width, chest proportions, overall curves EXACTLY. This body shape is MANDATORY.', 'BODY_SHAPE')
    }

    if (poseRefImage) {
        await appendImage(poseRefImage, 'POSE ONLY REFERENCE - Copy ONLY the body position/pose from this image. DO NOT copy the face or body proportions. Use [FACE_ANCHOR] for face and body specifications for proportions.', 'POSE_REF')
    }

    if (sceneReference) {
        await appendImage(sceneReference, styleDirectives, styleLabel)
    }

    // Add remaining references (max 5 total)
    const remainingSlots = 5 - refIndex + 1
    for (const img of assetReferences.slice(0, remainingSlots)) {
        await appendImage(img, 'Item to include', 'ASSET')
    }

    // Build enhanced prompt with body description injected directly
    // This is more effective than system instructions as it becomes part of the actual generation prompt
    const enhancedPrompt = `A ${inlineBodyDescription}. ${prompt}`

    // Determine if we have body reference image
    const hasBodyRef = bodyRefImage !== null
    const hasStyleRef = sceneReference !== null
    const hasPoseRef = poseRefImage !== null

    // Build camera shot instructions (framing + angle)
    const buildCameraShotInstructions = (): string => {
        const hasFraming = cameraShot !== 'AUTO'
        const hasAngle = cameraAngle !== null

        if (!hasFraming && !hasAngle) return ''

        const framingDescriptions: Record<string, string> = {
            'AUTO': '',
            'EXTREME_CLOSE_UP': 'EXTREME CLOSE-UP: Frame only the face, eyes and facial details. Maximum detail on facial features.',
            'CLOSE_UP': 'CLOSE-UP: Frame head and shoulders. Face is the main focus. Show some neck and upper shoulders.',
            'MEDIUM_CLOSE_UP': 'MEDIUM CLOSE-UP: Frame from chest up. Upper body visible, face clearly visible.',
            'MEDIUM_SHOT': 'MEDIUM SHOT: Frame from waist up. Upper body and arms visible. Good for portraits.',
            'MEDIUM_FULL': 'MEDIUM FULL SHOT: Frame from knees up. Most of the body visible except lower legs.',
            'FULL_SHOT': 'FULL SHOT: Frame entire body from head to feet. Full body must be visible in the frame.',
            'WIDE_SHOT': 'WIDE SHOT: Full body with significant environment visible. Subject takes about 1/3 to 1/2 of frame.',
            'EXTREME_WIDE': 'EXTREME WIDE SHOT: Landscape with subject. Environment dominates, subject is smaller in frame.',
        }

        const angleDescriptions: Record<string, string> = {
            'LOW_ANGLE': 'LOW ANGLE: Camera positioned below subject, looking UP. Makes subject appear powerful, dominant, heroic.',
            'HIGH_ANGLE': 'HIGH ANGLE: Camera positioned above subject, looking DOWN. Makes subject appear smaller, vulnerable, or submissive.',
            'DUTCH_ANGLE': 'DUTCH ANGLE: Camera tilted diagonally (10-45 degrees). Creates tension, unease, or dynamic energy.',
            'BIRDS_EYE': "BIRD'S EYE VIEW: Camera directly above, looking straight down. Overhead perspective, subject seen from top.",
            'WORMS_EYE': "WORM'S EYE VIEW: Camera at ground level, looking straight up. Extreme low angle, dramatic perspective.",
            'OVER_SHOULDER': 'OVER THE SHOULDER: Camera behind one person, looking at subject. Creates intimacy and context.',
            'POV': 'POV (Point of View): First-person perspective. Camera shows what the subject would see.',
            'PROFILE': 'PROFILE SHOT: Side view of face at 90 degrees. Shows silhouette and profile features.',
            'THREE_QUARTER': '3/4 VIEW: Face turned 45 degrees from camera. Classic portrait angle showing depth.',
        }

        let instructions = `
    ═══════════════════════════════════════════════════════════════
    CAMERA SETTINGS:
    ═══════════════════════════════════════════════════════════════`

        if (hasFraming) {
            instructions += `
    FRAMING: ${cameraShot}
    ${framingDescriptions[cameraShot] || ''}`
        }

        if (hasAngle) {
            instructions += `
    ANGLE: ${cameraAngle}
    ${angleDescriptions[cameraAngle] || ''}`
        }

        instructions += `

    ⚠️ MANDATORY: The camera framing and angle MUST match these specifications exactly.
    `
        return instructions
    }

    // Build style instructions based on styleWeight
    const buildStyleInstructions = (): string => {
        if (!hasStyleRef) return ''

        if (styleWeight < 30) {
            // Inspiration mode - minimal influence
            return `
    ═══════════════════════════════════════════════════════════════
    STYLE REFERENCE MODE: INSPIRATION (${styleWeight}%)
    ═══════════════════════════════════════════════════════════════
    From [${styleLabel}] extract ONLY:
    - Color palette and overall mood
    - Lighting tone (warm/cool)

    DO NOT copy: pose, outfit, background, composition
    CREATE a completely NEW scene with just the color mood as inspiration.
    `
        } else if (styleWeight < 60) {
            // Low influence - colors + some lighting
            return `
    ═══════════════════════════════════════════════════════════════
    STYLE REFERENCE MODE: LIGHT INFLUENCE (${styleWeight}%)
    ═══════════════════════════════════════════════════════════════
    From [${styleLabel}] use:
    - Color palette and mood
    - General lighting direction
    - Overall atmosphere

    DO NOT copy: exact pose, exact outfit, exact background
    Create a NEW composition inspired by the style reference.
    `
        } else if (styleWeight < 85) {
            // Medium influence - copy composition
            return `
    ═══════════════════════════════════════════════════════════════
    STYLE REFERENCE MODE: COMPOSITION GUIDE (${styleWeight}%)
    ═══════════════════════════════════════════════════════════════
    From [${styleLabel}] COPY:
    - Camera angle and framing
    - Lighting setup and direction
    - General pose/positioning
    - Color grading

    REPLACE: The subject with our character (face + body from references)
    Background can be similar but not identical.
    `
        } else {
            // High influence - strict clone BUT FACE FROM AVATAR
            return `
    ╔═══════════════════════════════════════════════════════════════╗
    ║ STYLE REFERENCE MODE: STRICT CLONE (${styleWeight}%)          ║
    ╚═══════════════════════════════════════════════════════════════╝

    From [${styleLabel}] COPY EXACTLY:
    ✓ EXACT pose and body positioning
    ✓ EXACT outfit/clothing (replicate it precisely)
    ✓ EXACT background and setting
    ✓ EXACT camera angle and framing
    ✓ EXACT lighting and color grading

    🚨🚨🚨 CRITICAL: FACE SWAP REQUIRED 🚨🚨🚨
    This is a FACE REPLACEMENT operation:
    - The face in [${styleLabel}] MUST BE REPLACED with [FACE_ANCHOR]
    - Think of it as: "Same photo, but with a different person's face"
    - The face from [${styleLabel}] does NOT exist in your output
    - [FACE_ANCHOR] is the ONLY face source

    OUTPUT = [${styleLabel}]'s everything EXCEPT face + [FACE_ANCHOR]'s face
    `
        }
    }

    // Final prompt with STRONG body AND style instructions
    // Body specifications go FIRST for maximum priority
    const finalPrompt = `
    ═══════════════════════════════════════════════════════════════
    ⚠️⚠️⚠️ FIRST PRIORITY: BODY SHAPE SPECIFICATIONS ⚠️⚠️⚠️
    ═══════════════════════════════════════════════════════════════

    ${hasBodyRef ? `
    [BODY_SHAPE] IMAGE IS PROVIDED - THIS IS YOUR PRIMARY VISUAL REFERENCE:
    - COPY the EXACT body proportions from [BODY_SHAPE] image
    - Match the silhouette, curves, waist definition, hip width, bust size, lower body fullness EXACTLY
    - The body shape in [BODY_SHAPE] overrides everything else

    REINFORCEMENT - The body should match these approximate specs:
    • Bust: ${measurements.bust}cm (${measurements.bust >= 95 ? 'FULL, LARGE' : 'proportionate'})
    • Waist: ${measurements.waist}cm (${measurements.waist <= 62 ? 'VERY NARROW' : 'defined'})
    • Hips: ${measurements.hips}cm (${measurements.hips >= 95 ? 'WIDE, FULL CURVES' : 'proportionate'})
    • Thighs: ${measurements.hips >= 95 ? 'THICK, FULL - meaty legs matching curvy hips' : 'proportionate to hips'}
    ⚠️ Legs must NOT be thin/skinny - they must have volume matching the hip width!
    ` : `
    ⚠️ NO BODY IMAGE REFERENCE - FOLLOW THESE TEXT SPECIFICATIONS EXACTLY:
    ${bodySpecification}
    `}

    ═══════════════════════════════════════════════════════════════
    TASK: Generate a photorealistic image of this EXACT character:
    ═══════════════════════════════════════════════════════════════

    "${enhancedPrompt}"

    REFERENCE MAPPING:
    ${refMappingText}
    ${hasPoseRef ? `
    ╔═══════════════════════════════════════════════════════════════╗
    ║ POSE REFERENCE: [POSE_REF] - BODY POSITION ONLY              ║
    ╚═══════════════════════════════════════════════════════════════╝

    [POSE_REF] is a FACELESS MANNEQUIN. The person's face DOES NOT EXIST.

    From [POSE_REF] copy ONLY:
    ✓ Body position and angle
    ✓ Limb positions (arms, legs, hands)
    ✓ Posture and gesture

    🚨🚨🚨 ABSOLUTELY FORBIDDEN - DO NOT COPY FROM [POSE_REF] 🚨🚨🚨
    ✗ The face → USE [FACE_ANCHOR] ONLY
    ✗ Facial features → USE [FACE_ANCHOR] ONLY
    ✗ Skin tone/ethnicity → USE [FACE_ANCHOR] ONLY
    ✗ Body proportions → USE specifications

    THINK OF IT THIS WAY:
    - [POSE_REF] = A poseable mannequin with NO FACE
    - [FACE_ANCHOR] = The ONLY face for this image
    - You are putting [FACE_ANCHOR]'s face on the mannequin's position
    ` : ''}
    ${buildCameraShotInstructions()}
    ${buildStyleInstructions()}

    RENDERING ORDER (FOLLOW STRICTLY):
    1. BODY FIRST: ${hasBodyRef ? 'Clone the body from [BODY_SHAPE] image' : inlineBodyDescription}
    2. FACE SECOND: Apply face from [FACE_ANCHOR]${activeFaceDescription ? `: ${activeFaceDescription}` : ''}
    ${hasPoseRef ? '3. POSE: Apply EXACT pose from [POSE_REF]' : ''}
    ${(cameraShot !== 'AUTO' || cameraAngle !== null) ? `${hasPoseRef ? '4' : '3'}. CAMERA: ${cameraShot !== 'AUTO' ? `Frame as ${cameraShot.replace(/_/g, ' ')}` : ''}${cameraShot !== 'AUTO' && cameraAngle !== null ? ' with ' : ''}${cameraAngle !== null ? `${cameraAngle.replace(/_/g, ' ')} angle` : ''}` : ''}
    ${hasStyleRef ? `${hasPoseRef ? '5' : (cameraShot !== 'AUTO' || cameraAngle !== null) ? '4' : '3'}. STYLE: Apply style from [${styleLabel}] at ${styleWeight}% influence` : `${hasPoseRef ? '5' : (cameraShot !== 'AUTO' || cameraAngle !== null) ? '4' : '3'}. SCENE: Generate from prompt description`}

    ⛔ FAILURE CONDITIONS (ABSOLUTELY FORBIDDEN):
    - Using a face that is NOT from [FACE_ANCHOR] → CRITICAL FAILURE
    ${hasPoseRef ? '- Copying the face from [POSE_REF] → CRITICAL FAILURE' : ''}
    ${hasStyleRef ? '- Copying the face from [STYLE_REF] → CRITICAL FAILURE' : ''}
    - Generic athletic body → WRONG
    - Average/slim body when curvy is specified → WRONG
    - Ignoring the body proportions → WRONG
    ${hasPoseRef ? '- Different pose than [POSE_REF] → WRONG' : ''}
    ${cameraShot !== 'AUTO' ? `- Wrong framing (not ${cameraShot.replace(/_/g, ' ')}) → WRONG` : ''}
    ${cameraAngle !== null ? `- Wrong camera angle (not ${cameraAngle.replace(/_/g, ' ')}) → WRONG` : ''}
    ${hasStyleRef && styleWeight >= 85 ? '- Different outfit/pose than [STYLE_REF] when Style Weight is high → WRONG' : ''}
    ${hasStyleRef && styleWeight < 30 ? '- Copying pose/outfit from [STYLE_REF] when Style Weight is low → WRONG' : ''}

    ✅ SUCCESS CRITERIA:
    - Face is IDENTICAL to [FACE_ANCHOR] (same person)
    - Body proportions match ${hasBodyRef ? '[BODY_SHAPE] reference' : 'specifications above'}
    ${hasPoseRef ? '- Pose matches [POSE_REF] (position only, not the person)' : ''}
    ${cameraShot !== 'AUTO' ? `- Framing is ${cameraShot.replace(/_/g, ' ')}` : ''}
    ${cameraAngle !== null ? `- Camera angle is ${cameraAngle.replace(/_/g, ' ')}` : ''}
  `

    parts.push({ text: finalPrompt })

    try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: { parts },
            config: {
                imageConfig: {
                    aspectRatio: aspectRatio,
                },
            },
        })

        const candidate = response.candidates?.[0]

        if (!candidate) {
            throw new Error('No candidates returned from the API.')
        }

        if (candidate.finishReason && candidate.finishReason !== 'STOP') {
            const reason = candidate.finishReason
            if (reason === 'SAFETY' || reason === 'IMAGE_SAFETY') {
                throw new Error('⚠️ Safety Block: Your prompt or reference images were flagged by content filters. Try: 1) Simplify your prompt, 2) Remove suggestive terms, 3) Use different reference images.')
            }
            throw new Error(`Generation stopped: ${reason}`)
        }

        for (const part of candidate.content?.parts || []) {
            if ((part as { inlineData?: { data: string } }).inlineData) {
                const inlineData = (part as { inlineData: { data: string } }).inlineData
                return {
                    url: `data:image/jpeg;base64,${inlineData.data}`,
                    fullApiPrompt: finalPrompt,
                }
            }
        }

        throw new Error('Model returned success but no image data found.')
    } catch (error) {
        console.error('Gemini Generation Error:', error)
        throw error
    }
}

// =============================================
// VIDEO GENERATION
// =============================================

export async function generateVideo(params: {
    prompt: string
    imageInput: ImageData | null
    avatarReferences?: ImageData[]
    faceRefImage?: ImageData | null
    bodyRefImage?: ImageData | null
    aspectRatio: AspectRatio
    sceneReference?: ImageData | null
    resolution?: VideoResolution
    cameraMotion?: CameraMotion
    subjectAction?: SubjectAction
    dialogue?: string
    voiceStyle?: string
    noMusic?: boolean
    noBackgroundEffects?: boolean
    modelName?: string
}): Promise<string> {
    const {
        prompt,
        imageInput,
        avatarReferences = [],
        faceRefImage = null,
        bodyRefImage = null,
        aspectRatio,
        sceneReference = null,
        resolution = '720p',
        cameraMotion = 'NONE',
        subjectAction = 'NONE',
        dialogue = '',
        voiceStyle = 'Realistic',
        noMusic = false,
        noBackgroundEffects = false,
        modelName = 'veo-3.1-fast-generate-preview',
    } = params

    const apiKey = getApiKey()
    const ai = new GoogleGenAI({ apiKey })

    const hasRefs = avatarReferences.length > 0 || faceRefImage || bodyRefImage || sceneReference

    // Enforce constraints for character references
    let targetAspectRatio = aspectRatio === '16:9' ? '16:9' : '9:16'
    if (aspectRatio === '1:1' || aspectRatio === '4:3') targetAspectRatio = '16:9'
    if (aspectRatio === '3:4') targetAspectRatio = '9:16'

    let targetResolution = resolution
    if (hasRefs && !imageInput) {
        targetAspectRatio = '16:9'
        targetResolution = '720p'
    }

    // Prepare reference images (max 3)
    const referenceImagesPayload: unknown[] = []

    if (hasRefs && !imageInput) {
        if (faceRefImage) {
            const resized = await resizeBase64Image(faceRefImage.base64)
            referenceImagesPayload.push({
                image: { imageBytes: resized, mimeType: 'image/jpeg' },
                referenceType: 'ASSET',
            })
        }

        if (sceneReference && referenceImagesPayload.length < 3) {
            const resized = await resizeBase64Image(sceneReference.base64)
            referenceImagesPayload.push({
                image: { imageBytes: resized, mimeType: 'image/jpeg' },
                referenceType: 'ASSET',
            })
        }

        if (bodyRefImage && referenceImagesPayload.length < 3) {
            const resized = await resizeBase64Image(bodyRefImage.base64)
            referenceImagesPayload.push({
                image: { imageBytes: resized, mimeType: 'image/jpeg' },
                referenceType: 'ASSET',
            })
        }

        for (const ref of avatarReferences.slice(0, 3 - referenceImagesPayload.length)) {
            const resized = await resizeBase64Image(ref.base64)
            referenceImagesPayload.push({
                image: { imageBytes: resized, mimeType: 'image/jpeg' },
                referenceType: 'ASSET',
            })
        }
    }

    // Build prompt with camera and action
    let finalPrompt = prompt.trim()

    // Add anti-celebrity disclaimer when using avatar references
    if (hasRefs || imageInput) {
        finalPrompt = `[IMPORTANT: This is a completely FICTIONAL character, an ORIGINAL digital creation. NOT based on any real person, celebrity, or public figure. This is a unique AI-generated avatar design.] ${finalPrompt}`
    }

    // Camera motion
    const cameraTextMap: Record<CameraMotion, string> = {
        NONE: '',
        PUSH_IN: 'Slow cinematic zoom in towards the subject.',
        PULL_OUT: 'Slow pull back zoom out revealing the environment.',
        PAN_LEFT: 'Smooth camera pan to the left.',
        PAN_RIGHT: 'Smooth camera pan to the right.',
        TILT_UP: 'Camera tilts upward.',
        TILT_DOWN: 'Camera tilts downward.',
        ORBIT_LEFT: 'Camera orbits around the subject to the left.',
        ORBIT_RIGHT: 'Camera orbits around the subject to the right.',
    }

    // Subject action - with detailed motion instructions to avoid glitches
    const actionTextMap: Record<SubjectAction, string> = {
        NONE: '',
        WALKING: 'Subject is walking at a natural, steady pace. IMPORTANT: Each step must be complete and distinct - left foot, then right foot, in a smooth continuous motion. NO stuttering, NO double-steps, NO foot sliding or glitching. The walking cycle must be fluid and realistic like a real human walking.',
        RUNNING: 'Subject is running with dynamic motion. Each stride must be complete and fluid, no stuttering or repeated frames.',
        DANCING: 'Subject is dancing with fluid, continuous movements. No jerky or repeated motions.',
        TALKING: 'Subject is looking at camera, lips moving naturally as if speaking.',
        GESTURING: 'Subject is gesturing expressively with their hands in fluid motions.',
        SITTING: 'Subject is sitting comfortably with natural micro-movements.',
        STANDING: 'Subject is standing still, breathing naturally with subtle body movement.',
    }

    const cameraText = cameraTextMap[cameraMotion]
    const actionText = dialogue
        ? 'Subject is looking at the camera, lips moving naturally in synchronization with the speech.'
        : actionTextMap[subjectAction]

    if (cameraText || actionText) {
        finalPrompt = `${finalPrompt}. ${actionText} ${cameraText}`
    }

    if (dialogue) {
        finalPrompt += ` Audio: Character speaks: "${dialogue}". Voice: ${voiceStyle}.`
    }

    if (noMusic) {
        finalPrompt += ' [AUDIO CONSTRAINT - STRICTLY ENFORCE]: ABSOLUTELY NO background music. NO musical score. NO soundtrack. NO melodic sounds whatsoever. The audio track must contain ZERO music - only dialogue and realistic ambient sounds if any.'
    }

    if (noBackgroundEffects) {
        finalPrompt += ' [AUDIO CONSTRAINT - MAXIMUM SILENCE]: NO background effects, NO ambient sounds, NO wind, NO environmental audio, NO foley sounds. Complete audio silence except for dialogue speech if specified. The video must have a clean, silent audio track.'
    }

    if (hasRefs && !imageInput) {
        finalPrompt += ' The character must resemble the provided reference assets.'
    }

    // Execute video generation
    try {
        let operation

        if (imageInput) {
            // Animate mode
            const resizedInput = await resizeBase64Image(imageInput.base64)
            operation = await ai.models.generateVideos({
                model: 'veo-3.1-fast-generate-preview',
                prompt: finalPrompt || 'Animate this scene naturally.',
                image: { imageBytes: resizedInput, mimeType: 'image/jpeg' },
                config: {
                    numberOfVideos: 1,
                    resolution: targetResolution,
                    aspectRatio: targetAspectRatio,
                },
            })
        } else {
            // Avatar mode
            const config: Record<string, unknown> = {
                numberOfVideos: 1,
                resolution: targetResolution,
                aspectRatio: targetAspectRatio,
            }

            if (referenceImagesPayload.length > 0) {
                config.referenceImages = referenceImagesPayload
            }

            operation = await ai.models.generateVideos({
                model: hasRefs ? 'veo-3.1-generate-preview' : modelName,
                prompt: finalPrompt,
                config: config,
            })
        }

        // Poll for completion
        while (!operation.done) {
            await new Promise((resolve) => setTimeout(resolve, 10000))
            const newOp = await ai.operations.getVideosOperation({ operation: operation })
            operation = newOp
        }

        if (operation.error) {
            const errMsg = typeof operation.error === 'object' && 'message' in operation.error
                ? String((operation.error as { message?: string }).message)
                : JSON.stringify(operation.error)
            throw new Error(errMsg || 'Video generation failed')
        }

        const response = operation.response as {
            raiMediaFilteredReasons?: string[]
            generatedVideos?: { video?: { uri?: string } }[]
        }

        if (response?.raiMediaFilteredReasons?.length) {
            throw new Error(`RAI_FILTERED: ${response.raiMediaFilteredReasons.join(', ')}`)
        }

        const videoResult = response?.generatedVideos?.[0]
        const videoUri = videoResult?.video?.uri

        if (!videoUri) {
            throw new Error('Video generation completed without output.')
        }

        // Download video
        const videoResponse = await fetch(`${videoUri}&key=${apiKey}`)
        if (!videoResponse.ok) {
            throw new Error('Failed to download video file.')
        }

        const blob = await videoResponse.blob()
        const buffer = await blob.arrayBuffer()
        const base64Video = Buffer.from(buffer).toString('base64')

        return `data:video/mp4;base64,${base64Video}`
    } catch (error) {
        console.error('Video Generation Error:', error)
        throw error
    }
}

// =============================================
// IMAGE EDITING
// =============================================

export async function editImage(
    originalImageBase64: string,
    editPrompt: string,
    maskBase64: string | null = null,
    aspectRatio: AspectRatio = '1:1',
    referenceAssets?: Array<{ base64: string; mimeType: string }>
): Promise<string> {
    const apiKey = getApiKey()
    const ai = new GoogleGenAI({ apiKey })
    const modelName = 'gemini-3-pro-image-preview'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parts: any[] = []

    // Original image - convert if needed (handles AVIF and other unsupported formats)
    const convertedOriginal = await convertToSupportedFormat(originalImageBase64)
    parts.push({
        inlineData: {
            mimeType: convertedOriginal.mimeType,
            data: convertedOriginal.data,
        },
    })

    // Build prompt
    let textPrompt = `EDIT INSTRUCTION: ${editPrompt}. Maintain the original style, composition, and identity, changing ONLY what is requested.`

    // Add mask if provided - clean base64 prefix if present
    if (maskBase64) {
        parts.push({
            inlineData: {
                mimeType: 'image/png',
                data: cleanBase64Data(maskBase64),
            },
        })
        textPrompt += `\nVISUAL GUIDE: The second image shows a highlighted area. Apply the edit specifically to that area.`
    }

    // Add reference assets if provided - convert each if needed
    if (referenceAssets && referenceAssets.length > 0) {
        textPrompt += `\nREFERENCE IMAGES: Use the following ${referenceAssets.length} reference image(s) as visual guidance for the edit. Match styles, elements, or details from these references.`
        for (const asset of referenceAssets) {
            const convertedAsset = await convertToSupportedFormat(asset.base64)
            parts.push({
                inlineData: {
                    mimeType: convertedAsset.mimeType,
                    data: convertedAsset.data,
                },
            })
        }
    }

    parts.push({ text: textPrompt })

    try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: { parts },
            config: {
                imageConfig: {
                    aspectRatio: aspectRatio,
                },
            },
        })

        const candidate = response.candidates?.[0]

        if (!candidate) {
            throw new Error('No candidates returned from edit API.')
        }

        if (candidate.finishReason && candidate.finishReason !== 'STOP') {
            const reason = candidate.finishReason
            if (reason === 'SAFETY' || reason === 'IMAGE_SAFETY') {
                // Try to get more details from safety ratings
                const safetyDetails = (candidate as { safetyRatings?: Array<{ category: string; probability: string }> })
                    .safetyRatings?.filter(r => r.probability !== 'NEGLIGIBLE' && r.probability !== 'LOW')
                    .map(r => r.category.replace('HARM_CATEGORY_', ''))
                    .join(', ')
                const details = safetyDetails ? ` (${safetyDetails})` : ''
                throw new Error(`Edit blocked by safety filters${details}. Try a different image or edit prompt.`)
            }
            throw new Error(`Edit stopped: ${reason}`)
        }

        // Check for image data
        for (const part of candidate.content?.parts || []) {
            if ((part as { inlineData?: { data: string } }).inlineData) {
                const inlineData = (part as { inlineData: { data: string } }).inlineData
                return `data:image/jpeg;base64,${inlineData.data}`
            }
        }

        // Check if model returned text instead of image (possible refusal)
        const textParts = candidate.content?.parts
            ?.filter((p) => (p as { text?: string }).text)
            .map((p) => (p as { text: string }).text)
            .join(' ')
            .trim()

        if (textParts) {
            console.error('Model returned text instead of image:', textParts)
            throw new Error(`Model refused to edit: ${textParts.slice(0, 200)}`)
        }

        throw new Error('No image returned from edit operation. The model may not support this edit.')
    } catch (error) {
        console.error('Edit Image Failed:', error)
        throw error
    }
}
