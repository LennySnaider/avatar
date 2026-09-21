'use client'

import type { InboxMediaItem } from '@/lib/fanvue/messageMedia'

/**
 * Fotos y vídeos de un mensaje de Fanvue dentro del hilo. Sólo pinta: quien
 * pide las URLs firmadas es `ThreadPane`, UNA vez por hilo (`getChatMedia`),
 * y aquí se buscan los medios de este mensaje por su uuid.
 */
export type ChatMediaState =
    | { kind: 'loading' }
    | { kind: 'ready'; index: Record<string, InboxMediaItem> }
    | { kind: 'error'; message: string }

interface MessageMediaProps {
    uuids: string[]
    media: ChatMediaState
    align: 'start' | 'end'
    /** Una imagen no cargó (URL caducada): el hilo vuelve a pedir la media. */
    onBroken: () => void
    onRetry: () => void
}

const MessageMedia = ({
    uuids,
    media,
    align,
    onBroken,
    onRetry,
}: MessageMediaProps) => {
    const justify = align === 'end' ? 'justify-end' : 'justify-start'

    if (media.kind === 'loading') {
        // Huecos del tamaño de una miniatura, para que el hilo no salte
        // cuando llegan las imágenes.
        return (
            <div className={`flex flex-wrap gap-1 mb-1 ${justify}`}>
                {Array.from({ length: Math.min(uuids.length, 4) }, (_, i) => (
                    <div
                        key={i}
                        className="w-32 h-32 rounded-xl bg-gray-100 dark:bg-gray-700 animate-pulse"
                    />
                ))}
            </div>
        )
    }

    if (media.kind === 'error') {
        return (
            <div className="text-[11px] text-gray-400 mb-1">
                Couldn&apos;t load media ·{' '}
                <button type="button" className="underline" onClick={onRetry}>
                    retry
                </button>
            </div>
        )
    }

    const items = uuids
        .map((uuid) => media.index[uuid])
        .filter((item): item is InboxMediaItem => Boolean(item))
    if (items.length === 0) {
        // Fanvue no lo devolvió: es más viejo que las páginas pedidas, o ya
        // no existe. Se dice que había algo, en vez de callarlo.
        return (
            <div className="text-[11px] text-gray-400 mb-1">
                📷 Media not available
            </div>
        )
    }
    return (
        <div className={`flex flex-wrap gap-1 max-w-[80%] mb-1 ${justify}`}>
            {items.map((item) => (
                <MediaTile key={item.uuid} item={item} onBroken={onBroken} />
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
                    className="max-h-48 max-w-60 object-cover"
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
