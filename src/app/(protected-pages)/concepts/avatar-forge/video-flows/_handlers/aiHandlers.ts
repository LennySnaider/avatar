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
