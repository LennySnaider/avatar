'use server'

/**
 * F4.2.b — Servicio scopeado por ORGANIZACIÓN (multitenant).
 *
 * Identidad: SIEMPRE de la sesión vía getOrgContext() (nunca userId del
 * cliente). Autorización: filtro manual organization_id con service-role
 * (RLS-sin-políticas es solo backstop anti-anon). `user_id` se conserva en
 * los inserts como "creado por" (auditoría), NO como frontera de tenant.
 */
import { getOrgContext, type OrgContext } from '@/lib/tenant/getOrgContext'
import { orgTable, orgSupabase } from '@/lib/org/orgTable'
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

// =============================================
// OWNERSHIP GUARDS (org-based, anti-IDOR)
// =============================================
// Cada función exportada es un endpoint HTTP que cualquier autenticado puede
// invocar con argumentos arbitrarios: toda fila direccionada por id crudo se
// verifica contra la ORG de la sesión antes de leer/mutar.

async function assertAvatarInOrg(ctx: OrgContext, avatarId: string) {
    const { data, error } = await orgTable(ctx, 'avatars')
        .select('id')
        .eq('id', avatarId)
        .maybeSingle()
    if (error) throw error
    if (!data) throw new Error('Not your avatar')
}

async function assertGenerationInOrg(ctx: OrgContext, generationId: string) {
    const { data, error } = await orgTable(ctx, 'generations')
        .select('id')
        .eq('id', generationId)
        .maybeSingle()
    if (error) throw error
    if (!data) throw new Error('Not your media')
}

async function assertPromptInOrg(ctx: OrgContext, promptId: string) {
    const { data, error } = await orgTable(ctx, 'prompts')
        .select('id')
        .eq('id', promptId)
        .maybeSingle()
    if (error) throw error
    if (!data) throw new Error('Not your prompt')
}

// =============================================
// AVATARS CRUD
// =============================================

/**
 * Reassign a generation to another avatar (or none). This decides which
 * avatar's social accounts can publish the media, so BOTH rows must belong
 * to the caller's org.
 */
export async function apiSetGenerationAvatar(generationId: string, avatarId: string | null) {
    const ctx = await getOrgContext()
    await assertGenerationInOrg(ctx, generationId)
    if (avatarId) {
        await assertAvatarInOrg(ctx, avatarId)
    }
    const { error } = await orgTable(ctx, 'generations')
        .update({ avatar_id: avatarId })
        .eq('id', generationId)
    if (error) throw error
}

export async function apiGetAvatars() {
    const ctx = await getOrgContext()
    const { data, error } = await orgTable(ctx, 'avatars')
        .select('*, avatar_references(*)')
        .order('created_at', { ascending: false })

    if (error) throw error
    return data as unknown as (Avatar & { avatar_references: AvatarReference[] })[]
}

export async function apiGetAvatarById(avatarId: string) {
    const ctx = await getOrgContext()
    const { data, error } = await orgTable(ctx, 'avatars')
        .select('*, avatar_references(*)')
        .eq('id', avatarId)
        .maybeSingle()

    if (error) throw error
    if (!data) throw new Error('Not your avatar')
    return data as unknown as Avatar & { avatar_references: AvatarReference[] }
}

export async function apiCreateAvatar(avatar: AvatarInsert) {
    const ctx = await getOrgContext()
    // org de la sesión + user_id como "creado por" — valores del cliente se
    // sobreescriben SIEMPRE.
    const { data, error } = await orgSupabase()
        .from('avatars')
        .insert({
            ...avatar,
            user_id: ctx.userId,
            organization_id: ctx.organizationId,
        } as never)
        .select()
        .single()

    if (error) throw error
    return data as unknown as Avatar
}

export async function apiUpdateAvatar(avatarId: string, updates: AvatarUpdate) {
    const ctx = await getOrgContext()
    await assertAvatarInOrg(ctx, avatarId)
    // Never allow re-assigning ownership/tenant through an update payload.
    const {
        user_id: _u,
        organization_id: _o,
        ...safeUpdates
    } = updates as AvatarUpdate & { user_id?: string; organization_id?: string }
    void _u
    void _o
    const { data, error } = await orgTable(ctx, 'avatars')
        .update(safeUpdates as never)
        .eq('id', avatarId)
        .select()
        .single()

    if (error) throw error
    return data as unknown as Avatar
}

