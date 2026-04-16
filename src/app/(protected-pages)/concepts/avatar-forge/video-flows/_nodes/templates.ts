import type { VideoNodeTemplate } from '../_engine/types'

export const NODE_TEMPLATES: VideoNodeTemplate[] = [
    // ─── Input ───────────────────────────────────────────────
    {
        type: 'select-avatar',
        label: 'Select Avatar',
        category: 'input',
        icon: 'HiOutlineUser',
        description: 'Pick an avatar from your gallery',
        inputs: [],
        outputs: ['avatarId', 'references', 'faceRef', 'measurements'],
        defaultData: { avatarId: null },
    },
    {
        type: 'upload-image',
        label: 'Upload Image',
        category: 'input',
        icon: 'HiOutlineUpload',
        description: 'Upload an image from your device',
        inputs: [],
        outputs: ['imageUrl', 'imageBase64'],
        defaultData: {},
    },
    // ─── AI Processing ───────────────────────────────────────
    {
        type: 'prompt-enhance',
        label: 'Enhance Prompt',
        category: 'ai',
        icon: 'HiOutlineSparkles',
        description: 'Improve prompt with AI details',
        inputs: ['basePrompt'],
        outputs: ['enhancedPrompt'],
        defaultData: { basePrompt: '', style: 'photorealistic', intensity: 'medium' },
    },
    {
        type: 'describe-image',
        label: 'Describe Image',
        category: 'ai',
        icon: 'HiOutlineEye',
        description: 'Generate text description from image',
        inputs: ['imageUrl'],
        outputs: ['description'],
        defaultData: { detailLevel: 'detailed' },
    },
    // ─── Generation ──────────────────────────────────────────
    {
        type: 'generate-image',
        label: 'Generate Image',
        category: 'generation',
        icon: 'HiOutlinePhotograph',
        description: 'Generate avatar image with Gemini',
        inputs: ['prompt', 'references', 'faceRef'],
        outputs: ['imageUrl', 'fullApiPrompt'],
        defaultData: { aspectRatio: '1:1', model: 'gemini' },
    },
    {
        type: 'generate-video',
        label: 'Generate Video',
        category: 'generation',
        icon: 'HiOutlineFilm',
        description: 'Generate video from image with Kling',
        inputs: ['imageUrl'],
        outputs: ['videoUrl', 'taskId'],
        defaultData: { duration: '5', mode: 'standard' },
    },
    // ─── Transform ───────────────────────────────────────────
    {
        type: 'stitch',
        label: 'Stitch Videos',
        category: 'transform',
        icon: 'HiOutlineScissors',
        description: 'Concatenate multiple videos into one',
        inputs: ['videoUrls'],
        outputs: ['stitchedVideoUrl'],
        defaultData: { transition: 'none' },
    },
    {
        type: 'text-overlay',
        label: 'Text Overlay',
        category: 'transform',
        icon: 'HiOutlineAnnotation',
        description: 'Add text overlay to image or video',
        inputs: ['imageUrl', 'videoUrl'],
        outputs: ['outputUrl'],
        defaultData: { text: '', position: 'bottom-center', fontSize: 24, color: '#ffffff' },
    },
    // ─── Voice ───────────────────────────────────────────────
    {
        type: 'script-generator',
        label: 'Generate Script',
        category: 'voice',
        icon: 'HiOutlineDocumentText',
        description: 'AI-generated script for video narration',
        inputs: ['topic'],
        outputs: ['script', 'duration'],
        defaultData: { tone: 'professional', language: 'es', template: 'general', durationSeconds: 30 },
    },
    {
        type: 'text-to-speech',
        label: 'Text to Speech',
        category: 'voice',
        icon: 'HiOutlineMicrophone',
        description: 'Convert text to speech with MiniMax',
        inputs: ['text'],
        outputs: ['audioUrl', 'duration'],
        defaultData: { voiceId: '', speed: 1.0, language: 'es' },
    },
    // ─── Logic ───────────────────────────────────────────────
    {
        type: 'condition',
        label: 'Condition',
        category: 'logic',
        icon: 'HiOutlineSwitchHorizontal',
        description: 'Branch flow based on a condition',
        inputs: ['value'],
        outputs: ['result'],
        defaultData: { field: '', operator: 'equals', compareValue: '' },
    },
    // ─── Output ──────────────────────────────────────────────
    {
        type: 'save-to-gallery',
        label: 'Save to Gallery',
        category: 'output',
        icon: 'HiOutlineSave',
        description: 'Save generated media to avatar gallery',
        inputs: ['imageUrl', 'videoUrl'],
        outputs: ['galleryItemId', 'savedUrl'],
        defaultData: { collection: 'default' },
    },
    {
        type: 'webhook',
        label: 'Webhook',
        category: 'output',
        icon: 'HiOutlineLink',
        description: 'Send results to external URL',
        inputs: ['data'],
        outputs: ['responseStatus'],
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
