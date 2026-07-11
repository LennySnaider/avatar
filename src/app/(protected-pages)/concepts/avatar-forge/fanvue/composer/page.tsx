import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Container from '@/components/shared/Container'
import Card from '@/components/ui/Card'
import FanvueComposer from './_components/FanvueComposer'
import { createServerSupabaseClient, getStoragePublicUrl } from '@/lib/supabase'
import {
    getFanvueConnection,
    listFanvueCreators,
} from '@/services/FanvueService'
import type { PageProps } from '@/@types/common'
import type { MediaType } from '@/@types/supabase'

export interface ComposerGeneration {
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
    const generationId =
        typeof params.generationId === 'string'
            ? params.generationId
            : undefined

    const [connectionResult, creatorsResult, generations] = await Promise.all([
        getFanvueConnection(),
        listFanvueCreators(),
        (async (): Promise<ComposerGeneration[]> => {
            const supabase = createServerSupabaseClient()
            const { data } = await supabase
                .from('generations')
                .select('id, media_type, storage_path, prompt')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(24)
            return (data ?? []).map((g) => ({
                id: g.id,
                mediaType: g.media_type,
                publicUrl: getStoragePublicUrl('generations', g.storage_path),
                prompt: g.prompt,
            }))
        })(),
    ])

    const connected = connectionResult.success
        ? !!connectionResult.data?.connected
        : false
    const creators = creatorsResult.success ? (creatorsResult.data ?? []) : []

    return (
        <Container className="py-6">
            <h3 className="mb-1">New Fanvue post</h3>
            <p className="text-sm text-gray-500 mb-6">
                Publish a generation to Fanvue on behalf of one of your managed
                creators
            </p>

            {!connected ? (
                <Card>
                    <p className="mb-4 text-sm text-gray-500">
                        Connect your Fanvue agency before you can publish.
                    </p>
                    <Link
                        href="/concepts/avatar-forge/fanvue/accounts"
                        className="button inline-flex items-center justify-center h-12 px-5 py-2 rounded-xl bg-primary hover:bg-primary-mild text-neutral button-press-feedback"
                    >
                        Go to Fanvue Agency
                    </Link>
                </Card>
            ) : (
                <FanvueComposer
                    creators={creators}
                    generations={generations}
                    initialGenerationId={generationId}
                />
            )}
        </Container>
    )
}
