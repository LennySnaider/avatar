import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import ImageEditorMain from './_components/ImageEditorMain'

export default async function Page() {
    const session = await auth()

    if (!session?.user?.id) {
        redirect('/sign-in')
    }

    return <ImageEditorMain userId={session.user.id} />
}
