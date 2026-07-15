'use server'

import { requireUserId } from '@/lib/session'
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

type ServerSupabase = ReturnType<typeof getSupabase>

// =============================================
// OWNERSHIP GUARDS
// =============================================
// Every exported function here is a server action — an HTTP endpoint anyone
// authenticated can invoke with arbitrary arguments. Identity therefore comes
// ONLY from the session (requireUserId), and any row addressed by a raw id is
// checked against that identity before reading or mutating (anti-IDOR).
// Legacy rows with NULL user_id are tolerated (pre-auth data), matching the
// original apiSetGenerationAvatar pattern.

async function assertAvatarOwner(
    supabase: ServerSupabase,
    avatarId: string,
    userId: string,
) {
    const { data, error } = await supabase
        .from('avatars')
        .select('id, user_id')
        .eq('id', avatarId)
        .single()
    if (error) throw error
    if (data.user_id && data.user_id !== userId) throw new Error('Not your avatar')
}

async function assertGenerationOwner(
    supabase: ServerSupabase,
    generationId: string,
    userId: string,
) {
    const { data, error } = await supabase
        .from('generations')
        .select('id, user_id')
        .eq('id', generationId)
        .single()
    if (error) throw error
    if (data.user_id && data.user_id !== userId) throw new Error('Not your media')
}

async function assertPromptOwner(
    supabase: ServerSupabase,
    promptId: string,
    userId: string,
) {
    const { data, error } = await supabase
        .from('prompts')
        .select('id, user_id')
        .eq('id', promptId)
        .single()
    if (error) throw error
    if (data.user_id && data.user_id !== userId) throw new Error('Not your prompt')
}

// =============================================
// AVATARS CRUD
// =============================================

/**
 * Reassign a generation to another avatar (or none). This decides which
 * avatar's social accounts can publish the media, so ownership of BOTH the
 * generation and the target avatar is enforced here.
 */
export async function apiSetGenerationAvatar(generationId: string, avatarId: string | null) {
    const userId = await requireUserId()
    const supabase = getSupabase()
    await assertGenerationOwner(supabase, generationId, userId)
    if (avatarId) {
        await assertAvatarOwner(supabase, avatarId, userId)
    }

    const { error } = await supabase
        .from('generations')
        .update({ avatar_id: avatarId })
        .eq('id', generationId)
    if (error) throw error
}

export async function apiGetAvatars() {
    const userId = await requireUserId()
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
    const userId = await requireUserId()
    const supabase = getSupabase()
    const { data, error } = await supabase
        .from('avatars')
        .select('*, avatar_references(*)')
        .eq('id', avatarId)
        .single()

    if (error) throw error
    const avatar = data as unknown as Avatar & { avatar_references: AvatarReference[] }
    if (avatar.user_id && avatar.user_id !== userId) throw new Error('Not your avatar')
    return avatar
}

export async function apiCreateAvatar(avatar: AvatarInsert) {
    const userId = await requireUserId()
    const supabase = getSupabase()
    // user_id comes from the session — a client-supplied value is overridden.
    const { data, error } = await supabase
        .from('avatars')
        .insert({ ...avatar, user_id: userId } as never)
        .select()
        .single()

    if (error) throw error
    return data as unknown as Avatar
}

export async function apiUpdateAvatar(avatarId: string, updates: AvatarUpdate) {
    const userId = await requireUserId()
    const supabase = getSupabase()
    await assertAvatarOwner(supabase, avatarId, userId)
    // Never allow re-assigning ownership through an update payload.
    const { user_id: _ignored, ...safeUpdates } = updates as AvatarUpdate & { user_id?: string }
    void _ignored
    const { data, error } = await supabase
        .from('avatars')
        .update(safeUpdates as never)
        .eq('id', avatarId)
        .select()
        .single()

    if (error) throw error
    return data as unknown as Avatar
}

export async function apiDeleteAvatar(avatarId: string) {
    const userId = await requireUserId()
    const supabase = getSupabase()
    await assertAvatarOwner(supabase, avatarId, userId)
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
    const userId = await requireUserId()
    const supabase = getSupabase()
    if (!reference.avatar_id) throw new Error('avatar_id is required')
    await assertAvatarOwner(supabase, reference.avatar_id, userId)
    const { data, error } = await supabase
        .from('avatar_references')
        .insert(reference as never)
        .select()
        .single()

    if (error) throw error
    return data as unknown as AvatarReference
}

export async function apiDeleteAvatarReference(referenceId: string) {
    const userId = await requireUserId()
    const supabase = getSupabase()
    const { data: ref, error: refErr } = await supabase
        .from('avatar_references')
        .select('id, avatar_id')
        .eq('id', referenceId)
        .single()
    if (refErr) throw refErr
    // Orphan rows (null avatar_id) have no owner to validate against.
    if (ref.avatar_id) await assertAvatarOwner(supabase, ref.avatar_id, userId)

    const { error } = await supabase
        .from('avatar_references')
        .delete()
        .eq('id', referenceId)

    if (error) throw error
    return true
}

