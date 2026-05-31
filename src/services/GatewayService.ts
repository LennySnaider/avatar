'use server'

import { experimental_generateImage as generateImage } from 'ai'
import { persistImageBufferToSupabase } from '@/lib/mediaPersist'

/**
 * Vercel AI Gateway image generation.
 *
 * Routes a plain `provider/model` string (e.g. `openai/gpt-image-2`) through
 * the AI Gateway. Auth is resolved automatically by the AI SDK from the
 * `AI_GATEWAY_API_KEY` env var (falls back to OIDC on Vercel).
 *
 * This is the spike provider — one image model behind the unified hub, so we
 * can A/B it in the UI against the current KIE/Gemini paths before migrating
 * the rest of the catalog.
 */

/**
 * Map a UI aspect ratio to the nearest size OpenAI's gpt-image models accept
 * (only 1024x1024 / 1536x1024 / 1024x1536). The exact ratio (9:16, 4:3, …) is
 * then enforced downstream by center-cropping the result — same strategy the
 * KIE GPT-4o path uses.
 */
function aspectRatioToGptImageSize(aspectRatio?: string): '1024x1024' | '1536x1024' | '1024x1536' {
    if (!aspectRatio) return '1024x1024'
    const [w, h] = aspectRatio.split(':').map(Number)
    if (!w || !h) return '1024x1024'
    const ratio = w / h
    if (ratio > 1.1) return '1536x1024' // landscape (16:9, 4:3, 3:2)
    if (ratio < 0.9) return '1024x1536' // portrait (9:16, 3:4, 2:3)
    return '1024x1024' // square-ish
}

export async function generateImageViaGateway(params: {
    prompt: string
    aspectRatio?: string
    modelName?: string
}): Promise<
    | { success: true; url: string; fullApiPrompt: string }
    | { success: false; error: string }
> {
    const { prompt, aspectRatio, modelName = 'openai/gpt-image-2' } = params

    if (!process.env.AI_GATEWAY_API_KEY) {
        return { success: false, error: 'AI_GATEWAY_API_KEY is not configured in environment variables' }
    }

    try {
        const size = aspectRatioToGptImageSize(aspectRatio)
        console.log(`[Gateway] generateImage model=${modelName} size=${size}`)

        const { image } = await generateImage({
            model: modelName,
            prompt,
            size,
        })

        // The AI SDK returns the image as a base64 string + Uint8Array. Derive
        // the extension from the real mediaType — models differ (gpt-image →
        // PNG, seedream → JPEG) and mislabeling breaks viewers/downloads.
        // Persist to Supabase, center-cropping to the exact requested ratio
        // (gpt-image only renders 2:3/3:2, so 9:16 etc. needs the crop).
        const ext = image.mediaType === 'image/jpeg' ? 'jpg' : 'png'
        const buffer = Buffer.from(image.uint8Array)
        const url = await persistImageBufferToSupabase(buffer, ext, 'gateway-images', aspectRatio)

        console.log(`[Gateway] Generation complete: ${url}`)
        return { success: true, url, fullApiPrompt: prompt }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[Gateway] Image generation failed:', message)
        return { success: false, error: message }
    }
}
