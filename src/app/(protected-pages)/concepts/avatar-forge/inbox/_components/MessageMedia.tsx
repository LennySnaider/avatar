'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getMessageMedia } from '@/services/AgentInboxService'
import type { InboxMediaItem } from '@/lib/fanvue/messageMedia'

/**
 * Fotos y vídeos de un mensaje de Fanvue dentro del hilo.
 *
 * Fanvue sólo nos da uuids; las URLs las firma al pedirlas y caducan. Por eso:
 *  - se piden cuando el mensaje ENTRA EN PANTALLA (IntersectionObserver), no
 *    al abrir el hilo: un chat de spam trae cientos de mensajes con media;
 *  - se guardan en memoria mientras la página vive, para que el refresco del
 *    hilo o volver a un chat no las pida otra vez;
 *  - si una imagen falla al cargar (URL caducada), se tira la caché de ese
 *    mensaje y se piden una vez más.
 */
const cache = new Map<string, InboxMediaItem[]>()

type State =
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'ready'; items: InboxMediaItem[] }
    | { kind: 'error'; message: string }

interface MessageMediaProps {
    messageId: string
    count: number
    align: 'start' | 'end'
}

const MessageMedia = ({ messageId, count, align }: MessageMediaProps) => {
    const ref = useRef<HTMLDivElement>(null)
    const retried = useRef(false)
    const [state, setState] = useState<State>(() => {
        const cached = cache.get(messageId)
        return cached ? { kind: 'ready', items: cached } : { kind: 'idle' }
    })

    const load = useCallback(async () => {
        setState({ kind: 'loading' })
        const result = await getMessageMedia(messageId)
        if (result.success) {
            const items = result.data ?? []
            cache.set(messageId, items)
            setState({ kind: 'ready', items })
        } else {
            setState({
                kind: 'error',
                message: result.error ?? 'Could not load media',
            })
        }
    }, [messageId])

    useEffect(() => {
        if (state.kind !== 'idle') return
        const el = ref.current
        if (!el) return
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) {
                    observer.disconnect()
                    load()
                }
            },
            { rootMargin: '200px' },
        )
        observer.observe(el)
        return () => observer.disconnect()
    }, [state.kind, load])

    const onBroken = () => {
        if (retried.current) return
        retried.current = true
        cache.delete(messageId)
        load()
    }

    const justify = align === 'end' ? 'justify-end' : 'justify-start'

    if (state.kind === 'ready') {
        if (state.items.length === 0) return null
        return (
            <div className={`flex flex-wrap gap-1 max-w-[80%] mb-1 ${justify}`}>
                {state.items.map((item) => (
                    <MediaTile
                        key={item.uuid}
                        item={item}
                        onBroken={onBroken}
                    />
                ))}
            </div>
        )
    }

    if (state.kind === 'error') {
        return (
            <div className="text-[11px] text-gray-400 mb-1">
                Couldn&apos;t load media ·{' '}
                <button type="button" className="underline" onClick={load}>
                    retry
                </button>
            </div>
        )
    }

    // idle / loading: huecos del tamaño de una miniatura, para que el hilo no
    // salte cuando llegan las imágenes.
    return (
        <div ref={ref} className={`flex flex-wrap gap-1 mb-1 ${justify}`}>
            {Array.from({ length: Math.min(count, 4) }, (_, i) => (
                <div
                    key={i}
                    className="w-32 h-32 rounded-xl bg-gray-100 dark:bg-gray-700 animate-pulse"
                />
            ))}
        </div>
    )
}

const MediaTile = ({
    item,
    onBroken,
}: {
    item: InboxMediaItem
    onBroken: () => void
}) => {
    if (item.mediaType === 'audio' && item.fullUrl) {
        return <audio controls src={item.fullUrl} className="max-w-full" />
    }
    const href = item.fullUrl ?? item.thumbUrl
    if (!href) return null
    const isVideo = item.mediaType === 'video'
    return (
        <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="relative block rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700"
            title={isVideo ? 'Open video' : 'Open image'}
        >
            {item.thumbUrl ? (
                <img
                    src={item.thumbUrl}
                    alt=""
                    loading="lazy"
                    onError={onBroken}
                    className="max-h-48 max-w-[240px] object-cover"
                />
            ) : (
                <span className="flex w-32 h-32 items-center justify-center text-xs text-gray-500">
                    {isVideo ? 'Video' : 'Attachment'}
                </span>
            )}
            {isVideo && (
                <span className="absolute inset-0 flex items-center justify-center text-white text-2xl drop-shadow">
                    ▶
                </span>
            )}
        </a>
    )
}

export default MessageMedia