export async function apiDeleteAvatar(avatarId: string) {
    const ctx = await getOrgContext()
    await assertAvatarInOrg(ctx, avatarId)
    const { error } = await orgTable(ctx, 'avatars').delete().eq('id', avatarId)
    if (error) throw error
    return true
}

// =============================================
// AVATAR REFERENCES
// =============================================

export async function apiAddAvatarReference(reference: AvatarReferenceInsert) {
    const ctx = await getOrgContext()
    if (!reference.avatar_id) throw new Error('avatar_id is required')
    await assertAvatarInOrg(ctx, reference.avatar_id)
    const { data, error } = await orgSupabase()
        .from('avatar_references')
        .insert({ ...reference, organization_id: ctx.organizationId } as never)
        .select()
        .single()

    if (error) throw error
    return data as unknown as AvatarReference
}

export async function apiDeleteAvatarReference(referenceId: string) {
    const ctx = await getOrgContext()
    const { data: ref, error: refErr } = await orgTable(ctx, 'avatar_references')
        .select('id, avatar_id')
        .eq('id', referenceId)
        .maybeSingle()
    if (refErr) throw refErr
    if (!ref) throw new Error('Not your reference')

    const { error } = await orgTable(ctx, 'avatar_references')
        .delete()
        .eq('id', referenceId)

    if (error) throw error
    return true
}

export async function apiGetAvatarReferences(avatarId: string, type?: ReferenceType) {
    const ctx = await getOrgContext()
    await assertAvatarInOrg(ctx, avatarId)
    let query = orgTable(ctx, 'avatar_references')
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
    const ctx = await getOrgContext()
    let query = orgTable(ctx, 'generations').select('*')

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
    const ctx = await getOrgContext()
    if (generation.avatar_id) {
        await assertAvatarInOrg(ctx, generation.avatar_id)
    }
    // org + "creado por" de la sesión — valores del cliente se sobreescriben.
    const { data, error } = await orgSupabase()
        .from('generations')
        .insert({
            ...generation,
            user_id: ctx.userId,
            organization_id: ctx.organizationId,
        } as never)
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
    const ctx = await getOrgContext()
    await assertGenerationInOrg(ctx, generationId)
    const { error } = await orgTable(ctx, 'generations')
        .update({ metadata } as never)
        .eq('id', generationId)
    if (error) throw error
    return true
}

export async function apiDeleteGeneration(generationId: string) {
    const ctx = await getOrgContext()
    await assertGenerationInOrg(ctx, generationId)
    const { error } = await orgTable(ctx, 'generations')
        .delete()
        .eq('id', generationId)

    if (error) throw error
    return true
}

// =============================================
// PROMPTS
// =============================================

export async function apiGetPrompts(mediaType?: MediaType) {
    const ctx = await getOrgContext()
    let query = orgTable(ctx, 'prompts').select('*')

    if (mediaType) {
        query = query.eq('media_type', mediaType)
    }

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) throw error
    return data as unknown as Prompt[]
}

export async function apiCreatePrompt(prompt: PromptInsert) {
    const ctx = await getOrgContext()
    const { data, error } = await orgSupabase()
        .from('prompts')
        .insert({
            ...prompt,
            user_id: ctx.userId,
            organization_id: ctx.organizationId,
        } as never)
        .select()
        .single()

    if (error) throw error
    return data as unknown as Prompt
}

export async function apiUpdatePrompt(promptId: string, updates: PromptUpdate) {
    const ctx = await getOrgContext()
    await assertPromptInOrg(ctx, promptId)
    const {
        user_id: _u,
        organization_id: _o,
        ...safeUpdates
    } = updates as PromptUpdate & { user_id?: string; organization_id?: string }
    void _u
    void _o
    const { data, error } = await orgTable(ctx, 'prompts')
        .update(safeUpdates as never)
        .eq('id', promptId)
        .select()
        .single()

    if (error) throw error
    return data as unknown as Prompt
}

