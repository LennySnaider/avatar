/**
 * Client-side audio muxing — bakes a soundtrack into a video so automated
 * posts go out WITH music (the only way to have audio on API-published
 * Instagram/TikTok posts; official trending sounds can't be attached via API).
 *
 * Runs entirely in the browser on the shared FFmpeg WASM runtime (same as
 * VideoEditService). Returns a blob URL the caller uploads to Storage via a
 * signed URL — binaries never touch a server action (anti-413 rule).
 */
import { loadFFmpeg, fetchVideoData } from './_ffmpegRuntime'

export interface MuxAudioOptions {
    /** 0–1. When > 0, the original video audio is kept and mixed under the new
     * track at this level; 0 (default) replaces the audio entirely. */
    keepOriginalVolume?: number
    onProgress?: (percent: number) => void
}

/**
 * Bake `audioUrl` into `videoUrl`. The audio loops to cover the full video and
 * is cut at the video's end (`-shortest` against an infinitely looped audio),
 * re-encoded to AAC (Instagram requires AAC). Video is stream-copied — no
 * quality loss, fast.
 */
export async function muxAudioIntoVideo(
    videoUrl: string,
    audioUrl: string,
    opts: MuxAudioOptions = {},
): Promise<string> {
    const ff = await loadFFmpeg()
    opts.onProgress?.(5)

    const onFf = ({ progress }: { progress: number }) => {
        opts.onProgress?.(Math.max(45, Math.min(92, 45 + Math.round(progress * 47))))
    }
    ff.on('progress', onFf)

    const stamp = Date.now()
    const videoIn = `mux-v-${stamp}.mp4`
    const audioIn = `mux-a-${stamp}`
    const output = `mux-out-${stamp}.mp4`

    try {
        const [videoBytes, audioBytes] = await Promise.all([
            fetchVideoData(videoUrl),
            fetchVideoData(audioUrl),
        ])
        opts.onProgress?.(35)
        await ff.writeFile(videoIn, videoBytes)
        await ff.writeFile(audioIn, audioBytes)
        opts.onProgress?.(42)

        const keep = opts.keepOriginalVolume ?? 0
        const args: string[] =
            keep > 0
                ? [
                      // Loop the new track, mix it with the original at `keep`.
                      '-stream_loop', '-1', '-i', audioIn,
                      '-i', videoIn,
                      '-filter_complex',
                      `[1:a]volume=${keep}[o];[0:a][o]amix=inputs=2:duration=shortest:dropout_transition=0[a]`,
                      '-map', '1:v', '-map', '[a]',
                      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
                      '-shortest', output,
                  ]
                : [
                      // Replace the audio: looped new track, cut at video end.
                      '-stream_loop', '-1', '-i', audioIn,
                      '-i', videoIn,
                      '-map', '1:v', '-map', '0:a',
                      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
                      '-shortest', output,
                  ]

        const exit = await ff.exec(args)
        if (exit !== 0) {
            throw new Error(`FFmpeg mux exited with code ${exit}. See [FFmpeg Log] for details.`)
        }

        opts.onProgress?.(94)
        const result = await ff.readFile(output)
        const blob = new Blob([result as BlobPart], { type: 'video/mp4' })
        opts.onProgress?.(100)
        return URL.createObjectURL(blob)
    } finally {
        ff.off('progress', onFf)
        try { await ff.deleteFile(videoIn) } catch { /* ignore */ }
        try { await ff.deleteFile(audioIn) } catch { /* ignore */ }
        try { await ff.deleteFile(output) } catch { /* ignore */ }
    }
}
