import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

let ffmpeg: FFmpeg | null = null
let isLoaded = false

/**
 * Initialize FFmpeg WASM
 */
async function loadFFmpeg(): Promise<FFmpeg> {
    if (ffmpeg && isLoaded) {
        return ffmpeg
    }

    ffmpeg = new FFmpeg()

    // Load FFmpeg core from CDN
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'
    await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    })

    isLoaded = true
    return ffmpeg
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

    const ff = await loadFFmpeg()

    // Set up progress handler
    ff.on('progress', ({ progress }) => {
        onProgress?.(Math.round(progress * 100))
    })

    try {
        // Download all videos and write them to FFmpeg's virtual filesystem
        const inputFiles: string[] = []

        for (let i = 0; i < videoUrls.length; i++) {
            const filename = `input${i}.mp4`
            inputFiles.push(filename)

            onProgress?.(Math.round((i / videoUrls.length) * 30)) // 0-30% for downloading

            const videoData = await fetchFile(videoUrls[i])
            await ff.writeFile(filename, videoData)
        }

        // Create concat file list
        const concatList = inputFiles.map(f => `file '${f}'`).join('\n')
        await ff.writeFile('concat.txt', concatList)

        onProgress?.(35) // 35% - files written

        // Run FFmpeg concat command
        // -f concat: use concat demuxer
        // -safe 0: allow any file paths
        // -i concat.txt: input from concat list
        // -c copy: copy codecs (fast, no re-encoding)
        await ff.exec([
            '-f', 'concat',
            '-safe', '0',
            '-i', 'concat.txt',
            '-c', 'copy',
            'output.mp4'
        ])

        onProgress?.(90) // 90% - concat done

        // Read the output file
        const data = await ff.readFile('output.mp4')
        const blob = new Blob([data as BlobPart], { type: 'video/mp4' })
        const url = URL.createObjectURL(blob)

        // Clean up files
        for (const file of inputFiles) {
            await ff.deleteFile(file)
        }
        await ff.deleteFile('concat.txt')
        await ff.deleteFile('output.mp4')

        onProgress?.(100)

        return url
    } catch (error) {
        console.error('Video stitch error:', error)
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
        // Re-encoding takes longer, scale progress accordingly
        onProgress?.(30 + Math.round(progress * 60)) // 30-90%
    })

    try {
        // Download all videos
        const inputFiles: string[] = []

        for (let i = 0; i < videoUrls.length; i++) {
            const filename = `input${i}.mp4`
            inputFiles.push(filename)

            onProgress?.(Math.round((i / videoUrls.length) * 30))

            const videoData = await fetchFile(videoUrls[i])
            await ff.writeFile(filename, videoData)
        }

        // Create concat file
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
        console.error('Video stitch with re-encode error:', error)
        throw new Error('Failed to stitch videos')
    }
}