export async function apiDeletePrompt(promptId: string) {
    const ctx = await getOrgContext()
    await assertPromptInOrg(ctx, promptId)
    const { error } = await orgTable(ctx, 'prompts').delete().eq('id', promptId)
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
    // Catálogo: filas globales (organization_id NULL = plantilla con key por
    // env) + filas BYOK de la propia org.
    const ctx = await getOrgContext()
    let query = orgSupabase()
        .from('ai_providers')
        .select('*')
        .or(`organization_id.is.null,organization_id.eq.${ctx.organizationId}`)

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
    const ctx = await getOrgContext()
    const { data, error } = await orgSupabase()
        .from('ai_providers')
        .select('*')
        .eq('id', providerId)
        .or(`organization_id.is.null,organization_id.eq.${ctx.organizationId}`)
        .maybeSingle()

    if (error) throw error
    if (!data) throw new Error('Provider not found')
    return data as unknown as AIProvider
}

// =============================================
// STORAGE HELPERS
// =============================================
// Los helpers de upload NO se exportan: exportarlos desde un archivo 'use
// server' los volvería endpoints públicos con userId crudo. Reciben el
// contexto derivado de la sesión desde sus wrappers exportados.

async function uploadAvatarReference(
    ctx: OrgContext,
    avatarId: string,
    type: ReferenceType,
    file: File
): Promise<string> {
    const supabase = orgSupabase()
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}.${fileExt}`
    const filePath = `${ctx.userId}/references/${avatarId}/${type}/${fileName}`

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
    ctx: OrgContext,
    mediaType: MediaType,
    blob: Blob,
    extension: string = 'jpg'
): Promise<string> {
    const supabase = orgSupabase()
    const folder = mediaType === 'IMAGE' ? 'images' : 'videos'
    const fileName = `${Date.now()}.${extension}`
    const filePath = `${ctx.userId}/${folder}/${fileName}`

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
    await getOrgContext()
    const supabase = orgSupabase()
    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    return data.publicUrl
}

/**
 * Prefijos de storage accesibles para la org de la sesión: los archivos
 * legacy viven bajo `{userId}/…` de CADA miembro de la org; los nuevos
 * (F4.2.c) bajo `org/{orgId}/…`.
 */
async function assertPathInOrg(ctx: OrgContext, path: string) {
    if (path.startsWith(`org/${ctx.organizationId}/`)) return
    const firstSegment = path.split('/')[0]
    if (firstSegment === ctx.userId) return
    const { data, error } = await orgSupabase()
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', ctx.organizationId)
        .eq('user_id', firstSegment)
        .maybeSingle()
    if (error) throw error
    if (!data) throw new Error('Not your file')
}

/**
 * Sign a storage path for reading. Solo se emiten URLs firmadas para rutas
 * dentro de los prefijos de la org del caller.
 */
export async function getSignedUrl(
    bucket: string,
    path: string,
    expiresIn: number = 3600
): Promise<string> {
    const ctx = await getOrgContext()
    await assertPathInOrg(ctx, path)
    const supabase = orgSupabase()
    const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, expiresIn)

    if (error) throw error
    return data.signedUrl
}

export async function deleteStorageFile(bucket: string, path: string) {
    const ctx = await getOrgContext()
    await assertPathInOrg(ctx, path)
    const supabase = orgSupabase()
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
    const ctx = await getOrgContext()
    await assertAvatarInOrg(ctx, avatarId)

    // Upload file to storage
    const storagePath = await uploadAvatarReference(ctx, avatarId, type, file)

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
    const ctx = await getOrgContext()
    const supabase = orgSupabase()
    const folder = mediaType === 'IMAGE' ? 'images' : 'videos'
    const ext = mediaType === 'VIDEO' ? 'mp4' : 'jpg'
    const path = `${ctx.userId}/${folder}/${Date.now()}.${ext}`
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
    const ctx = await getOrgContext()

    // Determine extension
    const ext = data.media_type === 'VIDEO' ? 'mp4' : 'jpg'

    // Upload to storage
    const storagePath = await uploadGeneration(ctx, data.media_type, file, ext)

    // Create database record (apiSaveGeneration re-derives session context
    // and validates avatar ownership)
    const generation = await apiSaveGeneration({
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
