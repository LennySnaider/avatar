import type { Metadata } from 'next'
import { getPublicLiveProfile } from '@/lib/live/session'
import PublicLiveClient from './_components/PublicLiveClient'

/**
 * Link público del modo en vivo de un avatar (módulo `live_avatar`): el
 * visitante habla por micrófono con la cara, la voz y la persona del avatar.
 * También es lo que carga el iframe del widget (`public/live-widget.js`).
 *
 * Pública: el middleware exime el prefijo `/live/`. Cualquier motivo de
 * rechazo pinta la misma página de "no disponible" (ver
 * `getPublicLiveProfile`).
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
    title: 'Live',
    robots: { index: false, follow: false },
}

export default async function PublicLivePage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params
    const profile = await getPublicLiveProfile(token).catch(() => null)
    return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
            {profile ? (
                <PublicLiveClient token={token} avatarName={profile.avatarName} />
            ) : (
                <p className="text-gray-300 text-center">Este avatar no está disponible ahora mismo.</p>
            )}
        </div>
    )
}
