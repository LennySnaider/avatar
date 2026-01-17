'use server'

import { createServerSupabaseClient } from '@/lib/supabase'
import type {
    Avatar,
    AvatarInsert,
    AvatarUpdate,
    AvatarReference,
    AvatarReferenceInsert,
    Generation,
    GenerationInsert,
    Prompt,
    PromptInsert,
    PromptUpdate,
    AIProvider,
    ReferenceType,
    MediaType,
} from '@/@types/supabase'

// Helper to get server client (bypasses RLS with service role)
const getSupabase = () => createServerSupabaseClient()

// =============================================
// AVATARS CRUD
// =============================================

export async function apiGetAvatars(userId: string) {
    const supabase = getSupabase()
    const { data, error } = await supabase
        .from('avatars')
        .select('*, avatar_references(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

    if (error) throw error
    return data as unknown as (Avatar & { avatar_references: AvatarReference[] })[]
}

export async function apiGetAvatarById(avatarId: string) {
    const supabase = getSupabase()
    const { data, error } = await supabase
        .from('avatars')
        .select('*, avatar_references(*)')
        .eq('id', avatarId)
        .single()

    if (error) throw error
    return data as unknown as Avatar & { avatar_references: AvatarReference[] }
}

export async function apiCreateAvatar(avatar: AvatarInsert) {
    const supabase = getSupabase()
    const { data, error } = await supabase
        .from('avatars')
        .insert(avatar as never)
        .select()
        .single()

    if (error) throw error
    return data as unknown as Avatar
}

export async function apiUpdateAvatar(avatarId: string, updates: AvatarUpdate) {
    const supabase = getSupabase()
    const { data, error } = await supabase
        .from('avatars')
        .update(updates as never)
        .eq('id', avatarId)
        .select()
        .single()

    if (error) throw error
    return data as unknown as Avatar
}

export async function apiDeleteAvatar(avatarId: string) {
    const supabase = getSupabase()
    const { error } = await supabase
        .from('avatars')
        .delete()
        .eq('id', avatarId)

    if (error) throw error
    return true
}

// =============================================
// AVATAR REFERENCES
// =============================================

export async function apiAddAvatarReference(reference: AvatarReferenceInsert) {
    const supabase = getSupabase()
    const { data, error } = await supabase
        .from('avatar_references')
        .insert(reference as never)
        .select()
        .single()

    if (error) throw error
    return data as unknown as AvatarReference
}

export async function apiDeleteAvatarReference(referenceId: string) {
    const supabase = getSupabase()
    const { error } = await supabase
        .from('avatar_references')
        .delete()
        .eq('id', referenceId)

    if (error) throw error
    return true
}

export async function apiGetAvatarReferences(avatarId: string, type?: ReferenceType) {
    const supabase = getSupabase()
    let query = supabase
        .from('avatar_references')
        .select('*')
        .eq('avatar_id', avatarId)

    if (type) {
        query = query.eq('type', type)
    }

    const { data, error } = await query.order('created_at', { ascending: true })

    if (error) throw error
    return data as unknown as AvatarReference[]
}

// =============================================
// GENERATIONS
// =============================================

export async function apiGetGenerations(
    userId: string,
    options?: {
        mediaType?: MediaType
        avatarId?: string
        limit?: number
        offset?: number
    }
) {
    const supabase = getSupabase()
    let query = supabase
        .from('generations')
        .select('*')
        .eq('user_id', userId)

    if (options?.mediaType) {
        query = query.eq('media_type', options.mediaType)
    }

    if (options?.avatarId) {
        query = query.eq('avatar_id', options.avatarId)
    }

    query = query.order('created_at', { ascending: false })

    if (options?.limit) {
        query = query.limit(options.limit)
    }

    if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 10) - 1)
    }

    const { data, error } = await query

    if (error) throw error
    return data as unknown as Generation[]
}

export async function apiSaveGeneration(generation: GenerationInsert) {
    const supabase = getSupabase()
    const { data, error } = await supabase
        .from('generations')
        .insert(generation as never)
        .select()
        .single()

    if (error) throw error
    return data as unknown as Generation
}

export async function apiDeleteGeneration(generationId: string) {
    const supabase = getSupabase()
    const { error } = await supabase
        .from('generations')
        .delete()
        .eq('id', generationId)

    if (error) throw error
    return true
}

// =============================================
// PROMPTS
// =============================================

export async function apiGetPrompts(userId: string, mediaType?: MediaType) {
    const supabase = getSupabase()
    let query = supabase
        .from('prompts')
        .select('*')
        .eq('user_id', userId)

    if (mediaType) {
        query = query.eq('media_type', mediaType)
    }

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) throw error
    return data as unknown as Prompt[]
}

export async function apiCreatePrompt(prompt: PromptInsert) {
    const supabase = getSupabase()
    const { data, error } = await supabase
        .from('prompts')
        .insert(prompt as never)
        .select()
        .single()

    if (error) throw error
    return data as unknown as Prompt
}

