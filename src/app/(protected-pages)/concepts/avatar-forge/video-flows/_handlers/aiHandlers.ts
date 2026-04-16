import type { VideoNodeHandler } from '../_engine/types'
import * as GeminiService from '@/services/GeminiService'

export const promptEnhance: VideoNodeHandler = async (node, inputs) => {
    const basePrompt =
        (inputs.enhancedPrompt as string) ??
        (inputs.basePrompt as string) ??
        (node.data.config.basePrompt as string) ??
        ''
    if (!basePrompt) throw new Error('No prompt to enhance')

    const enhancedPrompt = await GeminiService.enhancePrompt(basePrompt)

    return {
        output: { enhancedPrompt },
    }
}

export const describeImage: VideoNodeHandler = async (_node, inputs) => {
    const imageUrl = inputs.imageUrl as string
    if (!imageUrl) throw new Error('No image to describe')

    const description = await GeminiService.describeImageForPrompt({
        id: 'flow-image',
        url: imageUrl,
        base64: (inputs.imageBase64 as string) ?? '',
        mimeType: 'image/png',
    })

    return {
        output: { description },
    }
}
