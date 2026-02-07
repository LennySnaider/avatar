import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'

let ffmpeg: FFmpeg | null = null
let isLoading = false
let loadPromise: Promise<FFmpeg> | null = null

/**
 * Initialize FFmpeg WASM with timeout
 */
async function loadFFmpeg(): Promise<FFmpeg> {
    // If already loaded, return immediately
    if (ffmpeg) {
        return ffmpeg
    }

    // If currently loading, wait for the existing promise
    if (isLoading && loadPromise) {
        return loadPromise
    }

    isLoading = true

    loadPromise = (async () => {
        console.log('[FFmpeg] Starting to load FFmpeg WASM...')

        const ff = new FFmpeg()

        // Add logging
        ff.on('log', ({ message }) => {
            console.log('[FFmpeg Log]', message)
        })

        try {
            // Load FFmpeg core from CDN with timeout
            const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'

            console.log('[FFmpeg] Loading core from CDN...')

            const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript')
            const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm')

            console.log('[FFmpeg] Core URLs prepared, loading into FFmpeg...')

            await ff.load({
                coreURL,
                wasmURL,
            })

            console.log('[FFmpeg] FFmpeg loaded successfully!')
            ffmpeg = ff
            return ff
        } catch (error) {
            console.error('[FFmpeg] Failed to load FFmpeg:', error)
            isLoading = false
            loadPromise = null
            throw new Error('Failed to load FFmpeg. Please refresh the page and try again.')
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
 * Concatenate multiple videos into one
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

    // Set up progress handler
    ff.on('progress', ({ progress }) => {
        const percent = 40 + Math.round(progress * 50) // 40-90%
        onProgress?.(percent)
    })

    try {
        // Download all videos and write them to FFmpeg's virtual filesystem
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

        // Create concat file list
        const concatList = inputFiles.map(f => `file '${f}'`).join('\n')
        console.log('[FFmpeg] Concat list:', concatList)
        await ff.writeFile('concat.txt', concatList)

        onProgress?.(40)

        console.log('[FFmpeg] Running concat command...')

        // Run FFmpeg concat command
        await ff.exec([
            '-f', 'concat',
            '-safe', '0',
            '-i', 'concat.txt',
            '-c', 'copy',
            '-movflags', '+faststart',
            'output.mp4'
        ])

        console.log('[FFmpeg] Concat complete, reading output...')
        onProgress?.(90)

        // Read the output file
        const data = await ff.readFile('output.mp4')
        const blob = new Blob([data as BlobPart], { type: 'video/mp4' })
        const url = URL.createObjectURL(blob)

        console.log('[FFmpeg] Output URL created:', url)

        // Clean up files
        console.log('[FFmpeg] Cleaning up temporary files...')
        for (const file of inputFiles) {
            await ff.deleteFile(file)
        }
        await ff.deleteFile('concat.txt')
        await ff.deleteFile('output.mp4')

        onProgress?.(100)
        console.log('[FFmpeg] Stitch complete!')

        return url
    } catch (error) {
        console.error('[FFmpeg] Stitch error:', error)
        throw new Error('Failed to stitch videos. The videos may have incompatible formats.')
    }
}

/**
 * Re-encode and concatenate videos (slower but more compatible)
 * Use this if the fast method fails due to codec incompatibility
 */
export async function stitchVideosWithReencode(
    videoUrls: string[],
    onProgress?: (progress: number) => void
): Promise<string> {
    if (videoUrls.length < 2) {
        throw new Error('At least 2 videos are required for stitching')
    }

    const ff = await loadFFmpeg()

    ff.on('progress', ({ progress }) => {
        onProgress?.(30 + Math.round(progress * 60)) // 30-90%
    })

    try {
        const inputFiles: string[] = []

        for (let i = 0; i < videoUrls.length; i++) {
            const filename = `input${i}.mp4`
            inputFiles.push(filename)

            onProgress?.(Math.round((i / videoUrls.length) * 30))

            const videoData = await fetchVideoData(videoUrls[i])
            await ff.writeFile(filename, videoData)
        }

        const concatList = inputFiles.map(f => `file '${f}'`).join('\n')
        await ff.writeFile('concat.txt', concatList)

        // Re-encode with common settings for better compatibility
        await ff.exec([
            '-f', 'concat',
            '-safe', '0',
            '-i', 'concat.txt',
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            'output.mp4'
        ])

        onProgress?.(95)

        const data = await ff.readFile('output.mp4')
        const blob = new Blob([data as BlobPart], { type: 'video/mp4' })
        const url = URL.createObjectURL(blob)

        // Clean up
        for (const file of inputFiles) {
            await ff.deleteFile(file)
        }
        await ff.deleteFile('concat.txt')
        await ff.deleteFile('output.mp4')

        onProgress?.(100)

        return url
    } catch (error) {
        console.error('[FFmpeg] Stitch with re-encode error:', error)
        throw new Error('Failed to stitch videos')
    }
}
