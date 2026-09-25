'use client'

import { useCallback } from 'react'
import LiveAvatarCall from '@/components/shared/LiveAvatarCall/LiveAvatarCall'
import type { LiveBootstrap } from '@/components/shared/LiveAvatarCall/useLiveCall'

const VISITOR_KEY = 'pa_live_visitor'

/** Id estable del visitante en este navegador: el avatar lo recuerda entre visitas. */
function visitorId(): string {
    try {
        const saved = window.localStorage.getItem(VISITOR_KEY)
        if (saved) return saved
        const fresh = crypto.randomUUID()
        window.localStorage.setItem(VISITOR_KEY, fresh)
        return fresh
    } catch {
        return crypto.randomUUID()
    }
}

/** Origen de la web que embebe el iframe, si lo hay. */
function embedding(): { embedded: boolean; embedderOrigin: string | null } {
    const embedded = window.self !== window.top
    if (!embedded) return { embedded, embedderOrigin: null }
    const ancestors = window.location.ancestorOrigins
    if (ancestors && ancestors.length > 0) return { embedded, embedderOrigin: ancestors[ancestors.length - 1] }
    try {
        return { embedded, embedderOrigin: document.referrer ? new URL(document.referrer).origin : null }
    } catch {
        return { embedded, embedderOrigin: null }
    }
}

const PublicLiveClient = ({ token, avatarName }: { token: string; avatarName: string }) => {
    const bootstrap = useCallback(async (): Promise<LiveBootstrap> => {
        const res = await fetch('/api/live/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, visitorId: visitorId(), ...embedding() }),
        })
        const body = (await res.json().catch(() => ({}))) as Partial<LiveBootstrap> & { ok?: boolean; error?: string }
        if (!res.ok || !body.ok || !body.sessionId) throw new Error(body.error ?? 'No se pudo iniciar la llamada.')
        return body as LiveBootstrap
    }, [token])

    return <LiveAvatarCall className="w-full max-w-md" avatarName={avatarName} bootstrap={bootstrap} />
}

export default PublicLiveClient
