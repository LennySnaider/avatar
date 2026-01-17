import { auth } from '@/auth'
import Container from '@/components/shared/Container'
import AvatarStudioProvider from './_components/AvatarStudioProvider'
import AvatarStudioMain from './_components/AvatarStudioMain'
import getAvatarStudioData from '@/server/actions/getAvatarStudioData'
import type { PageProps } from '@/@types/common'

export default async function Page({ searchParams }: PageProps) {
    const session = await auth()
    const params = await searchParams
    const avatarId = params.avatarId as string | undefined

    // Fetch data
    const { avatar, references, providers, prompts } = await getAvatarStudioData(
        avatarId,
        session?.user?.id
    )

    // Transform references to include URLs (signed URLs will be fetched client-side)
    const transformedReferences = references.map((ref) => ({
        id: ref.id,
        url: '', // Will be populated client-side
        mimeType: ref.mime_type,
        base64: '', // Will be fetched client-side
        type: ref.type as 'general' | 'face' | 'angle' | 'body',
        storagePath: ref.storage_path,
    }))

    return (
        <AvatarStudioProvider
            avatar={avatar}
            references={transformedReferences}
            providers={providers}
            prompts={prompts}
        >
            <Container className="h-[calc(100vh-theme(spacing.16))]">
                <AvatarStudioMain userId={session?.user?.id} />
            </Container>
        </AvatarStudioProvider>
    )
}