export async function apiGetAvatarReferences(avatarId: string, type?: ReferenceType) {
    const userId = await requireUserId()
    const supabase = getSupabase()
    await assertAvatarOwner(supabase, avatarId, userId)
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
    options?: {
        mediaType?: MediaType
        avatarId?: string
        limit?: number
        offset?: number
    }
) {
    const userId = await requireUserId()
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
    const userId = await requireUserId()
    const supabase = getSupabase()
    if (generation.avatar_id) {
        await assertAvatarOwner(supabase, generation.avatar_id, userId)
    }
    // user_id comes from the session — a client-supplied value is overridden.
    const { data, error } = await supabase
        .from('generations')
        .insert({ ...generation, user_id: userId } as never)
        .select()
        .single()

    if (error) throw error
    return data as unknown as Generation
}

/**
 * Merge-write the `metadata` jsonb of a generation row. The client already
 * holds the current metadata, so it passes the full merged object (favorite /
 * archived flags, providerName, …) — one round trip, no read-modify-write.
 */
export async function apiUpdateGenerationMetadata(
    generationId: string,
    metadata: Record<string, unknown>,
) {
    const userId = await requireUserId()
    const supabase = getSupabase()
    await assertGenerationOwner(supabase, generationId, userId)
    const { error } = await supabase
        .from('generations')
        .update({ metadata } as never)
        .eq('id', generationId)
    if (error) throw error
    return true
}

export async function apiDeleteGeneration(generationId: string) {
    const userId = await requireUserId()
    const supabase = getSupabase()
    await assertGenerationOwner(supabase, generationId, userId)
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

export async function apiGetPrompts(mediaType?: MediaType) {
    const userId = await requireUserId()
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
    const userId = await requireUserId()
    const supabase = getSupabase()
    // user_id comes from the session — a client-supplied value is overridden.
    const { data, error } = await supabase
        .from('prompts')
        .insert({ ...prompt, user_id: userId } as never)
        .select()
        .single()

    if (error) throw error
    return data as unknown as Prompt
}

export async function apiUpdatePrompt(promptId: string, updates: PromptUpdate) {
    const userId = await requireUserId()
    const supabase = getSupabase()
    await assertPromptOwner(supabase, promptId, userId)
    const { user_id: _ignored, ...safeUpdates } = updates as PromptUpdate & { user_id?: string }
    void _ignored
    const { data, error } = await supabase
        .from('prompts')
        .update(safeUpdates as never)
        .eq('id', promptId)
        .select()
        .single()

    if (error) throw error
    return data as unknown as Prompt
}

export async function apiDeletePrompt(promptId: string) {
    const userId = await requireUserId()
    const supabase = getSupabase()
    await assertPromptOwner(supabase, promptId, userId)
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
    await requireUserId() // global catalog, but only for signed-in users
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
    await requireUserId() // global catalog, but only for signed-in users
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
// The upload helpers are intentionally NOT exported: exporting them from a
// 'use server' file would make them public endpoints taking a raw userId.
// They receive the session-derived userId from their exported wrappers.

async function uploadAvatarReference(
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

async function uploadGeneration(
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
    await requireUserId()
    const supabase = getSupabase()
    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    return data.publicUrl
}

/**
 * Sign a storage path for reading. Both user buckets (`avatars`,
 * `generations`) key every object under `{userId}/…`, so a signed URL is
 * only issued for paths inside the caller's own prefix.
 */
export async function getSignedUrl(
    bucket: string,
    path: string,
    expiresIn: number = 3600
): Promise<string> {
    const userId = await requireUserId()
    if (!path.startsWith(`${userId}/`)) throw new Error('Not your file')
    const supabase = getSupabase()
    const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, expiresIn)

    if (error) throw error
    return data.signedUrl
}

export async function deleteStorageFile(bucket: string, path: string) {
    const userId = await requireUserId()
    if (!path.startsWith(`${userId}/`)) throw new Error('Not your file')
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
    file: File,
    type: ReferenceType
): Promise<AvatarReference> {
    const userId = await requireUserId()
    const supabase = getSupabase()
    await assertAvatarOwner(supabase, avatarId, userId)

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
 * Signed upload URL so the browser can PUT gallery media straight to Supabase
 * Storage. Sending the file through a server action 413s past ~4.5MB
 * (Vercel's request cap) — videos always exceed it. Pair with
 * `uploadToSignedUrl` client-side, then `apiSaveGeneration` for the row.
 */
export async function apiCreateGenerationUploadUrl(
    mediaType: MediaType,
): Promise<{ path: string; token: string }> {
    const userId = await requireUserId()
    const supabase = getSupabase()
    const folder = mediaType === 'IMAGE' ? 'images' : 'videos'
    const ext = mediaType === 'VIDEO' ? 'mp4' : 'jpg'
    const path = `${userId}/${folder}/${Date.now()}.${ext}`
    const { data, error } = await supabase.storage
        .from('generations')
        .createSignedUploadUrl(path)
    if (error || !data) {
        throw new Error(`Failed to create generation upload URL: ${error?.message ?? 'no data'}`)
    }
    return { path, token: data.token }
}

/**
 * Save a generation (upload file + create record)
 */
export async function apiSaveGenerationWithFile(
    avatarId: string | null,
    file: File,
    data: {
        prompt: string
        media_type: MediaType
        aspect_ratio?: string
        metadata?: Record<string, unknown>
    }
): Promise<Generation> {
    const userId = await requireUserId()

    // Determine extension
    const ext = data.media_type === 'VIDEO' ? 'mp4' : 'jpg'

    // Upload to storage
    const storagePath = await uploadGeneration(userId, data.media_type, file, ext)

    // Create database record (apiSaveGeneration re-derives the session user
    // and validates avatar ownership)
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
