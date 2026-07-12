'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Progress from '@/components/ui/Progress'
import Slider from '@/components/ui/Slider'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import {
    HiOutlineUpload,
    HiOutlineFilm,
    HiOutlineDownload,
    HiOutlineRefresh,
    HiOutlineScissors,
    HiOutlineSave,
    HiOutlineSelector,
    HiOutlinePlay,
    HiOutlinePause,
    HiOutlineVolumeOff,
    HiOutlineVolumeUp,
    HiOutlineMenuAlt4,
    HiOutlineX,
    HiOutlinePlus,
    HiOutlineMusicNote,
} from 'react-icons/hi'
import { useAvatarStudioStore } from '../../avatar-studio/_store/avatarStudioStore'
import type { GeneratedMedia } from '../../avatar-studio/types'
import { muxAudioIntoVideo } from '@/services/AudioMuxService'
import { listTrendingSounds } from '@/services/TrendService'
import type { TrendingSoundDTO } from '@/lib/trends/constants'
import {
    probeVideo,
    removeWatermark,
    trimVideo,
    cropVideo,
    type VideoRegion,
} from '@/services/VideoEditService'
import { stitchVideos } from '@/services/VideoStitchService'

// ─── Single-track timeline model ──────────────────────────────────────
// One clip = one segment on the track. `duration` is the SOURCE video's
// full length; `inPoint`/`outPoint` mark the trimmed window inside it
// (trimmed length = outPoint - inPoint). All times are in seconds.
interface TimelineClip {
    id: string
    url: string
    name: string
    duration: number
    inPoint: number
    outPoint: number
}

type ToolMode = 'none' | 'crop' | 'watermark'

type Rect = { x: number; y: number; w: number; h: number }

const MIN_CLIP_LEN = 0.2

const CROP_ASPECTS: Array<{ value: 'free' | '1:1' | '16:9' | '9:16' | '4:3' | '3:4'; label: string }> = [
    { value: 'free', label: 'Libre' },
    { value: '1:1', label: '1:1' },
    { value: '16:9', label: '16:9' },
    { value: '9:16', label: '9:16' },
    { value: '4:3', label: '4:3' },
    { value: '3:4', label: '3:4' },
]

// ─── Duration probe with a DOM-metadata fallback ──────────────────────
// probeVideo() (FFmpeg) is the primary source per spec, but a hidden
// <video> element is a cheap safety net if the FFmpeg probe ever returns
// 0 (e.g. an exotic container FFmpeg's log parser doesn't recognise).
async function probeDurationWithFallback(url: string): Promise<number> {
    try {
        const probe = await probeVideo(url)
        if (probe.durationSec > 0) return probe.durationSec
    } catch (err) {
        console.warn('[VideoEditor] FFmpeg duration probe failed, falling back to DOM:', err)
    }
    return new Promise<number>((resolve) => {
        const v = document.createElement('video')
        v.preload = 'metadata'
        v.onloadedmetadata = () => resolve(v.duration || 1)
        v.onerror = () => resolve(1)
        v.src = url
    })
}

// ─── CapCut-style filmstrip thumbnails ─────────────────────────────────
// Samples `frameCount` frames evenly across the clip's duration and
// returns them as small JPEG data URLs (module-scope, mirrors
// probeDurationWithFallback above). Never rejects — resolves `[]` if
// metadata never loads (incl. an ~8s timeout), a seek stalls, or the
// canvas gets cross-origin-tainted (SecurityError on toDataURL, e.g. a
// cross-origin video served without CORS headers). Callers fall back to
// the single <video> thumbnail whenever the result is empty.
async function extractFilmstrip(url: string, frameCount: number): Promise<string[]> {
    // Same proven approach as ExtractFrameDialog: a crossOrigin video + canvas
    // drawImage. The KEY is that the on-screen preview <video> ALSO sets
    // crossOrigin="anonymous", so both requests share ONE CORS-mode cache entry.
    // Otherwise the preview poisons the HTTP cache with a non-CORS response and
    // this extractor errors even when the object allows CORS (Supabase sends
    // Access-Control-Allow-Origin: *). Resolves [] if metadata never loads, a
    // seek stalls, or the canvas is tainted; the caller then falls back to the
    // single stretched <video> thumbnail.
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.preload = 'auto'
    video.playsInline = true
    // Attach hidden to the DOM: some browsers won't decode frames for
    // drawImage on a fully-detached <video> (this is why ExtractFrameDialog,
    // which uses an on-screen video, works). Off-screen so it's invisible.
    video.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none'
    document.body.appendChild(video)

    const cleanup = () => {
        video.removeAttribute('src')
        video.src = ''
        video.remove()
    }

    const waitForMetadata = () => new Promise<boolean>((resolve) => {
        let settled = false
        const finish = (ok: boolean) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            video.removeEventListener('loadedmetadata', onLoaded)
            video.removeEventListener('error', onError)
            resolve(ok)
        }
        const onLoaded = () => finish(true)
        const onError = () => finish(false)
        const timer = setTimeout(() => finish(false), 8000)
        video.addEventListener('loadedmetadata', onLoaded)
        video.addEventListener('error', onError)
        video.src = url
    })

    // Bounded wait for 'seeked' — if a particular seek never resolves
    // (stalled network, exotic container) we bail out of the whole
    // filmstrip rather than hang the in-flight generation forever.
    const waitForSeeked = () => new Promise<boolean>((resolve) => {
        let settled = false
        const finish = (ok: boolean) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            video.removeEventListener('seeked', onSeeked)
            resolve(ok)
        }
        const onSeeked = () => finish(true)
        const timer = setTimeout(() => finish(false), 5000)
        video.addEventListener('seeked', onSeeked)
    })

    const gotMetadata = await waitForMetadata()
    if (!gotMetadata || !Number.isFinite(video.duration) || video.duration <= 0) {
        console.warn('[VideoEditor][filmstrip] NO metadata → empty strip', {
            url: url.slice(0, 100),
            scheme: url.slice(0, Math.max(0, url.indexOf(':'))),
            gotMetadata,
            duration: video.duration,
            errorCode: video.error?.code,
            errorMsg: video.error?.message,
        })
        cleanup()
        return []
    }

    const vw = video.videoWidth || 0
    const vh = video.videoHeight || 0
    if (vw <= 0 || vh <= 0) {
        cleanup()
        return []
    }

    // Extract at ~2x the ~96px timeline block height so frames stay crisp on
    // retina displays (the block is h-24). JPEG quality below is bumped too.
    const height = 176
    const width = Math.max(32, Math.round(height * (vw / vh)))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
        cleanup()
        return []
    }

    const duration = video.duration
    const frames: string[] = []
    for (let i = 0; i < frameCount; i++) {
        const t = ((i + 0.5) / frameCount) * duration
        video.currentTime = t
        const seeked = await waitForSeeked()
        if (!seeked) break
        try {
            ctx.drawImage(video, 0, 0, width, height)
            frames.push(canvas.toDataURL('image/jpeg', 0.75))
        } catch (err) {
            // Cross-origin video without CORS headers taints the canvas —
            // abort entirely and fall back to the single <video> thumbnail.
            console.warn('[VideoEditor] Filmstrip canvas tainted, falling back:', err)
            cleanup()
            return []
        }
    }
    cleanup()
    return frames
}

