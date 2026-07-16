import type { VideoNodeHandler } from '../_engine/types'
import type { MediaType } from '@/@types/supabase'
import { supabase, getStoragePublicUrl } from '@/lib/supabase'
import {
    apiCreateGenerationUploadUrl,
    apiSaveGeneration,
} from '@/services/AvatarForgeService'

// Same signed-URL upload flow as Avatar Studio's persistGeneration: identity
// comes from the NextAuth session server-side (the browser's anon Supabase
// client has no auth user under NextAuth, so supabase.auth.getUser() here
// would always be null), and the media itself is uploaded to storage instead
// of stuffing a data URL into storage_path.
export const saveToGallery: VideoNodeHandler = async (node, inputs) => {
    const videoUrl =
        (inputs.videoUrl as string) ??
        (inputs.stitchedVideoUrl as string) ??
        undefined
    const imageUrl =
        (inputs.imageUrl as string) ??
        (inputs.outputUrl as string) ??
        undefined
    const mediaUrl = videoUrl ?? imageUrl
    if (!mediaUrl) throw new Error('No media to save')

    const mediaType: MediaType =
        videoUrl || mediaUrl.includes('.mp4') ? 'VIDEO' : 'IMAGE'

    // Prefer avatarId flowing in from an upstream select-avatar node,
    // fall back to whatever is hard-coded in node config.
    const avatarId =
        (inputs.avatarId as string) ??
        (node.data.config.avatarId as string) ??
        null

    const res = await fetch(mediaUrl)
    if (!res.ok) {
        throw new Error(`Could not fetch media to save (HTTP ${res.status})`)
    }
    const blob = await res.blob()
    const contentType =
        blob.type || (mediaType === 'VIDEO' ? 'video/mp4' : 'image/jpeg')

    const { path, token } = await apiCreateGenerationUploadUrl(mediaType)
    const { error: uploadError } = await supabase.storage
        .from('generations')
        .uploadToSignedUrl(path, token, blob, { contentType })
    if (uploadError) {
        throw new Error(`Failed to upload media: ${uploadError.message}`)
    }

    // user_id is re-derived from the session inside apiSaveGeneration.
    const row = await apiSaveGeneration({
        avatar_id: avatarId,
        media_type: mediaType,
        storage_path: path,
        prompt:
            (inputs.prompt as string) ??
            (inputs.fullApiPrompt as string) ??
            'Video Flow',
        metadata: {
            collection: (node.data.config.collection as string) ?? 'default',
            source: 'video-flow',
        },
    })

    return {
        output: {
            galleryItemId: row.id,
            savedUrl: getStoragePublicUrl('generations', path),
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
