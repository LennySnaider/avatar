'use client'

import { useEffect, useRef, useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import { HiOutlineZoomIn, HiOutlineZoomOut } from 'react-icons/hi'

/**
 * Lightbox de imagen reutilizable: modal grande, zoom (botones + rueda) y
 * ARRASTRAR para desplazar cuando hay zoom. Fuente ÚNICA — antes cada drawer
 * (avatar-studio y el shared de My Avatars) tenía su propia copia del Dialog de
 * preview, con zoom pero SIN pan. Ambos ahora renderizan este componente.
 */
interface ImageLightboxProps {
    imageUrl: string | null // null = cerrado
    onClose: () => void
    alt?: string
}

const ZOOM_MIN = 1
const ZOOM_MAX = 4
const ZOOM_STEP = 0.25

const ImageLightbox = ({
    imageUrl,
    onClose,
    alt = 'Preview',
}: ImageLightboxProps) => {
    const [zoom, setZoom] = useState(1)
    const [pan, setPan] = useState({ x: 0, y: 0 })
    const drag = useRef<{
        startX: number
        startY: number
        ox: number
        oy: number
    } | null>(null)

    // Reset al abrir una imagen nueva (o cerrar).
    useEffect(() => {
        setZoom(1)
        setPan({ x: 0, y: 0 })
    }, [imageUrl])

    const zoomTo = (next: number) => {
        const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next))
        setZoom(clamped)
        if (clamped === 1) setPan({ x: 0, y: 0 })
    }

    const onWheel = (e: React.WheelEvent) => {
        e.preventDefault()
        zoomTo(zoom + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP))
    }

    const onPointerDown = (e: React.PointerEvent) => {
        if (zoom <= 1) return
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = {
            startX: e.clientX,
            startY: e.clientY,
            ox: pan.x,
            oy: pan.y,
        }
    }

    const onPointerMove = (e: React.PointerEvent) => {
        if (!drag.current) return
        setPan({
            x: drag.current.ox + (e.clientX - drag.current.startX),
            y: drag.current.oy + (e.clientY - drag.current.startY),
        })
    }

    const endDrag = () => {
        drag.current = null
    }

    return (
        <Dialog
            isOpen={!!imageUrl}
            onClose={onClose}
            onRequestClose={onClose}
            width={1200}
        >
            {imageUrl && (
                <div className="flex flex-col">
                    {/* Zoom Controls */}
                    <div className="flex items-center justify-center gap-2 p-2 border-b">
                        <button
                            onClick={() => zoomTo(zoom - ZOOM_STEP)}
                            disabled={zoom <= ZOOM_MIN}
                            className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Zoom Out"
                        >
                            <HiOutlineZoomOut className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => zoomTo(1)}
                            className="px-3 py-1 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white min-w-14 text-center"
                            title="Reset Zoom"
                        >
                            {Math.round(zoom * 100)}%
                        </button>
                        <button
                            onClick={() => zoomTo(zoom + ZOOM_STEP)}
                            disabled={zoom >= ZOOM_MAX}
                            className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Zoom In"
                        >
                            <HiOutlineZoomIn className="w-4 h-4" />
                        </button>
                    </div>
                    {/* Image */}
                    <div
                        className="p-2 overflow-hidden max-h-[82vh] flex items-center justify-center"
                        onWheel={onWheel}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={endDrag}
                        onPointerLeave={endDrag}
                        style={{
                            cursor:
                                zoom > 1
                                    ? drag.current
                                        ? 'grabbing'
                                        : 'grab'
                                    : 'default',
                        }}
                    >
                        <img
                            src={imageUrl}
                            alt={alt}
                            className="rounded-lg object-contain select-none"
                            style={{
                                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                                transition: drag.current
                                    ? 'none'
                                    : 'transform 0.15s ease-out',
                                maxHeight: zoom === 1 ? '78vh' : 'none',
                            }}
                            draggable={false}
                        />
                    </div>
                </div>
            )}
        </Dialog>
    )
}

export default ImageLightbox
