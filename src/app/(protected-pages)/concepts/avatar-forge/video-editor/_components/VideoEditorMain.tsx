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
    HiOutlineClock,
    HiOutlineSelector,
    HiOutlinePlay,
    HiOutlinePause,
    HiOutlineVolumeOff,
    HiOutlineVolumeUp,
} from 'react-icons/hi'
import { useAvatarStudioStore } from '../../avatar-studio/_store/avatarStudioStore'
import {
    probeVideo,
    removeWatermark,
    trimVideo,
    cropVideo,
    type VideoRegion,
    type WatermarkMode,
} from '@/services/VideoEditService'

type EditOperation = 'delogo' | 'trim' | 'crop'

type EditedVideo = {
    id: string
    url: string
    label: string
    operation: EditOperation
    params: Record<string, unknown>
    timestamp: number
}

type EditMode = 'watermark' | 'trim' | 'crop'

const CROP_ASPECTS: Array<{ value: 'free' | '1:1' | '16:9' | '9:16' | '4:3' | '3:4'; label: string }> = [
    { value: 'free', label: 'Libre' },
    { value: '1:1', label: '1:1' },
    { value: '16:9', label: '16:9' },
    { value: '9:16', label: '9:16' },
    { value: '4:3', label: '4:3' },
    { value: '3:4', label: '3:4' },
]

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
    const [editMode, setEditMode] = useState<EditMode>('watermark')
    const [rect, setRect] = useState<VideoRegion | null>(null)
    const [isDraggingRect, setIsDraggingRect] = useState(false)
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

    // Watermark sub-mode. 'inpaint' uses FFmpeg delogo (best for static
    // backgrounds), 'blur' uses gaussian blur over the region (best when
    // something moves through the watermark area — no pixel stretching).
    const [watermarkMode, setWatermarkMode] = useState<WatermarkMode>('inpaint')

    // Trim state — start/end in seconds within the current video
    const [trimStart, setTrimStart] = useState(0)
    const [trimEnd, setTrimEnd] = useState(0)

    // Crop aspect ratio (drives the rectangle drag in crop mode)
    const [cropAspect, setCropAspect] = useState<typeof CROP_ASPECTS[number]['value']>('free')

    // Processing state
    const [isProcessing, setIsProcessing] = useState(false)
    const [progress, setProgress] = useState(0)
    const [progressLabel, setProgressLabel] = useState('')

    // Custom video player state. We replaced the native `controls` attribute
    // with our own UI because the native player's shadow DOM intercepted
    // mouse events over the bottom half of the video, blocking the
    // watermark/crop drag rectangle. Custom controls live OUTSIDE the
    // drag container so the entire video surface is free to receive
    // mousedown/move events for the rect overlay.
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [isMuted, setIsMuted] = useState(false)

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
            const dur = video.duration || 0
            setVideoDuration(dur)
            // Snap trim range to the full video duration whenever a new
            // clip loads so the user starts with "trim nothing" by default.
            setTrimStart(0)
            setTrimEnd(dur)
        }
        const onTimeUpdate = () => setCurrentTime(video.currentTime)
        const onPlay = () => setIsPlaying(true)
        const onPause = () => setIsPlaying(false)
        const onEnded = () => setIsPlaying(false)

        video.addEventListener('loadedmetadata', onMeta)
        video.addEventListener('timeupdate', onTimeUpdate)
        video.addEventListener('play', onPlay)
        video.addEventListener('pause', onPause)
        video.addEventListener('ended', onEnded)
        return () => {
            video.removeEventListener('loadedmetadata', onMeta)
            video.removeEventListener('timeupdate', onTimeUpdate)
            video.removeEventListener('play', onPlay)
            video.removeEventListener('pause', onPause)
            video.removeEventListener('ended', onEnded)
        }
    }, [currentUrl])

    // ─── Custom video control handlers ──────────────────────────────
    const togglePlay = () => {
        const v = videoRef.current
        if (!v) return
        if (v.paused) v.play().catch(() => { /* ignore autoplay rejection */ })
        else v.pause()
    }

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        const v = videoRef.current
        if (!v || !videoDuration) return
        const bar = e.currentTarget.getBoundingClientRect()
        const ratio = Math.max(0, Math.min(1, (e.clientX - bar.left) / bar.width))
        v.currentTime = ratio * videoDuration
    }

    const toggleMute = () => {
        const v = videoRef.current
        if (!v) return
        v.muted = !v.muted
        setIsMuted(v.muted)
    }

    const fmtTime = (s: number): string => {
        if (!Number.isFinite(s) || s < 0) return '0:00'
        const mm = Math.floor(s / 60)
        const ss = Math.floor(s % 60)
        return `${mm}:${ss.toString().padStart(2, '0')}`
    }

    // Reset rect when changing modes so the user doesn't carry over a
    // watermark selection into crop mode (different semantics).
    useEffect(() => {
        setRect(null)
    }, [editMode])

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
        let w = maxX - minX
        let h = maxY - minY

        // In crop mode with a fixed aspect ratio, snap height to match width.
        // Watermark mode is always free-form (you don't want the rect snapping
        // to a ratio just to cover a logo).
        if (editMode === 'crop' && cropAspect !== 'free') {
            const [arW, arH] = cropAspect.split(':').map(Number)
            const ratio = arW / arH
            // Use whichever drag dimension is larger to drive the other.
            if (w / h > ratio) w = h * ratio
            else h = w / ratio
        }

        setRect({ x: minX, y: minY, w, h })
    }

    const handleRectMouseUp = () => {
        setIsDraggingRect(false)
        // Reject ghost-rects from a stray click without drag.
        if (rect && (rect.w < 4 || rect.h < 4)) setRect(null)
    }

    // Translate a display-pixel rect (drawn on top of the <video>) to the
    // corresponding source-video-pixel rect. The <video> uses object-contain
    // so it may be letterboxed inside its container; we compute the rendered
    // video box first, then scale. Returns null if the rect doesn't actually
    // overlap the rendered video (e.g. drawn entirely on the letterbox).
    const rectToSourcePixels = useCallback((r: VideoRegion): VideoRegion | null => {
        const container = canvasContainerRef.current
        if (!container) return null
        const cr = container.getBoundingClientRect()
        const vw = videoSize.width
        const vh = videoSize.height
        if (vw <= 0 || vh <= 0) return null

        const containerAR = cr.width / cr.height
        const videoAR = vw / vh
        let renderedW = cr.width
        let renderedH = cr.height
        let offsetX = 0
        let offsetY = 0
        if (videoAR > containerAR) {
            renderedH = cr.width / videoAR
            offsetY = (cr.height - renderedH) / 2
        } else {
            renderedW = cr.height * videoAR
            offsetX = (cr.width - renderedW) / 2
        }

        const scaleX = vw / renderedW
        const scaleY = vh / renderedH

        const region: VideoRegion = {
            x: Math.max(0, (r.x - offsetX) * scaleX),
            y: Math.max(0, (r.y - offsetY) * scaleY),
            w: Math.min(vw, r.w * scaleX),
            h: Math.min(vh, r.h * scaleY),
        }
        if (region.w < 4 || region.h < 4) return null
        return region
    }, [videoSize])

    // ─── Generic edit runner (shared progress + history + error UX) ──
    const runEdit = useCallback(async (
        label: string,
        operation: EditOperation,
        params: Record<string, unknown>,
        executor: (onProgress: (p: number) => void) => Promise<string>,
    ) => {
        setIsProcessing(true)
        setProgress(0)
        setProgressLabel(label)
        try {
            const outputUrl = await executor(setProgress)
            const edit: EditedVideo = {
                id: `edit-${Date.now()}`,
                url: outputUrl,
                label,
                operation,
                params,
                timestamp: Date.now(),
            }
            setHistory((prev) => [...prev, edit])
            setCurrentIndex(history.length)
            setRect(null)
            toast.push(
                <Notification type="success" title="Done">
                    {label}. Result added to history.
                </Notification>,
            )
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            console.error(`[VideoEditor] ${operation} failed:`, err)
            toast.push(
                <Notification type="danger" title="Edit failed">
                    {message}
                </Notification>,
            )
        } finally {
            setIsProcessing(false)
            setProgress(0)
        }
    }, [history.length])

    // ─── Apply watermark removal ─────────────────────────────────────
    const handleRemoveWatermark = useCallback(async () => {
        if (!currentUrl || !rect) return
        const region = rectToSourcePixels(rect)
        if (!region) {
            toast.push(
                <Notification type="warning" title="Region too small">
                    Draw a larger rectangle over the watermark.
                </Notification>,
            )
            return
        }
        const label = watermarkMode === 'blur' ? 'Watermark blurred' : 'Watermark removed'
        await runEdit(label, 'delogo', { ...region, mode: watermarkMode }, (onP) =>
            removeWatermark(currentUrl, region, watermarkMode, onP),
        )
    }, [currentUrl, rect, rectToSourcePixels, runEdit, watermarkMode])

    // ─── Apply trim ──────────────────────────────────────────────────
    const handleApplyTrim = useCallback(async () => {
        if (!currentUrl) return
        const start = Math.max(0, trimStart)
        const end = Math.min(videoDuration, trimEnd)
        if (end - start < 0.1) {
            toast.push(
                <Notification type="warning" title="Range too small">
                    Trim range must be at least 0.1 seconds.
                </Notification>,
            )
            return
        }
        const label = `Trimmed ${start.toFixed(1)}s → ${end.toFixed(1)}s`
        await runEdit(label, 'trim', { startSec: start, endSec: end }, (onP) =>
            trimVideo(currentUrl, start, end, onP),
        )
    }, [currentUrl, trimStart, trimEnd, videoDuration, runEdit])

    // ─── Apply crop ──────────────────────────────────────────────────
    const handleApplyCrop = useCallback(async () => {
        if (!currentUrl || !rect) return
        const region = rectToSourcePixels(rect)
        if (!region) {
            toast.push(
                <Notification type="warning" title="Region too small">
                    Draw a larger rectangle to crop.
                </Notification>,
            )
            return
        }
        const label = `Cropped ${Math.round(region.w)}×${Math.round(region.h)}`
        await runEdit(label, 'crop', region, (onP) =>
            cropVideo(currentUrl, region, onP),
        )
    }, [currentUrl, rect, rectToSourcePixels, runEdit])

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
                    <div className="flex-1 flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900 p-6 relative gap-3">
                        {/* Drag container — full mouse capture for rect drawing.
                            Native <video> controls are intentionally omitted; they
                            steal pointer events from the lower half of the video
                            and break the drag-to-select watermark interaction.
                            Use the custom player below the drag area instead. */}
                        <div
                            ref={canvasContainerRef}
                            className="relative max-w-full inline-block"
                            onMouseDown={editMode === 'trim' ? undefined : handleRectMouseDown}
                            onMouseMove={editMode === 'trim' ? undefined : handleRectMouseMove}
                            onMouseUp={editMode === 'trim' ? undefined : handleRectMouseUp}
                            onMouseLeave={editMode === 'trim' ? undefined : handleRectMouseUp}
                            style={{
                                cursor: isProcessing
                                    ? 'wait'
                                    : editMode === 'trim'
                                        ? 'default'
                                        : 'crosshair',
                            }}
                        >
                            <video
                                ref={videoRef}
                                src={currentUrl ?? undefined}
                                playsInline
                                className="max-w-full max-h-[60vh] block bg-black"
                                style={{
                                    pointerEvents: 'none',
                                }}
                            />
                            {/* Rectangle overlay for watermark/crop region */}
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

                        {/* Custom player controls — sit BELOW the drag area, so
                            they don't intercept mouse events meant for the rect
                            overlay. Click anywhere on the video itself also
                            toggles play (cheap fallback for users used to it). */}
                        <div className="w-full max-w-2xl flex items-center gap-3 bg-white/5 dark:bg-gray-800/40 backdrop-blur rounded-lg px-3 py-2">
                            <button
                                type="button"
                                onClick={togglePlay}
                                disabled={isProcessing || !currentUrl}
                                className="text-gray-700 dark:text-gray-200 hover:text-purple-500 disabled:opacity-30 transition-colors"
                                aria-label={isPlaying ? 'Pause' : 'Play'}
                            >
                                {isPlaying ? (
                                    <HiOutlinePause className="w-6 h-6" />
                                ) : (
                                    <HiOutlinePlay className="w-6 h-6" />
                                )}
                            </button>
                            <div
                                className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded cursor-pointer relative group"
                                onClick={handleSeek}
                            >
                                <div
                                    className="absolute h-full bg-purple-500 rounded transition-[width] duration-100"
                                    style={{
                                        width: `${videoDuration ? (currentTime / videoDuration) * 100 : 0}%`,
                                    }}
                                />
                            </div>
                            <span className="text-xs font-mono text-gray-500 dark:text-gray-400 min-w-[80px] text-right">
                                {fmtTime(currentTime)} / {fmtTime(videoDuration)}
                            </span>
                            <button
                                type="button"
                                onClick={toggleMute}
                                className="text-gray-500 dark:text-gray-400 hover:text-purple-500 transition-colors"
                                aria-label={isMuted ? 'Unmute' : 'Mute'}
                            >
                                {isMuted ? (
                                    <HiOutlineVolumeOff className="w-5 h-5" />
                                ) : (
                                    <HiOutlineVolumeUp className="w-5 h-5" />
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Tools bar */}
                    <div className="border-t border-gray-200 dark:border-gray-700 p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <Button
                                size="xs"
                                variant={editMode === 'watermark' ? 'solid' : 'plain'}
                                icon={<HiOutlineScissors />}
                                onClick={() => setEditMode('watermark')}
                                disabled={isProcessing}
                            >
                                Watermark
                            </Button>
                            <Button
                                size="xs"
                                variant={editMode === 'trim' ? 'solid' : 'plain'}
                                icon={<HiOutlineClock />}
                                onClick={() => setEditMode('trim')}
                                disabled={isProcessing}
                            >
                                Trim
                            </Button>
                            <Button
                                size="xs"
                                variant={editMode === 'crop' ? 'solid' : 'plain'}
                                icon={<HiOutlineSelector />}
                                onClick={() => setEditMode('crop')}
                                disabled={isProcessing}
                            >
                                Crop
                            </Button>
                        </div>

                        {editMode === 'watermark' && (
                            <div className="space-y-3">
                                {/* Sub-mode selector. Inpaint vs Blur is the
                                    most useful trade-off without going to AI:
                                    inpaint reconstructs, blur hides. */}
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">
                                        Método:
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setWatermarkMode('inpaint')}
                                        disabled={isProcessing}
                                        className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                                            watermarkMode === 'inpaint'
                                                ? 'border-purple-500 bg-purple-50 dark:bg-purple-500/20 text-purple-700 dark:text-purple-200 font-medium'
                                                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        Inpaint · fondo estático
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setWatermarkMode('blur')}
                                        disabled={isProcessing}
                                        className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                                            watermarkMode === 'blur'
                                                ? 'border-purple-500 bg-purple-50 dark:bg-purple-500/20 text-purple-700 dark:text-purple-200 font-medium'
                                                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        Blur · con movimiento cerca
                                    </button>
                                </div>

                                {/* Educational hint. Spelled out so the user
                                    can pick consciously instead of guessing. */}
                                <div className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
                                    {watermarkMode === 'inpaint' ? (
                                        <>
                                            ⚠ Inpaint reconstruye el fondo interpolando los pixels alrededor del rectángulo.
                                            Si algo (una persona, un objeto) pasa por encima de la zona, el color se &quot;estira&quot;
                                            hacia adentro y se ve un artifact. Para esos casos usá Blur.
                                        </>
                                    ) : (
                                        <>
                                            ⚠ Blur difumina la zona en vez de reconstruir el fondo. El watermark deja de ser legible
                                            pero queda un parche borroso. No genera artifacts de estiramiento cuando hay movimiento
                                            sobre la zona.
                                        </>
                                    )}
                                </div>

                                <div className="flex items-center justify-between gap-4">
                                    <div className="text-xs text-gray-500 dark:text-gray-400 flex-1">
                                        {showRect ? (
                                            <>
                                                Región seleccionada: {Math.round(rect!.w)}×{Math.round(rect!.h)}px.
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
                                        {watermarkMode === 'blur' ? 'Blur Watermark' : 'Remove Watermark'}
                                    </Button>
                                </div>
                            </div>
                        )}

                        {editMode === 'trim' && (
                            <div className="space-y-3">
                                {/* Two-handle scrubber over the full duration */}
                                <div className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded">
                                    {/* Selected range bar */}
                                    <div
                                        className="absolute h-full bg-purple-500/40 rounded"
                                        style={{
                                            left: `${(trimStart / Math.max(0.1, videoDuration)) * 100}%`,
                                            width: `${((trimEnd - trimStart) / Math.max(0.1, videoDuration)) * 100}%`,
                                        }}
                                    />
                                </div>
                                <div className="flex items-center gap-3">
                                    <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                        Start
                                        <input
                                            type="number"
                                            min={0}
                                            max={trimEnd}
                                            step={0.1}
                                            value={trimStart.toFixed(2)}
                                            onChange={(e) =>
                                                setTrimStart(
                                                    Math.min(
                                                        trimEnd,
                                                        Math.max(0, parseFloat(e.target.value) || 0),
                                                    ),
                                                )
                                            }
                                            className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded text-xs bg-white dark:bg-gray-800"
                                        />
                                        s
                                    </label>
                                    <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                        End
                                        <input
                                            type="number"
                                            min={trimStart}
                                            max={videoDuration}
                                            step={0.1}
                                            value={trimEnd.toFixed(2)}
                                            onChange={(e) =>
                                                setTrimEnd(
                                                    Math.max(
                                                        trimStart,
                                                        Math.min(
                                                            videoDuration,
                                                            parseFloat(e.target.value) || videoDuration,
                                                        ),
                                                    ),
                                                )
                                            }
                                            className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded text-xs bg-white dark:bg-gray-800"
                                        />
                                        s
                                    </label>
                                    <span className="text-xs text-gray-400 dark:text-gray-500 flex-1">
                                        Duración resultante: {(trimEnd - trimStart).toFixed(2)}s
                                    </span>
                                    <Button
                                        size="sm"
                                        variant="solid"
                                        onClick={handleApplyTrim}
                                        disabled={isProcessing || trimEnd - trimStart < 0.1}
                                        icon={<HiOutlineClock />}
                                    >
                                        Apply Trim
                                    </Button>
                                </div>
                            </div>
                        )}

                        {editMode === 'crop' && (
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">
                                        Aspect:
                                    </span>
                                    {CROP_ASPECTS.map((opt) => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => {
                                                setCropAspect(opt.value)
                                                setRect(null)
                                            }}
                                            disabled={isProcessing}
                                            className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                                                cropAspect === opt.value
                                                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-500/20 text-purple-700 dark:text-purple-200 font-medium'
                                                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <div className="text-xs text-gray-500 dark:text-gray-400 flex-1">
                                        {showRect ? (
                                            <>Recorte: {Math.round(rect!.w)}×{Math.round(rect!.h)}px.</>
                                        ) : (
                                            <>Dibujá el rectángulo de recorte sobre el video.</>
                                        )}
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="solid"
                                        onClick={handleApplyCrop}
                                        disabled={!canApply}
                                        icon={<HiOutlineSelector />}
                                    >
                                        Apply Crop
                                    </Button>
                                </div>
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