interface VideoEditorMainProps {
    userId?: string
    /**
     * Optional pre-loaded video URL — used when the editor is hosted in-place
     * inside Avatar Studio's ToolModal (Gallery "Edit" on a video). Takes
     * priority over the sessionStorage['videoEditorImport'] fallback, which
     * stays intact for the standalone /video-editor route.
     */
    initialVideoUrl?: string
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const VideoEditorMain = ({ userId, initialVideoUrl }: VideoEditorMainProps) => {
    const addToGallery = useAvatarStudioStore((s) => s.addToGallery)
    const gallery = useAvatarStudioStore((s) => s.gallery)
    const [isGalleryPickerOpen, setIsGalleryPickerOpen] = useState(false)

    // ─── Audio: bake a track into the exported video (moved here from the Post
    // modal). Applied at export in buildFinalVideo via ffmpeg mux. ──────────
    const [audioPanelOpen, setAudioPanelOpen] = useState(false)
    const [audioMode, setAudioMode] = useState<'none' | 'trending' | 'upload'>('none')
    const [trendingSounds, setTrendingSounds] = useState<TrendingSoundDTO[] | null>(null)
    const [selectedSound, setSelectedSound] = useState<TrendingSoundDTO | null>(null)
    const [uploadedAudio, setUploadedAudio] = useState<File | null>(null)
    const [keepOriginalSound, setKeepOriginalSound] = useState(false)
    const audioFileInputRef = useRef<HTMLInputElement>(null)

    // ─── Timeline state ───────────────────────────────────────────────
    const [clips, setClips] = useState<TimelineClip[]>([])
    const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
    const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

    // ─── Filmstrip thumbnails (CapCut-style), keyed by clip.url so a
    // crop/watermark edit (which mints a new url) regenerates naturally ──
    const [filmstrips, setFilmstrips] = useState<Record<string, string[]>>({})

    // ─── Preview / playback state ─────────────────────────────────────
    const [playhead, setPlayhead] = useState(0) // video.currentTime of the selected clip
    const [isPlaying, setIsPlaying] = useState(false)
    const [isMuted, setIsMuted] = useState(false)
    const [videoSize, setVideoSize] = useState({ width: 0, height: 0 }) // selected clip's SOURCE px
    const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 }) // selected clip's DISPLAYED px

    // ─── Tool state (crop / watermark), applied to the selected clip ──
    const [toolMode, setToolMode] = useState<ToolMode>('none')
    const [cropAspect, setCropAspect] = useState<typeof CROP_ASPECTS[number]['value']>('free')
    const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 })
    const [cropScale, setCropScale] = useState(100) // 30-100%
    const [isDraggingCrop, setIsDraggingCrop] = useState(false)
    const [cropDragStart, setCropDragStart] = useState({ x: 0, y: 0 })
    const [wmRect, setWmRect] = useState<Rect | null>(null)
    const [isDraggingWm, setIsDraggingWm] = useState(false)
    const [wmDragStart, setWmDragStart] = useState({ x: 0, y: 0 })

    // ─── Processing state ──────────────────────────────────────────────
    const [isProcessing, setIsProcessing] = useState(false)
    const [progress, setProgress] = useState(0)
    const [progressLabel, setProgressLabel] = useState('')

    // ─── DOM refs ───────────────────────────────────────────────────────
    const videoRef = useRef<HTMLVideoElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const blockRefs = useRef<Record<string, HTMLDivElement | null>>({})
    // The timeline track container — read fresh on each trim-drag mousemove
    // so the pixel→seconds mapping never drifts as block widths reflow.
    const trackRef = useRef<HTMLDivElement>(null)

    // Blob URLs THIS component minted (added clips + crop/watermark edit
    // outputs) — tracked so unmount can revoke exactly those without ever
    // touching the initial clip's URL (owned by initialVideoUrl / the
    // gallery, never added here).
    const mintedBlobUrlsRef = useRef<Set<string>>(new Set())

    // Mirrors of state read from event-listener closures that must never go
    // stale (listeners are (re)bound only when `selectedClipId` changes, not
    // on every clips/trim update).
    const clipsRef = useRef<TimelineClip[]>(clips)
    const selectedClipIdRef = useRef<string | null>(selectedClipId)
    useEffect(() => { clipsRef.current = clips }, [clips])
    useEffect(() => { selectedClipIdRef.current = selectedClipId }, [selectedClipId])

    // Mirror of `filmstrips` for the generation effect below, so it can key
    // off `clips` alone without re-running its whole body on every state
    // update it itself produces. URLs currently being extracted (to avoid
    // duplicate concurrent extractions of the same clip).
    const filmstripsRef = useRef<Record<string, string[]>>(filmstrips)
    useEffect(() => { filmstripsRef.current = filmstrips }, [filmstrips])
    const filmstripInFlightRef = useRef<Set<string>>(new Set())
    // Bounded retries: an empty strip (transient decode/CORS hiccup) re-attempts
    // on later effect runs instead of being cached as permanently empty.
    const filmstripAttemptsRef = useRef<Record<string, number>>({})

    // Seek to apply once the next `loadedmetadata` fires (clip switch or
    // click-to-seek on a not-yet-selected clip); pendingPlayRef keeps
    // playback going across an auto-advance to the next clip.
    const pendingSeekRef = useRef<number | null>(null)
    const pendingPlayRef = useRef(false)
    // Guards against handleClipBoundary firing twice for the same clip
    // (once from `timeupdate` clamp, once from the native `ended` event).
    const boundaryFiredRef = useRef<string | null>(null)
    // Reorder drag-and-drop (HTML5 DnD) source index, tracked in a ref so
    // the drop handler doesn't race React's state batching.
    const dragSourceIdxRef = useRef<number | null>(null)
    // Trim-handle drag session.
    const trimDragRef = useRef<{
        clipId: string
        edge: 'in' | 'out'
        startX: number
        startIn: number
        startOut: number
    } | null>(null)

    const selectedClip = clips.find((c) => c.id === selectedClipId) ?? null
    const totalTrimmed = clips.reduce((sum, c) => sum + Math.max(0.01, c.outPoint - c.inPoint), 0)

    // ─── Load the initial video on mount ──────────────────────────────
    // Prefer the `initialVideoUrl` prop — set when Avatar Studio hosts this
    // editor in-place inside ToolModal (Gallery "Edit" on a video). Falls
    // back to sessionStorage['videoEditorImport'], which the standalone
    // /video-editor route (and its GalleryPanel navigation) still relies on.
    useEffect(() => {
        const loadFirstClip = async (url: string) => {
            setIsProcessing(true)
            setProgress(0)
            setProgressLabel('Loading video…')
            try {
                const duration = await probeDurationWithFallback(url)
                const clip: TimelineClip = {
                    id: `clip-${Date.now()}`,
                    url,
                    name: 'Clip 1',
                    duration,
                    inPoint: 0,
                    outPoint: duration,
                }
                setClips([clip])
                setSelectedClipId(clip.id)
            } catch (err) {
                console.error('[VideoEditor] Failed to load initial video:', err)
                toast.push(
                    <Notification type="danger" title="Load failed">
                        Could not load the video.
                    </Notification>,
                )
            } finally {
                setIsProcessing(false)
                setProgress(0)
                setProgressLabel('')
            }
        }

        if (initialVideoUrl) {
            loadFirstClip(initialVideoUrl)
            return
        }
        const importData = sessionStorage.getItem('videoEditorImport')
        if (!importData) return
        try {
            const { url } = JSON.parse(importData) as { url?: string }
            sessionStorage.removeItem('videoEditorImport')
            if (url) loadFirstClip(url)
        } catch (err) {
            console.warn('[VideoEditor] Bad videoEditorImport payload:', err)
            sessionStorage.removeItem('videoEditorImport')
        }
    }, [initialVideoUrl])

    // Always keep a clip selected once at least one exists (initial load,
    // add-clip, or after removing the previously-selected one).
    useEffect(() => {
        if (!selectedClipId && clips.length > 0) {
            setSelectedClipId(clips[0].id)
        }
    }, [selectedClipId, clips])

    // ─── Generate filmstrip thumbnails for any clip that doesn't have one
    // yet ────────────────────────────────────────────────────────────────
    // Keyed by clip.url (not clip.id) so crop/watermark edits — which mint
    // a new url on the same clip id — regenerate. Non-blocking: fire and
    // forget per clip, guarded against duplicate concurrent extraction of
    // the same url via filmstripInFlightRef.
    useEffect(() => {
        let cancelled = false
        clips.forEach((clip) => {
            const url = clip.url
            const existingStrip = filmstripsRef.current[url]
            if (existingStrip && existingStrip.length > 0) return // already have a good strip
            if (filmstripInFlightRef.current.has(url)) return
            if ((filmstripAttemptsRef.current[url] ?? 0) >= 4) return // gave up → fallback thumb
            filmstripAttemptsRef.current[url] = (filmstripAttemptsRef.current[url] ?? 0) + 1
            filmstripInFlightRef.current.add(url)
            // ~1 frame per second, min 8: with fewer, a short clip on a wide
            // track rendered 3 giant object-cover tiles instead of a filmstrip.
            const frameCount = Math.min(24, Math.max(8, Math.ceil(clip.duration)))
            extractFilmstrip(url, frameCount)
                .then((frames) => {
                    if (cancelled) return
                    setFilmstrips((prev) => ({ ...prev, [url]: frames }))
                })
                .catch(() => {
                    if (cancelled) return
                    setFilmstrips((prev) => ({ ...prev, [url]: [] }))
                })
                .finally(() => {
                    filmstripInFlightRef.current.delete(url)
                })
        })
        return () => { cancelled = true }
    }, [clips])

    // ─── Revoke every blob URL this component minted, on unmount ─────
    // Covers the case where the editor unmounts (e.g. Avatar Studio's
    // ToolModal closes) while clips are still on the timeline. Only touches
    // URLs THIS component created (added clips + crop/watermark outputs) —
    // the initial clip's URL is never added to the set, so it's never
    // revoked here (it's owned by initialVideoUrl / the gallery).
    useEffect(() => {
        const mintedUrls = mintedBlobUrlsRef.current
        return () => {
            mintedUrls.forEach((url) => {
                try { URL.revokeObjectURL(url) } catch { /* ignore */ }
            })
            mintedUrls.clear()
        }
    }, [])

    // ─── Reset per-clip tool/seek state whenever selection changes ────
    useEffect(() => {
        boundaryFiredRef.current = null
        setToolMode('none')
        setWmRect(null)
        setCropPosition({ x: 0, y: 0 })
        setCropScale(100)
    }, [selectedClipId])

    // ─── Displayed-size tracking (for the crop box + rect→source scale) ─
    const updateCanvasSize = useCallback(() => {
        if (videoRef.current) {
            const rect = videoRef.current.getBoundingClientRect()
            setCanvasSize({ width: rect.width, height: rect.height })
        }
    }, [])

    useEffect(() => {
        window.addEventListener('resize', updateCanvasSize)
        return () => window.removeEventListener('resize', updateCanvasSize)
    }, [updateCanvasSize])

    useEffect(() => {
        if (toolMode === 'crop') updateCanvasSize()
    }, [toolMode, updateCanvasSize])

    // ─── Auto-advance across clips + preview event wiring ─────────────
    // Bound once per clip SELECTION (not per trim edit) — handlers read
    // fresh values via clipsRef/selectedClipIdRef so they never go stale.
    const handleClipBoundary = useCallback(() => {
        if (boundaryFiredRef.current === selectedClipIdRef.current) return
        boundaryFiredRef.current = selectedClipIdRef.current
        const list = clipsRef.current
        const idx = list.findIndex((c) => c.id === selectedClipIdRef.current)
        if (idx === -1) return
        const clip = list[idx]
        const next = list[idx + 1]
        const v = videoRef.current
        if (next) {
            pendingSeekRef.current = next.inPoint
            pendingPlayRef.current = true
            setSelectedClipId(next.id)
        } else if (v) {
            v.pause()
            v.currentTime = clip.outPoint
        }
    }, [])

    useEffect(() => {
        const v = videoRef.current
        if (!v || !selectedClip) return

        const onLoadedMeta = () => {
            const w = v.videoWidth || 0
            const h = v.videoHeight || 0
            if (w > 0 && h > 0) {
                setVideoSize({ width: w, height: h })
            } else {
                const clip = clipsRef.current.find((c) => c.id === selectedClipIdRef.current)
                if (clip) {
                    probeVideo(clip.url)
                        .then((p) => {
                            if (p.width > 0 && p.height > 0) setVideoSize({ width: p.width, height: p.height })
                        })
                        .catch(() => { /* ignore — crop/watermark will just stay disabled */ })
                }
            }
            updateCanvasSize()
            const clip = clipsRef.current.find((c) => c.id === selectedClipIdRef.current)
            const seekTo = pendingSeekRef.current ?? clip?.inPoint ?? 0
            v.currentTime = seekTo
            pendingSeekRef.current = null
            if (pendingPlayRef.current) {
                pendingPlayRef.current = false
                v.play().catch(() => { /* ignore autoplay rejection */ })
            }
        }
        const onTimeUpdate = () => {
            setPlayhead(v.currentTime)
            const clip = clipsRef.current.find((c) => c.id === selectedClipIdRef.current)
            if (clip && v.currentTime >= clip.outPoint - 0.03) {
                handleClipBoundary()
            }
        }
        const onPlay = () => setIsPlaying(true)
        const onPause = () => setIsPlaying(false)
        const onEnded = () => {
            setIsPlaying(false)
            handleClipBoundary()
        }

        v.addEventListener('loadedmetadata', onLoadedMeta)
        v.addEventListener('timeupdate', onTimeUpdate)
        v.addEventListener('play', onPlay)
        v.addEventListener('pause', onPause)
        v.addEventListener('ended', onEnded)
        return () => {
            v.removeEventListener('loadedmetadata', onLoadedMeta)
            v.removeEventListener('timeupdate', onTimeUpdate)
            v.removeEventListener('play', onPlay)
            v.removeEventListener('pause', onPause)
            v.removeEventListener('ended', onEnded)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedClipId])

    // Clamp playback immediately whenever the SELECTED clip's trim bounds
    // change (dragging a handle while paused/playing on that clip).
    useEffect(() => {
        const v = videoRef.current
        if (!v || !selectedClip) return
        if (v.currentTime < selectedClip.inPoint) v.currentTime = selectedClip.inPoint
        else if (v.currentTime > selectedClip.outPoint) v.currentTime = selectedClip.outPoint
        // Intentionally keyed on the numeric trim bounds, not the `selectedClip`
        // object identity (which changes on every clips-array update, e.g. every
        // pixel of a trim drag) — that would clamp on unrelated re-renders too.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedClip?.inPoint, selectedClip?.outPoint])

    // ─── Custom player controls ────────────────────────────────────────
    const togglePlay = () => {
        const v = videoRef.current
        const clip = selectedClip
        if (!v || !clip) return
        if (v.paused) {
            if (v.currentTime >= clip.outPoint - 0.02 || v.currentTime < clip.inPoint) {
                v.currentTime = clip.inPoint
            }
            v.play().catch(() => { /* ignore autoplay rejection */ })
        } else {
            v.pause()
        }
    }

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        const v = videoRef.current
        const clip = selectedClip
        if (!v || !clip) return
        const bar = e.currentTarget.getBoundingClientRect()
        const ratio = Math.max(0, Math.min(1, (e.clientX - bar.left) / bar.width))
        v.currentTime = clip.inPoint + ratio * (clip.outPoint - clip.inPoint)
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

    // ─── Timeline: select + scrub (mousedown + drag moves the playhead) ─
    // The clip body used to be `draggable`, so trying to drag the playhead
    // started an HTML5 clip-reorder drag (giant ghost strip) instead of
    // scrubbing. Reorder now lives ONLY on the ≡ handle; the body scrubs.
    const seekClipAt = useCallback((clip: TimelineClip, clientX: number, rect: DOMRect) => {
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
        const time = clip.inPoint + ratio * (clip.outPoint - clip.inPoint)
        if (selectedClipId === clip.id) {
            const v = videoRef.current
            if (v) v.currentTime = Math.max(clip.inPoint, Math.min(clip.outPoint, time))
        } else {
            pendingSeekRef.current = time
            setSelectedClipId(clip.id)
        }
    }, [selectedClipId])

    const handleBlockScrubStart = useCallback((clip: TimelineClip) => (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.button !== 0) return
        e.preventDefault()
        const rect = e.currentTarget.getBoundingClientRect()
        seekClipAt(clip, e.clientX, rect)
        const onMove = (ev: MouseEvent) => seekClipAt(clip, ev.clientX, rect)
        const onUp = () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
    }, [seekClipAt])

    // ─── Timeline: trim handles ─────────────────────────────────────────
    const handleTrimDragMove = useCallback((e: MouseEvent) => {
        const drag = trimDragRef.current
        const trackEl = trackRef.current
        if (!drag || !trackEl) return
        // Derive px→sec from the TRACK's total width and total timeline
        // duration, read fresh on every move — block widths reflow as
        // trimming changes totalTrimmed, so a ratio snapshotted once at
        // drag start (from the dragged block's rendered width) drifts from
        // the cursor mid-drag. Recomputing here keeps it 1:1.
        const trackWidth = trackEl.clientWidth
        if (trackWidth <= 0) return
        const totalTrimmedDuration = clipsRef.current.reduce(
            (sum, c) => sum + Math.max(0.01, c.outPoint - c.inPoint), 0,
        )
        const secPerPx = totalTrimmedDuration / trackWidth
        const deltaSec = (e.clientX - drag.startX) * secPerPx
        setClips((prev) => prev.map((c) => {
            if (c.id !== drag.clipId) return c
            if (drag.edge === 'in') {
                const newIn = Math.min(Math.max(0, drag.startIn + deltaSec), drag.startOut - MIN_CLIP_LEN)
                return { ...c, inPoint: Math.max(0, newIn) }
            }
            const newOut = Math.max(Math.min(c.duration, drag.startOut + deltaSec), drag.startIn + MIN_CLIP_LEN)
            return { ...c, outPoint: Math.min(c.duration, newOut) }
        }))
    }, [])

    const handleTrimDragEnd = useCallback(() => {
        trimDragRef.current = null
        window.removeEventListener('mousemove', handleTrimDragMove)
        window.removeEventListener('mouseup', handleTrimDragEnd)
    }, [handleTrimDragMove])

    const startTrimDrag = (e: React.MouseEvent, clip: TimelineClip, edge: 'in' | 'out') => {
        if (isProcessing) return
        e.preventDefault()
        e.stopPropagation()
        trimDragRef.current = {
            clipId: clip.id,
            edge,
            startX: e.clientX,
            startIn: clip.inPoint,
            startOut: clip.outPoint,
        }
        window.addEventListener('mousemove', handleTrimDragMove)
        window.addEventListener('mouseup', handleTrimDragEnd)
    }

    // ─── Timeline: reorder (drag clip body) ────────────────────────────
    const handleClipDragStart = (idx: number) => () => { dragSourceIdxRef.current = idx }
    const handleClipDragOver = (idx: number) => (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        setDragOverIdx(idx)
    }
    const handleClipDrop = (idx: number) => (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        e.stopPropagation()
        const from = dragSourceIdxRef.current
        dragSourceIdxRef.current = null
        setDragOverIdx(null)
        if (from === null || from === idx) return
        setClips((prev) => {
            const next = [...prev]
            const [moved] = next.splice(from, 1)
            next.splice(idx, 0, moved)
            return next
        })
    }
    const handleClipDragEnd = () => {
        dragSourceIdxRef.current = null
        setDragOverIdx(null)
    }

    // ─── Add clip (file picker + external drag-drop onto the timeline) ─
    const handleAddFiles = useCallback(async (files: File[]) => {
        const videoFiles = files.filter((f) => f.type.startsWith('video/'))
        if (videoFiles.length === 0) {
            toast.push(
                <Notification type="warning" title="Invalid Files">
                    Only video files are supported.
                </Notification>,
            )
            return
        }
        setIsProcessing(true)
        setProgress(0)
        setProgressLabel(videoFiles.length > 1 ? `Adding ${videoFiles.length} clips…` : 'Adding clip…')
        try {
            const newClips: TimelineClip[] = []
            for (let i = 0; i < videoFiles.length; i++) {
                const file = videoFiles[i]
                const url = URL.createObjectURL(file)
                mintedBlobUrlsRef.current.add(url)
                const duration = await probeDurationWithFallback(url)
                newClips.push({
                    id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    url,
                    name: file.name,
                    duration,
                    inPoint: 0,
                    outPoint: duration,
                })
                setProgress(Math.round(((i + 1) / videoFiles.length) * 100))
            }
            setClips((prev) => [...prev, ...newClips])
            setSelectedClipId((prev) => prev ?? newClips[0]?.id ?? null)
        } catch (err) {
            console.error('[VideoEditor] Add clip failed:', err)
            toast.push(
                <Notification type="danger" title="Add clip failed">
                    Could not read the video file(s).
                </Notification>,
            )
        } finally {
            setIsProcessing(false)
            setProgress(0)
            setProgressLabel('')
        }
    }, [])

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files || files.length === 0) return
        handleAddFiles(Array.from(files))
        e.target.value = ''
    }

    // Add a clip straight from the Avatar Studio gallery (no disk round-trip).
    // The gallery URL isn't minted here, so it's never revoked on unmount.
    const handleAddFromGallery = useCallback(async (item: GeneratedMedia) => {
        if (item.mediaType !== 'VIDEO' || !item.url) return
        setIsGalleryPickerOpen(false)
        setIsProcessing(true)
        setProgress(0)
        setProgressLabel('Adding clip…')
        try {
            const duration = await probeDurationWithFallback(item.url)
            const clip: TimelineClip = {
                id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                url: item.url,
                name:
                    item.prompt && !/^Uploaded:/i.test(item.prompt)
                        ? item.prompt.slice(0, 40)
                        : 'Gallery clip',
                duration,
                inPoint: 0,
                outPoint: duration,
            }
            setClips((prev) => [...prev, clip])
            setSelectedClipId((prev) => prev ?? clip.id)
        } catch (err) {
            console.error('[VideoEditor] Add from gallery failed:', err)
            toast.push(
                <Notification type="danger" title="Add clip failed">
                    Could not read that gallery video.
                </Notification>,
            )
        } finally {
            setIsProcessing(false)
            setProgress(0)
            setProgressLabel('')
        }
    }, [])

    const handleTrackDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
    }
    const handleTrackDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        // Internal clip-reorder drags carry no Files — only external OS
        // drag-drops (adding a new clip) land here.
        const files = Array.from(e.dataTransfer.files || [])
        if (files.length === 0) return
        handleAddFiles(files)
    }

    const handleRemoveClip = useCallback((clipId: string) => {
        setClips((prev) => {
            const removed = prev.find((c) => c.id === clipId)
            if (removed) {
                try { URL.revokeObjectURL(removed.url) } catch { /* ignore */ }
                mintedBlobUrlsRef.current.delete(removed.url)
            }
            return prev.filter((c) => c.id !== clipId)
        })
        setSelectedClipId((prev) => (prev === clipId ? null : prev))
    }, [])

    // ─── Crop tool (ported from ImagePreviewModal's image crop UX) ─────
    const getCropDimensions = useCallback(() => {
        if (!canvasSize.width || !canvasSize.height) return null
        const aspectMap: Record<typeof CROP_ASPECTS[number]['value'], number | null> = {
            free: null,
            '1:1': 1,
            '16:9': 16 / 9,
            '9:16': 9 / 16,
            '4:3': 4 / 3,
            '3:4': 3 / 4,
        }
        const imageRatio = canvasSize.width / canvasSize.height
        const targetRatio = aspectMap[cropAspect] ?? imageRatio

        let maxCropWidth: number
        let maxCropHeight: number
        if (targetRatio > imageRatio) {
            maxCropWidth = canvasSize.width
            maxCropHeight = canvasSize.width / targetRatio
        } else {
            maxCropHeight = canvasSize.height
            maxCropWidth = canvasSize.height * targetRatio
        }

        const scale = cropScale / 100
        const cropWidth = maxCropWidth * scale
        const cropHeight = maxCropHeight * scale
        const maxX = canvasSize.width - cropWidth
        const maxY = canvasSize.height - cropHeight
        const x = Math.max(0, Math.min(cropPosition.x, maxX))
        const y = Math.max(0, Math.min(cropPosition.y, maxY))

        return { width: cropWidth, height: cropHeight, x, y, maxX, maxY }
    }, [canvasSize, cropAspect, cropScale, cropPosition])

    useEffect(() => {
        setCropPosition({ x: 0, y: 0 })
        setCropScale(100)
    }, [cropAspect])

    const handleCropMouseDown = (e: React.MouseEvent) => {
        if (toolMode !== 'crop') return
        e.preventDefault()
        e.stopPropagation()
        setIsDraggingCrop(true)
        setCropDragStart({ x: e.clientX - cropPosition.x, y: e.clientY - cropPosition.y })
    }
    const handleCropMouseMove = useCallback((e: MouseEvent) => {
        if (!isDraggingCrop) return
        const crop = getCropDimensions()
        if (!crop) return
        const newX = Math.max(0, Math.min(e.clientX - cropDragStart.x, crop.maxX))
        const newY = Math.max(0, Math.min(e.clientY - cropDragStart.y, crop.maxY))
        setCropPosition({ x: newX, y: newY })
    }, [isDraggingCrop, cropDragStart, getCropDimensions])
    const handleCropMouseUp = useCallback(() => setIsDraggingCrop(false), [])

    useEffect(() => {
        if (isDraggingCrop) {
            window.addEventListener('mousemove', handleCropMouseMove)
            window.addEventListener('mouseup', handleCropMouseUp)
            return () => {
                window.removeEventListener('mousemove', handleCropMouseMove)
                window.removeEventListener('mouseup', handleCropMouseUp)
            }
        }
    }, [isDraggingCrop, handleCropMouseMove, handleCropMouseUp])

    // ─── Watermark tool (freehand rect — unchanged from the old editor) ─
    const getVideoCoords = (e: React.MouseEvent): { x: number; y: number } => {
        const video = videoRef.current
        if (!video) return { x: 0, y: 0 }
        const r = video.getBoundingClientRect()
        return {
            x: Math.max(0, Math.min(r.width, e.clientX - r.left)),
            y: Math.max(0, Math.min(r.height, e.clientY - r.top)),
        }
    }
    const handleWmMouseDown = (e: React.MouseEvent) => {
        if (isProcessing) return
        const { x, y } = getVideoCoords(e)
        setIsDraggingWm(true)
        setWmDragStart({ x, y })
        setWmRect({ x, y, w: 0, h: 0 })
    }
    const handleWmMouseMove = (e: React.MouseEvent) => {
        if (!isDraggingWm) return
        const { x, y } = getVideoCoords(e)
        const minX = Math.min(wmDragStart.x, x)
        const minY = Math.min(wmDragStart.y, y)
        const w = Math.max(wmDragStart.x, x) - minX
        const h = Math.max(wmDragStart.y, y) - minY
        setWmRect({ x: minX, y: minY, w, h })
    }
    const handleWmMouseUp = () => {
        setIsDraggingWm(false)
        setWmRect((r) => (r && (r.w < 4 || r.h < 4) ? null : r))
    }

    // Translate a display-pixel rect (drawn on top of the <video>) to the
    // corresponding source-video-pixel rect. Shared by both crop and
    // watermark — both draw against the same <video> element.
    const rectToSourcePixels = useCallback((r: Rect): VideoRegion | null => {
        const video = videoRef.current
        if (!video) return null
        const vr = video.getBoundingClientRect()
        const vw = videoSize.width
        const vh = videoSize.height
        if (vw <= 0 || vh <= 0 || vr.width <= 0 || vr.height <= 0) return null

        const scaleX = vw / vr.width
        const scaleY = vh / vr.height
        const region: VideoRegion = {
            x: Math.max(0, r.x * scaleX),
            y: Math.max(0, r.y * scaleY),
            w: Math.min(vw, r.w * scaleX),
            h: Math.min(vh, r.h * scaleY),
        }
        if (region.w < 4 || region.h < 4) return null
        return region
    }, [videoSize])

    // ─── Generic per-clip edit runner (crop/watermark share this) ─────
    const applyClipEdit = useCallback(async (
        clip: TimelineClip,
        label: string,
        executor: (onProgress: (p: number) => void) => Promise<string>,
        opts: { resetTrim: boolean },
    ): Promise<boolean> => {
        setIsProcessing(true)
        setProgress(0)
        setProgressLabel(label)
        try {
            const outputUrl = await executor(setProgress)
            mintedBlobUrlsRef.current.add(outputUrl)
            let duration = clip.duration
            let inPoint = clip.inPoint
            let outPoint = clip.outPoint
            if (opts.resetTrim) {
                const newDuration = await probeDurationWithFallback(outputUrl)
                duration = newDuration
                inPoint = 0
                outPoint = newDuration
            }
            setClips((prev) => prev.map((c) => (
                c.id === clip.id ? { ...c, url: outputUrl, duration, inPoint, outPoint } : c
            )))
            try { URL.revokeObjectURL(clip.url) } catch { /* not a blob URL, ignore */ }
            mintedBlobUrlsRef.current.delete(clip.url)
            toast.push(
                <Notification type="success" title="Done">
                    {label}.
                </Notification>,
            )
            return true
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            console.error('[VideoEditor] Clip edit failed:', err)
            toast.push(
                <Notification type="danger" title="Edit failed">
                    {message}
                </Notification>,
            )
            return false
        } finally {
            setIsProcessing(false)
            setProgress(0)
            setProgressLabel('')
        }
    }, [])

    const handleApplyCrop = useCallback(async () => {
        if (!selectedClip) return
        const crop = getCropDimensions()
        if (!crop) return
        const region = rectToSourcePixels({ x: crop.x, y: crop.y, w: crop.width, h: crop.height })
        if (!region) {
            toast.push(
                <Notification type="warning" title="Region too small">
                    Adjust the crop box before applying.
                </Notification>,
            )
            return
        }
        const success = await applyClipEdit(
            selectedClip,
            `Cropped ${Math.round(region.w)}×${Math.round(region.h)}`,
            (onP) => cropVideo(selectedClip.url, region, onP),
            { resetTrim: true },
        )
        // Only close the tool on success — applyClipEdit swallows errors
        // (toast only), so on failure we keep the tool open and the crop
        // box intact so the user can retry without redrawing.
        if (success) {
            setToolMode('none')
        }
    }, [selectedClip, getCropDimensions, rectToSourcePixels, applyClipEdit])

    const handleApplyWatermark = useCallback(async () => {
        if (!selectedClip || !wmRect) return
        const region = rectToSourcePixels(wmRect)
        if (!region) {
            toast.push(
                <Notification type="warning" title="Region too small">
                    Draw a larger rectangle over the watermark.
                </Notification>,
            )
            return
        }
        const success = await applyClipEdit(
            selectedClip,
            'Watermark removed',
            (onP) => removeWatermark(selectedClip.url, region, onP),
            { resetTrim: false },
        )
        // Only clear the tool/rect on success — on failure keep them so the
        // user can retry without redrawing the rectangle.
        if (success) {
            setToolMode('none')
            setWmRect(null)
        }
    }, [selectedClip, wmRect, rectToSourcePixels, applyClipEdit])

    // ─── Reset (v1 scope: undo trims only — crop/watermark are destructive
    // per-clip edits with no history stack in this single-track model) ──
    const handleResetTrims = useCallback(() => {
        setClips((prev) => prev.map((c) => ({ ...c, inPoint: 0, outPoint: c.duration })))
    }, [])

    // ─── Export: trim each clip as needed, stitch if >1, then download or
    // save to gallery via the existing addToGallery contract ───────────
    const loadTrendingSounds = useCallback(async () => {
        if (trendingSounds !== null) return
        const result = await listTrendingSounds({ countryCode: 'GLOBAL', period: 7 })
        setTrendingSounds(result.success ? (result.data?.sounds ?? []) : [])
    }, [trendingSounds])

    // Bake the chosen audio into a built video (ffmpeg). Returns a NEW blob url;
    // revokes the pre-mux url only if it was a minted intermediate (never a
    // timeline clip.url passthrough).
    const applyAudioToVideo = useCallback(
        async (videoUrl: string, videoIsMinted: boolean): Promise<string> => {
            if (audioMode === 'none') return videoUrl
            const audioUrl =
                audioMode === 'trending'
                    ? selectedSound
                        ? `/api/trends/sound-audio?id=${encodeURIComponent(selectedSound.id)}`
                        : null
                    : uploadedAudio
                      ? URL.createObjectURL(uploadedAudio)
                      : null
            if (!audioUrl) return videoUrl
            setProgressLabel('Adding audio…')
            setProgress(0)
            try {
                const muxed = await muxAudioIntoVideo(videoUrl, audioUrl, {
                    keepOriginalVolume: keepOriginalSound ? 0.15 : 0,
                    onProgress: setProgress,
                })
                if (videoIsMinted) {
                    try { URL.revokeObjectURL(videoUrl) } catch { /* ignore */ }
                }
                return muxed
            } finally {
                if (audioMode === 'upload' && audioUrl.startsWith('blob:')) {
                    try { URL.revokeObjectURL(audioUrl) } catch { /* ignore */ }
                }
            }
        },
        [audioMode, selectedSound, uploadedAudio, keepOriginalSound],
    )

    const buildFinalVideo = useCallback(async (): Promise<string | null> => {
        if (clips.length === 0) return null
        const EPS = 0.01
        const needsTrim = clips.map((c) => c.inPoint > EPS || c.outPoint < c.duration - EPS)
        const trimCount = needsTrim.filter(Boolean).length
        const steps = Math.max(1, trimCount + (clips.length > 1 ? 1 : 0))
        const stepProgress = (i: number) => (p: number) => setProgress(Math.round(((i + p / 100) / steps) * 100))

        let stepIdx = 0
        const partUrls: string[] = []
        // Blob URLs minted by trimVideo() for THIS export — distinct from
        // any clips[].url (the timeline still owns those, untouched here).
        // Revoked below once stitchVideos has read them (or on error), so
        // they never leak. Never includes a passed-through clip.url.
        const createdPartUrls: string[] = []
        try {
            for (let i = 0; i < clips.length; i++) {
                const clip = clips[i]
                if (needsTrim[i]) {
                    setProgressLabel(`Trimming clip ${i + 1}/${clips.length}…`)
                    const url = await trimVideo(clip.url, clip.inPoint, clip.outPoint, stepProgress(stepIdx))
                    partUrls.push(url)
                    createdPartUrls.push(url)
                    stepIdx++
                } else {
                    partUrls.push(clip.url)
                }
            }
            if (partUrls.length > 1) {
                setProgressLabel('Combining clips…')
                const finalUrl = await stitchVideos(partUrls, stepProgress(stepIdx))
                // stitchVideos has read every part by value — the trimmed
                // intermediates are no longer needed. Clips still on the
                // timeline reuse their own clip.url, which was never added
                // to createdPartUrls, so they're untouched.
                for (const partUrl of createdPartUrls) {
                    try { URL.revokeObjectURL(partUrl) } catch { /* ignore */ }
                }
                // stitchVideos minted finalUrl → safe to revoke after muxing.
                return await applyAudioToVideo(finalUrl, true)
            }
            // Single part: partUrls[0] is a trimmed blob (minted) if that clip
            // was trimmed, else the timeline's own clip.url (passthrough) which
            // applyAudioToVideo must NOT revoke.
            return await applyAudioToVideo(partUrls[0], needsTrim[0])
        } catch (err) {
            // Trim/stitch failed partway — revoke whatever intermediates
            // were already minted so they don't leak.
            for (const partUrl of createdPartUrls) {
                try { URL.revokeObjectURL(partUrl) } catch { /* ignore */ }
            }
            throw err
        }
    }, [clips, applyAudioToVideo])

    const handleDownload = useCallback(async () => {
        if (clips.length === 0) return
        setIsProcessing(true)
        setProgress(0)
        setProgressLabel('Preparing export…')
        try {
            const finalUrl = await buildFinalVideo()
            if (!finalUrl) return
            setProgress(100)
            try {
                const resp = await fetch(finalUrl)
                const blob = await resp.blob()
                const objUrl = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = objUrl
                a.download = `video-editor-${Date.now()}.mp4`
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                URL.revokeObjectURL(objUrl)
                // finalUrl was only needed to build the download blob above —
                // it's used transiently here, so revoke it now. Guard against
                // the no-trim/no-stitch single-clip passthrough case, where
                // finalUrl IS still one of the timeline's own clip URLs.
                if (!clipsRef.current.some((c) => c.url === finalUrl)) {
                    try { URL.revokeObjectURL(finalUrl) } catch { /* ignore */ }
                }
            } catch (err) {
                console.error('[VideoEditor] Download failed:', err)
                window.open(finalUrl, '_blank')
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            console.error('[VideoEditor] Export (download) failed:', err)
            toast.push(
                <Notification type="danger" title="Export failed">
                    {message}
                </Notification>,
            )
        } finally {
            setIsProcessing(false)
            setProgress(0)
            setProgressLabel('')
        }
    }, [clips.length, buildFinalVideo])

    const handleSaveToGallery = useCallback(async () => {
        if (clips.length === 0) return
        setIsProcessing(true)
        setProgress(0)
        setProgressLabel('Preparing export…')
        try {
            const finalUrl = await buildFinalVideo()
            if (!finalUrl) return
            setProgress(100)
            let aspectRatio: '16:9' | '9:16' = '16:9'
            try {
                const probe = await probeVideo(finalUrl)
                if (probe.width > 0 && probe.height > 0) {
                    aspectRatio = probe.width >= probe.height ? '16:9' : '9:16'
                }
            } catch { /* keep default aspect ratio */ }
            const label = clips.length > 1 ? `${clips.length} clips combined` : clips[0].name
            addToGallery({
                id: `editor-${Date.now()}`,
                url: finalUrl,
                prompt: `Video Editor: ${label}`,
                aspectRatio,
                timestamp: Date.now(),
                mediaType: 'VIDEO',
            })
            toast.push(
                <Notification type="success" title="Saved">
                    Video added to Avatar Studio gallery.
                </Notification>,
            )
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            console.error('[VideoEditor] Export (save) failed:', err)
            toast.push(
                <Notification type="danger" title="Export failed">
                    {message}
                </Notification>,
            )
        } finally {
            setIsProcessing(false)
            setProgress(0)
            setProgressLabel('')
        }
    }, [clips, buildFinalVideo, addToGallery])

    // Saved videos from the studio gallery, offered by the "From gallery" picker.
    const galleryVideoCandidates = gallery.filter((g) => g.mediaType === 'VIDEO' && !!g.url)
    const galleryPicker = (
        <Dialog
            isOpen={isGalleryPickerOpen}
            onClose={() => setIsGalleryPickerOpen(false)}
            width={640}
            className="bg-white! dark:bg-gray-900!"
        >
            <h5 className="mb-1">Add clip</h5>
            <p className="text-sm text-gray-500 mb-4">
                Pick a saved video from your gallery, or upload one from your device.
            </p>
            {galleryVideoCandidates.length === 0 ? (
                <p className="text-sm text-gray-500">
                    No saved videos in the gallery yet — generate or save one first.
                </p>
            ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[60vh] overflow-y-auto pr-1">
                    {galleryVideoCandidates.map((g) => (
                        <button
                            key={g.id}
                            type="button"
                            onClick={() => handleAddFromGallery(g)}
                            disabled={isProcessing}
                            title="Add to timeline"
                            className="relative aspect-[9/16] rounded-lg overflow-hidden border-2 border-transparent hover:border-primary transition-colors bg-black disabled:opacity-50"
                        >
                            <video
                                src={g.url}
                                muted
                                preload="metadata"
                                className="w-full h-full object-cover"
                            />
                            <span className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/30 opacity-0 hover:opacity-100 transition-opacity">
                                <HiOutlinePlus className="w-6 h-6 text-white" />
                            </span>
                        </button>
                    ))}
                </div>
            )}
            <div className="flex justify-between items-center mt-4">
                <Button
                    variant="default"
                    icon={<HiOutlineUpload />}
                    disabled={isProcessing}
                    onClick={() => {
                        setIsGalleryPickerOpen(false)
                        fileInputRef.current?.click()
                    }}
                >
                    Upload from device
                </Button>
                <Button variant="plain" onClick={() => setIsGalleryPickerOpen(false)}>
                    Close
                </Button>
            </div>
        </Dialog>
    )

    // ─── Empty state ─────────────────────────────────────────────────
    if (clips.length === 0) {
        return (
            <div className="h-full flex flex-col">
                <div className="border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold">Video Editor</h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Single-track timeline · trim · crop · watermark · combine
                        </p>
                    </div>
                </div>
                <div className="flex-1 flex items-center justify-center p-8">
                    <Card className="max-w-md w-full text-center p-8">
                        <div className="w-16 h-16 mx-auto rounded-full border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center mb-4">
                            <HiOutlineFilm className="w-8 h-8 text-gray-400" />
                        </div>
                        <h3 className="text-base font-semibold mb-2">Empezá tu timeline</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                            Subí o arrastrá uno o más videos. Vas a poder recortar,
                            reordenar, cortar watermarks y combinarlos, todo en un
                            único track. Corre en tu navegador con FFmpeg.
                        </p>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="video/*"
                            multiple
                            className="hidden"
                            onChange={handleFileInputChange}
                        />
                        <div className="flex items-center justify-center gap-2">
                            <Button
                                variant="solid"
                                icon={<HiOutlineUpload />}
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isProcessing}
                            >
                                Upload
                            </Button>
                            <Button
                                variant="default"
                                icon={<HiOutlineFilm />}
                                onClick={() => setIsGalleryPickerOpen(true)}
                                disabled={isProcessing}
                            >
                                From gallery
                            </Button>
                        </div>
                    </Card>
                </div>
                {isProcessing && (
                    <div className="p-4">
                        <Card className="px-4 py-3 text-center">
                            <div className="text-xs font-mono text-primary mb-2">{progressLabel}</div>
                            <Progress percent={progress} size="sm" />
                        </Card>
                    </div>
                )}
                {galleryPicker}
            </div>
        )
    }

    const trimmedLenOf = (c: TimelineClip) => Math.max(0.01, c.outPoint - c.inPoint)
    const selectedTrimmedLen = selectedClip ? trimmedLenOf(selectedClip) : 0

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <h2 className="text-lg font-semibold truncate">Video Editor</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        {clips.length} clip{clips.length === 1 ? '' : 's'} · {totalTrimmed.toFixed(1)}s total
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        size="xs"
                        variant="plain"
                        icon={<HiOutlineRefresh />}
                        onClick={handleResetTrims}
                        disabled={isProcessing}
                    >
                        Reset
                    </Button>
                    <Button
                        size="xs"
                        variant="plain"
                        icon={<HiOutlineDownload />}
                        onClick={handleDownload}
                        disabled={isProcessing}
                    >
                        Download
                    </Button>
                    <Button
                        size="xs"
                        variant="solid"
                        icon={<HiOutlineSave />}
                        onClick={handleSaveToGallery}
                        disabled={isProcessing}
                    >
                        Save to Gallery
                    </Button>
                </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0">
                {/* Preview */}
                <div className="flex-3 min-h-0 flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900 p-4 gap-3 overflow-y-auto">
                    <div
                        className="relative max-w-full inline-block"
                        onMouseDown={toolMode === 'watermark' ? handleWmMouseDown : undefined}
                        onMouseMove={toolMode === 'watermark' ? handleWmMouseMove : undefined}
                        onMouseUp={toolMode === 'watermark' ? handleWmMouseUp : undefined}
                        onMouseLeave={toolMode === 'watermark' ? handleWmMouseUp : undefined}
                        style={{
                            cursor: isProcessing ? 'wait' : toolMode === 'watermark' ? 'crosshair' : 'default',
                        }}
                    >
                        <video
                            ref={videoRef}
                            src={selectedClip?.url}
                            // Match the filmstrip extractor's CORS mode so both share
                            // one cache entry (else the strip can't read the frames).
                            crossOrigin="anonymous"
                            playsInline
                            className="max-w-full max-h-[42vh] block bg-black"
                            style={{ pointerEvents: 'none' }}
                        />

                        {/* Watermark freehand rect */}
                        {toolMode === 'watermark' && wmRect && wmRect.w > 4 && wmRect.h > 4 && (
                            <div
                                className="absolute border-2 border-purple-500 bg-purple-500/20 pointer-events-none"
                                style={{ left: wmRect.x, top: wmRect.y, width: wmRect.w, height: wmRect.h }}
                            />
                        )}

                        {/* Crop box */}
                        {toolMode === 'crop' && (() => {
                            const crop = getCropDimensions()
                            if (!crop) return null
                            return (
                                <div
                                    className="absolute bg-transparent border-2 border-dashed border-purple-400 cursor-move"
                                    style={{
                                        left: crop.x,
                                        top: crop.y,
                                        width: crop.width,
                                        height: crop.height,
                                        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.7)',
                                    }}
                                    onMouseDown={handleCropMouseDown}
                                >
                                    <div className="absolute -top-1 -left-1 w-3 h-3 bg-purple-400 rounded-full" />
                                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-purple-400 rounded-full" />
                                    <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-purple-400 rounded-full" />
                                    <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-purple-400 rounded-full" />
                                </div>
                            )
                        })()}

                        {/* Processing overlay */}
                        {isProcessing && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
                                <Card className="px-6 py-4 min-w-70 text-center">
                                    <HiOutlineScissors className="w-8 h-8 text-primary mx-auto mb-2" />
                                    <div className="text-sm font-mono text-primary mb-2">{progressLabel}</div>
                                    <Progress percent={progress} size="sm" />
                                </Card>
                            </div>
                        )}
                    </div>

                    {/* Custom player controls — playback is clamped to the
                        selected clip's [inPoint, outPoint]. */}
                    <div className="w-full max-w-2xl flex items-center gap-3 bg-white/5 dark:bg-gray-800/40 backdrop-blur rounded-lg px-3 py-2">
                        <button
                            type="button"
                            onClick={togglePlay}
                            disabled={isProcessing || !selectedClip}
                            className="text-gray-700 dark:text-gray-200 hover:text-purple-500 disabled:opacity-30 transition-colors"
                            aria-label={isPlaying ? 'Pause' : 'Play'}
                        >
                            {isPlaying ? <HiOutlinePause className="w-6 h-6" /> : <HiOutlinePlay className="w-6 h-6" />}
                        </button>
                        <div
                            className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded cursor-pointer relative group"
                            onClick={handleSeek}
                        >
                            <div
                                className="absolute h-full bg-purple-500 rounded transition-[width] duration-100"
                                style={{
                                    width: `${selectedTrimmedLen > 0
                                        ? Math.max(0, Math.min(1, (playhead - (selectedClip?.inPoint ?? 0)) / selectedTrimmedLen)) * 100
                                        : 0}%`,
                                }}
                            />
                        </div>
                        <span className="text-xs font-mono text-gray-500 dark:text-gray-400 min-w-20 text-right">
                            {fmtTime(Math.max(0, playhead - (selectedClip?.inPoint ?? 0)))} / {fmtTime(selectedTrimmedLen)}
                        </span>
                        <button
                            type="button"
                            onClick={toggleMute}
                            className="text-gray-500 dark:text-gray-400 hover:text-purple-500 transition-colors"
                            aria-label={isMuted ? 'Unmute' : 'Mute'}
                        >
                            {isMuted ? <HiOutlineVolumeOff className="w-5 h-5" /> : <HiOutlineVolumeUp className="w-5 h-5" />}
                        </button>
                    </div>

                    {/* Tools: Crop / Watermark, applied to the selected clip */}
                    <div className="w-full max-w-2xl">
                        <div className="flex items-center gap-2 mb-2">
                            <Button
                                size="xs"
                                variant={toolMode === 'crop' ? 'solid' : 'plain'}
                                icon={<HiOutlineSelector />}
                                onClick={() => setToolMode((m) => (m === 'crop' ? 'none' : 'crop'))}
                                disabled={isProcessing || !selectedClip}
                            >
                                Crop
                            </Button>
                            <Button
                                size="xs"
                                variant={toolMode === 'watermark' ? 'solid' : 'plain'}
                                icon={<HiOutlineScissors />}
                                onClick={() => setToolMode((m) => (m === 'watermark' ? 'none' : 'watermark'))}
                                disabled={isProcessing || !selectedClip}
                            >
                                Watermark
                            </Button>
                            <Button
                                size="xs"
                                variant={audioPanelOpen || audioMode !== 'none' ? 'solid' : 'plain'}
                                icon={<HiOutlineMusicNote />}
                                onClick={() => {
                                    setAudioPanelOpen((o) => !o)
                                    void loadTrendingSounds()
                                }}
                                disabled={isProcessing}
                            >
                                Audio{audioMode !== 'none' ? ' •' : ''}
                            </Button>
                        </div>

                        {audioPanelOpen && (
                            <div className="space-y-2 mb-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                                <div className="flex items-center gap-2 flex-wrap">
                                    {(['none', 'trending', 'upload'] as const).map((mode) => (
                                        <button
                                            key={mode}
                                            type="button"
                                            onClick={() => {
                                                setAudioMode(mode)
                                                if (mode === 'trending') void loadTrendingSounds()
                                            }}
                                            disabled={isProcessing}
                                            className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                                                audioMode === mode
                                                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-500/20 text-purple-700 dark:text-purple-200 font-medium'
                                                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                            }`}
                                        >
                                            {mode === 'none'
                                                ? 'No audio'
                                                : mode === 'trending'
                                                  ? 'Trending sound'
                                                  : 'Upload audio'}
                                        </button>
                                    ))}
                                </div>

                                {audioMode === 'trending' && (
                                    <div className="max-h-40 overflow-y-auto flex flex-col gap-1 pr-1">
                                        {trendingSounds === null ? (
                                            <p className="text-xs text-gray-500">Loading chart…</p>
                                        ) : trendingSounds.length === 0 ? (
                                            <p className="text-xs text-amber-600 dark:text-amber-400">
                                                No sounds cached — open Trending Sounds and hit Refresh
                                                first.
                                            </p>
                                        ) : (
                                            trendingSounds.map((sound) => (
                                                <button
                                                    key={sound.id}
                                                    type="button"
                                                    onClick={() => setSelectedSound(sound)}
                                                    className={`flex items-center gap-2 p-1.5 rounded-lg text-left transition-colors border ${
                                                        selectedSound?.id === sound.id
                                                            ? 'bg-primary/15 border-primary/40'
                                                            : 'border-transparent hover:bg-gray-100 dark:hover:bg-gray-700'
                                                    }`}
                                                >
                                                    <span className="text-[10px] font-bold text-gray-400 w-4 shrink-0">
                                                        {sound.rank}
                                                    </span>
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block text-xs font-medium truncate">
                                                            {sound.name}
                                                        </span>
                                                        <span className="block text-[10px] text-gray-400 truncate">
                                                            {sound.author ?? 'Unknown'}
                                                        </span>
                                                    </span>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                )}

                                {audioMode === 'upload' && (
                                    <div>
                                        <input
                                            ref={audioFileInputRef}
                                            type="file"
                                            accept="audio/*"
                                            className="hidden"
                                            onChange={(e) => setUploadedAudio(e.target.files?.[0] ?? null)}
                                        />
                                        <Button
                                            size="xs"
                                            variant="default"
                                            icon={<HiOutlineUpload />}
                                            onClick={() => audioFileInputRef.current?.click()}
                                        >
                                            {uploadedAudio
                                                ? uploadedAudio.name.slice(0, 30)
                                                : 'Choose audio file'}
                                        </Button>
                                    </div>
                                )}

                                {audioMode !== 'none' && (
                                    <>
                                        <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={keepOriginalSound}
                                                onChange={(e) => setKeepOriginalSound(e.target.checked)}
                                            />
                                            <span>Keep original video sound (mixed low)</span>
                                        </label>
                                        <p className="text-[10px] text-amber-600 dark:text-amber-400">
                                            Baked into the export on Save/Download. Platforms may mute
                                            copyrighted music.
                                        </p>
                                    </>
                                )}
                            </div>
                        )}

                        {toolMode === 'crop' && (
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Aspect:</span>
                                    {CROP_ASPECTS.map((opt) => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => setCropAspect(opt.value)}
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
                                <div className="flex items-center gap-4">
                                    <span className="text-xs text-gray-500 dark:text-gray-400 w-20 shrink-0">Crop Size</span>
                                    <div className="flex-1">
                                        <Slider value={cropScale} onChange={(v) => setCropScale(v as number)} min={30} max={100} />
                                    </div>
                                    <span className="text-xs text-gray-500 dark:text-gray-400 w-10 text-right">{cropScale}%</span>
                                    <Button size="sm" variant="solid" onClick={handleApplyCrop} disabled={isProcessing}>
                                        Apply Crop
                                    </Button>
                                    <Button size="sm" variant="plain" onClick={() => setToolMode('none')}>
                                        Cancel
                                    </Button>
                                </div>
                            </div>
                        )}

                        {toolMode === 'watermark' && (
                            <div className="flex items-center justify-between gap-4">
                                <div className="text-xs text-gray-500 dark:text-gray-400 flex-1">
                                    {wmRect && wmRect.w > 4 && wmRect.h > 4 ? (
                                        <>Región: {Math.round(wmRect.w)}×{Math.round(wmRect.h)}px.</>
                                    ) : (
                                        <>Dibujá un rectángulo encima del watermark.</>
                                    )}
                                </div>
                                <Button
                                    size="sm"
                                    variant="solid"
                                    onClick={handleApplyWatermark}
                                    disabled={isProcessing || !wmRect || wmRect.w <= 4 || wmRect.h <= 4}
                                    icon={<HiOutlineScissors />}
                                >
                                    Remove Watermark
                                </Button>
                                <Button size="sm" variant="plain" onClick={() => { setToolMode('none'); setWmRect(null) }}>
                                    Cancel
                                </Button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Timeline — single track, the centerpiece */}
                <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 p-4">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Timeline</h3>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="video/*"
                            multiple
                            className="hidden"
                            onChange={handleFileInputChange}
                        />
                        <Button
                            size="xs"
                            variant="plain"
                            icon={<HiOutlinePlus />}
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isProcessing}
                        >
                            Add clip
                        </Button>
                    </div>
                    <div
                        ref={trackRef}
                        onDragOver={handleTrackDragOver}
                        onDrop={handleTrackDrop}
                        className="flex items-stretch gap-1 h-20 bg-gray-100 dark:bg-gray-900 rounded-lg p-1"
                    >
                        {clips.map((clip, idx) => {
                            const trimmedLen = trimmedLenOf(clip)
                            const selected = clip.id === selectedClipId
                            const playheadPct = selected
                                ? Math.max(0, Math.min(100, ((playhead - clip.inPoint) / trimmedLen) * 100))
                                : 0
                            return (
                                <div
                                    key={clip.id}
                                    ref={(el) => { blockRefs.current[clip.id] = el }}
                                    className={`relative rounded-md overflow-hidden border-2 transition-colors ${
                                        selected ? 'border-purple-500' : 'border-transparent'
                                    } ${dragOverIdx === idx ? 'ring-2 ring-purple-300' : ''}`}
                                    style={{ flexGrow: trimmedLen, flexBasis: 0, minWidth: 24 }}
                                    onDragOver={handleClipDragOver(idx)}
                                    onDrop={handleClipDrop(idx)}
                                >
                                    <div
                                        className="absolute inset-0 bg-black cursor-ew-resize"
                                        onMouseDown={handleBlockScrubStart(clip)}
                                    >
                                        {filmstrips[clip.url]?.length ? (
                                            <div className="absolute inset-0 flex pointer-events-none">
                                                {filmstrips[clip.url].map((frame, i) => (
                                                    <img
                                                        key={i}
                                                        src={frame}
                                                        alt=""
                                                        className="h-full flex-1 min-w-0 object-cover"
                                                        draggable={false}
                                                    />
                                                ))}
                                            </div>
                                        ) : (
                                            <video
                                                src={clip.url}
                                                crossOrigin="anonymous"
                                                muted
                                                preload="metadata"
                                                className="w-full h-full object-cover opacity-70"
                                            />
                                        )}
                                        <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 pointer-events-none">
                                            <div className="text-[10px] text-white truncate leading-tight">{clip.name}</div>
                                            <div className="text-[9px] text-gray-300 leading-tight">{trimmedLen.toFixed(1)}s</div>
                                        </div>
                                    </div>

                                    {/* Reorder handle — the ONLY drag source for clip reordering */}
                                    <span
                                        draggable
                                        onDragStart={handleClipDragStart(idx)}
                                        onDragEnd={handleClipDragEnd}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        className="absolute top-0.5 left-0.5 z-20 p-1 rounded bg-black/50 cursor-grab active:cursor-grabbing"
                                        title="Drag to reorder clips"
                                    >
                                        <HiOutlineMenuAlt4 className="w-3 h-3 text-white/80" />
                                    </span>

                                    {/* Trim handles */}
                                    <div
                                        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-purple-500/50 z-10"
                                        onMouseDown={(e) => { e.stopPropagation(); startTrimDrag(e, clip, 'in') }}
                                    />
                                    <div
                                        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-purple-500/50 z-10"
                                        onMouseDown={(e) => { e.stopPropagation(); startTrimDrag(e, clip, 'out') }}
                                    />

                                    {/* Remove clip */}
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); handleRemoveClip(clip.id) }}
                                        className="absolute top-0.5 right-0.5 z-20 p-0.5 rounded bg-black/50 text-white/80 hover:text-red-400"
                                        aria-label="Remove clip"
                                    >
                                        <HiOutlineX className="w-3 h-3" />
                                    </button>

                                    {/* Playhead — wider grab affordance + knob so it reads as draggable */}
                                    {selected && (
                                        <div
                                            className="absolute top-0 bottom-0 z-20 pointer-events-none"
                                            style={{ left: `${playheadPct}%` }}
                                        >
                                            <div className="absolute top-0 bottom-0 -translate-x-1/2 w-0.5 bg-red-500" />
                                            <div className="absolute -top-1 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-red-500 border border-white" />
                                        </div>
                                    )}
                                </div>
                            )
                        })}

                        {/* Append-clip tile — the big "+" at the end of the track */}
                        <button
                            type="button"
                            onClick={() => setIsGalleryPickerOpen(true)}
                            disabled={isProcessing}
                            title="Add clip"
                            className="shrink-0 h-full w-12 rounded-md border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center gap-0.5 text-gray-400 hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                        >
                            <HiOutlinePlus className="w-7 h-7" />
                            <span className="text-[9px] font-medium">Add</span>
                        </button>
                    </div>
                </div>
            </div>

            {galleryPicker}
        </div>
    )
}

export default VideoEditorMain
