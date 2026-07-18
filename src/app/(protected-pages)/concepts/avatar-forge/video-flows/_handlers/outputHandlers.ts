import type { VideoNodeHandler, MediaBundle, AvatarBundle } from '../_engine/types'
import type { MediaType } from '@/@types/supabase'
import { getStoragePublicUrl } from '@/lib/storagePaths'
import { uploadToSignedStorageUrl } from '@/lib/storageUpload'
import {
    apiCreateGenerationUploadUrl,
    apiSaveGeneration,
} from '@/services/AvatarForgeService'
import { createFanvuePost } from '@/services/FanvueService'
import { createSocialPost } from '@/services/SocialService'

// Same signed-URL upload flow as Avatar Studio's persistGeneration: identity
// comes from the NextAuth session server-side (the browser's anon Supabase
// client has no auth user under NextAuth, so supabase.auth.getUser() here
// would always be null), and the media itself is uploaded to storage instead
// of stuffing a data URL into storage_path.
export const saveToGallery: VideoNodeHandler = async (node, inputs) => {
    const media = inputs.media as MediaBundle | undefined
    if (!media?.url) throw new Error('No media to save — wire an image or video port')
    if (media.kind === 'audio') {
        throw new Error('Only images and videos can be saved to the gallery')
    }

    const mediaType: MediaType = media.kind === 'video' ? 'VIDEO' : 'IMAGE'

    // Prefer the avatar cable from an upstream select-avatar node,
    // fall back to whatever is hard-coded in node config.
    const avatar = inputs.avatar as AvatarBundle | undefined
    const avatarId =
        avatar?.avatarId ??
        (node.data.config.avatarId as string) ??
        null

    const res = await fetch(media.url)
    if (!res.ok) {
        throw new Error(`Could not fetch media to save (HTTP ${res.status})`)
    }
    const blob = await res.blob()
    const contentType =
        blob.type || (mediaType === 'VIDEO' ? 'video/mp4' : 'image/jpeg')

    const { path, token } = await apiCreateGenerationUploadUrl(mediaType)
    await uploadToSignedStorageUrl('generations', path, token, blob, contentType)

    // user_id is re-derived from the session inside apiSaveGeneration.
    const row = await apiSaveGeneration({
        avatar_id: avatarId,
        media_type: mediaType,
        storage_path: path,
        prompt: media.prompt ?? 'Video Flow',
        metadata: {
            collection: (node.data.config.collection as string) ?? 'default',
            source: 'video-flow',
        },
    })

    const saved: MediaBundle = {
        kind: media.kind,
        url: getStoragePublicUrl('generations', path),
        prompt: media.prompt,
        generationId: row.id,
        avatarId: avatarId ?? undefined,
    }
    return {
        output: {
            media: saved,
            galleryItemId: row.id,
        },
    }
}

export const fanvuePost: VideoNodeHandler = async (node, inputs) => {
    const media = inputs.media as MediaBundle | undefined
    if (!media?.generationId) {
        throw new Error(
            'Fanvue posts need a saved gallery item — wire media from Save to Gallery or From Gallery',
        )
    }

    const config = node.data.config
    const audience =
        (config.audience as string) === 'followers-and-subscribers'
            ? 'followers-and-subscribers'
            : 'subscribers'
    const priceCents = Number(config.priceCents) || 0

    const result = await createFanvuePost({
        generationId: media.generationId,
        caption: (inputs.caption as string) || undefined,
        audience,
        ...(priceCents >= 300 ? { price: Math.round(priceCents) } : {}),
        ...(config.creatorUserUuid
            ? { creatorUserUuid: config.creatorUserUuid as string }
            : {}),
    })
    if (!result.success || !result.data) {
        throw new Error(result.error ?? 'Fanvue post failed')
    }

    return {
        output: {
            post: {
                id: result.data.id,
                fanvuePostUuid: result.data.fanvue_post_uuid,
                status: result.data.status,
            },
        },
    }
}

export const socialPost: VideoNodeHandler = async (node, inputs) => {
    const media = inputs.media as MediaBundle | undefined
    if (!media?.generationId) {
        throw new Error(
            'Social posts need a saved gallery item — wire media from Save to Gallery or From Gallery',
        )
    }

    const avatar = inputs.avatar as AvatarBundle | undefined
    const avatarId = avatar?.avatarId ?? media.avatarId
    if (!avatarId) {
        throw new Error(
            'No avatar — wire the avatar port (its connected account publishes the post)',
        )
    }

    const caption = (inputs.caption as string) || ''
    if (!caption) throw new Error('No caption — wire a text port or a Caption (AI) node')

    const hashtags = Array.isArray(inputs.hashtags)
        ? (inputs.hashtags as string[])
        : []
    const platforms = String(node.data.config.platforms ?? 'instagram')
        .split(',')
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean)

    const result = await createSocialPost({
        avatarId,
        generationId: media.generationId,
        caption,
        hashtags,
        platforms,
    })
    if (!result.success || !result.data) {
        throw new Error(result.error ?? 'Social post failed')
    }

    return {
        output: {
            post: {
                id: result.data.id,
                status: result.data.status,
                platforms,
            },
        },
    }
}

export const webhook: VideoNodeHandler = async (node, inputs) => {
    const url = node.data.config.url as string
    if (!url) throw new Error('No webhook URL configured')

    const method = (node.data.config.method as string) ?? 'POST'
    const headers =
        (node.data.config.headers as Record<string, string>) ?? {}

    const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(inputs),
    })

    return {
        output: {
            responseStatus: response.status,
        },
    }
}
