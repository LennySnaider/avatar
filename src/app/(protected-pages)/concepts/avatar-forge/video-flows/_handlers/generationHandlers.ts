import type { VideoNodeHandler, AvatarBundle, MediaBundle } from '../_engine/types'
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
        (node.data.config.prompt as string) ||
        ''
    if (!prompt) throw new Error('No prompt for image generation — type one in the node or wire a text port')

    // The avatar cable carries identity (references, faceRef, measurements)
    // in one bundle.
    const avatar = inputs.avatar as AvatarBundle | undefined
    const avatarReferences = (avatar?.references as ImageData[]) ?? []
    const faceRef = (avatar?.faceRef as ImageData | null) ?? null
    const measurements = avatar?.measurements as PhysicalMeasurements | undefined
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
        const image: MediaBundle = {
            kind: 'image',
            url: result.url,
            prompt: result.fullApiPrompt,
        }
        return { output: { image } }
    }

    const result = await GeminiService.generateAvatar({
        prompt,
        avatarReferences,
        assetReferences: [],
        sceneReference: null,
        faceRefImage: faceRef,
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

    const image: MediaBundle = {
        kind: 'image',
        url: result.url,
        prompt: result.fullApiPrompt,
    }
    return { output: { image } }
}

export const generateVideo: VideoNodeHandler = async (node, inputs) => {
    const image = inputs.image as MediaBundle | undefined
    let imageBase64 = image?.base64 ?? ''
    let mimeType = image?.mimeType ?? 'image/png'

    // The Kling API needs base64 — derive it from the image bundle's URL when
    // the upstream node (generate-image, storage) only provided a URL.
    if (!imageBase64 && image?.url) {
        const converted = await urlToBase64(image.url)
        imageBase64 = converted.base64
        mimeType = converted.mimeType
    }
    if (!imageBase64) throw new Error('No image for video generation — wire an image port')

    const prompt =
        (inputs.prompt as string) ||
        (node.data.config.prompt as string) ||
        'Animate this image with natural, subtle motion'

    const videoUrl = await KlingService.generateVideo({
        prompt,
        imageInput: { base64: imageBase64, mimeType },
        aspectRatio:
            (node.data.config.aspectRatio as AspectRatio) ?? '16:9',
        duration:
            (node.data.config.duration as '5' | '10') ?? '5',
    })

    const video: MediaBundle = {
        kind: 'video',
        url: videoUrl,
        prompt,
    }
    return { output: { video } }
}
