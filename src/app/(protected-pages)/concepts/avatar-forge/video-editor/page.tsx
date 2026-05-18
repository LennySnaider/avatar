import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import VideoEditorMain from './_components/VideoEditorMain'

export default async function Page() {
    const session = await auth()

    if (!session?.user?.id) {
        redirect('/sign-in')
    }

    return <VideoEditorMain userId={session.user.id} />
}
