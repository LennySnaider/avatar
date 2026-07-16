import type { VideoNodeHandler, MediaBundle, AvatarBundle } from '../_engine/types'
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
        prompt: media.prompt ?? 'Video Flow',
        metadata: {
            collection: (node.data.config.collection as string) ?? 'default',
            source: 'video-flow',
        },
    })

    const saved: MediaBundle = {
        kind: media.kind,
        url: getStoragePublicUrl('generations', path),
    }
    return {
        output: {
            media: saved,
            galleryItemId: row.id,
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
