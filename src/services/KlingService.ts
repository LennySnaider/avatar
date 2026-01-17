'use server'

import * as jose from 'jose'
import { createServerSupabaseClient } from '@/lib/supabase'
import type { AspectRatio } from '@/@types/supabase'
import type {
    KlingModel,
    KlingMode,
    KlingDuration,
    KlingVoice,
    KlingDynamicMask,
    KlingCameraControl,
    KlingCameraSimpleConfig,
    KlingMotionPreset,
    KlingMotionOrientation,
} from '@/@types/kling'

// Types
export interface ImageData {
    base64: string
    mimeType: string
}

export type VideoResolution = '480p' | '720p' | '1080p'
export type CameraMotion = 'NONE' | 'PUSH_IN' | 'PULL_OUT' | 'PAN_LEFT' | 'PAN_RIGHT' | 'TILT_UP' | 'TILT_DOWN' | 'ORBIT_LEFT' | 'ORBIT_RIGHT'

/**
 * Clean base64 string for Kling API
 * Kling requires base64 WITHOUT the data: prefix
 */
function cleanBase64ForKling(base64: string): string {
    if (!base64) throw new Error('Base64 string is required')
    // Remove data URI prefix if present (e.g., "data:image/jpeg;base64,")
    return base64.includes(',') ? base64.split(',')[1] : base64
}

/**
 * Normalize model name for Kling API
 * Converts formats like 'kling-v1.5' to 'kling-v1-5'
 * The API expects hyphens, not dots, in version numbers
 */
function normalizeKlingModelName(modelName: string): string {
    // Convert patterns like kling-v1.5 to kling-v1-5
    // Also handles kling-v2.6 to kling-v2-6, etc.
    return modelName.replace(/kling-v(\d+)\.(\d+)/g, 'kling-v$1-$2')
}

// Kling API Configuration
const KLING_API_BASE = 'https://api-singapore.klingai.com'

// Get credentials from environment
const getCredentials = (): { accessKey: string; secretKey: string } => {
    const accessKey = process.env.KLING_ACCESS_KEY
    const secretKey = process.env.KLING_SECRET_KEY

    if (!accessKey || !secretKey) {
        throw new Error('KLING_ACCESS_KEY or KLING_SECRET_KEY is not configured in environment variables')
    }

    return { accessKey, secretKey }
}

// Generate JWT token for Kling API authentication
async function generateJwtToken(): Promise<string> {
    const { accessKey, secretKey } = getCredentials()

    const now = Math.floor(Date.now() / 1000)

    const payload = {
        iss: accessKey,
        exp: now + 1800, // Token valid for 30 minutes
        nbf: now - 5,    // Not before: 5 seconds ago (to account for clock skew)
    }

    const secret = new TextEncoder().encode(secretKey)

    const token = await new jose.SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .sign(secret)

    return token
}

