'use server'

import { createServerSupabaseClient } from '@/lib/supabase'
import { v4 as uuidv4 } from 'uuid'

/**
 * Merges an audio track with a video by calling FFmpeg via a temporary
 * server-side process. Uses Supabase Storage for input/output.
 *
 * Strategy: Upload both files to a temp location, call FFmpeg CLI
 * to merge, upload result, clean up temps.
 *
 * NOTE: This requires FFmpeg installed on the server (Vercel Functions
 * have a 250MB limit — for production, use a dedicated media processing
 * service or a serverless FFmpeg layer). For MVP, we use the /tmp
 * directory available in serverless functions.
 */
export async function mergeAudioVideo(params: {
    videoUrl: string
    audioBuffer: Buffer
    userId: string
    outputFilename?: string
}): Promise<{ storagePath: string; publicUrl: string }> {
    const { videoUrl, audioBuffer, userId, outputFilename } = params
    const supabase = createServerSupabaseClient()

    // 1. Upload audio to temp storage
    const tempAudioPath = `temp/${userId}/${uuidv4()}.mp3`
    const { error: audioUploadError } = await supabase.storage
        .from('generations')
        .upload(tempAudioPath, audioBuffer, {
            contentType: 'audio/mpeg',
            upsert: true,
        })
    if (audioUploadError) {
        throw new Error(`Failed to upload temp audio: ${audioUploadError.message}`)
    }

    // 2. Get signed URLs for both files
    const { data: audioSignedUrl } = await supabase.storage
        .from('generations')
        .createSignedUrl(tempAudioPath, 300)

    if (!audioSignedUrl?.signedUrl) {
        throw new Error('Failed to get signed URL for audio')
    }

    // 3. Call external merge endpoint or use FFmpeg
    // For MVP: download both, merge with FFmpeg via child_process, upload result
    const { execSync } = await import('child_process')
    const { writeFileSync, readFileSync, unlinkSync, mkdirSync, existsSync } = await import('fs')
    const path = await import('path')

    const tmpDir = '/tmp/audio-merge'
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true })

    const jobId = uuidv4()
    const tmpVideo = path.join(tmpDir, `${jobId}-video.mp4`)
    const tmpAudio = path.join(tmpDir, `${jobId}-audio.mp3`)
    const tmpOutput = path.join(tmpDir, `${jobId}-output.mp4`)

    try {
        // Download video
        const videoRes = await fetch(videoUrl)
        const videoArrayBuffer = await videoRes.arrayBuffer()
        writeFileSync(tmpVideo, Buffer.from(videoArrayBuffer))

        // Write audio
        writeFileSync(tmpAudio, audioBuffer)

        // Merge: replace audio track in video with our TTS audio
        // -shortest: cut to shorter of the two streams
        execSync(
            `ffmpeg -y -i "${tmpVideo}" -i "${tmpAudio}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${tmpOutput}"`,
            { timeout: 60000 }
        )

        // Read merged file
        const mergedBuffer = readFileSync(tmpOutput)

        // Upload to Supabase Storage
        const finalPath = `${userId}/videos/${outputFilename || `merged-${jobId}.mp4`}`
        const { error: uploadError } = await supabase.storage
            .from('generations')
            .upload(finalPath, mergedBuffer, {
                contentType: 'video/mp4',
                upsert: true,
            })

        if (uploadError) {
            throw new Error(`Failed to upload merged video: ${uploadError.message}`)
        }

        const { data: publicUrlData } = supabase.storage
            .from('generations')
            .getPublicUrl(finalPath)

        return {
            storagePath: finalPath,
            publicUrl: publicUrlData.publicUrl,
        }
    } finally {
        // Cleanup temp files
        for (const f of [tmpVideo, tmpAudio, tmpOutput]) {
            try { unlinkSync(f) } catch { /* ignore */ }
        }
        // Cleanup temp audio from storage
        await supabase.storage.from('generations').remove([tempAudioPath])
    }
}
