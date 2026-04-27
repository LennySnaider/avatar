import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'

let ffmpeg: FFmpeg | null = null
let isLoading = false
let loadPromise: Promise<FFmpeg> | null = null

const FFMPEG_CORE_VERSION = '0.12.6'
const CDN_HOSTS = [
    'https://cdn.jsdelivr.net/npm',
    'https://unpkg.com',
]

/** Reject the inner promise if it doesn't settle before `ms` milliseconds. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
        promise.then(
            (v) => { clearTimeout(t); resolve(v) },
            (e) => { clearTimeout(t); reject(e) },
        )
    })
}

async function fetchFromCdnWithFallback(
    pkg: string,
    version: string,
    distDir: 'esm' | 'umd',
    file: string,
    mimeType: string,
): Promise<string> {
    let lastError: unknown
    for (const host of CDN_HOSTS) {
        const url = `${host}/${pkg}@${version}/dist/${distDir}/${file}`
        try {
            console.log(`[FFmpeg] Fetching ${url}`)
            return await withTimeout(
                toBlobURL(url, mimeType),
                20_000,
                `Fetch ${file} from ${host}`,
            )
        } catch (err) {
            console.warn(`[FFmpeg] CDN ${host} failed for ${file}:`, err)
            lastError = err
        }
    }
    throw lastError ?? new Error(`All CDNs failed for ${file}`)
}

/**
 * Initialize FFmpeg WASM with timeouts and CDN fallback.
 *
 * The hosting class worker (worker.js) is served from /public so its
 * relative imports `./const.js` and `./errors.js` resolve same-origin.
 * Loading it via blob URL doesn't work — the browser tries to resolve
 * those imports relative to the blob: origin, fails silently, and
 * ff.load() hangs forever. The UMD worker doesn't work either: it
 * uses webpack's require shim that throws "Cannot find module" when
 * called in a module worker (which is the only mode @ffmpeg/ffmpeg
 * supports for class workers).
 *
 * The ffmpeg-core comes from the ESM distribution because the worker
 * dynamic-imports it (`await import(_coreURL)`) and that requires the
 * file to be a real ES module with `export default`.
 */
async function loadFFmpeg(): Promise<FFmpeg> {
    if (ffmpeg) return ffmpeg
    if (isLoading && loadPromise) return loadPromise

    isLoading = true

    loadPromise = (async () => {
        console.log('[FFmpeg] Starting to load FFmpeg WASM...')

        const ff = new FFmpeg()
        ff.on('log', ({ message }) => {
            console.log('[FFmpeg Log]', message)
        })

        try {
            const [coreURL, wasmURL] = await Promise.all([
                fetchFromCdnWithFallback('@ffmpeg/core', FFMPEG_CORE_VERSION, 'esm', 'ffmpeg-core.js', 'text/javascript'),
                fetchFromCdnWithFallback('@ffmpeg/core', FFMPEG_CORE_VERSION, 'esm', 'ffmpeg-core.wasm', 'application/wasm'),
            ])
            // Must be absolute. @ffmpeg/ffmpeg does
            // `new URL(classWorkerURL, import.meta.url)` and Next.js's bundle
            // for `import.meta.url` resolves to a file:// stub, which makes a
            // relative '/ffmpeg-runtime/worker.js' end up as
            // file:///ffmpeg-runtime/worker.js — a SecurityError when the page
            // is served over https://. Anchor explicitly to the page origin.
            const classWorkerURL = `${window.location.origin}/ffmpeg-runtime/worker.js`
            console.log('[FFmpeg] Core (ESM), WASM fetched; class worker served from', classWorkerURL)

            console.log('[FFmpeg] Loading into FFmpeg instance...')

            await withTimeout(
                ff.load({ coreURL, wasmURL, classWorkerURL }),
                45_000,
                'FFmpeg instance load',
            )

            console.log('[FFmpeg] FFmpeg loaded successfully!')
            ffmpeg = ff
            return ff
        } catch (error) {
            console.error('[FFmpeg] Failed to load FFmpeg:', error)
            const message = error instanceof Error ? error.message : String(error)
            throw new Error(`Failed to load FFmpeg (${message}). Refresh and try again.`)
        } finally {
            isLoading = false
            if (!ffmpeg) loadPromise = null
        }
    })()

    return loadPromise
}

/**
 * Fetch video data from URL (handles both blob URLs and remote URLs)
 */
async function fetchVideoData(url: string): Promise<Uint8Array> {
    console.log('[FFmpeg] Fetching video:', url.substring(0, 50) + '...')

    const response = await fetch(url)
    if (!response.ok) {
        throw new Error(`Failed to fetch video: ${response.status}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    console.log('[FFmpeg] Video fetched, size:', Math.round(arrayBuffer.byteLength / 1024), 'KB')

    return new Uint8Array(arrayBuffer)
}

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

    ff.on('progress', ({ progress }) => {
        const percent = 40 + Math.round(progress * 50) // 40-90%
        onProgress?.(percent)
    })

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
        const probes = await Promise.all(
            inputFiles.map(async (f) => {
                let hasAudio = false
                let durationSec = 5
                const onLog = ({ message }: { message: string }) => {
                    if (/Audio:/.test(message)) hasAudio = true
                    const m = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(message)
                    if (m) {
                        durationSec =
                            parseInt(m[1]) * 3600 +
                            parseInt(m[2]) * 60 +
                            parseFloat(m[3])
                    }
                }
                ff.on('log', onLog)
                await ff.exec(['-i', f]).catch(() => undefined)
                ff.off('log', onLog)
                return { hasAudio, durationSec }
            }),
        )
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
    }
}

// Legacy alias for callers that imported the explicit re-encode variant.
// Re-encoding is now the only path — see comment on stitchVideos.
export const stitchVideosWithReencode = stitchVideos
