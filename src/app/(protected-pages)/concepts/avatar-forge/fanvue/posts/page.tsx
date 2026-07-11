import Container from '@/components/shared/Container'
import FanvuePostsClient from './_components/FanvuePostsClient'
import { listFanvuePosts } from '@/services/FanvueService'

export default async function Page() {
    const result = await listFanvuePosts()

    return (
        <Container className="py-6">
            <h3 className="mb-1">Fanvue Posts</h3>
            <p className="text-sm text-gray-500 mb-6">
                Track posts published to Fanvue from the composer
            </p>
            <FanvuePostsClient
                initialPosts={result.success ? (result.data ?? []) : []}
                loadError={result.success ? null : (result.error ?? null)}
            />
        </Container>
    )
}