// Make authenticated request to Kling API
async function klingRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' = 'POST',
    body?: Record<string, unknown>
): Promise<T> {
    const token = await generateJwtToken()

    const response = await fetch(`${KLING_API_BASE}${endpoint}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
        const errorText = await response.text()
        console.error('Kling API Error:', errorText)
        throw new Error(`Kling API Error: ${response.status} - ${errorText}`)
    }

    return response.json()
}

// Response types
interface KlingTaskResponse {
    code: number
    message: string
    request_id: string
    data: {
        task_id: string
        task_status: string
        task_status_msg?: string
        created_at?: number
        updated_at?: number
    }
}

interface KlingTaskResultResponse {
    code: number
    message: string
    request_id: string
    data: {
        task_id: string
        task_status: 'submitted' | 'processing' | 'succeed' | 'failed'
        task_status_msg?: string
        task_result?: {
            videos?: Array<{
                id: string
                url: string
                duration: string
            }>
            images?: Array<{
                index: number
                url: string
            }>
        }
    }
}

// Poll for task completion
async function pollTaskResult(taskId: string, maxAttempts = 120, intervalMs = 5000): Promise<KlingTaskResultResponse['data']> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const result = await klingRequest<KlingTaskResultResponse>(
            `/v1/videos/text2video/${taskId}`,
            'GET'
        )

        console.log(`[Kling] Task ${taskId} status: ${result.data.task_status} (attempt ${attempt + 1}/${maxAttempts})`)

        if (result.data.task_status === 'succeed') {
            return result.data
        }

        if (result.data.task_status === 'failed') {
            throw new Error(`Kling task failed: ${result.data.task_status_msg || 'Unknown error'}`)
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, intervalMs))
    }

    throw new Error('Kling task timed out waiting for completion')
}

// Poll for image task completion
async function pollImageTaskResult(taskId: string, maxAttempts = 60, intervalMs = 3000): Promise<KlingTaskResultResponse['data']> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const result = await klingRequest<KlingTaskResultResponse>(
            `/v1/images/generations/${taskId}`,
            'GET'
        )

        console.log(`[Kling] Image Task ${taskId} status: ${result.data.task_status} (attempt ${attempt + 1}/${maxAttempts})`)

        if (result.data.task_status === 'succeed') {
            return result.data
        }

        if (result.data.task_status === 'failed') {
            throw new Error(`Kling image task failed: ${result.data.task_status_msg || 'Unknown error'}`)
        }

        await new Promise(resolve => setTimeout(resolve, intervalMs))
    }

    throw new Error('Kling image task timed out waiting for completion')
}

// Poll for image2video task completion (CORRECT endpoint)
async function pollImage2VideoTaskResult(taskId: string, maxAttempts = 120, intervalMs = 5000): Promise<KlingTaskResultResponse['data']> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const result = await klingRequest<KlingTaskResultResponse>(
            `/v1/videos/image2video/${taskId}`,
            'GET'
        )

        console.log(`[Kling] Image2Video Task ${taskId} status: ${result.data.task_status} (attempt ${attempt + 1}/${maxAttempts})`)

        if (result.data.task_status === 'succeed') {
            return result.data
        }

        if (result.data.task_status === 'failed') {
            throw new Error(`Kling image2video task failed: ${result.data.task_status_msg || 'Unknown error'}`)
        }

        await new Promise(resolve => setTimeout(resolve, intervalMs))
    }

    throw new Error('Kling image2video task timed out waiting for completion')
}

// Map aspect ratio to Kling format
function mapAspectRatio(aspectRatio: AspectRatio): string {
    const mapping: Record<AspectRatio, string> = {
        '1:1': '1:1',
        '16:9': '16:9',
        '9:16': '9:16',
        '4:3': '4:3',
        '3:4': '3:4',
    }
    return mapping[aspectRatio] || '16:9'
}

// Map camera motion to Kling format
function mapCameraMotion(motion?: CameraMotion): string | undefined {
    if (!motion || motion === 'NONE') return undefined

    const mapping: Record<CameraMotion, string> = {
        'NONE': '',
        'PUSH_IN': 'zoom_in',
        'PULL_OUT': 'zoom_out',
        'PAN_LEFT': 'pan_left',
        'PAN_RIGHT': 'pan_right',
        'TILT_UP': 'tilt_up',
        'TILT_DOWN': 'tilt_down',
        'ORBIT_LEFT': 'rotate_left',
        'ORBIT_RIGHT': 'rotate_right',
    }

    return mapping[motion]
}

/**
 * Generate video using Kling Text-to-Video API
 */
export async function generateVideo(params: {
    prompt: string
    imageInput?: ImageData | null
    aspectRatio: AspectRatio
    resolution?: VideoResolution
    cameraMotion?: CameraMotion
    duration?: '5' | '10' // seconds
    modelName?: string
}): Promise<string> {
    const {
        prompt,
        imageInput,
        aspectRatio,
        cameraMotion,
        duration = '5',
        modelName = 'kling-v1-5',
    } = params

    // Normalize model name (converts kling-v1.5 to kling-v1-5)
    const normalizedModel = normalizeKlingModelName(modelName)

    console.log('[Kling] Starting video generation...')
    console.log('[Kling] Prompt:', prompt.substring(0, 100) + '...')
    console.log('[Kling] Model (original):', modelName)
    console.log('[Kling] Model (normalized):', normalizedModel)

    // Determine if this is image-to-video or text-to-video
    const isImageToVideo = !!imageInput?.base64

    let endpoint: string
    let requestBody: Record<string, unknown>

    if (isImageToVideo) {
        // Image to Video
        endpoint = '/v1/videos/image2video'
        requestBody = {
            model_name: normalizedModel,
            prompt: prompt,
            image: cleanBase64ForKling(imageInput.base64), // Fixed: Kling requires base64 WITHOUT prefix
            cfg_scale: 0.5,
            mode: 'std', // 'std' or 'pro'
            duration: duration,
        }
    } else {
        // Text to Video
        endpoint = '/v1/videos/text2video'
        requestBody = {
            model_name: normalizedModel,
            prompt: prompt,
            negative_prompt: 'blurry, distorted, low quality, watermark, text overlay',
            cfg_scale: 0.5,
            mode: 'std',
            aspect_ratio: mapAspectRatio(aspectRatio),
            duration: duration,
        }

        // Add camera motion if specified
        const mappedMotion = mapCameraMotion(cameraMotion)
        if (mappedMotion) {
            requestBody.camera_control = {
                type: 'simple',
                config: {
                    horizontal: mappedMotion.includes('pan') ? (mappedMotion.includes('left') ? -5 : 5) : 0,
                    vertical: mappedMotion.includes('tilt') ? (mappedMotion.includes('up') ? -5 : 5) : 0,
                    zoom: mappedMotion.includes('zoom') ? (mappedMotion.includes('in') ? 5 : -5) : 0,
                    roll: mappedMotion.includes('rotate') ? (mappedMotion.includes('left') ? -5 : 5) : 0,
                }
            }
        }
    }

    // Submit task
    const submitResponse = await klingRequest<KlingTaskResponse>(endpoint, 'POST', requestBody)

    if (submitResponse.code !== 0) {
        throw new Error(`Kling API Error: ${submitResponse.message}`)
    }

    const taskId = submitResponse.data.task_id
    console.log('[Kling] Task submitted:', taskId)

    // Poll for result - use correct polling function based on endpoint type
    const result = isImageToVideo
        ? await pollImage2VideoTaskResult(taskId)  // Fixed: use correct endpoint for image2video
        : await pollTaskResult(taskId)

    if (!result.task_result?.videos?.[0]?.url) {
        throw new Error('Kling video generation completed but no video URL returned')
    }

    const videoUrl = result.task_result.videos[0].url
    console.log('[Kling] Video generated successfully:', videoUrl)

    return videoUrl
}

/**
 * Generate image using Kling Image Generation API
 */
export async function generateImage(params: {
    prompt: string
    referenceImage?: ImageData | null
    aspectRatio: AspectRatio
    modelName?: string
    n?: number // number of images
}): Promise<{ url: string; fullApiPrompt: string }> {
    const {
        prompt,
        referenceImage,
        aspectRatio,
        modelName = 'kling-v1',
        n = 1,
    } = params

    const normalizedModel = normalizeKlingModelName(modelName)

    console.log('[Kling] Starting image generation...')
    console.log('[Kling] Prompt:', prompt.substring(0, 100) + '...')
    console.log('[Kling] Model:', normalizedModel)

    const requestBody: Record<string, unknown> = {
        model_name: normalizedModel,
        prompt: prompt,
        negative_prompt: 'blurry, distorted, low quality, watermark, text overlay, deformed',
        n: n,
        aspect_ratio: mapAspectRatio(aspectRatio),
    }

    // Add reference image if provided
    if (referenceImage?.base64) {
        requestBody.image = cleanBase64ForKling(referenceImage.base64) // Fixed: Kling requires base64 WITHOUT prefix
        requestBody.image_fidelity = 0.5
    }

    // Submit task
    const submitResponse = await klingRequest<KlingTaskResponse>(
        '/v1/images/generations',
        'POST',
        requestBody
    )

    if (submitResponse.code !== 0) {
        throw new Error(`Kling Image API Error: ${submitResponse.message}`)
    }

    const taskId = submitResponse.data.task_id
    console.log('[Kling] Image task submitted:', taskId)

    // Poll for result
    const result = await pollImageTaskResult(taskId)

    if (!result.task_result?.images?.[0]?.url) {
        throw new Error('Kling image generation completed but no image URL returned')
    }

    const imageUrl = result.task_result.images[0].url
    console.log('[Kling] Image generated successfully:', imageUrl)

    return {
        url: imageUrl,
        fullApiPrompt: prompt,
    }
}

/**
 * Generate avatar video using Kling Avatar API
 */
export async function generateAvatarVideo(params: {
    prompt: string
    avatarImage: ImageData
    aspectRatio: AspectRatio
    duration?: '5' | '10'
    modelName?: string
}): Promise<string> {
    const {
        prompt,
        avatarImage,
        // aspectRatio not used for image2video endpoint
        duration = '5',
        modelName = 'kling-v1-5',
    } = params

    const normalizedModel = normalizeKlingModelName(modelName)

    console.log('[Kling] Starting avatar video generation...')
    console.log('[Kling] Model:', normalizedModel)

    const requestBody: Record<string, unknown> = {
        model_name: normalizedModel,
        prompt: prompt,
        image: cleanBase64ForKling(avatarImage.base64), // Fixed: 'image' not 'input_image', and no prefix
        duration: duration,
        cfg_scale: 0.5,
        mode: 'std',
    }

    const submitResponse = await klingRequest<KlingTaskResponse>(
        '/v1/videos/image2video',
        'POST',
        requestBody
    )

    if (submitResponse.code !== 0) {
        throw new Error(`Kling Avatar API Error: ${submitResponse.message}`)
    }

    const taskId = submitResponse.data.task_id
    console.log('[Kling] Avatar task submitted:', taskId)

    const result = await pollImage2VideoTaskResult(taskId) // Fixed: use correct polling for image2video

    if (!result.task_result?.videos?.[0]?.url) {
        throw new Error('Kling avatar generation completed but no video URL returned')
    }

    return result.task_result.videos[0].url
}

/**
 * Check Kling API connection and credentials
 */
export async function testConnection(): Promise<{ success: boolean; message: string }> {
    try {
        await generateJwtToken() // Test that we can generate a valid token
        console.log('[Kling] JWT Token generated successfully')

        // Try to make a simple request to verify credentials
        // Using a minimal test prompt
        return {
            success: true,
            message: 'Kling API connection successful. JWT token generated.',
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return {
            success: false,
            message: `Kling API connection failed: ${errorMessage}`,
        }
    }
}

// ===============================================
// NEW FEATURES: Voice, Motion Brush, Camera Control
// ===============================================

/**
 * Generate video with voice synthesis (requires model v2.6+)
 * Uses <<<voice_N>>> syntax in prompt for voice synchronization
 *
 * @example
 * await generateVideoWithVoice({
 *   prompt: "A person speaking in a professional setting",
 *   image: { base64: "...", mimeType: "image/jpeg" },
 *   voiceList: [{ voice_id: "voice_1" }],
 *   dialogue: "Hello, welcome to our presentation",
 *   duration: "5",
 *   modelName: "kling-v2-6",
 * })
 */
export async function generateVideoWithVoice(params: {
    prompt: string
    image: ImageData
    voiceList: KlingVoice[]
    dialogue: string
    duration?: KlingDuration
    mode?: KlingMode
    modelName?: KlingModel
}): Promise<string> {
    const {
        prompt,
        image,
        voiceList,
        dialogue,
        duration = '5',
        mode = 'std',
        modelName = 'kling-v2-6', // v2.6+ required for voice
    } = params

    const normalizedModel = normalizeKlingModelName(modelName)

    console.log('[Kling] Starting video with voice generation...')
    console.log('[Kling] Model:', normalizedModel)
    console.log('[Kling] Dialogue:', dialogue.substring(0, 50) + '...')

    // Build prompt with voice syntax
    // <<<voice_1>>> indicates where speaker 1's voice should be synchronized
    const voicePrompt = `${prompt}. <<<voice_1>>> ${dialogue}`

    const requestBody: Record<string, unknown> = {
        model_name: normalizedModel,
        prompt: voicePrompt,
        image: cleanBase64ForKling(image.base64),
        voice_list: voiceList,
        sound: 'on',
        cfg_scale: 0.5,
        mode,
        duration,
    }

    const submitResponse = await klingRequest<KlingTaskResponse>(
        '/v1/videos/image2video',
        'POST',
        requestBody
    )

    if (submitResponse.code !== 0) {
        throw new Error(`Kling Voice API Error: ${submitResponse.message}`)
    }

    const taskId = submitResponse.data.task_id
    console.log('[Kling] Voice video task submitted:', taskId)

    const result = await pollImage2VideoTaskResult(taskId)

    if (!result.task_result?.videos?.[0]?.url) {
        throw new Error('Voice video generation completed but no video URL returned')
    }

    const videoUrl = result.task_result.videos[0].url
    console.log('[Kling] Voice video generated successfully:', videoUrl)

    return videoUrl
}

/**
 * Generate video with motion brush for controlled animation
 * - static_mask: areas that should NOT move
 * - dynamic_masks: areas with specific movement trajectories
 *
 * Note: Motion brush only supported on kling-v1 in std/pro mode 5s
 *
 * @example
 * await generateVideoWithMotionBrush({
 *   prompt: "The astronaut walked away",
 *   image: { base64: "...", mimeType: "image/jpeg" },
 *   staticMask: "base64_of_background_mask",
 *   dynamicMasks: [{
 *     mask: "base64_of_subject_mask",
 *     trajectories: [{ x: 279, y: 219 }, { x: 417, y: 65 }]
 *   }],
 *   duration: "5",
 * })
 */
export async function generateVideoWithMotionBrush(params: {
    prompt: string
    image: ImageData
    staticMask?: string
    dynamicMasks?: KlingDynamicMask[]
    duration?: KlingDuration
    mode?: KlingMode
    modelName?: KlingModel
}): Promise<string> {
    const {
        prompt,
        image,
        staticMask,
        dynamicMasks,
        duration = '5',
        mode = 'std',
        modelName = 'kling-v1', // Motion brush best supported on v1
    } = params

    const normalizedModel = normalizeKlingModelName(modelName)

    console.log('[Kling] Starting video with motion brush...')
    console.log('[Kling] Model:', normalizedModel)
    console.log('[Kling] Static mask provided:', !!staticMask)
    console.log('[Kling] Dynamic masks count:', dynamicMasks?.length || 0)

    // Validate trajectory points (2-77 for 5s video)
    if (dynamicMasks) {
        dynamicMasks.forEach((dm, i) => {
            if (dm.trajectories.length < 2) {
                throw new Error(`Dynamic mask ${i} needs at least 2 trajectory points`)
            }
            if (dm.trajectories.length > 77) {
                throw new Error(`Dynamic mask ${i} has too many trajectory points (max 77 for 5s video)`)
            }
        })
    }

    const requestBody: Record<string, unknown> = {
        model_name: normalizedModel,
        prompt,
        image: cleanBase64ForKling(image.base64),
        cfg_scale: 0.5,
        mode,
        duration,
    }

    // Add static mask if provided
    if (staticMask) {
        requestBody.static_mask = cleanBase64ForKling(staticMask)
    }

    // Add dynamic masks with trajectories
    if (dynamicMasks && dynamicMasks.length > 0) {
        requestBody.dynamic_masks = dynamicMasks.map(dm => ({
            mask: cleanBase64ForKling(dm.mask),
            trajectories: dm.trajectories,
        }))
    }

    const submitResponse = await klingRequest<KlingTaskResponse>(
        '/v1/videos/image2video',
        'POST',
        requestBody
    )

    if (submitResponse.code !== 0) {
        throw new Error(`Kling Motion Brush API Error: ${submitResponse.message}`)
    }

    const taskId = submitResponse.data.task_id
    console.log('[Kling] Motion brush task submitted:', taskId)

    const result = await pollImage2VideoTaskResult(taskId)

    if (!result.task_result?.videos?.[0]?.url) {
        throw new Error('Motion brush video completed but no URL returned')
    }

    const videoUrl = result.task_result.videos[0].url
    console.log('[Kling] Motion brush video generated successfully:', videoUrl)

    return videoUrl
}

/**
 * Generate video with advanced camera control
 *
 * Camera control types:
 * - simple: custom pan/tilt/zoom/roll values (-10 to 10)
 * - down_back: camera moves down and backward
 * - forward_up: camera moves forward and up
 * - right_turn_forward: camera turns right while moving forward
 * - left_turn_forward: camera turns left while moving forward
 *
 * @example
 * // Preset camera movement
 * await generateVideoWithCameraControl({
 *   prompt: "A beautiful landscape",
 *   image: { base64: "...", mimeType: "image/jpeg" },
 *   cameraType: "forward_up",
 * })
 *
 * // Custom camera movement
 * await generateVideoWithCameraControl({
 *   prompt: "A beautiful landscape",
 *   image: { base64: "...", mimeType: "image/jpeg" },
 *   cameraType: "simple",
 *   cameraConfig: { zoom: 5, vertical: 3 },
 * })
 */
export async function generateVideoWithCameraControl(params: {
    prompt: string
    image?: ImageData
    cameraType: KlingCameraControl['type']
    cameraConfig?: KlingCameraSimpleConfig
    aspectRatio?: AspectRatio
    duration?: KlingDuration
    mode?: KlingMode
    modelName?: KlingModel
}): Promise<string> {
    const {
        prompt,
        image,
        cameraType,
        cameraConfig,
        aspectRatio = '16:9',
        duration = '5',
        mode = 'std',
        modelName = 'kling-v1-6',
    } = params

    const normalizedModel = normalizeKlingModelName(modelName)

    console.log('[Kling] Starting video with camera control...')
    console.log('[Kling] Model:', normalizedModel)
    console.log('[Kling] Camera type:', cameraType)

    // Build camera control object
    const cameraControl: KlingCameraControl = {
        type: cameraType,
    }

    // Only add config for 'simple' type
    if (cameraType === 'simple' && cameraConfig) {
        cameraControl.config = cameraConfig
    }

    const isImage2Video = !!image?.base64

    let requestBody: Record<string, unknown>
    let endpoint: string

    if (isImage2Video) {
        endpoint = '/v1/videos/image2video'
        requestBody = {
            model_name: normalizedModel,
            prompt,
            image: cleanBase64ForKling(image.base64),
            cfg_scale: 0.5,
            mode,
            duration,
            camera_control: cameraControl,
        }
    } else {
        endpoint = '/v1/videos/text2video'
        requestBody = {
            model_name: normalizedModel,
            prompt,
            negative_prompt: 'blurry, distorted, low quality',
            cfg_scale: 0.5,
            mode,
            aspect_ratio: mapAspectRatio(aspectRatio),
            duration,
            camera_control: cameraControl,
        }
    }

    const submitResponse = await klingRequest<KlingTaskResponse>(
        endpoint,
        'POST',
        requestBody
    )

    if (submitResponse.code !== 0) {
        throw new Error(`Kling Camera Control API Error: ${submitResponse.message}`)
    }

    const taskId = submitResponse.data.task_id
    console.log('[Kling] Camera control task submitted:', taskId)

    // Use correct polling based on endpoint type
    const result = isImage2Video
        ? await pollImage2VideoTaskResult(taskId)
        : await pollTaskResult(taskId)

    if (!result.task_result?.videos?.[0]?.url) {
        throw new Error('Camera control video completed but no URL returned')
    }

    const videoUrl = result.task_result.videos[0].url
    console.log('[Kling] Camera control video generated successfully:', videoUrl)

    return videoUrl
}

/**
 * Generate avatar video with synchronized dialogue
 * Combines image-to-video with voice generation for talking head videos
 * Requires model v2.6+
 *
 * @example
 * await generateAvatarWithDialogue({
 *   avatarImage: { base64: "...", mimeType: "image/jpeg" },
 *   dialogue: "Hello! Welcome to our platform.",
 *   voiceId: "voice_1",
 *   prompt: "Professional business presentation, neutral background",
 * })
 */
export async function generateAvatarWithDialogue(params: {
    avatarImage: ImageData
    dialogue: string
    voiceId: string
    prompt?: string
    duration?: KlingDuration
    mode?: KlingMode
    modelName?: KlingModel
}): Promise<string> {
    const {
        avatarImage,
        dialogue,
        voiceId,
        prompt = 'Professional talking head video, natural expressions, lip sync, looking at camera',
        duration = '5',
        mode = 'std',
        modelName = 'kling-v2-6', // v2.6 required for voice
    } = params

    const normalizedModel = normalizeKlingModelName(modelName)

    console.log('[Kling] Starting avatar dialogue video...')
    console.log('[Kling] Model:', normalizedModel)
    console.log('[Kling] Voice ID:', voiceId)
    console.log('[Kling] Dialogue:', dialogue.substring(0, 50) + '...')

    // Build prompt with voice marker
    const fullPrompt = `${prompt}. The person speaks: <<<voice_1>>> "${dialogue}"`

    const requestBody: Record<string, unknown> = {
        model_name: normalizedModel,
        prompt: fullPrompt,
        image: cleanBase64ForKling(avatarImage.base64),
        voice_list: [{ voice_id: voiceId }],
        sound: 'on',
        cfg_scale: 0.5,
        mode,
        duration,
    }

    const submitResponse = await klingRequest<KlingTaskResponse>(
        '/v1/videos/image2video',
        'POST',
        requestBody
    )

    if (submitResponse.code !== 0) {
        throw new Error(`Kling Avatar Dialogue API Error: ${submitResponse.message}`)
    }

    const taskId = submitResponse.data.task_id
    console.log('[Kling] Avatar dialogue task submitted:', taskId)

    const result = await pollImage2VideoTaskResult(taskId)

    if (!result.task_result?.videos?.[0]?.url) {
        throw new Error('Avatar dialogue video completed but no URL returned')
    }

    const videoUrl = result.task_result.videos[0].url
    console.log('[Kling] Avatar dialogue video generated successfully:', videoUrl)

    return videoUrl
}

// ===============================================
// MOTION CONTROL (v2.6+)
// ===============================================

// Supabase URL for public file access
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

/**
 * Upload a file to Supabase Storage and get a public URL
 * Used for Motion Control which requires HTTP URLs
 */
async function uploadToTempStorage(
    base64Data: string,
    mimeType: string,
    fileType: 'image' | 'video'
): Promise<{ url: string; path: string }> {
    const supabase = createServerSupabaseClient()

    // Clean base64 - remove data URI prefix if present
    const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data

    // Convert base64 to buffer
    const buffer = Buffer.from(cleanBase64, 'base64')

    // Generate unique filename
    const extension = fileType === 'video' ? 'mp4' : (mimeType.includes('png') ? 'png' : 'jpg')
    const fileName = `kling-temp/${fileType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${extension}`

    // Upload to storage
    const { error } = await supabase.storage
        .from('generations')
        .upload(fileName, buffer, {
            contentType: mimeType,
            cacheControl: '300', // 5 min cache
            upsert: true,
        })

    if (error) {
        console.error('[Kling] Storage upload error:', error)
        throw new Error(`Failed to upload ${fileType} to storage: ${error.message}`)
    }

    // Get public URL
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/generations/${fileName}`
    console.log(`[Kling] Uploaded ${fileType} to:`, publicUrl)

    return { url: publicUrl, path: fileName }
}

/**
 * Delete temporary files from storage after use
 */
async function cleanupTempFiles(paths: string[]): Promise<void> {
    try {
        const supabase = createServerSupabaseClient()
        await supabase.storage.from('generations').remove(paths)
        console.log('[Kling] Cleaned up temp files:', paths)
    } catch (error) {
        console.error('[Kling] Failed to cleanup temp files:', error)
        // Don't throw - cleanup failure shouldn't break the flow
    }
}

/**
 * Poll for motion control task completion
 * Default timeout: 15 minutes (180 attempts * 5 seconds)
 */
async function pollMotionTaskResult(taskId: string, maxAttempts = 180, intervalMs = 5000): Promise<KlingTaskResultResponse['data']> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const result = await klingRequest<KlingTaskResultResponse>(
            `/v1/videos/motion-control/${taskId}`,
            'GET'
        )

        console.log(`[Kling] Motion Task ${taskId} status: ${result.data.task_status} (attempt ${attempt + 1}/${maxAttempts})`)

        if (result.data.task_status === 'succeed') {
            return result.data
        }

        if (result.data.task_status === 'failed') {
            throw new Error(`Kling motion task failed: ${result.data.task_status_msg || 'Unknown error'}`)
        }

        await new Promise(resolve => setTimeout(resolve, intervalMs))
    }

    throw new Error('Kling motion task timed out waiting for completion')
}

