import type {
    Avatar,
    AvatarReference,
    Generation,
    AIProvider,
    MediaType,
    AspectRatio,
    PhysicalMeasurements,
    GenerationMetadata
} from '@/@types/supabase'

// Prompt Segment for tracking different sources of prompt content
export type PromptSegmentSource =
    | 'manual'          // User typed directly
    | 'img-prompt'      // From image-to-prompt tool
    | 'style-ref'       // From style reference
    | 'pose-ref'        // From pose reference
    | 'shot'            // From camera shot selection
    | 'style'           // From quick style selection
    | 'action'          // From action preset
    | 'enhanced'        // From AI enhancement

export interface PromptSegment {
    id: string
    source: PromptSegmentSource
    content: string
    label: string       // Display label for the tag
    removable: boolean  // Whether it can be removed by user
}

// Source colors for UI
export const PROMPT_SEGMENT_COLORS: Record<PromptSegmentSource, { bg: string; text: string; border: string }> = {
    'manual': { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-300', border: 'border-gray-300' },
    'img-prompt': { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-400' },
    'style-ref': { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-400' },
    'pose-ref': { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', border: 'border-green-400' },
    'shot': { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-400' },
    'style': { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-700 dark:text-cyan-300', border: 'border-cyan-400' },
    'action': { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-400' },
    'enhanced': { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-700 dark:text-pink-300', border: 'border-pink-400' },
}

// Reference Image with URL for display
export interface ReferenceImage {
    id: string
    url: string
    mimeType: string
    base64: string
    type: 'general' | 'face' | 'angle' | 'body' | 'pose'
    storagePath?: string
    thumbnailUrl?: string // Optimized thumbnail for UI display
}

// Avatar info stored with each generation
export interface GeneratedAvatarInfo {
    name: string
    thumbnailUrl?: string
}

// Generated content
export interface GeneratedMedia {
    id: string
    url: string
    prompt: string
    aspectRatio: AspectRatio
    timestamp: number
    mediaType: MediaType
    metadata?: GenerationMetadata
    avatarInfo?: GeneratedAvatarInfo // Avatar used to create this media
    fullApiPrompt?: string // Full prompt sent to the API (for debugging)
}

// App states
export enum AppState {
    IDLE = 'IDLE',
    AVATAR_DEFINED = 'AVATAR_DEFINED',
    GENERATING = 'GENERATING',
    SUCCESS = 'SUCCESS',
    ERROR = 'ERROR',
}

// Video specific types
export type VideoResolution = '480p' | '720p' | '1080p'
export type CameraMotion = 'NONE' | 'PUSH_IN' | 'PULL_OUT' | 'PAN_LEFT' | 'PAN_RIGHT' | 'TILT_UP' | 'TILT_DOWN' | 'ORBIT_LEFT' | 'ORBIT_RIGHT'
export type SubjectAction = 'NONE' | 'WALKING' | 'RUNNING' | 'DANCING' | 'TALKING' | 'GESTURING' | 'SITTING' | 'STANDING'

// Camera shot types for image generation (framing + angle)
export type CameraShot =
    // Framing
    | 'AUTO' | 'EXTREME_CLOSE_UP' | 'CLOSE_UP' | 'MEDIUM_CLOSE_UP' | 'MEDIUM_SHOT' | 'MEDIUM_FULL' | 'FULL_SHOT' | 'WIDE_SHOT' | 'EXTREME_WIDE'
    // Angles
    | 'LOW_ANGLE' | 'HIGH_ANGLE' | 'DUTCH_ANGLE' | 'BIRDS_EYE' | 'WORMS_EYE' | 'OVER_SHOULDER' | 'POV' | 'PROFILE' | 'THREE_QUARTER'

// Provider selection
export interface ProviderOption {
    id: string
    name: string
    type: string
    model: string
    supportsImage: boolean
    supportsVideo: boolean
}

// Current avatar editing state
export interface AvatarEditorState {
    avatar: Avatar | null
    references: ReferenceImage[]
    faceRef: ReferenceImage | null
    angleRef: ReferenceImage | null
    bodyRef: ReferenceImage | null
    identityWeight: number
    measurements: PhysicalMeasurements
    faceDescription: string
}

// Quick style preset type
export type StyleCategory = 'lighting' | 'mood' | 'film' | 'quality' | 'art' | 'color' | 'makeup'

export interface QuickStyleOption {
    value: string
    label: string
    description: string
    category: StyleCategory
}

// Quick style presets with categories and descriptions
export const QUICK_STYLES: QuickStyleOption[] = [
    // Lighting
    { value: 'warm-professional', label: 'Warm Professional', description: 'Soft, flattering studio lighting', category: 'lighting' },
    { value: 'cinematic-lighting', label: 'Cinematic Lighting', description: 'Movie-quality dramatic lighting', category: 'lighting' },
    { value: 'golden-hour', label: 'Golden Hour', description: 'Warm sunset/sunrise glow', category: 'lighting' },
    { value: 'natural-soft', label: 'Natural Soft Light', description: 'Diffused daylight, no harsh shadows', category: 'lighting' },
    { value: 'rembrandt', label: 'Rembrandt Lighting', description: 'Classic portrait triangle shadow', category: 'lighting' },
    { value: 'rim-light', label: 'Rim/Back Light', description: 'Glowing edge outline effect', category: 'lighting' },
    { value: 'high-key', label: 'High Key', description: 'Bright, minimal shadows, airy', category: 'lighting' },
    { value: 'low-key', label: 'Low Key', description: 'Dark, dramatic, moody shadows', category: 'lighting' },
    { value: 'split-lighting', label: 'Split Lighting', description: 'Half face lit, half in shadow', category: 'lighting' },
    { value: 'butterfly', label: 'Butterfly/Paramount', description: 'Classic Hollywood glamour lighting', category: 'lighting' },
    { value: 'selfie', label: 'Selfie', description: 'Casual smartphone selfie, natural front-facing light', category: 'lighting' },
    { value: 'iphone', label: 'iPhone', description: 'Apple camera aesthetic, vibrant colors, smart HDR', category: 'lighting' },

    // Mood/Atmosphere
    { value: 'dramatic-noir', label: 'Dramatic Noir', description: 'Dark, mysterious, high contrast', category: 'mood' },
    { value: 'dreamy-ethereal', label: 'Dreamy Ethereal', description: 'Soft, hazy, romantic feel', category: 'mood' },
    { value: 'moody-atmospheric', label: 'Moody Atmospheric', description: 'Emotional depth, rich tones', category: 'mood' },
    { value: 'energetic-vibrant', label: 'Energetic Vibrant', description: 'Bold, dynamic, lively', category: 'mood' },
    { value: 'serene-calm', label: 'Serene & Calm', description: 'Peaceful, tranquil atmosphere', category: 'mood' },
    { value: 'mysterious', label: 'Mysterious', description: 'Intriguing, shadowy, enigmatic', category: 'mood' },
    { value: 'romantic', label: 'Romantic', description: 'Soft, warm, intimate feeling', category: 'mood' },
    { value: 'edgy-gritty', label: 'Edgy & Gritty', description: 'Raw, urban, intense', category: 'mood' },

    // Film Styles
    { value: 'documentary', label: 'Documentary Style', description: 'Authentic, journalistic look', category: 'film' },
    { value: 'film-grain', label: 'Film Grain 35mm', description: 'Classic analog film texture', category: 'film' },
    { value: 'vintage-70s', label: 'Vintage 70s', description: 'Warm tones, soft focus, retro', category: 'film' },
    { value: 'vintage-80s', label: 'Vintage 80s', description: 'Neon colors, bold contrasts', category: 'film' },
    { value: 'vintage-90s', label: 'Vintage 90s', description: 'Muted colors, grunge aesthetic', category: 'film' },
    { value: 'polaroid', label: 'Polaroid', description: 'Instant film, faded edges', category: 'film' },
    { value: 'kodak-portra', label: 'Kodak Portra 400', description: 'Warm skin tones, fine grain', category: 'film' },
    { value: 'fuji-velvia', label: 'Fuji Velvia', description: 'Vivid colors, high saturation', category: 'film' },

    // Quality/Technical
    { value: 'ultra-4k', label: 'Ultra HD 4K', description: 'Maximum detail and clarity', category: 'quality' },
    { value: 'shallow-dof', label: 'Shallow Depth of Field', description: 'Blurred background, sharp subject', category: 'quality' },
    { value: 'sharp-crisp', label: 'Sharp & Crisp', description: 'High definition, precise details', category: 'quality' },
    { value: 'bokeh', label: 'Beautiful Bokeh', description: 'Creamy background blur circles', category: 'quality' },
    { value: 'hdr', label: 'HDR Effect', description: 'Extended dynamic range', category: 'quality' },
    { value: 'corporate-clean', label: 'Corporate Clean', description: 'Professional, polished look', category: 'quality' },

    // Art Styles
    { value: 'cyberpunk-neon', label: 'Cyberpunk Neon', description: 'Futuristic, neon-lit, tech noir', category: 'art' },
    { value: 'vaporwave', label: 'Vaporwave', description: 'Retro-futuristic, pink/purple', category: 'art' },
    { value: 'anime-style', label: 'Anime Inspired', description: 'Japanese animation aesthetic', category: 'art' },
    { value: 'oil-painting', label: 'Oil Painting', description: 'Classical painterly texture', category: 'art' },
    { value: 'watercolor', label: 'Watercolor', description: 'Soft, flowing paint effect', category: 'art' },
    { value: 'pop-art', label: 'Pop Art', description: 'Bold colors, Warhol-style', category: 'art' },
    { value: 'fashion-editorial', label: 'Fashion Editorial', description: 'High-fashion magazine style', category: 'art' },
    { value: 'comic-book', label: 'Comic Book', description: 'Bold lines, graphic novel style', category: 'art' },

    // Color Palettes
    { value: 'teal-orange', label: 'Teal & Orange', description: 'Hollywood color grading', category: 'color' },
    { value: 'desaturated', label: 'Desaturated', description: 'Muted, understated colors', category: 'color' },
    { value: 'high-contrast-bw', label: 'High Contrast B&W', description: 'Bold black and white', category: 'color' },
    { value: 'pastel', label: 'Pastel Colors', description: 'Soft, light, dreamy tones', category: 'color' },
    { value: 'earth-tones', label: 'Earth Tones', description: 'Warm browns, greens, naturals', category: 'color' },
    { value: 'cool-blue', label: 'Cool Blue', description: 'Cold, blue-tinted atmosphere', category: 'color' },
    { value: 'warm-sepia', label: 'Warm Sepia', description: 'Vintage brownish-gold tint', category: 'color' },
    { value: 'monochrome', label: 'Monochrome', description: 'Single color variations', category: 'color' },

    // Makeup
    { value: 'makeup-natural', label: 'Natural/No Makeup', description: 'Clean, bare-faced look with minimal enhancement', category: 'makeup' },
    { value: 'makeup-subtle', label: 'Subtle Glow', description: 'Light, barely-there makeup with soft enhancement', category: 'makeup' },
    { value: 'makeup-everyday', label: 'Everyday Casual', description: 'Polished but effortless daily makeup look', category: 'makeup' },
    { value: 'makeup-glamorous', label: 'Glamorous', description: 'Full glam with lashes, contour, and bold lips', category: 'makeup' },
    { value: 'makeup-dramatic', label: 'Bold Dramatic', description: 'High-impact theatrical makeup', category: 'makeup' },
    { value: 'makeup-editorial', label: 'Editorial Avant-garde', description: 'Artistic, fashion-forward creative makeup', category: 'makeup' },
    { value: 'makeup-smoky-eye', label: 'Smoky Eye', description: 'Classic smoky eye with blended dark shadows', category: 'makeup' },
    { value: 'makeup-cat-eye', label: 'Cat Eye/Winged', description: 'Sharp winged eyeliner, feline look', category: 'makeup' },
    { value: 'makeup-red-lips', label: 'Classic Red Lips', description: 'Timeless red lipstick, polished finish', category: 'makeup' },
    { value: 'makeup-nude-lips', label: 'Nude MLBB', description: 'My-lips-but-better subtle lip color', category: 'makeup' },
    { value: 'makeup-dewy', label: 'Dewy Glass Skin', description: 'Luminous, hydrated, glass-skin effect', category: 'makeup' },
    { value: 'makeup-matte', label: 'Matte Perfection', description: 'Flawless matte finish, shine-free', category: 'makeup' },
    { value: 'makeup-contoured', label: 'Sculpted Contour', description: 'Defined cheekbones and jawline', category: 'makeup' },
    { value: 'makeup-bronzed', label: 'Sun-kissed Bronze', description: 'Warm, glowing, bronzed complexion', category: 'makeup' },
    { value: 'makeup-kbeauty', label: 'K-beauty Style', description: 'Korean-inspired gradient lips, soft blush', category: 'makeup' },
]

// Category labels for UI
export const STYLE_CATEGORIES: { value: StyleCategory; label: string }[] = [
    { value: 'lighting', label: 'Lighting' },
    { value: 'mood', label: 'Mood & Atmosphere' },
    { value: 'film', label: 'Film Styles' },
    { value: 'quality', label: 'Quality & Technical' },
    { value: 'art', label: 'Art Styles' },
    { value: 'color', label: 'Color Palettes' },
    { value: 'makeup', label: 'Makeup' },
]

// Aspect ratio options
export const ASPECT_RATIOS: { value: AspectRatio; label: string }[] = [
    { value: '1:1', label: 'Square (1:1)' },
    { value: '16:9', label: 'Landscape (16:9)' },
    { value: '9:16', label: 'Portrait (9:16)' },
    { value: '4:3', label: 'Standard (4:3)' },
    { value: '3:4', label: 'Vertical (3:4)' },
]

// Camera motion options
export const CAMERA_MOTIONS: { value: CameraMotion; label: string }[] = [
    { value: 'NONE', label: 'None' },
    { value: 'PUSH_IN', label: 'Push In (Zoom)' },
    { value: 'PULL_OUT', label: 'Pull Out' },
    { value: 'PAN_LEFT', label: 'Pan Left' },
    { value: 'PAN_RIGHT', label: 'Pan Right' },
    { value: 'TILT_UP', label: 'Tilt Up' },
    { value: 'TILT_DOWN', label: 'Tilt Down' },
    { value: 'ORBIT_LEFT', label: 'Orbit Left' },
    { value: 'ORBIT_RIGHT', label: 'Orbit Right' },
]

// Subject actions
export const SUBJECT_ACTIONS: { value: SubjectAction; label: string }[] = [
    { value: 'NONE', label: 'None' },
    { value: 'WALKING', label: 'Walking' },
    { value: 'RUNNING', label: 'Running' },
    { value: 'DANCING', label: 'Dancing' },
    { value: 'TALKING', label: 'Talking' },
    { value: 'GESTURING', label: 'Gesturing' },
    { value: 'SITTING', label: 'Sitting' },
    { value: 'STANDING', label: 'Standing' },
]

// Camera shot options for image generation
export const CAMERA_SHOTS: { value: CameraShot; label: string; description: string; category: 'framing' | 'angle' }[] = [
    // Framing options
    { value: 'AUTO', label: 'Auto', description: 'AI decides best framing', category: 'framing' },
    { value: 'EXTREME_CLOSE_UP', label: 'Extreme Close-Up', description: 'Face details, eyes', category: 'framing' },
    { value: 'CLOSE_UP', label: 'Close-Up', description: 'Head and shoulders', category: 'framing' },
    { value: 'MEDIUM_CLOSE_UP', label: 'Medium Close-Up', description: 'Chest up', category: 'framing' },
    { value: 'MEDIUM_SHOT', label: 'Medium Shot', description: 'Waist up', category: 'framing' },
    { value: 'MEDIUM_FULL', label: 'Medium Full', description: 'Knees up', category: 'framing' },
    { value: 'FULL_SHOT', label: 'Full Shot', description: 'Full body', category: 'framing' },
    { value: 'WIDE_SHOT', label: 'Wide Shot', description: 'Body with environment', category: 'framing' },
    { value: 'EXTREME_WIDE', label: 'Extreme Wide', description: 'Landscape with subject', category: 'framing' },
    // Angle options
    { value: 'LOW_ANGLE', label: 'Low Angle', description: 'Camera looking up at subject', category: 'angle' },
    { value: 'HIGH_ANGLE', label: 'High Angle', description: 'Camera looking down at subject', category: 'angle' },
    { value: 'DUTCH_ANGLE', label: 'Dutch Angle', description: 'Tilted/diagonal framing', category: 'angle' },
    { value: 'BIRDS_EYE', label: "Bird's Eye", description: 'Directly from above', category: 'angle' },
    { value: 'WORMS_EYE', label: "Worm's Eye", description: 'Directly from below', category: 'angle' },
    { value: 'OVER_SHOULDER', label: 'Over Shoulder', description: 'From behind shoulder', category: 'angle' },
    { value: 'POV', label: 'POV', description: 'First person perspective', category: 'angle' },
    { value: 'PROFILE', label: 'Profile', description: 'Side view of face', category: 'angle' },
    { value: 'THREE_QUARTER', label: '3/4 View', description: '45° angle portrait', category: 'angle' },
]

// Re-export database types
export type { Avatar, AvatarReference, Generation, AIProvider, MediaType, AspectRatio, PhysicalMeasurements }
