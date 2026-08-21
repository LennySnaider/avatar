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

    // El filtro por user_id sobra: getAvatarStudioData ya acota por
    // organizacion, asi que si el avatar no es de tu org, avatar viene null.
    // Exigir ademas user_id === yo rompia con un segundo miembro en la org:
    // la lista mostraba el avatar (es de tu org) pero aca rebotaba sin
    // mensaje, creando un bucle lista -> detalle -> lista.
    if (!avatar) {
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
        storageProvider: ref.storage_provider,
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
