/**
 * Kling AI API Types
 * Documentation: https://api-singapore.klingai.com
 */

// ===============================================
// MODELS
// ===============================================

export type KlingModel =
    | 'kling-v1'
    | 'kling-v1-5'
    | 'kling-v1-6'
    | 'kling-v2-master'
    | 'kling-v2-1'
    | 'kling-v2-1-master'
    | 'kling-v2-5-turbo'
    | 'kling-v2-6'

export type KlingMode = 'std' | 'pro'
export type KlingDuration = '5' | '10'
export type KlingSoundOption = 'on' | 'off'

// ===============================================
// VOICE GENERATION (v2.6+)
// ===============================================

export interface KlingVoice {
    voice_id: string
}

// Placeholder voice IDs - will be updated with official IDs
export const KLING_VOICE_PRESETS: { id: string; label: string; description: string }[] = [
    { id: 'voice_placeholder_1', label: 'Voice 1', description: 'Placeholder - update with official voice ID' },
    { id: 'voice_placeholder_2', label: 'Voice 2', description: 'Placeholder - update with official voice ID' },
]

// ===============================================
// MOTION BRUSH
// ===============================================

export interface KlingTrajectoryPoint {
    x: number // Coordinate X (pixel coordinate, origin at bottom-left)
    y: number // Coordinate Y (pixel coordinate, origin at bottom-left)
}

export interface KlingDynamicMask {
    mask: string // Base64 of mask image (WITHOUT data: prefix) or URL
    trajectories: KlingTrajectoryPoint[] // 2-77 points for 5s video
}

export interface KlingMotionBrushConfig {
    staticMask?: string // Areas that should NOT move
    dynamicMasks?: KlingDynamicMask[] // Up to 6 dynamic mask groups
}

// ===============================================
// CAMERA CONTROL
// ===============================================

export type KlingCameraControlType =
    | 'simple' // Custom config with 6 parameters
    | 'down_back' // Camera descends and moves backward
    | 'forward_up' // Camera moves forward and tilts up
    | 'right_turn_forward' // Rotate right and move forward
    | 'left_turn_forward' // Rotate left and move forward

export interface KlingCameraSimpleConfig {
    horizontal?: number // -10 to 10 (pan along x-axis)
    vertical?: number // -10 to 10 (pan along y-axis)
    pan?: number // -10 to 10 (rotation around x-axis)
    tilt?: number // -10 to 10 (rotation around y-axis)
    roll?: number // -10 to 10 (rotation around z-axis)
    zoom?: number // -10 to 10 (focal length change)
}

export interface KlingCameraControl {
    type: KlingCameraControlType
    config?: KlingCameraSimpleConfig // Only for type: 'simple'
}

// Camera control presets for UI
export const KLING_CAMERA_PRESETS: { type: KlingCameraControlType; label: string; description: string }[] = [
    { type: 'simple', label: 'Custom', description: 'Configure camera movement manually' },
    { type: 'down_back', label: 'Down & Back', description: 'Camera descends and moves backward' },
    { type: 'forward_up', label: 'Forward & Up', description: 'Camera moves forward and tilts up' },
    { type: 'right_turn_forward', label: 'Right Turn', description: 'Rotate right while moving forward' },
    { type: 'left_turn_forward', label: 'Left Turn', description: 'Rotate left while moving forward' },
]

// ===============================================
// REQUEST TYPES
// ===============================================

export interface KlingImage2VideoRequest {
    model_name: KlingModel
    image: string // Base64 WITHOUT prefix or URL
    image_tail?: string // End frame control (optional)
    prompt: string // Use <<<voice_1>>> for voice markers
    negative_prompt?: string
    cfg_scale?: number // 0-1
    mode: KlingMode
    duration: KlingDuration

    // Voice Generation (v2.6+ only)
    voice_list?: KlingVoice[]
    sound?: KlingSoundOption

    // Motion Brush
    static_mask?: string
    dynamic_masks?: KlingDynamicMask[]

    // Camera Control
    camera_control?: KlingCameraControl

    // Callbacks
    callback_url?: string
    external_task_id?: string
}

export interface KlingText2VideoRequest {
    model_name: KlingModel
    prompt: string
    negative_prompt?: string
    cfg_scale?: number
    mode: KlingMode
    aspect_ratio: string
    duration: KlingDuration
    camera_control?: KlingCameraControl
    callback_url?: string
    external_task_id?: string
}

// ===============================================
// RESPONSE TYPES
// ===============================================

export type KlingTaskStatus = 'submitted' | 'processing' | 'succeed' | 'failed'

export interface KlingVideoResult {
    id: string
    url: string
    duration: string
}

export interface KlingImageResult {
    index: number
    url: string
}

export interface KlingTaskResponse {
    code: number
    message: string
    request_id: string
    data: {
        task_id: string
        task_status: string
        task_status_msg?: string
        task_info?: {
            external_task_id?: string
        }
        created_at?: number
        updated_at?: number
    }
}

export interface KlingTaskResultResponse {
    code: number
    message: string
    request_id: string
    data: {
        task_id: string
        task_status: KlingTaskStatus
        task_status_msg?: string
        task_info?: {
            external_task_id?: string
        }
        created_at?: number
        updated_at?: number
        task_result?: {
            videos?: KlingVideoResult[]
            images?: KlingImageResult[]
        }
    }
}

