import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import StudioShell from '../_components/StudioShell'
import getAvatarStudioData from '@/server/actions/getAvatarStudioData'
import type { ReferenceImage } from '../types'

interface PageProps {
    params: Promise<{ slug: string }>
}

export default async function Page({ params }: PageProps) {
    const session = await auth()
    const { slug: avatarId } = await params

    if (!session?.user?.id) {
        redirect('/sign-in')
    }

    // Fetch avatar data
    // defaultVoice FALTABA aquí (solo lo pedía la ruta raíz): entrar al Studio
    // por /[slug] dejaba al avatar sin su voz clonada para TTS/lip-sync.
    const { avatar, references, providers, prompts, defaultVoice } =
        await getAvatarStudioData(avatarId, session.user.id)

    // If avatar doesn't exist or doesn't belong to user, redirect
    if (!avatar || avatar.user_id !== session.user.id) {
        redirect('/concepts/avatar-forge/avatar-list')
    }

    // Transform references WITHOUT loading base64 server-side
    // Base64 will be loaded client-side by AvatarStudioProvider to avoid
    // serialization issues (Maximum call stack size exceeded)
    const transformedReferences: ReferenceImage[] = references.map((ref) => ({
        id: ref.id,
        url: '', // Will be loaded client-side
        mimeType: ref.mime_type,
        base64: '', // Will be loaded client-side from storagePath
        type: ref.type as 'general' | 'face' | 'angle' | 'body',
        storagePath: ref.storage_path,
    }))

    return (
        <StudioShell
            avatar={avatar}
            defaultVoice={defaultVoice}
            references={transformedReferences}
            providers={providers}
            prompts={prompts}
            userId={session.user.id}
        />
    )
}
