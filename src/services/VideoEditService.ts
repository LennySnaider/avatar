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
 * Remove a static watermark with two combined techniques:
 *
 *   1) `delogo` on the user's exact rectangle: erases the watermark
 *      content. It can introduce mild color smudges where neighbors
 *      differ in brightness, but those stay contained inside the
 *      rectangle.
 *
 *   2) `gblur` (sigma=20) on the rectangle EXPANDED by ~20px on each
 *      side, composited back over the cleaned frame. The padded area
 *      means the blur boundary doesn't align with the original rect
 *      edges, so the user no longer sees a sharp square cutout —
 *      the blurred zone reads as a natural out-of-focus patch and
 *      simultaneously hides whatever interpolation noise delogo left
 *      behind.
 *
 * This avoids both prior failure modes:
 *  - Pure delogo/removelogo left visible color distortion smudges.
 *  - Pure blur left a sharp-edged blurry square that the eye spotted.
 *
 * Future improvement: AI inpainting with temporal consistency (LaMa
 * via ONNX Runtime Web + WebGPU). Tracked as Path B in the editor plan.
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

        // Round coords to integers — filters reject fractional values.
        const x = Math.max(0, Math.round(region.x))
        const y = Math.max(0, Math.round(region.y))
        const w = Math.max(4, Math.round(region.w))
        const h = Math.max(4, Math.round(region.h))

        // Probe to get video dimensions — we need them to clamp the
        // expanded blur rectangle so it doesn't run past the frame edge.
        const probe = await probeVideo(videoUrl)
        if (probe.width <= 0 || probe.height <= 0) {
            throw new Error('Could not determine video dimensions for watermark removal')
        }
        const vw = probe.width
        const vh = probe.height

        // Padding around the user's rectangle for the blur layer. Bigger
        // padding = softer edges and more "out of focus" feel, but also
        // blurs more of the surrounding scene. 20px is a balance that
        // works for typical corner watermarks at 720p/1080p; we may
        // expose it as a slider if more tuning is needed.
        const padding = 20
        const blurX = Math.max(0, x - padding)
        const blurY = Math.max(0, y - padding)
        const blurW = Math.min(vw - blurX, w + padding * 2)
        const blurH = Math.min(vh - blurY, h + padding * 2)

        // Two-pass filtergraph:
        //   1) delogo wipes the exact watermark rectangle. Any colour
        //      smudge introduced by interpolation stays inside [x,y,w,h].
        //   2) split the cleaned frame, crop a LARGER rect ([blurX, blurY,
        //      blurW, blurH]) that overlaps the surrounding clean area,
        //      blur it heavily, overlay back at the padded origin. The
        //      enlarged blur boundary doesn't coincide with the original
        //      rect edges, so the user no longer perceives a sharp
        //      square cutout — it reads as a soft out-of-focus patch.
        const vfilter =
            `[0:v]delogo=x=${x}:y=${y}:w=${w}:h=${h}:show=0[clean];` +
            `[clean]split=2[base][region_src];` +
            `[region_src]crop=${blurW}:${blurH}:${blurX}:${blurY},gblur=sigma=20[blurred];` +
            `[base][blurred]overlay=${blurX}:${blurY}`

        const exitCode = await ff.exec([
            '-i', input,
            '-filter_complex', vfilter,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '23',
            '-c:a', 'copy',
            '-movflags', '+faststart',
            output,
        ])

        if (exitCode !== 0) {
            throw new Error(`FFmpeg removeWatermark exited with code ${exitCode}. See [FFmpeg Log] for details.`)
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

/**
 * Trim a video to the [startSec, endSec] interval. Uses `-c copy` so there's
 * no re-encode — output is generated in seconds even for long clips. The
 * trade-off is that the actual cut may snap to the nearest keyframe instead
 * of the exact requested timestamp (a few frames of drift), which is
 * acceptable for the short generated clips this app produces.
 *
 * If you ever need frame-exact trimming, switch to `-c:v libx264 -c:a aac`
 * but expect the operation to take roughly as long as a re-encode.
 */
export async function trimVideo(
    videoUrl: string,
    startSec: number,
    endSec: number,
    onProgress?: (percent: number) => void,
): Promise<string> {
    if (endSec <= startSec) {
        throw new Error('Trim end must be after start')
    }

    const ff = await loadFFmpeg()
    onProgress?.(5)

    const onFfProgress = ({ progress }: { progress: number }) => {
        const raw = 40 + Math.round(progress * 50)
        const percent = Math.max(40, Math.min(89, raw))
        onProgress?.(percent)
    }
    ff.on('progress', onFfProgress)

    const input = `trim-in-${Date.now()}.mp4`
    const output = `trim-out-${Date.now()}.mp4`

    try {
        console.log(`[VideoEdit] Trimming ${startSec.toFixed(2)}s → ${endSec.toFixed(2)}s`)
        onProgress?.(10)

        const data = await fetchVideoData(videoUrl)
        await ff.writeFile(input, data)
        onProgress?.(35)

        // `-avoid_negative_ts make_zero` rebases timestamps to 0 so the
        // output starts cleanly even if -ss landed mid-GOP. Without this
        // some players (Safari especially) show a black frame at the start.
        const exitCode = await ff.exec([
            '-i', input,
            '-ss', startSec.toFixed(3),
            '-to', endSec.toFixed(3),
            '-c', 'copy',
            '-avoid_negative_ts', 'make_zero',
            output,
        ])

        if (exitCode !== 0) {
            throw new Error(`FFmpeg trim exited with code ${exitCode}. See [FFmpeg Log] for details.`)
        }

        onProgress?.(90)
        const result = await ff.readFile(output)
        const blob = new Blob([result as BlobPart], { type: 'video/mp4' })
        const url = URL.createObjectURL(blob)

        onProgress?.(100)
        console.log('[VideoEdit] Trim complete, output URL:', url)
        return url
    } finally {
        ff.off('progress', onFfProgress)
        try { await ff.deleteFile(input) } catch { /* ignore */ }
        try { await ff.deleteFile(output) } catch { /* ignore */ }
    }
}

/**
 * Crop a video to the given rectangle. Coordinates are in source-video pixels
 * (the caller is responsible for mapping display-space rectangles to source
 * pixels — VideoEditorMain does this by accounting for letterboxing).
 *
 * Re-encodes via libx264 because `crop` is a video filter and there's no
 * lossless copy path for changed dimensions. Audio is copied as-is.
 */
export async function cropVideo(
    videoUrl: string,
    region: VideoRegion,
    onProgress?: (percent: number) => void,
): Promise<string> {
    const ff = await loadFFmpeg()
    onProgress?.(5)

    const onFfProgress = ({ progress }: { progress: number }) => {
        const raw = 40 + Math.round(progress * 50)
        const percent = Math.max(40, Math.min(89, raw))
        onProgress?.(percent)
    }
    ff.on('progress', onFfProgress)

    const input = `crop-in-${Date.now()}.mp4`
    const output = `crop-out-${Date.now()}.mp4`

    try {
        console.log('[VideoEdit] Cropping to region:', region)
        onProgress?.(10)

        const data = await fetchVideoData(videoUrl)
        await ff.writeFile(input, data)
        onProgress?.(35)

        // libx264 requires even W/H for yuv420p. Round to even integers.
        const w = Math.max(16, Math.round(region.w / 2) * 2)
        const h = Math.max(16, Math.round(region.h / 2) * 2)
        const x = Math.max(0, Math.round(region.x))
        const y = Math.max(0, Math.round(region.y))

        const exitCode = await ff.exec([
            '-i', input,
            '-vf', `crop=${w}:${h}:${x}:${y}`,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '23',
            '-c:a', 'copy',
            '-movflags', '+faststart',
            output,
        ])

        if (exitCode !== 0) {
            throw new Error(`FFmpeg crop exited with code ${exitCode}. See [FFmpeg Log] for details.`)
        }

        onProgress?.(90)
        const result = await ff.readFile(output)
        const blob = new Blob([result as BlobPart], { type: 'video/mp4' })
        const url = URL.createObjectURL(blob)

        onProgress?.(100)
        console.log('[VideoEdit] Crop complete, output URL:', url)
        return url
    } finally {
        ff.off('progress', onFfProgress)
        try { await ff.deleteFile(input) } catch { /* ignore */ }
        try { await ff.deleteFile(output) } catch { /* ignore */ }
    }
}
