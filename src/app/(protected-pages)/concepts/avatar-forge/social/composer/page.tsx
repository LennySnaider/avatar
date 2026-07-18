import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Container from '@/components/shared/Container'
import Card from '@/components/ui/Card'
import SocialComposer from './_components/SocialComposer'
import { getStoragePublicUrl } from '@/lib/storagePaths'
import { getOrgContext } from '@/lib/tenant/getOrgContext'
import { orgTable } from '@/lib/org/orgTable'
import { listAvatarSocialAccounts } from '@/services/SocialService'
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
    avatarId: string | null
}

export default async function Page({ searchParams }: PageProps) {
    const session = await auth()
    if (!session?.user?.id) {
        redirect('/sign-in')
    }
    const ctx = await getOrgContext()

    const params = await searchParams
    const generationId = typeof params.generationId === 'string' ? params.generationId : undefined

    const [accountsResult, media, libraryImages] = await Promise.all([
        listAvatarSocialAccounts(),
        (async (): Promise<GenerationMedia | null> => {
            if (!generationId) return null
            const { data: gen } = await orgTable(ctx, 'generations')
                .select('id, media_type, storage_path, prompt, avatar_id')
                .eq('id', generationId)
                .maybeSingle()
            if (!gen) return null
            return {
                id: gen.id,
                mediaType: gen.media_type,
                publicUrl: getStoragePublicUrl('generations', gen.storage_path),
                prompt: gen.prompt,
                avatarId: gen.avatar_id,
            }
        })(),
        // Recent gallery images the user can add to a carousel (filtered to
        // the selected avatar client-side — cross-avatar carousels are
        // rejected by the server).
        (async (): Promise<{ id: string; publicUrl: string; avatarId: string | null }[]> => {
            const { data } = await orgTable(ctx, 'generations')
                .select('id, storage_path, avatar_id')
                .eq('media_type', 'IMAGE')
                .order('created_at', { ascending: false })
                .limit(24)
            return ((data ?? []) as { id: string; storage_path: string; avatar_id: string | null }[]).map((g) => ({
                id: g.id,
                publicUrl: getStoragePublicUrl('generations', g.storage_path),
                avatarId: g.avatar_id,
            }))
        })(),
    ])

    // Only avatars with an ACTIVE Upload-Post account can publish.
    const accounts = (accountsResult.success ? (accountsResult.data ?? []) : [])
        .filter((a) => a.profile?.status === 'active')
        .map((a) => ({
            avatarId: a.avatarId,
            avatarName: a.avatarName,
            platforms: (a.profile?.connectedPlatforms ?? [])
                .map(normalizePlatformKey)
                .filter((p): p is string => Boolean(p)),
        }))

    return (
        <Container className="py-6">
            <h3 className="mb-1">New post</h3>
            <p className="text-sm text-gray-500 mb-6">
                Publish or schedule this generation through an avatar&apos;s connected
                social accounts (via Upload-Post)
            </p>

            {accounts.length === 0 ? (
                <Card>
                    <p className="mb-4 text-sm text-gray-500">
                        No avatar has an Upload-Post account yet. Connect one on the
                        accounts page before publishing.
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
                    accounts={accounts}
                    libraryImages={libraryImages}
                />
            )}
        </Container>
    )
}
