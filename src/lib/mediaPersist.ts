import sharp from 'sharp'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * Server-side media persistence helpers shared across generation providers
 * (KIE, Vercel AI Gateway, …). Lives outside any `'use server'` module so its
 * synchronous-ish helpers can be imported by several server actions without
 * each becoming its own RPC endpoint.
 */

/**
 * Center-crop an image buffer to an exact aspect ratio (e.g. "9:16").
 *
 * Some image models only render a fixed set of sizes (OpenAI gpt-image →
 * 1:1 / 3:2 / 2:3), so a requested 9:16 comes back shorter than the same
 * prompt through Gemini. Because every UI ratio is narrower (or wider) than
 * what those models produce, the target rectangle always fits inside the
 * source, so a center-crop is enough and never needs padding — it trims the
 * excess width (or height), leaving the image as tall as the native providers'.
 */
export async function centerCropToAspect(buffer: Buffer, aspectRatio: string): Promise<Buffer> {
    const [wRatio, hRatio] = aspectRatio.split(':').map(Number)
    if (!wRatio || !hRatio) return buffer

    const targetRatio = wRatio / hRatio
    const image = sharp(buffer)
    const { width, height } = await image.metadata()
    if (!width || !height) return buffer

    const currentRatio = width / height
    // Already matches (within ~1%): nothing to do.
    if (Math.abs(currentRatio - targetRatio) / targetRatio < 0.01) return buffer

    let cropW = width
    let cropH = height
    if (currentRatio > targetRatio) {
        // Source is too wide → trim width.
        cropW = Math.round(height * targetRatio)
    } else {
        // Source is too tall → trim height.
        cropH = Math.round(width / targetRatio)
    }

    const left = Math.round((width - cropW) / 2)
    const top = Math.round((height - cropH) / 2)

    return image.extract({ left, top, width: cropW, height: cropH }).toBuffer()
}

/**
 * Upload a raw buffer to the public `generations` bucket and return its public
 * URL. The single source of truth for how generated media lands in Supabase.
 */
export async function uploadBufferToGenerations(
    buffer: Buffer,
    fileName: string,
    contentType: string,
): Promise<string> {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not defined')

    const supabase = createServerSupabaseClient()
    const { error } = await supabase.storage
        .from('generations')
        .upload(fileName, buffer, {
            contentType,
            cacheControl: '3600',
            upsert: false,
        })
    if (error) throw new Error(`Failed to persist media: ${error.message}`)

    return `${SUPABASE_URL}/storage/v1/object/public/generations/${fileName}`
}

/**
 * Persist an in-memory image buffer (e.g. base64 returned by the AI Gateway)
 * to Supabase, optionally center-cropping to a requested aspect ratio first.
 */
export async function persistImageBufferToSupabase(
    buffer: Buffer,
    ext: 'png' | 'jpg',
    subfolder: string,
    cropToAspect?: string,
): Promise<string> {
    let out = buffer
    if (cropToAspect) {
        try {
            out = await centerCropToAspect(buffer, cropToAspect)
        } catch (err) {
            console.warn(`[mediaPersist] center-crop to ${cropToAspect} failed, keeping original:`, err)
        }
    }

    const contentType = `image/${ext === 'jpg' ? 'jpeg' : 'png'}`
    const fileName = `${subfolder}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${ext}`
    return uploadBufferToGenerations(out, fileName, contentType)
}
