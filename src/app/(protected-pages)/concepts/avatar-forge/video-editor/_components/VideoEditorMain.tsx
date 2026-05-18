'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Progress from '@/components/ui/Progress'
import ScrollBar from '@/components/ui/ScrollBar'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import {
    HiOutlineUpload,
    HiOutlineFilm,
    HiOutlineDownload,
    HiOutlineRefresh,
    HiOutlineScissors,
    HiOutlineChevronLeft,
    HiOutlineChevronRight,
    HiOutlineTrash,
    HiOutlineSave,
} from 'react-icons/hi'
import { useAvatarStudioStore } from '../../avatar-studio/_store/avatarStudioStore'
import {
    probeVideo,
    removeWatermark,
    type VideoRegion,
} from '@/services/VideoEditService'

type EditedVideo = {
    id: string
    url: string
    label: string
    operation: 'delogo'
    params: Record<string, unknown>
    timestamp: number
}

type EditMode = 'watermark' // 'trim' | 'crop' come in Phase 2

interface VideoEditorMainProps {
    userId?: string
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const VideoEditorMain = ({ userId }: VideoEditorMainProps) => {
    const addToGallery = useAvatarStudioStore((s) => s.addToGallery)

    // Source video state
    const [sourceUrl, setSourceUrl] = useState<string | null>(null)
    const [videoSize, setVideoSize] = useState({ width: 0, height: 0 })
    const [videoDuration, setVideoDuration] = useState(0)

    // History of edits (each one is a new blob URL)
    const [history, setHistory] = useState<EditedVideo[]>([])
    const [currentIndex, setCurrentIndex] = useState(-1) // -1 = original

    // Edit mode + rectangle drag state
    const [editMode] = useState<EditMode>('watermark')
    const [rect, setRect] = useState<VideoRegion | null>(null)
    const [isDraggingRect, setIsDraggingRect] = useState(false)
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

    // Processing state
    const [isProcessing, setIsProcessing] = useState(false)
    const [progress, setProgress] = useState(0)
    const [progressLabel, setProgressLabel] = useState('')

    // DOM refs
    const videoRef = useRef<HTMLVideoElement>(null)
    const canvasContainerRef = useRef<HTMLDivElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Current visible URL is either the original or a history entry
    const currentUrl = currentIndex === -1
        ? sourceUrl
        : history[currentIndex]?.url ?? sourceUrl

    // ─── Load source from sessionStorage on mount ────────────────────
    // GalleryPanel "Edit" button (Phase 2) writes to videoEditorImport;
    // we read it on mount and pre-load the video so the user lands ready
    // to edit without a manual upload step.
    useEffect(() => {
        const importData = sessionStorage.getItem('videoEditorImport')
        if (!importData) return
        try {
            const { url } = JSON.parse(importData) as { url?: string }
            sessionStorage.removeItem('videoEditorImport')
            if (url) loadVideo(url)
        } catch (err) {
            console.warn('[VideoEditor] Bad videoEditorImport payload:', err)
            sessionStorage.removeItem('videoEditorImport')
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // ─── Probe video to get dimensions + duration ────────────────────
    // The visible <video> element gives us width/height/duration via DOM
    // events (loadedmetadata), which is faster than a full FFmpeg probe
    // and works for any browser-playable format. We only fall back to
    // FFmpeg probing if the DOM read fails (e.g. CORS on remote URL).
    const loadVideo = useCallback((url: string) => {
        setSourceUrl(url)
        setHistory([])
        setCurrentIndex(-1)
        setRect(null)
    }, [])

    useEffect(() => {
        if (!currentUrl) return
        const video = videoRef.current
        if (!video) return

        const onMeta = () => {
            setVideoSize({
                width: video.videoWidth || 1,
                height: video.videoHeight || 1,
            })
            setVideoDuration(video.duration || 0)
        }
        video.addEventListener('loadedmetadata', onMeta)
        return () => video.removeEventListener('loadedmetadata', onMeta)
    }, [currentUrl])

    // ─── File upload handler ────────────────────────────────────────
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        if (!file.type.startsWith('video/')) {
            toast.push(
                <Notification type="warning" title="Invalid File">
                    Only video files are supported.
                </Notification>,
            )
            return
        }
        const url = URL.createObjectURL(file)
        loadVideo(url)
        e.target.value = ''
    }

    // ─── Rectangle drag (watermark / crop selector) ──────────────────
    // Coordinates here are in DISPLAY pixels (the container size). When
    // we send to FFmpeg we scale up to source video pixels using
    // videoSize / containerSize. This keeps the math simple and the
    // overlay accurate as the video is responsively sized.
    const getContainerCoords = (e: React.MouseEvent): { x: number; y: number } => {
        const container = canvasContainerRef.current
        if (!container) return { x: 0, y: 0 }
        const r = container.getBoundingClientRect()
        return {
            x: Math.max(0, Math.min(r.width, e.clientX - r.left)),
            y: Math.max(0, Math.min(r.height, e.clientY - r.top)),
        }
    }

    const handleRectMouseDown = (e: React.MouseEvent) => {
        if (isProcessing) return
        const { x, y } = getContainerCoords(e)
        setIsDraggingRect(true)
        setDragStart({ x, y })
        setRect({ x, y, w: 0, h: 0 })
    }

    const handleRectMouseMove = (e: React.MouseEvent) => {
        if (!isDraggingRect) return
        const { x, y } = getContainerCoords(e)
        const minX = Math.min(dragStart.x, x)
        const minY = Math.min(dragStart.y, y)
        const maxX = Math.max(dragStart.x, x)
        const maxY = Math.max(dragStart.y, y)
        setRect({ x: minX, y: minY, w: maxX - minX, h: maxY - minY })
    }

    const handleRectMouseUp = () => {
        setIsDraggingRect(false)
        // Reject ghost-rects from a stray click without drag.
        if (rect && (rect.w < 4 || rect.h < 4)) setRect(null)
    }

    // ─── Apply watermark removal ─────────────────────────────────────
    const handleRemoveWatermark = useCallback(async () => {
        if (!currentUrl || !rect) return

        const container = canvasContainerRef.current
        if (!container) return
        const containerRect = container.getBoundingClientRect()

        // Translate display-pixel rect to source-video-pixel rect.
        // The <video> uses object-contain so it might be letterboxed —
        // compute the actual rendered video box first, then scale.
        const containerW = containerRect.width
        const containerH = containerRect.height
        const vw = videoSize.width
        const vh = videoSize.height

        const containerAR = containerW / containerH
        const videoAR = vw / vh
        let renderedW = containerW
        let renderedH = containerH
        let offsetX = 0
        let offsetY = 0
        if (videoAR > containerAR) {
            // Video is wider than container → letterbox top/bottom
            renderedH = containerW / videoAR
            offsetY = (containerH - renderedH) / 2
        } else {
            renderedW = containerH * videoAR
            offsetX = (containerW - renderedW) / 2
        }

        const scaleX = vw / renderedW
        const scaleY = vh / renderedH

        const region: VideoRegion = {
            x: Math.max(0, (rect.x - offsetX) * scaleX),
            y: Math.max(0, (rect.y - offsetY) * scaleY),
            w: Math.min(vw, rect.w * scaleX),
            h: Math.min(vh, rect.h * scaleY),
        }

        if (region.w < 4 || region.h < 4) {
            toast.push(
                <Notification type="warning" title="Region too small">
                    Draw a larger rectangle over the watermark.
                </Notification>,
            )
            return
        }

        setIsProcessing(true)
        setProgress(0)
        setProgressLabel('Removing watermark…')

        try {
            const outputUrl = await removeWatermark(currentUrl, region, setProgress)
            const edit: EditedVideo = {
                id: `edit-${Date.now()}`,
                url: outputUrl,
                label: 'Watermark removed',
                operation: 'delogo',
                params: region,
                timestamp: Date.now(),
            }
            setHistory((prev) => [...prev, edit])
            setCurrentIndex(history.length)
            setRect(null)
            toast.push(
                <Notification type="success" title="Done">
                    Watermark removed. Result added to history.
                </Notification>,
            )
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            console.error('[VideoEditor] removeWatermark failed:', err)
            toast.push(
                <Notification type="danger" title="Edit failed">
                    {message}
                </Notification>,
            )
        } finally {
            setIsProcessing(false)
            setProgress(0)
        }
    }, [currentUrl, rect, videoSize, history.length])

    // ─── Probe with FFmpeg if DOM metadata not yet loaded ────────────
    // The native <video> tag usually populates videoWidth/videoHeight as
    // soon as loadedmetadata fires, so we rarely need this fallback.
    // Kept here for robustness on cross-origin remote URLs where the
    // browser may refuse to expose dimensions.
    useEffect(() => {
        if (!sourceUrl) return
        if (videoSize.width > 0 && videoSize.height > 0) return

        let cancelled = false
        ;(async () => {
            try {
                const probe = await probeVideo(sourceUrl)
                if (cancelled) return
                if (probe.width > 0 && probe.height > 0) {
                    setVideoSize({ width: probe.width, height: probe.height })
                }
                if (probe.durationSec > 0) setVideoDuration(probe.durationSec)
            } catch (err) {
                console.warn('[VideoEditor] FFmpeg probe fallback failed:', err)
            }
        })()
        return () => { cancelled = true }
    }, [sourceUrl, videoSize.width, videoSize.height])

    // ─── Save current video to gallery ───────────────────────────────
    const handleSaveToGallery = () => {
        if (!currentUrl) return
        const current = currentIndex === -1 ? null : history[currentIndex]
        const label = current?.label ?? 'Original'
        addToGallery({
            id: `editor-${Date.now()}`,
            url: currentUrl,
            prompt: `Video Editor: ${label}`,
            aspectRatio: videoSize.width >= videoSize.height ? '16:9' : '9:16',
            timestamp: Date.now(),
            mediaType: 'VIDEO',
        })
        toast.push(
            <Notification type="success" title="Saved">
                Video added to Avatar Studio gallery.
            </Notification>,
        )
    }

    // ─── Download current video ──────────────────────────────────────
    const handleDownload = async () => {
        if (!currentUrl) return
        try {
            const resp = await fetch(currentUrl)
            const blob = await resp.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `video-editor-${Date.now()}.mp4`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
        } catch (err) {
            console.error('[VideoEditor] Download failed:', err)
            window.open(currentUrl, '_blank')
        }
    }

    // ─── Reset to original ───────────────────────────────────────────
    const handleResetToOriginal = () => {
        setCurrentIndex(-1)
        setRect(null)
    }

    const handleDeleteHistoryItem = (idx: number) => {
        const entry = history[idx]
        if (!entry) return
        try { URL.revokeObjectURL(entry.url) } catch { /* ignore */ }
        setHistory((prev) => prev.filter((_, i) => i !== idx))
        if (currentIndex === idx) setCurrentIndex(-1)
        else if (currentIndex > idx) setCurrentIndex((c) => c - 1)
    }

    // ─── Empty state ─────────────────────────────────────────────────
    if (!sourceUrl) {
        return (
            <div className="h-full flex flex-col">
                <div className="border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold">Video Editor</h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Watermark removal · trim · crop (próximamente)
                        </p>
                    </div>
                </div>
                <div className="flex-1 flex items-center justify-center p-8">
                    <Card className="max-w-md w-full text-center p-8">
                        <div className="w-16 h-16 mx-auto rounded-full border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center mb-4">
                            <HiOutlineFilm className="w-8 h-8 text-gray-400" />
                        </div>
                        <h3 className="text-base font-semibold mb-2">Sube un video para editar</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                            Dibujá un rectángulo sobre el watermark y removelo sin AI, todo
                            en tu navegador con FFmpeg.
                        </p>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="video/*"
                            className="hidden"
                            onChange={handleFileUpload}
                        />
                        <Button
                            variant="solid"
                            icon={<HiOutlineUpload />}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            Upload Video
                        </Button>
                    </Card>
                </div>
            </div>
        )
    }

    // ─── Editor state ────────────────────────────────────────────────
    const showRect = rect && rect.w > 4 && rect.h > 4
    const canApply = !!showRect && !isProcessing

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <h2 className="text-lg font-semibold truncate">Video Editor</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        {videoSize.width}×{videoSize.height} · {videoDuration.toFixed(1)}s
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        size="xs"
                        variant="plain"
                        icon={<HiOutlineRefresh />}
                        onClick={handleResetToOriginal}
                        disabled={currentIndex === -1}
                    >
                        Reset
                    </Button>
                    <Button
                        size="xs"
                        variant="plain"
                        icon={<HiOutlineDownload />}
                        onClick={handleDownload}
                    >
                        Download
                    </Button>
                    <Button
                        size="xs"
                        variant="solid"
                        icon={<HiOutlineSave />}
                        onClick={handleSaveToGallery}
                    >
                        Save to Gallery
                    </Button>
                </div>
            </div>

            {/* Main area: video preview + history sidebar */}
            <div className="flex-1 flex min-h-0">
                {/* Center: video + canvas overlay */}
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="flex-1 flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-6 relative">
                        <div
                            ref={canvasContainerRef}
                            className="relative max-w-full max-h-full inline-block"
                            onMouseDown={handleRectMouseDown}
                            onMouseMove={handleRectMouseMove}
                            onMouseUp={handleRectMouseUp}
                            onMouseLeave={handleRectMouseUp}
                            style={{ cursor: isProcessing ? 'wait' : 'crosshair' }}
                        >
                            <video
                                ref={videoRef}
                                src={currentUrl ?? undefined}
                                controls
                                className="max-w-full max-h-[60vh] block"
                                style={{
                                    pointerEvents: isProcessing ? 'none' : 'auto',
                                }}
                            />
                            {/* Rectangle overlay for watermark region */}
                            {showRect && (
                                <div
                                    className="absolute border-2 border-purple-500 bg-purple-500/20 pointer-events-none"
                                    style={{
                                        left: rect!.x,
                                        top: rect!.y,
                                        width: rect!.w,
                                        height: rect!.h,
                                    }}
                                />
                            )}
                            {/* Processing overlay */}
                            {isProcessing && (
                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
                                    <Card className="px-6 py-4 min-w-[280px] text-center">
                                        <HiOutlineScissors className="w-8 h-8 text-primary mx-auto mb-2" />
                                        <div className="text-sm font-mono text-primary mb-2">
                                            {progressLabel}
                                        </div>
                                        <Progress percent={progress} size="sm" />
                                    </Card>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Tools bar */}
                    <div className="border-t border-gray-200 dark:border-gray-700 p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <Button
                                size="xs"
                                variant="solid"
                                icon={<HiOutlineScissors />}
                            >
                                Watermark
                            </Button>
                            {/* Trim and Crop come in Phase 2 */}
                            <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">
                                Trim y Crop: próximamente
                            </span>
                        </div>

                        {editMode === 'watermark' && (
                            <div className="flex items-center justify-between gap-4">
                                <div className="text-xs text-gray-500 dark:text-gray-400 flex-1">
                                    {showRect ? (
                                        <>
                                            Región seleccionada: {Math.round(rect!.w)}×{Math.round(rect!.h)}px.
                                            Hacé click en &quot;Remove Watermark&quot;.
                                        </>
                                    ) : (
                                        <>Dibujá un rectángulo encima del watermark con el mouse.</>
                                    )}
                                </div>
                                <Button
                                    size="sm"
                                    variant="solid"
                                    onClick={handleRemoveWatermark}
                                    disabled={!canApply}
                                    icon={<HiOutlineScissors />}
                                >
                                    Remove Watermark
                                </Button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: history sidebar */}
                <div className="w-64 border-l border-gray-200 dark:border-gray-700 flex flex-col">
                    <div className="border-b border-gray-200 dark:border-gray-700 p-3 flex items-center justify-between">
                        <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                            History
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => setCurrentIndex((c) => Math.max(-1, c - 1))}
                                disabled={currentIndex === -1}
                                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <HiOutlineChevronLeft className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setCurrentIndex((c) => Math.min(history.length - 1, c + 1))}
                                disabled={currentIndex >= history.length - 1}
                                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <HiOutlineChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    <ScrollBar className="flex-1" autoHide={false}>
                        <div className="p-2 space-y-2">
                            <button
                                type="button"
                                onClick={() => setCurrentIndex(-1)}
                                className={`w-full text-left p-2 rounded-lg border transition-colors ${
                                    currentIndex === -1
                                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-500/20'
                                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                                }`}
                            >
                                <div className="text-xs font-medium">Original</div>
                                <div className="text-[10px] text-gray-400">source video</div>
                            </button>
                            {history.map((edit, idx) => (
                                <div
                                    key={edit.id}
                                    className={`w-full p-2 rounded-lg border transition-colors flex items-start gap-2 ${
                                        currentIndex === idx
                                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-500/20'
                                            : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                                    }`}
                                >
                                    <button
                                        type="button"
                                        onClick={() => setCurrentIndex(idx)}
                                        className="flex-1 text-left min-w-0"
                                    >
                                        <div className="text-xs font-medium truncate">
                                            {edit.label}
                                        </div>
                                        <div className="text-[10px] text-gray-400">
                                            {new Date(edit.timestamp).toLocaleTimeString()}
                                        </div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteHistoryItem(idx)}
                                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500"
                                        title="Remove from history"
                                    >
                                        <HiOutlineTrash className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                            {history.length === 0 && (
                                <div className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">
                                    Aún no hay edits.
                                </div>
                            )}
                        </div>
                    </ScrollBar>
                    <div className="border-t border-gray-200 dark:border-gray-700 p-2">
                        <Button
                            block
                            size="xs"
                            variant="plain"
                            icon={<HiOutlineUpload />}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            Cargar otro video
                        </Button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="video/*"
                            className="hidden"
                            onChange={handleFileUpload}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}

export default VideoEditorMain
