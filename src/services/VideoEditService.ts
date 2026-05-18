// Client-side video editing operations powered by FFmpeg WASM. Reuses the
// runtime singleton from _ffmpegRuntime.ts so the same WASM instance backs
// both the stitch path and these per-clip edits.
//
// Operations exposed:
//   - probeVideo()        → metadata (duration, dimensions, hasAudio)
//   - removeWatermark()   → delogo filter on a static rectangle
//
// Trim + Crop will be added in Phase 2.

import { loadFFmpeg, fetchVideoData } from './_ffmpegRuntime'

export type VideoRegion = {
    /** X coordinate in source-video pixels (origin top-left). */
    x: number
    /** Y coordinate in source-video pixels (origin top-left). */
    y: number
    /** Width in source-video pixels. */
    w: number
    /** Height in source-video pixels. */
    h: number
}

export type VideoProbeResult = {
    durationSec: number
    width: number
    height: number
    hasAudio: boolean
}

/**
 * Probe a video to extract duration, dimensions and audio presence by running
 * `ffmpeg -i <file>` with no output spec. FFmpeg exits with code 1 ("At least
 * one output file must be specified") — harmless, we only need the stream
 * descriptors it dumps to its log channel before bailing.
 *
 * Regexes are anchored to the canonical Stream descriptor lines so they don't
 * false-positive on unrelated log noise (same pattern that was fixed in the
 * stitch flow after the original /Audio:/ caused video-only inputs to flip
 * hasAudio=true).
 */
export async function probeVideo(videoUrl: string): Promise<VideoProbeResult> {
    const ff = await loadFFmpeg()
    const filename = `probe-${Date.now()}.mp4`

    console.log('[VideoEdit] Probing video:', videoUrl.substring(0, 60))
    const data = await fetchVideoData(videoUrl)
    await ff.writeFile(filename, data)

    let hasAudio = false
    let durationSec = 0
    let width = 0
    let height = 0

    const audioStreamRe = /^\s*Stream\s+#\d+:\d+.*?Audio:/
    const videoStreamRe = /^\s*Stream\s+#\d+:\d+.*?Video:.*?(\d{2,5})x(\d{2,5})/
    const durationRe = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/

    const onLog = ({ message }: { message: string }) => {
        if (audioStreamRe.test(message)) hasAudio = true
        const vm = videoStreamRe.exec(message)
        if (vm) {
            width = parseInt(vm[1], 10)
            height = parseInt(vm[2], 10)
        }
        const dm = durationRe.exec(message)
        if (dm) {
            durationSec =
                parseInt(dm[1], 10) * 3600 +
                parseInt(dm[2], 10) * 60 +
                parseFloat(dm[3])
        }
    }

    ff.on('log', onLog)
    try {
        await ff.exec(['-i', filename]).catch(() => undefined)
    } finally {
        ff.off('log', onLog)
    }

    // Best-effort cleanup so the FS doesn't accumulate stale probes.
    try { await ff.deleteFile(filename) } catch { /* ignore */ }

    console.log(
        `[VideoEdit] Probe result: ${width}x${height}, duration=${durationSec.toFixed(2)}s, audio=${hasAudio}`,
    )
    return { durationSec, width, height, hasAudio }
}

/**
 * Remove a static watermark using FFmpeg's `delogo` filter. The filter
 * interpolates pixels around a rectangle to mask the logo — it's not AI
 * inpainting, so a slight blur is normal in the area, but it's fast,
 * client-side and free.
 *
 * @param videoUrl   Source video URL (blob: or http).
 * @param region     Rectangle in source-video pixels.
 * @param onProgress Progress callback (0–100).
 * @returns          Blob URL of the cleaned video.
 */
export async function removeWatermark(
    videoUrl: string,
    region: VideoRegion,
    onProgress?: (percent: number) => void,
): Promise<string> {
    const ff = await loadFFmpeg()
    onProgress?.(5)

    // Map FFmpeg's per-frame progress (0..~1, can overshoot near the end)
    // to the 40–89% slice, matching the convention used in VideoStitchService.
    // Manual hits cover 5/10/35/90/100. Detached in finally so a follow-up
    // edit doesn't stack listeners on the cached instance.
    const onFfProgress = ({ progress }: { progress: number }) => {
        const raw = 40 + Math.round(progress * 50)
        const percent = Math.max(40, Math.min(89, raw))
        onProgress?.(percent)
    }
    ff.on('progress', onFfProgress)

    const input = `in-${Date.now()}.mp4`
    const output = `out-${Date.now()}.mp4`

    try {
        console.log('[VideoEdit] Removing watermark, region:', region)
        onProgress?.(10)

        const data = await fetchVideoData(videoUrl)
        await ff.writeFile(input, data)
        onProgress?.(35)

        // Round coords to integers — delogo rejects fractional values.
        const x = Math.max(0, Math.round(region.x))
        const y = Math.max(0, Math.round(region.y))
        const w = Math.max(4, Math.round(region.w))
        const h = Math.max(4, Math.round(region.h))

        const exitCode = await ff.exec([
            '-i', input,
            '-vf', `delogo=x=${x}:y=${y}:w=${w}:h=${h}:show=0`,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '23',
            '-c:a', 'copy',
            '-movflags', '+faststart',
            output,
        ])

        if (exitCode !== 0) {
            throw new Error(`FFmpeg delogo exited with code ${exitCode}. See [FFmpeg Log] for details.`)
        }

        onProgress?.(90)
        const result = await ff.readFile(output)
        const blob = new Blob([result as BlobPart], { type: 'video/mp4' })
        const url = URL.createObjectURL(blob)

        onProgress?.(100)
        console.log('[VideoEdit] Watermark removed, output URL:', url)
        return url
    } finally {
        ff.off('progress', onFfProgress)
        // Cleanup so FS stays bounded — these accumulate fast with repeated edits.
        try { await ff.deleteFile(input) } catch { /* ignore */ }
        try { await ff.deleteFile(output) } catch { /* ignore */ }
    }
}
