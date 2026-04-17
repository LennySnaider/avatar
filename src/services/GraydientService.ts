'use server'

/**
 * Graydient AI Service — Fallback image provider
 *
 * Used when Gemini blocks generation due to safety filters.
 * Graydient uses SD/SDXL/Flux models which are more permissive
 * and flag NSFW content instead of blocking it.
 *
 * API: https://cloud.graydient.ai/api/v3/
 * Auth: Bearer token
 * Flow: POST /render → poll GET /render/{hash} → return image URL
 */

const GRAYDIENT_BASE_URL = 'https://cloud.graydient.ai/api/v3'
const POLL_INTERVAL_MS = 3000
const MAX_POLL_ATTEMPTS = 40 // ~2 minutes max wait

interface GraydientRenderResponse {
    data: {
        id: string
        type: string
        attributes: {
            render_hash: string
            has_been_rendered: boolean
            estimated_render_time: number
            estimated_wait_time: number
            session_id: string
            clean_prompt: string
            task: string
            is_nsfw: boolean
            images: GraydientImage[]
        }
    }
}

interface GraydientImage {
    id: string
    url: string
    render_options: Record<string, unknown>
}

function getApiToken(): string {
    const token = process.env.GRAYDIENT_API_TOKEN
    if (!token) {
        throw new Error('GRAYDIENT_API_TOKEN is not configured in environment variables')
    }
    return token
}

async function submitRender(params: {
    prompt: string
    initImageUrl?: string
    width?: number
    height?: number
}): Promise<string> {
    const token = getApiToken()
    const { prompt, initImageUrl, width = 1024, height = 1024 } = params

    const body: Record<string, unknown> = {
        prompt: `/workflow /run:txt2img ${prompt} --width ${width} --height ${height}`,
        callback_url: 'https://placeholder.invalid/webhook',
    }

    if (initImageUrl) {
        body.init_image = initImageUrl
        body.prompt = `/workflow /run:img2img ${prompt} --width ${width} --height ${height}`
    }

    const response = await fetch(`${GRAYDIENT_BASE_URL}/render/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/vnd.api+json',
            'Accept': 'application/vnd.api+json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    })

    if (!response.ok) {
        const text = await response.text()
        throw new Error(`Graydient render submit failed (${response.status}): ${text}`)
    }

    const data = (await response.json()) as GraydientRenderResponse
    const renderHash = data.data?.attributes?.render_hash || data.data?.id

    if (!renderHash) {
        throw new Error('Graydient did not return a render_hash')
    }

    console.log(`[GraydientService] Render submitted: ${renderHash}, estimated time: ${data.data.attributes.estimated_render_time}s`)
    return renderHash
}

async function pollForResult(renderHash: string): Promise<GraydientImage[]> {
    const token = getApiToken()

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))

        const response = await fetch(`${GRAYDIENT_BASE_URL}/render/${renderHash}`, {
            headers: {
                'Accept': 'application/vnd.api+json',
                'Authorization': `Bearer ${token}`,
            },
        })

        if (!response.ok) {
            console.warn(`[GraydientService] Poll attempt ${attempt + 1} failed: ${response.status}`)
            continue
        }

        const data = (await response.json()) as GraydientRenderResponse
        const attrs = data.data?.attributes

        if (attrs?.has_been_rendered && attrs.images?.length > 0) {
            console.log(`[GraydientService] Render complete after ${attempt + 1} polls, ${attrs.images.length} image(s)`)
            return attrs.images
        }
    }

    throw new Error(`Graydient render timed out after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000}s`)
}

function getAspectDimensions(aspectRatio: string): { width: number; height: number } {
    switch (aspectRatio) {
        case '1:1': return { width: 1024, height: 1024 }
        case '3:4': return { width: 768, height: 1024 }
        case '4:3': return { width: 1024, height: 768 }
        case '9:16': return { width: 576, height: 1024 }
        case '16:9': return { width: 1024, height: 576 }
        default: return { width: 1024, height: 1024 }
    }
}

/**
 * Generate an image using Graydient AI as fallback.
 * Returns the image as a data URI (base64) to match Gemini's response format.
 */
export async function generateImageWithGraydient(params: {
    prompt: string
    aspectRatio?: string
    initImageUrl?: string
}): Promise<{
    success: true
    url: string
    fullApiPrompt: string
    provider: 'graydient'
} | {
    success: false
    error: string
}> {
    const { prompt, aspectRatio = '1:1', initImageUrl } = params

    try {
        const { width, height } = getAspectDimensions(aspectRatio)

        console.log(`[GraydientService] Starting generation: ${width}x${height}, prompt length: ${prompt.length}`)

        const renderHash = await submitRender({
            prompt,
            initImageUrl,
            width,
            height,
        })

        const images = await pollForResult(renderHash)
        const firstImage = images[0]

        if (!firstImage?.url) {
            return { success: false, error: 'Graydient returned no image URL' }
        }

        // Fetch the image and convert to base64 data URI to match Gemini format
        const imageResponse = await fetch(firstImage.url)
        if (!imageResponse.ok) {
            return { success: false, error: `Failed to fetch Graydient image: ${imageResponse.status}` }
        }

        const imageBuffer = await imageResponse.arrayBuffer()
        const base64 = Buffer.from(imageBuffer).toString('base64')
        const contentType = imageResponse.headers.get('content-type') || 'image/png'
        const dataUri = `data:${contentType};base64,${base64}`

        console.log(`[GraydientService] Generation complete, image size: ${imageBuffer.byteLength} bytes`)

        return {
            success: true,
            url: dataUri,
            fullApiPrompt: prompt,
            provider: 'graydient',
        }
    } catch (error) {
        console.error('[GraydientService] Generation failed:', error)
        const message = error instanceof Error ? error.message : 'Error desconocido en Graydient'
        return { success: false, error: message }
    }
}
