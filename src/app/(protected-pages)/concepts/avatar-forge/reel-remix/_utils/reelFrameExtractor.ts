/**
 * Client-side frame extraction for Reel Remix — NO ffmpeg, no extra deps.
 *
 * A short Reel is loaded into a hidden <video> and sampled at evenly spaced
 * timestamps via <canvas>. To keep the canvas un-tainted (Instagram's CDN sends
 * no CORS headers), a remote video is first fetched through our same-origin
 * proxy as a Blob and turned into an object URL — a fully local, seekable source
 * that never poisons toDataURL(). Uploaded files already are local object URLs,
 * so both inputs flow through the exact same code path.
 *
 * Mirrors the canvas/FileReader approach already used in
 * BottomControlBar.handleCloneRefUpload, just generalized to N frames over time.
 */

export interface ReelFrame {
    /** Clean base64 (no data: prefix) — ready for Gemini inlineData. */
    base64: string
    mimeType: string
    /** Full data URL — for showing the frame thumbnail in the UI. */
    dataUrl: string
}

export interface VideoSource {
    /** Remote CDN video URL (will be routed through the same-origin proxy). */
    videoUrl?: string
    /** Locally uploaded video file (fallback path). */
    file?: File
}

/** Build the same-origin proxy URL the browser can safely load as a Blob. */
export function proxyVideoUrl(cdnUrl: string): string {
    return `/api/instagram/proxy?u=${encodeURIComponent(cdnUrl)}`
}

const FRAME_MIME = 'image/jpeg'
const FRAME_QUALITY = 0.9

/**
 * Resolve a {videoUrl|file} source into a local, seekable object URL. Remote
 * URLs are fetched through the proxy first (→ Blob → object URL); files are
 * wrapped directly. Returns the URL plus a revoke() to release it.
 */
async function resolveObjectUrl(
    source: VideoSource,
): Promise<{ url: string; revoke: () => void }> {
    if (source.file) {
        const url = URL.createObjectURL(source.file)
        return { url, revoke: () => URL.revokeObjectURL(url) }
    }
    if (source.videoUrl) {
        const res = await fetch(proxyVideoUrl(source.videoUrl))
        if (!res.ok) {
            throw new Error(
                `Could not load the Reel video (proxy ${res.status}). Try uploading the file instead.`,
            )
        }
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        return { url, revoke: () => URL.revokeObjectURL(url) }
    }
    throw new Error('No video source provided')
}

/** Evenly spaced sample points in (0,1), avoiding the often-black first/last frame. */
function samplePositions(count: number): number[] {
    const n = Math.max(1, count)
    return Array.from({ length: n }, (_, i) => (i + 1) / (n + 1))
}

/**
 * Extract `count` frames from a Reel in chronological order. `count` of 1 grabs
 * the mid-frame (representative cover); 3 grabs start/middle/end for motion.
 */
export async function extractFrames(
    source: VideoSource,
    count: number,
): Promise<ReelFrame[]> {
    const { url, revoke } = await resolveObjectUrl(source)

    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.crossOrigin = 'anonymous'
    video.src = url

    try {
        await waitForEvent(video, 'loadedmetadata', 20_000)
        // Some browsers need a data load before the first seek paints anything.
        if (video.readyState < 2) {
            await waitForEvent(video, 'loadeddata', 20_000).catch(() => {})
        }

        const duration = Number.isFinite(video.duration) ? video.duration : 0
        if (!duration) {
            throw new Error('The video has no readable duration')
        }

        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth || 720
        canvas.height = video.videoHeight || 1280
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas 2D context unavailable')

        const frames: ReelFrame[] = []
        for (const pos of samplePositions(count)) {
            // Pull slightly inside the bounds so we never seek past the end.
            const t = Math.min(duration * pos, Math.max(0, duration - 0.05))
            await seekTo(video, t)
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
            const dataUrl = canvas.toDataURL(FRAME_MIME, FRAME_QUALITY)
            frames.push({
                base64: dataUrl.split(',')[1] ?? '',
                mimeType: FRAME_MIME,
                dataUrl,
            })
        }
        return frames
    } finally {
        video.removeAttribute('src')
        video.load()
        revoke()
    }
}

/** Seek and wait for the frame at `time` to be painted. */
function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
    return new Promise((resolve, reject) => {
        const onSeeked = () => {
            cleanup()
            resolve()
        }
        const onError = () => {
            cleanup()
            reject(new Error('Failed to seek the video'))
        }
        const cleanup = () => {
            video.removeEventListener('seeked', onSeeked)
            video.removeEventListener('error', onError)
        }
        video.addEventListener('seeked', onSeeked)
        video.addEventListener('error', onError)
        video.currentTime = time
    })
}

function waitForEvent(
    el: HTMLVideoElement,
    event: string,
    timeoutMs: number,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const onEvent = () => {
            cleanup()
            resolve()
        }
        const onError = () => {
            cleanup()
            reject(new Error('The video could not be loaded or decoded'))
        }
        const timer = setTimeout(() => {
            cleanup()
            reject(new Error(`Timed out waiting for video "${event}"`))
        }, timeoutMs)
        const cleanup = () => {
            clearTimeout(timer)
            el.removeEventListener(event, onEvent)
            el.removeEventListener('error', onError)
        }
        el.addEventListener(event, onEvent)
        el.addEventListener('error', onError)
    })
}
