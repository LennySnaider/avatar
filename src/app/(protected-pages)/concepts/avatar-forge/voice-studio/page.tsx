import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import VoiceStudioMain from './_components/VoiceStudioMain'

export default async function VoiceStudioPage() {
    const session = await auth()
    if (!session?.user?.id) redirect('/sign-in')

    return <VoiceStudioMain />
}
