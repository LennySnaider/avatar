'use client'

import { useCallback } from 'react'
import { optimizeForApi, cleanBase64 } from '@/utils/imageOptimization'
import type { ReferenceImage } from '../types'

interface ImageData {
    base64: string
    mimeType: string
}

/**
 * Hook to optimize images before sending to AI APIs
 * Resizes images to 1024px max dimension to reduce latency and cost
 */
export function useImageOptimization() {
    /**
     * Optimize a single image for API submission
     */
    const optimizeImage = useCallback(async (image: ImageData | null): Promise<ImageData | null> => {
        if (!image || !image.base64) return null

        try {
            const optimizedBase64 = await optimizeForApi(image.base64, false)
            return {
                base64: optimizedBase64,
                mimeType: 'image/jpeg', // Standardize to JPEG for smaller size
            }
        } catch (error) {
            console.error('Failed to optimize image:', error)
            // Fallback to cleaned original
            return {
                base64: cleanBase64(image.base64),
                mimeType: image.mimeType,
            }
        }
    }, [])

    /**
     * Optimize multiple reference images for API submission
     */
    const optimizeReferences = useCallback(async (
        refs: ReferenceImage[]
    ): Promise<ImageData[]> => {
        const optimized = await Promise.all(
            refs.map(async (ref) => {
                if (!ref.base64) return null
                try {
                    const optimizedBase64 = await optimizeForApi(ref.base64, false)
                    return {
                        base64: optimizedBase64,
                        mimeType: 'image/jpeg',
                    }
                } catch {
                    return {
                        base64: cleanBase64(ref.base64),
                        mimeType: ref.mimeType,
                    }
                }
            })
        )
        return optimized.filter((img): img is ImageData => img !== null)
    }, [])

    /**
     * Prepare avatar generation payload with optimized images
     */
    const prepareAvatarPayload = useCallback(async (params: {
        generalRefs: ReferenceImage[]
        assetImages: ReferenceImage[]
        faceRef: ReferenceImage | null
        bodyRef: ReferenceImage | null
        sceneImage: ReferenceImage | null
    }) => {
        const [
            optimizedGeneralRefs,
            optimizedAssetImages,
            optimizedFaceRef,
            optimizedBodyRef,
            optimizedSceneImage,
        ] = await Promise.all([
            params.generalRefs.length > 0 ? optimizeReferences(params.generalRefs) : Promise.resolve([]),
            params.assetImages.length > 0 ? optimizeReferences(params.assetImages) : Promise.resolve([]),
            params.faceRef ? optimizeImage({ base64: params.faceRef.base64, mimeType: params.faceRef.mimeType }) : Promise.resolve(null),
            params.bodyRef ? optimizeImage({ base64: params.bodyRef.base64, mimeType: params.bodyRef.mimeType }) : Promise.resolve(null),
            params.sceneImage ? optimizeImage({ base64: params.sceneImage.base64, mimeType: params.sceneImage.mimeType }) : Promise.resolve(null),
        ])

        return {
            generalRefs: optimizedGeneralRefs,
            assetImages: optimizedAssetImages,
            faceRef: optimizedFaceRef,
            bodyRef: optimizedBodyRef,
            sceneImage: optimizedSceneImage,
        }
    }, [optimizeImage, optimizeReferences])

    return {
        optimizeImage,
        optimizeReferences,
        prepareAvatarPayload,
    }
}
