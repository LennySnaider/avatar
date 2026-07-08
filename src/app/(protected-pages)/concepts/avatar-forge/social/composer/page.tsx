import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Container from '@/components/shared/Container'
import Card from '@/components/ui/Card'
import SocialComposer from './_components/SocialComposer'
import { createServerSupabaseClient, getStoragePublicUrl } from '@/lib/supabase'
import { getSocialProfileAction } from '@/services/SocialService'
import type { PageProps } from '@/@types/common'
import type { MediaType } from '@/@types/supabase'

/** Connected platforms come back either as bare strings or `{ platform }` objects (see T5's AccountsClient). */
function normalizePlatformKey(p: unknown): string {
    if (typeof p === 'string') return p
    return (p as { platform?: string })?.platform ?? ''
}

interface GenerationMedia {
    id: string
    mediaType: MediaType
    publicUrl: string
    prompt: string
}

export default async function Page({ searchParams }: PageProps) {
    const session = await auth()
    if (!session?.user?.id) {
        redirect('/sign-in')
    }
    const userId = session.user.id

    const params = await searchParams
    const generationId = typeof params.generationId === 'string' ? params.generationId : undefined

    const [profileResult, media, libraryImages] = await Promise.all([
        getSocialProfileAction(),
        (async (): Promise<GenerationMedia | null> => {
            if (!generationId) return null
            const supabase = createServerSupabaseClient()
            const { data: gen } = await supabase
                .from('generations')
                .select('id, media_type, storage_path, prompt')
                .eq('id', generationId)
                .eq('user_id', userId)
                .maybeSingle()
            if (!gen) return null
            return {
                id: gen.id,
                mediaType: gen.media_type,
                publicUrl: getStoragePublicUrl('generations', gen.storage_path),
                prompt: gen.prompt,
            }
        })(),
        // Recent gallery images the user can add to a carousel
        (async (): Promise<{ id: string; publicUrl: string }[]> => {
            const supabase = createServerSupabaseClient()
            const { data } = await supabase
                .from('generations')
                .select('id, storage_path')
                .eq('user_id', userId)
                .eq('media_type', 'IMAGE')
                .order('created_at', { ascending: false })
                .limit(24)
            return (data ?? []).map((g) => ({
                id: g.id,
                publicUrl: getStoragePublicUrl('generations', g.storage_path),
            }))
        })(),
    ])

    const profile = profileResult.success ? profileResult.data : null
    const connectedPlatforms = (profile?.connected_platforms ?? [])
        .map(normalizePlatformKey)
        .filter((p): p is string => Boolean(p))

    return (
        <Container className="py-6">
            <h3 className="mb-1">New post</h3>
            <p className="text-sm text-gray-500 mb-6">
                Publish or schedule this generation to your connected social accounts (via Upload-Post)
            </p>

            {!profile ? (
                <Card>
                    <p className="mb-4 text-sm text-gray-500">
                        You need a social profile before you can publish. Set one up on the accounts page.
                    </p>
                    <Link
                        href="/concepts/avatar-forge/social/accounts"
                        className="button inline-flex items-center justify-center h-12 px-5 py-2 rounded-xl bg-primary hover:bg-primary-mild text-neutral button-press-feedback"
                    >
                        Go to Social Accounts
                    </Link>
                </Card>
            ) : (
                <SocialComposer
                    media={media}
                    generationId={generationId}
                    platforms={connectedPlatforms}
                    libraryImages={libraryImages}
                />
            )}
        </Container>
    )
}
