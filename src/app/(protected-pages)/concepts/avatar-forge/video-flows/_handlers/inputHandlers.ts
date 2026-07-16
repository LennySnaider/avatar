import type { VideoNodeHandler, AvatarBundle, MediaBundle } from '../_engine/types'

export const selectAvatar: VideoNodeHandler = async (node) => {
    const config = node.data.config
    const { avatarId } = config
    if (!avatarId) throw new Error('No avatar selected')

    const avatar: AvatarBundle = {
        kind: 'avatar',
        avatarId: avatarId as string,
        avatarName: config.avatarName as string | undefined,
        thumbnailUrl: config.thumbnailUrl as string | undefined,
        references: (config.references as unknown[]) ?? [],
        faceRef: config.faceRef ?? null,
        measurements: (config.measurements as Record<string, unknown>) ?? {},
    }

    return { output: { avatar } }
}

export const uploadImage: VideoNodeHandler = async (node) => {
    const { imageUrl, imageBase64 } = node.data.config
    if (!imageUrl && !imageBase64) throw new Error('No image uploaded')

    const image: MediaBundle = {
        kind: 'image',
        url: (imageUrl as string) ?? '',
        base64: (imageBase64 as string) || undefined,
    }

    return { output: { image } }
}
