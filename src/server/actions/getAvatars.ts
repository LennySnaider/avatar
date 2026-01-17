import { createServerSupabaseClient } from '@/lib/supabase'
import type { AvatarWithReferences } from '@/app/(protected-pages)/concepts/avatar-forge/avatar-list/types'
import type { Avatar, AvatarReference } from '@/@types/supabase'

interface AvatarWithRefs extends Avatar {
    avatar_references: AvatarReference[]
}

const getAvatars = async (_queryParams: {
    [key: string]: string | string[] | undefined
}) => {
    const queryParams = _queryParams
    const {
        pageIndex = '1',
        pageSize = '12',
        query,
        userId,
    } = queryParams

    const supabase = createServerSupabaseClient()
    const page = parseInt(pageIndex as string) || 1
    const limit = parseInt(pageSize as string) || 12
    const offset = (page - 1) * limit

    // Build query for avatars
    let avatarsQuery = supabase
        .from('avatars')
        .select('*, avatar_references(*)', { count: 'exact' })
        .order('created_at', { ascending: false })

    // Filter by user if provided
    if (userId) {
        avatarsQuery = avatarsQuery.eq('user_id', userId as string)
    }

    // Search filter
    if (query) {
        avatarsQuery = avatarsQuery.ilike('name', `%${query}%`)
    }

    // Apply pagination
    avatarsQuery = avatarsQuery.range(offset, offset + limit - 1)

    const { data: avatars, count, error } = await avatarsQuery as {
        data: AvatarWithRefs[] | null
        count: number | null
        error: unknown
    }

    if (error) {
        console.error('Error fetching avatars:', error)
        return {
            list: [] as AvatarWithReferences[],
            total: 0,
        }
    }

    // Get signed URLs for avatar references (thumbnails)
    const avatarsWithUrls: AvatarWithReferences[] = await Promise.all(
        (avatars || []).map(async (avatar) => {
            const references = avatar.avatar_references || []

            // Get thumbnail from first face or general reference
            const thumbnailRef = references.find(
                (ref: { type: string }) => ref.type === 'face'
            ) || references.find(
                (ref: { type: string }) => ref.type === 'general'
            )

            let thumbnailUrl: string | undefined

            if (thumbnailRef) {
                const { data: signedUrl } = await supabase.storage
                    .from('avatars')
                    .createSignedUrl(thumbnailRef.storage_path, 3600) // 1 hour expiry

                thumbnailUrl = signedUrl?.signedUrl
            }

            return {
                ...avatar,
                avatar_references: references,
                thumbnailUrl,
            } as AvatarWithReferences
        })
    )

    return {
        list: avatarsWithUrls,
        total: count || 0,
    }
}

export default getAvatars