// ===============================================
// SERVICE PARAMETER TYPES
// ===============================================

export interface GenerateVideoWithVoiceParams {
    prompt: string
    image: { base64: string; mimeType: string }
    voiceList: KlingVoice[]
    dialogue: string
    duration?: KlingDuration
    mode?: KlingMode
    modelName?: KlingModel
}

export interface GenerateVideoWithMotionBrushParams {
    prompt: string
    image: { base64: string; mimeType: string }
    staticMask?: string
    dynamicMasks?: KlingDynamicMask[]
    duration?: KlingDuration
    mode?: KlingMode
    modelName?: KlingModel
}

export interface GenerateVideoWithCameraControlParams {
    prompt: string
    image?: { base64: string; mimeType: string }
    cameraControl: KlingCameraControl
    aspectRatio?: string
    duration?: KlingDuration
    mode?: KlingMode
    modelName?: KlingModel
}

export interface GenerateAvatarWithDialogueParams {
    avatarImage: { base64: string; mimeType: string }
    dialogue: string
    voiceId: string
    prompt?: string
    duration?: KlingDuration
    mode?: KlingMode
    modelName?: KlingModel
}

// ===============================================
// MOTION CONTROL (v2.6+)
// ===============================================

export type KlingMotionOrientation = 'video' | 'image'

export interface GenerateVideoWithMotionControlParams {
    characterImage: { base64: string; mimeType: string }
    motionVideo?: { base64: string; mimeType: string } // Motion reference video
    presetMotion?: KlingMotionPreset // Preset motion instead of video
    motionOrientation?: KlingMotionOrientation // 'video' for complex motions, 'image' for camera movements
    keepOriginalSound?: boolean
    prompt?: string
    mode?: KlingMode
    modelName?: KlingModel
}

// Preset motions available in Kling Motion Control
export type KlingMotionPreset =
    | 'cute_baby_dance'
    | 'nezha'
    | 'heart_gesture_dance'
    | 'motorcycle_dance'
    | 'subject_3_dance'
    | 'ghost_step_dance'
    | 'martial_arts'
    | 'running'
    | 'popping'

export const KLING_MOTION_PRESETS: { id: KlingMotionPreset; label: string; description: string }[] = [
    { id: 'cute_baby_dance', label: 'Cute Baby Dance', description: 'Adorable baby-style dance moves' },
    { id: 'nezha', label: 'Nezha', description: 'Inspired by Chinese mythology character' },
    { id: 'heart_gesture_dance', label: 'Heart Gesture Dance', description: 'Dance with heart-shaped hand gestures' },
    { id: 'motorcycle_dance', label: 'Motorcycle Dance', description: 'Motorcycle-style dance moves' },
    { id: 'subject_3_dance', label: 'Subject 3 Dance', description: 'Popular viral dance trend' },
    { id: 'ghost_step_dance', label: 'Ghost Step Dance', description: 'Smooth gliding dance moves' },
    { id: 'martial_arts', label: 'Martial Arts', description: 'Kung fu and martial arts moves' },
    { id: 'running', label: 'Running', description: 'Running motion' },
    { id: 'popping', label: 'Popping', description: 'Popping dance style' },
]

// ===============================================
// ERROR CODES
// ===============================================

export const KLING_ERROR_CODES: Record<number, { service: string; description: string }> = {
    0: { service: 'Request', description: 'Success' },
    1000: { service: 'Authentication failed', description: 'Check if the Authorization is correct' },
    1001: { service: 'Authorization is empty', description: 'Fill in the correct Authorization in the Request Header' },
    1002: { service: 'Authorization is invalid', description: 'Fill in the correct Authorization in the Request Header' },
    1003: { service: 'Authorization is not yet valid', description: 'Check the start effective time of the token' },
    1004: { service: 'Authorization has expired', description: 'Check the validity period of the token and reissue it' },
    1100: { service: 'Account exception', description: 'Verifying account configuration information' },
    1101: { service: 'Account in arrears', description: 'Recharge the account to ensure sufficient balance' },
    1102: { service: 'Resource pack depleted', description: 'Purchase additional resource packages' },
    1103: { service: 'Unauthorized access', description: 'Verifying account permissions' },
    1200: { service: 'Invalid request parameters', description: 'Check whether the request parameters are correct' },
    1201: { service: 'Invalid parameters', description: 'Refer to the specific information in the message field' },
    1202: { service: 'The requested method is invalid', description: 'Review the API documentation and use the correct request method' },
    1203: { service: 'The requested resource does not exist', description: 'Refer to the specific information in the message field' },
    1300: { service: 'Trigger strategy', description: 'Check if any platform policies have been triggered' },
    1301: { service: 'Trigger the content security policy', description: 'Check the input content, modify it, and resend the request' },
    1302: { service: 'The API request is too fast', description: 'Reduce the request frequency or contact customer service' },
    1303: { service: 'Concurrency or QPS exceeds limit', description: 'Reduce the request frequency or contact customer service' },
    1304: { service: "Trigger the platform's IP whitelisting policy", description: 'Contact customer service' },
    5000: { service: 'Server internal error', description: 'Try again later, or contact customer service' },
    5001: { service: 'Server temporarily unavailable', description: 'Try again later, or contact customer service' },
    5002: { service: 'Server internal timeout', description: 'Try again later, or contact customer service' },
}
