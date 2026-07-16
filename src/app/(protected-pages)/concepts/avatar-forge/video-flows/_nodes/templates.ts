import type { VideoNodeTemplate } from '../_engine/types'

// Ports are TYPED BUNDLES: one `avatar` cable carries id + references +
// faceRef + measurements together (the avatar already owns all of that);
// `image`/`video`/`audio` cables carry { kind, url, base64?, ... }. This keeps
// the canvas readable — one wire per concept instead of four parallel wires.
export const NODE_TEMPLATES: VideoNodeTemplate[] = [
    // ─── Trigger ─────────────────────────────────────────────
    {
        type: 'manual-trigger',
        label: 'Manual Trigger',
        category: 'trigger',
        icon: 'HiOutlineLightningBolt',
        description: 'Starts the flow when you press Run',
        inputs: [],
        outputs: [{ key: 'trigger', type: 'trigger' }],
        defaultData: {},
    },
    // ─── Input ───────────────────────────────────────────────
    {
        type: 'select-avatar',
        label: 'Select Avatar',
        category: 'input',
        icon: 'HiOutlineUser',
        description: 'Pick an avatar from your gallery',
        inputs: [{ key: 'trigger', type: 'trigger' }],
        outputs: [{ key: 'avatar', type: 'avatar' }],
        defaultData: { avatarId: null },
    },
    {
        type: 'from-gallery',
        label: 'From Gallery',
        category: 'input',
        icon: 'HiOutlineCollection',
        description: 'Use an existing image/video from your gallery',
        inputs: [{ key: 'trigger', type: 'trigger' }],
        outputs: [{ key: 'media', type: 'media' }],
        defaultData: { generationId: null },
    },
    {
        type: 'upload-image',
        label: 'Upload Image',
        category: 'input',
        icon: 'HiOutlineUpload',
        description: 'Upload an image from your device',
        inputs: [],
        outputs: [{ key: 'image', type: 'image' }],
        defaultData: {},
    },
    // ─── AI Processing ───────────────────────────────────────
    {
        type: 'prompt-enhance',
        label: 'Enhance Prompt',
        category: 'ai',
        icon: 'HiOutlineSparkles',
        description: 'Improve prompt with AI details',
        inputs: [{ key: 'prompt', type: 'text' }],
        outputs: [{ key: 'prompt', type: 'text' }],
        defaultData: { basePrompt: '', style: 'photorealistic', intensity: 'medium' },
    },
    {
        type: 'describe-image',
        label: 'Img→Prompt',
        category: 'ai',
        icon: 'HiOutlineEye',
        description: 'Generate text description from image (same as Studio Img→Prompt)',
        inputs: [{ key: 'image', type: 'image' }],
        outputs: [{ key: 'description', type: 'text' }],
        defaultData: { detailLevel: 'detailed' },
    },
    {
        type: 'prompt-from-video',
        label: 'Prompt from Video',
        category: 'ai',
        icon: 'HiOutlineVideoCamera',
        description: 'Analyze a video and write an i2v prompt that recreates it',
        inputs: [{ key: 'video', type: 'video' }],
        outputs: [{ key: 'prompt', type: 'text' }],
        defaultData: {},
    },
    {
        type: 'check-prompt-safety',
        label: 'Check Prompt Safety',
        category: 'ai',
        icon: 'HiOutlineShieldCheck',
        description: 'Analyze prompt safety and get an optimized safe version',
        inputs: [{ key: 'prompt', type: 'text' }],
        outputs: [
            { key: 'safePrompt', type: 'text' },
            { key: 'isSafe', type: 'any' },
        ],
        defaultData: {},
    },
    {
        type: 'caption-ai',
        label: 'Caption (AI)',
        category: 'ai',
        icon: 'HiOutlineChatAlt',
        description: 'Write a social caption + hashtags for the media',
        inputs: [{ key: 'media', type: 'media' }],
        outputs: [
            { key: 'caption', type: 'text' },
            { key: 'hashtags', type: 'any' },
        ],
        defaultData: { language: 'es', draft: '' },
    },
    // ─── Generation ──────────────────────────────────────────
    {
        type: 'generate-image',
        label: 'Generate Image',
        category: 'generation',
        icon: 'HiOutlinePhotograph',
        description: 'Generate avatar image with Gemini',
        inputs: [
            { key: 'avatar', type: 'avatar' },
            { key: 'prompt', type: 'text' },
        ],
        outputs: [{ key: 'image', type: 'image' }],
        defaultData: { prompt: '', aspectRatio: '1:1', model: 'gemini' },
    },
    {
        type: 'generate-video',
        label: 'Generate Video',
        category: 'generation',
        icon: 'HiOutlineFilm',
        description: 'Generate video from image with Kling',
        inputs: [
            { key: 'image', type: 'image' },
            { key: 'prompt', type: 'text' },
        ],
        outputs: [{ key: 'video', type: 'video' }],
        defaultData: { prompt: '', duration: '5', mode: 'standard' },
    },
    // ─── Transform ───────────────────────────────────────────
    {
        type: 'stitch',
        label: 'Stitch Videos',
        category: 'transform',
        icon: 'HiOutlineScissors',
        description: 'Concatenate multiple videos into one',
        inputs: [{ key: 'videos', type: 'video', list: true }],
        outputs: [{ key: 'video', type: 'video' }],
        defaultData: { transition: 'none' },
    },
    {
        type: 'text-overlay',
        label: 'Text Overlay',
        category: 'transform',
        icon: 'HiOutlineAnnotation',
        description: 'Add text overlay to image or video',
        inputs: [{ key: 'media', type: 'media' }],
        outputs: [{ key: 'media', type: 'media' }],
        defaultData: { text: '', position: 'bottom-center', fontSize: 24, color: '#ffffff' },
    },
    // ─── Voice ───────────────────────────────────────────────
    {
        type: 'script-generator',
        label: 'Generate Script',
        category: 'voice',
        icon: 'HiOutlineDocumentText',
        description: 'AI-generated script for video narration',
        inputs: [{ key: 'topic', type: 'text' }],
        outputs: [{ key: 'script', type: 'text' }],
        defaultData: { tone: 'professional', language: 'es', template: 'general', durationSeconds: 30 },
    },
    {
        type: 'text-to-speech',
        label: 'Text to Speech',
        category: 'voice',
        icon: 'HiOutlineMicrophone',
        description: 'Convert text to speech with MiniMax',
        inputs: [{ key: 'text', type: 'text' }],
        outputs: [{ key: 'audio', type: 'audio' }],
        defaultData: { voiceId: '', speed: 1.0, language: 'es' },
    },
    // ─── Logic ───────────────────────────────────────────────
    {
        type: 'condition',
        label: 'Condition',
        category: 'logic',
        icon: 'HiOutlineSwitchHorizontal',
        description: 'Branch flow based on a condition',
        inputs: [{ key: 'value', type: 'any' }],
        outputs: [
            { key: 'true', type: 'any' },
            { key: 'false', type: 'any' },
        ],
        defaultData: { field: '', operator: 'equals', compareValue: '' },
    },
    // ─── Output ──────────────────────────────────────────────
    {
        type: 'save-to-gallery',
        label: 'Save to Gallery',
        category: 'output',
        icon: 'HiOutlineSave',
        description: 'Save generated media to avatar gallery',
        inputs: [
            { key: 'media', type: 'media' },
            { key: 'avatar', type: 'avatar' },
        ],
        outputs: [{ key: 'media', type: 'media' }],
        defaultData: { collection: 'default' },
    },
    {
        type: 'fanvue-post',
        label: 'Fanvue: Post',
        category: 'output',
        icon: 'HiOutlineHeart',
        description: 'Publish a saved gallery item to Fanvue',
        inputs: [
            { key: 'media', type: 'media' },
            { key: 'caption', type: 'text' },
        ],
        outputs: [{ key: 'post', type: 'any' }],
        defaultData: {
            audience: 'subscribers',
            priceCents: 0,
            creatorUserUuid: '',
        },
    },
    {
        type: 'social-post',
        label: 'Social: Publish',
        category: 'output',
        icon: 'HiOutlineGlobeAlt',
        description: 'Publish a saved gallery item to Instagram/TikTok via Upload-Post',
        inputs: [
            { key: 'media', type: 'media' },
            { key: 'caption', type: 'text' },
            { key: 'hashtags', type: 'any' },
            { key: 'avatar', type: 'avatar' },
        ],
        outputs: [{ key: 'post', type: 'any' }],
        defaultData: { platforms: 'instagram' },
    },
    {
        type: 'webhook',
        label: 'Webhook',
        category: 'output',
        icon: 'HiOutlineLink',
        description: 'Send results to external URL',
        inputs: [{ key: 'data', type: 'any' }],
        outputs: [{ key: 'status', type: 'any' }],
        defaultData: { url: '', method: 'POST', headers: {} },
    },
]

export const TEMPLATES_BY_CATEGORY = NODE_TEMPLATES.reduce(
    (acc, template) => {
        if (!acc[template.category]) acc[template.category] = []
        acc[template.category].push(template)
        return acc
    },
    {} as Record<string, VideoNodeTemplate[]>
)

export function getTemplate(type: string): VideoNodeTemplate | undefined {
    return NODE_TEMPLATES.find((t) => t.type === type)
}
