import type { VideoNodeHandler } from '../_engine/types'

export const selectAvatar: VideoNodeHandler = async (node) => {
    const { avatarId } = node.data.config
    if (!avatarId) throw new Error('No avatar selected')

    return {
        output: {
            avatarId,
            references: node.data.config.references ?? [],
            faceRef: node.data.config.faceRef ?? null,
            measurements: node.data.config.measurements ?? {},
        },
    }
}

export const uploadImage: VideoNodeHandler = async (node) => {
    const { imageUrl, imageBase64 } = node.data.config
    if (!imageUrl && !imageBase64) throw new Error('No image uploaded')

    return {
        output: {
            imageUrl: imageUrl ?? '',
            imageBase64: imageBase64 ?? '',
        },
    }
}