export async function apiUpdatePrompt(promptId: string, updates: PromptUpdate) {
    const supabase = getSupabase()
    const { data, error } = await supabase
        .from('prompts')
        .update(updates as never)
        .eq('id', promptId)
        .select()
        .single()

    if (error) throw error
    return data as unknown as Prompt
}

export async function apiDeletePrompt(promptId: string) {
    const supabase = getSupabase()
    const { error } = await supabase
        .from('prompts')
        .delete()
        .eq('id', promptId)

    if (error) throw error
    return true
}

// =============================================
// AI PROVIDERS
// =============================================

export async function apiGetProviders(options?: {
    type?: string
    supportsImage?: boolean
    supportsVideo?: boolean
    activeOnly?: boolean
}) {
    const supabase = getSupabase()
    let query = supabase.from('ai_providers').select('*')

    if (options?.type) {
        query = query.eq('type', options.type as never)
    }

    if (options?.supportsImage) {
        query = query.eq('supports_image', true)
    }

    if (options?.supportsVideo) {
        query = query.eq('supports_video', true)
    }

    if (options?.activeOnly !== false) {
        query = query.eq('is_active', true)
    }

    const { data, error } = await query.order('type').order('name')

    if (error) throw error
    return data as unknown as AIProvider[]
}

export async function apiGetProviderById(providerId: string) {
    const supabase = getSupabase()
    const { data, error } = await supabase
        .from('ai_providers')
        .select('*')
        .eq('id', providerId)
        .single()

    if (error) throw error
    return data as unknown as AIProvider
}

// =============================================
// STORAGE HELPERS
// =============================================

export async function uploadAvatarReference(
    userId: string,
    avatarId: string,
    type: ReferenceType,
    file: File
): Promise<string> {
    const supabase = getSupabase()
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}.${fileExt}`
    const filePath = `${userId}/references/${avatarId}/${type}/${fileName}`

    const { error } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false,
        })

    if (error) throw error
    return filePath
}

export async function uploadGeneration(
    userId: string,
    mediaType: MediaType,
    blob: Blob,
    extension: string = 'jpg'
): Promise<string> {
    const supabase = getSupabase()
    const folder = mediaType === 'IMAGE' ? 'images' : 'videos'
    const fileName = `${Date.now()}.${extension}`
    const filePath = `${userId}/${folder}/${fileName}`

    const { error } = await supabase.storage
        .from('generations')
        .upload(filePath, blob, {
            cacheControl: '3600',
            upsert: false,
        })

    if (error) throw error
    return filePath
}

export async function getStorageUrl(bucket: string, path: string): Promise<string> {
    const supabase = getSupabase()
    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    return data.publicUrl
}

export async function getSignedUrl(
    bucket: string,
    path: string,
    expiresIn: number = 3600
): Promise<string> {
    const supabase = getSupabase()
    const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, expiresIn)

    if (error) throw error
    return data.signedUrl
}

export async function deleteStorageFile(bucket: string, path: string) {
    const supabase = getSupabase()
    const { error } = await supabase.storage.from(bucket).remove([path])
    if (error) throw error
    return true
}

// =============================================
// COMBINED HELPERS (Upload + Create Record)
// =============================================

/**
 * Upload a reference image and create the database record
 */
export async function apiUploadReference(
    avatarId: string,
    userId: string,
    file: File,
    type: ReferenceType
): Promise<AvatarReference> {
    // Upload file to storage
    const storagePath = await uploadAvatarReference(userId, avatarId, type, file)

    // Create database record
    const reference = await apiAddAvatarReference({
        avatar_id: avatarId,
        type,
        storage_path: storagePath,
        mime_type: file.type,
    })

    return reference
}

/**
 * Save a generation (upload file + create record)
 */
export async function apiSaveGenerationWithFile(
    userId: string,
    avatarId: string | null,
    file: File,
    data: {
        prompt: string
        media_type: MediaType
        aspect_ratio?: string
        metadata?: Record<string, unknown>
    }
): Promise<Generation> {
    // Determine extension
    const ext = data.media_type === 'VIDEO' ? 'mp4' : 'jpg'

    // Upload to storage
    const storagePath = await uploadGeneration(userId, data.media_type, file, ext)

    // Create database record
    const generation = await apiSaveGeneration({
        user_id: userId,
        avatar_id: avatarId,
        media_type: data.media_type,
        storage_path: storagePath,
        prompt: data.prompt,
        aspect_ratio: data.aspect_ratio,
        metadata: data.metadata,
    })

    return generation
}

// Re-export apiSaveGenerationWithFile as apiSaveGeneration for convenience in components
// that expect a single function that handles both upload and record creation
export { apiSaveGenerationWithFile as apiSaveGenerationComplete }