/**
 * Generate video with Motion Control
 * Transfer motion from a reference video or preset to a character image
 * Requires model v2.6+
 *
 * Motion Control allows you to:
 * - Use a reference video to transfer its motion to your character image
 * - Use preset motions like dances, martial arts, running, etc.
 * - Use a direct URL to a video (Instagram, TikTok, etc.)
 *
 * @example
 * // Using a reference video (base64)
 * await generateVideoWithMotionControl({
 *   characterImage: { base64: "...", mimeType: "image/jpeg" },
 *   motionVideo: { base64: "...", mimeType: "video/mp4" },
 *   motionOrientation: "video",
 *   prompt: "A person dancing energetically",
 * })
 *
 * @example
 * // Using a direct URL
 * await generateVideoWithMotionControl({
 *   characterImage: { base64: "...", mimeType: "image/jpeg" },
 *   motionVideoUrl: "https://example.com/dance.mp4",
 *   motionOrientation: "video",
 *   prompt: "Dance performance",
 * })
 *
 * @example
 * // Using a preset motion
 * await generateVideoWithMotionControl({
 *   characterImage: { base64: "...", mimeType: "image/jpeg" },
 *   presetMotion: "subject_3_dance",
 *   motionOrientation: "video",
 *   prompt: "Dance performance",
 * })
 */
