'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import {
    HiOutlinePhotograph,
    HiOutlinePlay,
    HiOutlinePause,
    HiOutlineFastForward,
    HiOutlineRewind,
    HiOutlineChevronDoubleLeft,
    HiOutlineChevronDoubleRight,
} from 'react-icons/hi'

interface ExtractFrameDialogProps {
    isOpen: boolean
    videoUrl: string
    onClose: () => void
    onCapture: (frameBase64: string) => void
}

const THUMB_COUNT = 20
// Step used by the prev/next-frame buttons. Real frame stepping requires
// requestVideoFrameCallback which has spotty support; 1/30s is a reasonable
// proxy that lets the user nudge through the timeline at frame granularity.
const FRAME_STEP_SECONDS = 1 / 30

const formatTime = (seconds: number) => {
    if (!isFinite(seconds)) return '0:00'
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
}

const seekVideo = (video: HTMLVideoElement, time: number): Promise<void> => {
    return new Promise((resolve) => {
        const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked)
            resolve()
        }
        video.addEventListener('seeked', onSeeked)
        video.currentTime = time
    })
}

const ExtractFrameDialog = ({
    isOpen,
    videoUrl,
    onClose,
    onCapture,
}: ExtractFrameDialogProps) => {
    const videoRef = useRef<HTMLVideoElement>(null)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [isPlaying, setIsPlaying] = useState(false)
    const [thumbnails, setThumbnails] = useState<string[]>([])
    const [thumbsLoading, setThumbsLoading] = useState(false)

    // Reset on close
    useEffect(() => {
        if (!isOpen) {
            setCurrentTime(0)
            setDuration(0)
            setIsPlaying(false)
            setThumbnails([])
            setThumbsLoading(false)
        }
    }, [isOpen])

    const generateThumbnails = useCallback(async (video: HTMLVideoElement) => {
        setThumbsLoading(true)
        const canvas = document.createElement('canvas')
        const w = 80
        const h = Math.max(1, Math.round((w * video.videoHeight) / video.videoWidth))
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
            setThumbsLoading(false)
            return
        }
        const collected: string[] = []
        try {
            for (let i = 0; i < THUMB_COUNT; i++) {
                const t = (video.duration / THUMB_COUNT) * i
                await seekVideo(video, t)
                ctx.drawImage(video, 0, 0, w, h)
                collected.push(canvas.toDataURL('image/jpeg', 0.6))
            }
            setThumbnails(collected)
        } catch (e) {
            console.warn('[ExtractFrame] thumbnail generation failed', e)
        } finally {
            setThumbsLoading(false)
        }
    }, [])

    const handleLoadedMetadata = useCallback(async () => {
        const video = videoRef.current
        if (!video) return
        setDuration(video.duration)
        // Default to the LAST frame — that's the most common use for "Continue".
        const lastFrameTime = Math.max(0, video.duration - FRAME_STEP_SECONDS)
        await seekVideo(video, lastFrameTime)
        setCurrentTime(lastFrameTime)
        // Then kick off thumbnail generation. This will move currentTime around,
        // but we restore it after.
        await generateThumbnails(video)
        await seekVideo(video, lastFrameTime)
        setCurrentTime(lastFrameTime)
    }, [generateThumbnails])

    const handleScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const t = Number(e.target.value)
        const v = videoRef.current
        if (v) v.currentTime = t
        setCurrentTime(t)
    }, [])

    const togglePlay = useCallback(() => {
        const v = videoRef.current
        if (!v) return
        if (v.paused) {
            v.play()
            setIsPlaying(true)
        } else {
            v.pause()
            setIsPlaying(false)
        }
    }, [])

    const stepFrame = useCallback((direction: -1 | 1) => {
        const v = videoRef.current
        if (!v || !duration) return
        if (!v.paused) {
            v.pause()
            setIsPlaying(false)
        }
        const next = Math.max(
            0,
            Math.min(duration - FRAME_STEP_SECONDS, v.currentTime + direction * FRAME_STEP_SECONDS),
        )
        v.currentTime = next
        setCurrentTime(next)
    }, [duration])

    const jumpTo = useCallback((time: number) => {
        const v = videoRef.current
        if (!v) return
        if (!v.paused) {
            v.pause()
            setIsPlaying(false)
        }
        v.currentTime = time
        setCurrentTime(time)
    }, [])

    const handleCapture = useCallback(() => {
        const v = videoRef.current
        if (!v) return
        if (!v.paused) {
            v.pause()
            setIsPlaying(false)
        }
        const canvas = document.createElement('canvas')
        canvas.width = v.videoWidth
        canvas.height = v.videoHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(v, 0, 0)
        const base64 = canvas.toDataURL('image/jpeg', 0.95)
        onCapture(base64)
    }, [onCapture])

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            width={800}
            overlayClassName="!z-[60]"
            closable={true}
        >
            <div className="flex flex-col">
                {/* Header */}
                <div className="flex items-center gap-3 p-5 border-b border-gray-200 dark:border-gray-700">
                    <div className="p-2 bg-purple-100 dark:bg-purple-500/20 rounded-lg">
                        <HiOutlinePhotograph className="w-5 h-5 text-purple-600 dark:text-purple-300" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            Extract Frame
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Scrub or step to the moment you want, then capture it
                        </p>
                    </div>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4">
                    {/* Video preview */}
                    <div className="flex items-center justify-center bg-black rounded-lg overflow-hidden" style={{ minHeight: 320 }}>
                        {isOpen && (
                            <video
                                ref={videoRef}
                                src={videoUrl}
                                onLoadedMetadata={handleLoadedMetadata}
                                onTimeUpdate={() => {
                                    const t = videoRef.current?.currentTime ?? 0
                                    setCurrentTime(t)
                                }}
                                onPlay={() => setIsPlaying(true)}
                                onPause={() => setIsPlaying(false)}
                                onEnded={() => setIsPlaying(false)}
                                crossOrigin="anonymous"
                                playsInline
                                preload="auto"
                                className="max-h-[400px] max-w-full"
                            />
                        )}
                    </div>

                    {/* Transport controls */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => jumpTo(0)}
                            title="Jump to start"
                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
                        >
                            <HiOutlineChevronDoubleLeft className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => stepFrame(-1)}
                            title="Previous frame"
                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
                        >
                            <HiOutlineRewind className="w-5 h-5" />
                        </button>
                        <button
                            onClick={togglePlay}
                            title={isPlaying ? 'Pause' : 'Play'}
                            className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-500/20 hover:bg-purple-200 dark:hover:bg-purple-500/30 text-purple-700 dark:text-purple-200 flex items-center justify-center"
                        >
                            {isPlaying ? <HiOutlinePause className="w-5 h-5" /> : <HiOutlinePlay className="w-5 h-5" />}
                        </button>
                        <button
                            onClick={() => stepFrame(1)}
                            title="Next frame"
                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
                        >
                            <HiOutlineFastForward className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => jumpTo(Math.max(0, duration - FRAME_STEP_SECONDS))}
                            title="Jump to end"
                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
                        >
                            <HiOutlineChevronDoubleRight className="w-5 h-5" />
                        </button>

                        <input
                            type="range"
                            min={0}
                            max={duration || 0}
                            step={0.01}
                            value={Math.min(currentTime, duration || 0)}
                            onChange={handleScrub}
                            className="flex-1 accent-purple-500"
                            disabled={!duration}
                        />
                        <span className="text-xs text-gray-600 dark:text-gray-300 tabular-nums w-20 text-right">
                            {formatTime(currentTime)} / {formatTime(duration)}
                        </span>
                    </div>

                    {/* Thumbnails */}
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-2 min-h-[60px]">
                        {thumbsLoading && thumbnails.length === 0 ? (
                            <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">
                                Generating thumbnails…
                            </p>
                        ) : thumbnails.length > 0 ? (
                            <div className="flex gap-1 overflow-x-auto">
                                {thumbnails.map((thumb, i) => {
                                    const t = (duration / THUMB_COUNT) * i
                                    const segWidth = duration / THUMB_COUNT
                                    const isActive = currentTime >= t && currentTime < t + segWidth
                                    return (
                                        <button
                                            key={i}
                                            onClick={() => jumpTo(t)}
                                            className={`flex-shrink-0 rounded overflow-hidden border-2 transition-all ${
                                                isActive
                                                    ? 'border-purple-500 ring-2 ring-purple-500/40'
                                                    : 'border-transparent hover:border-gray-400 dark:hover:border-gray-500'
                                            }`}
                                        >
                                            <img src={thumb} alt={`Frame ${i}`} className="h-12 w-auto block" />
                                        </button>
                                    )
                                })}
                            </div>
                        ) : (
                            <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">
                                Loading video…
                            </p>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                    <Button variant="plain" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        variant="solid"
                        color="purple"
                        onClick={handleCapture}
                        disabled={!duration}
                        icon={<HiOutlinePhotograph />}
                    >
                        Capture & Continue
                    </Button>
                </div>
            </div>
        </Dialog>
    )
}

export default ExtractFrameDialog
