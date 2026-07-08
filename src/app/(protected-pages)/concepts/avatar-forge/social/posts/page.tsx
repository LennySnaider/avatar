import Container from '@/components/shared/Container'
import PostsClient from './_components/PostsClient'
import { listSocialPosts } from '@/services/SocialService'

export default async function Page() {
    const result = await listSocialPosts()

    return (
        <Container className="py-6">
            <h3 className="mb-1">Posts</h3>
            <p className="text-sm text-gray-500 mb-6">
                Track publishing status for posts sent from the composer (via Upload-Post)
            </p>
            <PostsClient
                initialPosts={result.success ? (result.data ?? []) : []}
                loadError={result.success ? null : (result.error ?? null)}
            />
        </Container>
    )
}