export async function generateVideoWithMotionControl(params: {
    characterImage: ImageData
    motionVideo?: ImageData // Video file with motion to transfer (base64)
    motionVideoUrl?: string // Direct URL to motion video (Instagram, TikTok, etc.)
    presetMotion?: KlingMotionPreset // Or use a preset instead of video
    motionOrientation?: KlingMotionOrientation // 'video' for body motions, 'image' for camera
    keepOriginalSound?: boolean
    prompt?: string
    duration?: KlingDuration // '5' or '10' seconds
    mode?: KlingMode
    modelName?: KlingModel
}): Promise<string> {
    const {
        characterImage,
        motionVideo,
        motionVideoUrl,
        presetMotion,
        motionOrientation = 'video',
        keepOriginalSound = false,
        prompt = '',
        duration = '5',
        mode = 'std',
        modelName = 'kling-v2-6', // v2.6 required for motion control
    } = params

    // Count motion sources
    const motionSources = [motionVideo, motionVideoUrl, presetMotion].filter(Boolean).length

    // Validate: must have exactly one motion source
    if (motionSources === 0) {
        throw new Error('One of motionVideo, motionVideoUrl, or presetMotion must be provided')
    }
    if (motionSources > 1) {
        throw new Error('Cannot use multiple motion sources - choose one: motionVideo, motionVideoUrl, or presetMotion')
    }

    const normalizedModel = normalizeKlingModelName(modelName)

    // Determine motion source type for logging
    let motionSourceType = 'preset'
    if (motionVideo) motionSourceType = 'uploaded video'
    if (motionVideoUrl) motionSourceType = 'external URL'

    console.log('[Kling] ====== MOTION CONTROL REQUEST ======')
    console.log('[Kling] Model:', normalizedModel)
    console.log('[Kling] Motion source:', presetMotion ? `preset: ${presetMotion}` : motionSourceType)
    console.log('[Kling] Orientation:', motionOrientation)
    console.log('[Kling] Duration:', duration)
    console.log('[Kling] Keep original sound:', keepOriginalSound)
    console.log('[Kling] Character image size:', characterImage.base64.length, 'chars')
    if (motionVideoUrl) console.log('[Kling] Motion video URL:', motionVideoUrl)

    // Motion Control API requires public HTTP URLs (not base64 or data URIs)
    // Upload files to Supabase Storage first (only for base64 data)
    const tempFilePaths: string[] = []

    try {
        // Upload character image to get public URL
        console.log('[Kling] Uploading character image to storage...')
        const imageUpload = await uploadToTempStorage(
            characterImage.base64,
            characterImage.mimeType,
            'image'
        )
        tempFilePaths.push(imageUpload.path)

        const requestBody: Record<string, unknown> = {
            model_name: normalizedModel,
            image_url: imageUpload.url,
            character_orientation: motionOrientation,
            duration,
            mode,
        }

        // Add motion source
        if (motionVideo) {
            // Base64 video - needs to be uploaded to storage
            console.log('[Kling] Uploading motion video to storage...')
            const videoUpload = await uploadToTempStorage(
                motionVideo.base64,
                motionVideo.mimeType,
                'video'
            )
            tempFilePaths.push(videoUpload.path)
            requestBody.video_url = videoUpload.url

            if (keepOriginalSound) {
                requestBody.keep_origin_sound = true
            }
            console.log('[Kling] Custom video uploaded:', videoUpload.url)
        } else if (motionVideoUrl) {
            // Direct URL - use it directly without uploading
            requestBody.video_url = motionVideoUrl
            if (keepOriginalSound) {
                requestBody.keep_origin_sound = true
            }
            console.log('[Kling] Using external video URL directly:', motionVideoUrl)
        } else if (presetMotion) {
            requestBody.preset_motion = presetMotion
        }

        // Add prompt if provided
        if (prompt) {
            requestBody.prompt = prompt
        }

        console.log('[Kling] Submitting motion control request...')
        const submitResponse = await klingRequest<KlingTaskResponse>(
            '/v1/videos/motion-control',
            'POST',
            requestBody
        )

        if (submitResponse.code !== 0) {
            throw new Error(`Kling Motion Control API Error: ${submitResponse.message}`)
        }

        const taskId = submitResponse.data.task_id
        console.log('[Kling] Motion control task submitted:', taskId)

        const result = await pollMotionTaskResult(taskId)

        if (!result.task_result?.videos?.[0]?.url) {
            throw new Error('Motion control video completed but no URL returned')
        }

        const videoUrl = result.task_result.videos[0].url
        console.log('[Kling] Motion control video generated successfully:', videoUrl)

        return videoUrl
    } finally {
        // Cleanup temporary files after a delay to ensure Kling has fetched them
        // We delay cleanup to give Kling time to download the files
        if (tempFilePaths.length > 0) {
            setTimeout(() => {
                cleanupTempFiles(tempFilePaths)
            }, 60000) // 1 minute delay
        }
    }
}
