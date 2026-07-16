import type { VideoNodeHandler } from '../_engine/types'
import type { ImageData } from '@/services/GeminiService'
import type { AspectRatio, PhysicalMeasurements } from '@/@types/supabase'
import * as GeminiService from '@/services/GeminiService'
import * as KlingService from '@/services/KlingService'
import * as MiniMaxService from '@/services/MiniMaxService'

/**
 * Resolve any image URL (data: or http[s]:) to raw base64 + mime type.
 * Kling's image2video endpoint only accepts base64, but upstream nodes emit
 * URLs (Gemini returns data URLs, MiniMax/storage return https URLs).
 */
async function urlToBase64(
    url: string,
): Promise<{ base64: string; mimeType: string }> {
    const dataUrlMatch = url.match(/^data:([^;,]+);base64,(.+)$/)
    if (dataUrlMatch) {
        return { mimeType: dataUrlMatch[1], base64: dataUrlMatch[2] }
    }

    const res = await fetch(url)
    if (!res.ok) {
        throw new Error(`Could not fetch image for video generation (HTTP ${res.status})`)
    }
    const blob = await res.blob()
    const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('Failed to read image data'))
        reader.readAsDataURL(blob)
    })
    const m = dataUrl.match(/^data:([^;,]+);base64,(.+)$/)
    if (!m) throw new Error('Failed to convert image to base64')
    return { mimeType: m[1], base64: m[2] }
}

export const generateImage: VideoNodeHandler = async (node, inputs) => {
    const prompt =
        (inputs.prompt as string) ||
        (inputs.enhancedPrompt as string) ||
        (inputs.description as string) ||
        ''
    if (!prompt) throw new Error('No prompt for image generation')

    const avatarReferences =
        (inputs.references as ImageData[]) ?? []
    const faceRef = inputs.faceRef as ImageData | null
    const measurements = inputs.measurements as PhysicalMeasurements | undefined
    const aspectRatio = (node.data.config.aspectRatio as AspectRatio) ?? '1:1'
    const model = (node.data.config.model as string) ?? 'gemini'

    if (model === 'minimax') {
        const faceReferenceUrl = faceRef
            ? `data:${faceRef.mimeType};base64,${faceRef.base64}`
            : avatarReferences[0]
                ? `data:${avatarReferences[0].mimeType};base64,${avatarReferences[0].base64}`
                : undefined

        const result = await MiniMaxService.generateImage({
            prompt,
            aspectRatio,
            faceReferenceUrl,
        })
        if (!result.success) throw new Error(result.error)
        return {
            output: {
                imageUrl: result.url,
                fullApiPrompt: result.fullApiPrompt,
            },
        }
    }

    const result = await GeminiService.generateAvatar({
        prompt,
        avatarReferences,
        assetReferences: [],
        sceneReference: null,
        faceRefImage: faceRef ?? null,
        bodyRefImage: null,
        angleRefImage: null,
        poseRefImage: null,
        aspectRatio,
        ...(measurements && Object.keys(measurements).length > 0
            ? { measurements }
            : {}),
    })

    if (!result.success) {
        throw new Error(result.error)
    }

    return {
        output: {
            imageUrl: result.url,
            fullApiPrompt: result.fullApiPrompt,
        },
    }
}

export const generateVideo: VideoNodeHandler = async (node, inputs) => {
    const imageUrl = inputs.imageUrl as string
    let imageBase64 = (inputs.imageBase64 as string) ?? ''
    let mimeType = 'image/png'

    // The Kling API needs base64 — derive it from the wired image URL when the
    // upstream node (generate-image, gallery, storage) only provided a URL.
    if (!imageBase64 && imageUrl) {
        const converted = await urlToBase64(imageUrl)
        imageBase64 = converted.base64
        mimeType = converted.mimeType
    }
    if (!imageBase64) throw new Error('No image for video generation')

    const prompt =
        (inputs.prompt as string) ||
        (inputs.enhancedPrompt as string) ||
        (inputs.description as string) ||
        'Animate this image with natural, subtle motion'

    const videoUrl = await KlingService.generateVideo({
        prompt,
        imageInput: { base64: imageBase64, mimeType },
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
