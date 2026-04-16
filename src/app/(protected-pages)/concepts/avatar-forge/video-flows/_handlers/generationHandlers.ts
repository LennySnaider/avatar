import type { VideoNodeHandler } from '../_engine/types'
import type { ImageData } from '@/services/GeminiService'
import type { AspectRatio } from '@/@types/supabase'
import * as GeminiService from '@/services/GeminiService'
import * as KlingService from '@/services/KlingService'

export const generateImage: VideoNodeHandler = async (node, inputs) => {
    const prompt =
        (inputs.enhancedPrompt as string) ??
        (inputs.prompt as string) ??
        ''
    if (!prompt) throw new Error('No prompt for image generation')

    const avatarReferences =
        (inputs.references as ImageData[]) ?? []
    const faceRef = inputs.faceRef as ImageData | null

    const result = await GeminiService.generateAvatar({
        prompt,
        avatarReferences,
        assetReferences: [],
        sceneReference: null,
        faceRefImage: faceRef ?? null,
        bodyRefImage: null,
        angleRefImage: null,
        poseRefImage: null,
        aspectRatio:
            (node.data.config.aspectRatio as AspectRatio) ?? '1:1',
    })

    return {
        output: {
            imageUrl: result.url,
            fullApiPrompt: result.fullApiPrompt,
        },
    }
}

export const generateVideo: VideoNodeHandler = async (node, inputs) => {
    const imageUrl = inputs.imageUrl as string
    if (!imageUrl) throw new Error('No image for video generation')

    const imageBase64 = (inputs.imageBase64 as string) ?? ''

    const videoUrl = await KlingService.generateVideo({
        prompt:
            (inputs.enhancedPrompt as string) ??
            (inputs.description as string) ??
            'Generate a video from this image',
        imageInput: imageBase64
            ? { base64: imageBase64, mimeType: 'image/png' }
            : null,
        aspectRatio:
            (node.data.config.aspectRatio as AspectRatio) ?? '16:9',
        duration:
            (node.data.config.duration as '5' | '10') ?? '5',
    })

    return {
        output: {
            videoUrl,
            taskId: '',
        },
    }
}
