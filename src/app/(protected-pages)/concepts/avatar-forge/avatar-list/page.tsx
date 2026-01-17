import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import AvatarListProvider from './_components/AvatarListProvider'
import AvatarGrid from './_components/AvatarGrid'
import AvatarListActionTools from './_components/AvatarListActionTools'
import getAvatars from '@/server/actions/getAvatars'
import type { PageProps } from '@/@types/common'
import { auth } from '@/auth'

export default async function Page({ searchParams }: PageProps) {
    const session = await auth()
    const params = await searchParams

    // Add userId to params for filtering
    const queryParams = {
        ...params,
        userId: session?.user?.id,
    }

    const data = await getAvatars(queryParams)

    return (
        <AvatarListProvider avatarList={data.list}>
            <Container>
                <AdaptiveCard>
                    <div className="flex flex-col gap-6">
                        <AvatarListActionTools />
                        <AvatarGrid
                            total={data.total}
                            pageIndex={parseInt(params.pageIndex as string) || 1}
                            pageSize={parseInt(params.pageSize as string) || 12}
                        />
                    </div>
                </AdaptiveCard>
            </Container>
        </AvatarListProvider>
    )
}
