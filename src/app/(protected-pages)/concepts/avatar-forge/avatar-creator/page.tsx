import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AvatarCreatorMain from './_components/AvatarCreatorMain'

export const metadata = {
    title: 'Avatar Creator | Avatar Forge',
    description: 'Create and configure your avatar identity',
}

export default async function AvatarCreatorPage() {
    const session = await auth()

    if (!session?.user?.id) {
        redirect('/sign-in')
    }

    return <AvatarCreatorMain userId={session.user.id} />
}
