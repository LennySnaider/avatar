import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Container from '@/components/shared/Container'
import TrendingSoundsClient from './_components/TrendingSoundsClient'
import { listTrendingSounds } from '@/services/TrendService'

export default async function Page() {
    const session = await auth()
    if (!session?.user?.id) redirect('/sign-in')

    const initial = await listTrendingSounds({ countryCode: 'GLOBAL', period: 7 })

    return (
        <Container className="py-6">
            <h3 className="mb-1">Trending Sounds</h3>
            <p className="text-sm text-gray-500 mb-6">
                Viral TikTok audio, ranked. Preview a sound, open its TikTok page, or bake it
                into a video from the Video Editor before publishing.
            </p>
            <TrendingSoundsClient
                initialSounds={initial.success ? (initial.data?.sounds ?? []) : []}
                initialFetchedAt={initial.success ? (initial.data?.fetchedAt ?? null) : null}
                loadError={initial.success ? null : (initial.error ?? null)}
            />
        </Container>
    )
}
