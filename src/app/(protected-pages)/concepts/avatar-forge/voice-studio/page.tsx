import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import VoiceStudioMain from './_components/VoiceStudioMain'
import { apiGetAvatars } from '@/services/AvatarForgeService'

export default async function VoiceStudioPage() {
    const session = await auth()
    if (!session?.user?.id) redirect('/sign-in')

    const avatars = await apiGetAvatars()

    return <VoiceStudioMain userId={session.user.id} avatars={avatars} />
}
