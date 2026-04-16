import type { VideoNodeHandler } from '../_engine/types'
import type { MediaType } from '@/@types/supabase'
import { supabase } from '@/lib/supabase'

export const saveToGallery: VideoNodeHandler = async (node, inputs) => {
    const mediaUrl =
        (inputs.imageUrl as string) ??
        (inputs.videoUrl as string) ??
        (inputs.stitchedVideoUrl as string) ??
        ''
    if (!mediaUrl) throw new Error('No media to save')

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const mediaType: MediaType =
        mediaUrl.includes('.mp4') || (inputs.videoUrl as string)
            ? 'VIDEO'
            : 'IMAGE'

    const { data, error } = await supabase
        .from('generations')
        .insert({
            user_id: user.id,
            storage_path: mediaUrl,
            media_type: mediaType,
            prompt: (inputs.fullApiPrompt as string) ?? '',
            avatar_id: (node.data.config.avatarId as string) ?? null,
        })
        .select('id, storage_path')
        .single()

    if (error) throw new Error(`Failed to save: ${error.message}`)

    return {
        output: {
            galleryItemId: data?.id ?? '',
            savedUrl: data?.storage_path ?? mediaUrl,
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
