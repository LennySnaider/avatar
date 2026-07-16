import type { VideoNodeHandler, MediaBundle } from '../_engine/types'
import * as GeminiService from '@/services/GeminiService'

export const promptEnhance: VideoNodeHandler = async (node, inputs) => {
    const basePrompt =
        (inputs.prompt as string) ||
        (node.data.config.basePrompt as string) ||
        ''
    if (!basePrompt) throw new Error('No prompt to enhance')

    const enhancedPrompt = await GeminiService.enhancePrompt(basePrompt)

    return {
        output: { prompt: enhancedPrompt },
    }
}

export const describeImage: VideoNodeHandler = async (_node, inputs) => {
    const image = inputs.image as MediaBundle | undefined
    if (!image?.url && !image?.base64) throw new Error('No image to describe')

    const description = await GeminiService.describeImageForPrompt({
        id: 'flow-image',
        url: image.url ?? '',
        base64: image.base64 ?? '',
        mimeType: image.mimeType ?? 'image/png',
    })

    return {
        output: { description },
    }
}

export const promptFromVideo: VideoNodeHandler = async (_node, inputs) => {
    const video = inputs.video as MediaBundle | undefined
    if (!video?.url) throw new Error('No video to analyze — wire a video port')
    if (!/^https?:\/\//i.test(video.url)) {
        throw new Error('Video must be a public URL (save it to the gallery first)')
    }

    const result = await GeminiService.analyzeVideoForPrompt(video.url)
    if (!result.success || !result.prompt) {
        throw new Error(result.error ?? 'Video analysis failed')
    }

    return {
        output: {
            prompt: result.prompt,
            suggestedDurationSeconds: result.suggestedDurationSeconds ?? null,
        },
    }
}

export const checkPromptSafety: VideoNodeHandler = async (node, inputs) => {
    const prompt =
        (inputs.prompt as string) ||
        (node.data.config.prompt as string) ||
        ''
    if (!prompt) throw new Error('No prompt to analyze — wire a text port')

    const result = await GeminiService.analyzePromptSafety(prompt)

    return {
        output: {
            safePrompt: result.optimizedPrompt || prompt,
            isSafe: result.isSafe,
            reason: result.reason,
        },
    }
}

export const captionAI: VideoNodeHandler = async (node, inputs) => {
    const media = inputs.media as MediaBundle | undefined
    if (!media?.url) throw new Error('No media for caption — wire an image or video port')
    if (media.kind === 'audio') throw new Error('Captions need an image or video')
    if (!/^https?:\/\//i.test(media.url)) {
        throw new Error('Media must be a public URL — save it to the gallery first')
    }

    const config = node.data.config
    const result = await GeminiService.generateSocialCaption({
        mediaUrl: media.url,
        mediaType: media.kind === 'video' ? 'VIDEO' : 'IMAGE',
        draft: (config.draft as string) || undefined,
        language: (config.language as 'en' | 'es') || undefined,
    })
    if (!result.success || !result.caption) {
        throw new Error(result.error ?? 'Caption generation failed')
    }

    return {
        output: {
            caption: result.caption,
            hashtags: result.hashtags ?? [],
        },
    }
}
