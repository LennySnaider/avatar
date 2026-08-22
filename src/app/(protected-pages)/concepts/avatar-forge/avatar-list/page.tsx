import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import AvatarListProvider from './_components/AvatarListProvider'
import AvatarGrid from './_components/AvatarGrid'
import AvatarListActionTools from './_components/AvatarListActionTools'
import getAvatars from '@/server/actions/getAvatars'
import type { PageProps } from '@/@types/common'

export default async function Page({ searchParams }: PageProps) {
    const params = await searchParams

    // getAvatars() ya no filtra por user_id (F4.2 Tarea 3, commit 2f963e1):
    // los avatares son de la org, no del usuario, asi que no hace falta
    // resolver la sesion aca solo para eso — el scope real lo aplica el
    // propio server action via getOrgContext()/orgTable().
    const data = await getAvatars(params)

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
