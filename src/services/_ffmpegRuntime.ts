import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'

// Module-level singleton: thanks to ES module caching, any service that
// imports `loadFFmpeg` from this file shares the SAME FFmpeg instance
// (VideoStitchService, VideoEditService, etc.). Loading the runtime is
// expensive (~5s + CDN fetch), so reusing is critical.
let ffmpeg: FFmpeg | null = null
let isLoading = false
let loadPromise: Promise<FFmpeg> | null = null

const FFMPEG_CORE_VERSION = '0.12.6'
const CDN_HOSTS = [
    'https://cdn.jsdelivr.net/npm',
    'https://unpkg.com',
]

/** Reject the inner promise if it doesn't settle before `ms` milliseconds. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
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
export async function loadFFmpeg(): Promise<FFmpeg> {
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
export async function fetchVideoData(url: string): Promise<Uint8Array> {
    console.log('[FFmpeg] Fetching video:', url.substring(0, 50) + '...')

    const response = await fetch(url)
    if (!response.ok) {
        throw new Error(`Failed to fetch video: ${response.status}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    console.log('[FFmpeg] Video fetched, size:', Math.round(arrayBuffer.byteLength / 1024), 'KB')

    return new Uint8Array(arrayBuffer)
}
