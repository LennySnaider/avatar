// FFmpeg runtime (loadFFmpeg, fetchVideoData, withTimeout) was extracted to
// _ffmpegRuntime.ts so the new VideoEditService can share the same WASM
// instance via ES module caching. Don't reinitialise here — just import.
import { loadFFmpeg, fetchVideoData } from './_ffmpegRuntime'

/**
 * Concatenate multiple videos into one. Always re-encodes via libx264/aac
 * because the previous "-c copy" fast path produced freezing output when
 * the inputs had divergent DTS timelines (very common with provider-mixed
 * videos — e.g. Kling + KIE — even when codecs nominally match). The
 * non-monotonous DTS warnings end up baked into the muxed output and the
 * player stalls on the last frame of the first segment.
 *
 * @param videoUrls Array of video URLs to concatenate (in order)
 * @param onProgress Progress callback (0-100)
 * @returns Blob URL of the concatenated video
 */
export async function stitchVideos(
    videoUrls: string[],
    onProgress?: (progress: number) => void
): Promise<string> {
    if (videoUrls.length < 2) {
        throw new Error('At least 2 videos are required for stitching')
    }

    console.log('[FFmpeg] Starting stitch process for', videoUrls.length, 'videos')
    onProgress?.(5)

    const ff = await loadFFmpeg()
    onProgress?.(10)

    // Map FFmpeg's progress (0..~1.x — it can overshoot when the filter
    // graph emits frames past the estimated total duration, common with
    // concat + scale + pad chains) to the 40–89% slice. Clamping keeps the
    // bar from jumping to 105% before the post-encode 90/100 hits land.
    const onFfProgress = ({ progress }: { progress: number }) => {
        const raw = 40 + Math.round(progress * 50)
        const percent = Math.max(40, Math.min(89, raw))
        onProgress?.(percent)
    }
    ff.on('progress', onFfProgress)

    try {
        const inputFiles: string[] = []

        for (let i = 0; i < videoUrls.length; i++) {
            const filename = `input${i}.mp4`
            inputFiles.push(filename)

            const downloadProgress = 10 + Math.round((i / videoUrls.length) * 25) // 10-35%
            onProgress?.(downloadProgress)

            console.log(`[FFmpeg] Downloading video ${i + 1}/${videoUrls.length}...`)
            const videoData = await fetchVideoData(videoUrls[i])

            console.log(`[FFmpeg] Writing ${filename} to virtual filesystem...`)
            await ff.writeFile(filename, videoData)
        }

        onProgress?.(35)

        // Probe each input by running `ffmpeg -i <file>` (no output spec).
        // This makes ffmpeg dump stream info to its log channel and exit
        // with code 1, which is harmless — we just want to know whether
        // each clip has an audio stream and how long it is. AI-generated
        // videos are inconsistent: KIE/Veo usually carry audio, Kling and
        // MiniMax often don't, and the concat filter blows up if even one
        // input is missing the [N:a] stream.
        console.log('[FFmpeg] Probing inputs for audio + duration...')
        // SERIALISED on purpose — @ffmpeg/ffmpeg has a single worker and the
        // log channel is global. If we registered listeners for every input
        // up-front and let Promise.all run the execs back-to-back, every
        // listener would see every other input's log lines, so a clip with
        // an "Audio:" stream descriptor would falsely flip hasAudio=true on
        // a video-only sibling. Serialising guarantees exactly one listener
        // is attached during each ff.exec, so its hasAudio reading reflects
        // only the stream descriptors of the file actually being probed.
        //
        // The regex is also anchored to the canonical
        //   "Stream #N:N[...]: Audio: <codec> ..."
        // line so it doesn't match incidental occurrences of "Audio:" in
        // headers, version lines, or diagnostic messages.
        const audioStreamRe = /^\s*Stream\s+#\d+:\d+.*?Audio:/
        const durationRe = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/
        const probes: { hasAudio: boolean; durationSec: number }[] = []
        for (const f of inputFiles) {
            let hasAudio = false
            let durationSec = 5
            const onLog = ({ message }: { message: string }) => {
                if (audioStreamRe.test(message)) hasAudio = true
                const m = durationRe.exec(message)
                if (m) {
                    durationSec =
                        parseInt(m[1]) * 3600 +
                        parseInt(m[2]) * 60 +
                        parseFloat(m[3])
                }
            }
            ff.on('log', onLog)
            try {
                await ff.exec(['-i', f]).catch(() => undefined)
            } finally {
                ff.off('log', onLog)
            }
            probes.push({ hasAudio, durationSec })
        }
        for (let i = 0; i < probes.length; i++) {
            console.log(
                `[FFmpeg] input${i}: hasAudio=${probes[i].hasAudio}, duration=${probes[i].durationSec.toFixed(2)}s`,
            )
        }

        // Use the concat FILTER instead of the concat demuxer. The demuxer
        // pastes input bitstreams together at the byte level, which breaks
        // re-encoding because the decoder reads frames across the boundary
        // with mismatched SPS/PPS. The filter decodes each input
        // independently, normalises every stream to a common shape, and
        // concatenates decoded frames before re-encoding. Always produces
        // a valid output regardless of input differences.
        //
        // Each video stream is forced to 720x1280 / 24fps / yuv420p / SAR 1
        // and each audio stream to 44100Hz stereo fltp. Without this
        // normalisation the concat filter rejects inputs whose params don't
        // match exactly — even 2 pixels of height difference (e.g. Kling's
        // 716x1284 vs another 716x1286 output) is enough to kill it.
        //
        // For inputs with no audio stream we synthesise silence via the
        // anullsrc source filter (trimmed to the clip's duration) so the
        // concat node always sees both [v] and [a] for every clip — that's
        // strictly required by concat=v=1:a=1.
        const TARGET_W = 720
        const TARGET_H = 1280
        const TARGET_FPS = 24
        const N = videoUrls.length
        const filterChainParts: string[] = []
        const concatInputs: string[] = []
        for (let i = 0; i < N; i++) {
            filterChainParts.push(
                `[${i}:v]scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=decrease,` +
                `pad=${TARGET_W}:${TARGET_H}:(ow-iw)/2:(oh-ih)/2,` +
                `setsar=1,fps=${TARGET_FPS},format=yuv420p,setpts=PTS-STARTPTS[v${i}]`,
            )
            if (probes[i].hasAudio) {
                filterChainParts.push(
                    `[${i}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,` +
                    `asetpts=PTS-STARTPTS[a${i}]`,
                )
            } else {
                // anullsrc is a SOURCE filter — no input bracket needed.
                // atrim caps the silent stream to the matching clip duration
                // so concat lines up audio and video segments correctly.
                const dur = probes[i].durationSec.toFixed(3)
                filterChainParts.push(
                    `anullsrc=channel_layout=stereo:sample_rate=44100,` +
                    `atrim=0:${dur},asetpts=PTS-STARTPTS[a${i}]`,
                )
            }
            concatInputs.push(`[v${i}][a${i}]`)
        }
        const filterComplex =
            filterChainParts.join(';') +
            `;${concatInputs.join('')}concat=n=${N}:v=1:a=1[v][a]`

        const inputArgs: string[] = []
        for (const f of inputFiles) inputArgs.push('-i', f)

        onProgress?.(40)

        console.log('[FFmpeg] Running concat-filter + re-encode command...')
        console.log('[FFmpeg] filter_complex:', filterComplex)

        const exitCode = await ff.exec([
            ...inputArgs,
            '-filter_complex', filterComplex,
            '-map', '[v]',
            '-map', '[a]',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '23',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            'output.mp4'
        ])

        if (exitCode !== 0) {
            // Best-effort cleanup so the next attempt starts fresh.
            for (const f of inputFiles) {
                try { await ff.deleteFile(f) } catch { /* ignore */ }
            }
            throw new Error(`FFmpeg exited with code ${exitCode}. See [FFmpeg Log] lines above for the underlying cause.`)
        }

        console.log('[FFmpeg] Concat complete, reading output...')
        onProgress?.(90)

        const data = await ff.readFile('output.mp4')
        const blob = new Blob([data as BlobPart], { type: 'video/mp4' })
        const url = URL.createObjectURL(blob)

        console.log('[FFmpeg] Output URL created:', url)

        console.log('[FFmpeg] Cleaning up temporary files...')
        for (const file of inputFiles) {
            await ff.deleteFile(file)
        }
        await ff.deleteFile('output.mp4')

        onProgress?.(100)
        console.log('[FFmpeg] Stitch complete!')

        return url
    } catch (error) {
        console.error('[FFmpeg] Stitch error:', error)
        throw new Error('Failed to stitch videos. The videos may have incompatible formats.')
    } finally {
        // Detach the progress listener so a follow-up stitch doesn't end up
        // with N copies firing onProgress (the FFmpeg instance is cached).
        ff.off('progress', onFfProgress)
    }
}

// Legacy alias for callers that imported the explicit re-encode variant.
// Re-encoding is now the only path — see comment on stitchVideos.
export const stitchVideosWithReencode = stitchVideos
