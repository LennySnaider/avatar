'use server'

import { createServerSupabaseClient } from '@/lib/supabase'
import type {
    KieCreateTaskRequest,
    KieCreateTaskResponse,
    KieRecordInfoResponse,
    KieResultJsonShape,
    KieFluxKontextRecordInfoResponse,
} from '@/@types/kie'

const KIE_API_BASE = 'https://api.kie.ai/api/v1'

function getApiKey(): string {
    const key = process.env.KIE_API_KEY
    if (!key) throw new Error('KIE_API_KEY is not defined')
    return key
}

function authHeaders(): Record<string, string> {
    return {
        Authorization: `Bearer ${getApiKey()}`,
        'Content-Type': 'application/json',
    }
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
        p.then(
            (v) => { clearTimeout(t); resolve(v) },
            (e) => { clearTimeout(t); reject(e) },
        )
    })
}

async function submitTask(body: KieCreateTaskRequest): Promise<string> {
    const res = await fetch(`${KIE_API_BASE}/jobs/createTask`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
    })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(`KIE createTask failed (${res.status}): ${text}`)
    }
    const json: KieCreateTaskResponse = await res.json()
    if (json.code !== 200 || !json.data?.taskId) {
        throw new Error(`KIE createTask error: code=${json.code} msg=${json.msg}`)
    }
    return json.data.taskId
}

async function pollTask(
    taskId: string,
    options?: { maxAttempts?: number; intervalMs?: number },
): Promise<string[]> {
    const maxAttempts = options?.maxAttempts ?? 120
    const intervalMs = options?.intervalMs ?? 5000

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const res = await fetch(
            `${KIE_API_BASE}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
            { headers: authHeaders() },
        )
        if (!res.ok) {
            const text = await res.text()
            throw new Error(`KIE recordInfo failed (${res.status}): ${text}`)
        }
        const json: KieRecordInfoResponse = await res.json()
        const state = json.data?.state

        if (state === 'success') {
            const parsed: KieResultJsonShape = json.data.resultJson
                ? JSON.parse(json.data.resultJson)
                : {}
            const urls = parsed.resultUrls ?? []
            if (urls.length === 0) {
                throw new Error('KIE task succeeded but returned no resultUrls')
            }
            return urls
        }
        if (state === 'fail') {
            throw new Error(
                `KIE task failed: ${json.data.failCode || ''} ${json.data.failMsg || 'Unknown error'}`,
            )
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs))
    }
    throw new Error(`KIE task timed out after ${(maxAttempts * intervalMs) / 1000}s`)
}

/**
 * Upload a base64 image to Supabase Storage and return a public URL.
 * Used to pass image references to KIE endpoints that only accept HTTP URLs
 * (Flux Kontext, GPT 4o Image), not data URIs.
 */
async function uploadReferenceToSupabase(
    base64: string,
    mimeType: string,
): Promise<string> {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not defined')

    const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64
    const buffer = Buffer.from(cleanBase64, 'base64')

    const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg'
    const fileName = `kie-refs/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${ext}`

    const supabase = createServerSupabaseClient()
    const { error } = await supabase.storage
        .from('generations')
        .upload(fileName, buffer, {
            contentType: mimeType,
            cacheControl: '300',
            upsert: false,
        })
    if (error) throw new Error(`Failed to upload KIE reference: ${error.message}`)

    return `${SUPABASE_URL}/storage/v1/object/public/generations/${fileName}`
}

/**
 * Download a result URL and re-upload to Supabase Storage so we have a stable
 * URL that doesn't depend on KIE's CDN expiration / CORS rules.
 */
async function persistToSupabase(
    sourceUrl: string,
    extension: 'mp4' | 'png' | 'jpg',
    subfolder: string,
): Promise<string> {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not defined')

    const res = await fetch(sourceUrl)
    if (!res.ok) throw new Error(`Failed to download KIE result (${res.status})`)
    const buffer = Buffer.from(await res.arrayBuffer())

    const contentType = extension === 'mp4' ? 'video/mp4' : `image/${extension === 'jpg' ? 'jpeg' : 'png'}`
    const fileName = `${subfolder}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${extension}`

    const supabase = createServerSupabaseClient()
    const { error } = await supabase.storage
        .from('generations')
        .upload(fileName, buffer, {
            contentType,
            cacheControl: '3600',
            upsert: false,
        })
    if (error) throw new Error(`Failed to persist KIE result: ${error.message}`)

    return `${SUPABASE_URL}/storage/v1/object/public/generations/${fileName}`
}

export interface GenerateImageKieParams {
    prompt: string
    model: string
    aspectRatio?: string
    referenceImage?: { base64: string; mimeType: string } | null
}

/**
 * Generate an image via KIE AI. Routes to the right endpoint based on the
 * model family — KIE has dedicated endpoints per family, not a single unified
 * createTask for everything.
 */
export async function generateImageKie(
    params: GenerateImageKieParams,
): Promise<{ url: string; fullApiPrompt: string }> {
    const { prompt, model, aspectRatio = '1:1', referenceImage } = params

    if (model.startsWith('flux-kontext')) {
        return generateImageFluxKontext({ prompt, model, aspectRatio, referenceImage })
    }
    if (model === 'gpt-4o-image') {
        return generateImageGpt4o({ prompt, model, aspectRatio, referenceImage })
    }

    // Fallback to generic createTask flow (Grok and others)
    const input: Record<string, unknown> = { prompt, aspect_ratio: aspectRatio }
    let resolvedModel = model
    if (referenceImage) {
        resolvedModel = model.replace('/text-to-image', '/image-to-image')
        input.image_url = `data:${referenceImage.mimeType};base64,${referenceImage.base64}`
    }

    console.log(`[KIE] Submitting generic image task: model=${resolvedModel}`)
    const taskId = await withTimeout(
        submitTask({ model: resolvedModel, input }),
        30_000,
        'KIE image submit',
    )
    const urls = await pollTask(taskId, { maxAttempts: 60, intervalMs: 3000 })
    const persistedUrl = await persistToSupabase(urls[0], 'png', 'kie-images')
    return { url: persistedUrl, fullApiPrompt: prompt }
}

/**
 * Flux Kontext uses a dedicated endpoint with camelCase fields and a different
 * polling response shape (successFlag + resultImageUrl instead of state +
 * resultJson). It supports text-to-image and image-to-image in the same
 * endpoint — pass `inputImage` to enable edit mode.
 */
async function generateImageFluxKontext(params: GenerateImageKieParams): Promise<{ url: string; fullApiPrompt: string }> {
    const { prompt, model, aspectRatio = '1:1', referenceImage } = params

    const body: Record<string, unknown> = {
        prompt,
        model,
        aspectRatio,
        outputFormat: 'png',
    }
    if (referenceImage) {
        // Flux Kontext only accepts public HTTP URLs for inputImage, not data URIs.
        // Upload to Supabase first to get a stable public URL.
        const uploadedUrl = await uploadReferenceToSupabase(
            referenceImage.base64,
            referenceImage.mimeType,
        )
        console.log(`[KIE/Flux] Uploaded reference to: ${uploadedUrl}`)
        body.inputImage = uploadedUrl
    }

    console.log(`[KIE/Flux] Submitting: model=${model}, hasReference=${!!referenceImage}`)
    const submitRes = await withTimeout(
        fetch(`${KIE_API_BASE}/flux/kontext/generate`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(body),
        }),
        30_000,
        'KIE Flux Kontext submit',
    )
    if (!submitRes.ok) {
        const text = await submitRes.text()
        throw new Error(`KIE Flux Kontext submit failed (${submitRes.status}): ${text}`)
    }
    const submitJson: KieCreateTaskResponse = await submitRes.json()
    if (submitJson.code !== 200 || !submitJson.data?.taskId) {
        throw new Error(`KIE Flux Kontext submit error: code=${submitJson.code} msg=${submitJson.msg}`)
    }
    const taskId = submitJson.data.taskId
    console.log(`[KIE/Flux] Task submitted: ${taskId}`)

    // Poll the dedicated record-info endpoint
    const maxAttempts = 60
    const intervalMs = 3000
    let resultUrl: string | undefined

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const res = await fetch(
            `${KIE_API_BASE}/flux/kontext/record-info?taskId=${encodeURIComponent(taskId)}`,
            { headers: authHeaders() },
        )
        if (!res.ok) {
            const text = await res.text()
            throw new Error(`KIE Flux Kontext poll failed (${res.status}): ${text}`)
        }
        const json: KieFluxKontextRecordInfoResponse = await res.json()
        const flag = json.data?.successFlag

        if (flag === 1 && json.data.resultImageUrl) {
            resultUrl = json.data.resultImageUrl
            break
        }
        if (flag === 2 || flag === 3) {
            throw new Error(`KIE Flux Kontext failed (flag=${flag}): ${json.data.errorMessage || 'Unknown'}`)
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs))
    }
    if (!resultUrl) {
        throw new Error(`KIE Flux Kontext timed out after ${(maxAttempts * intervalMs) / 1000}s`)
    }

    console.log(`[KIE/Flux] Generation complete: ${resultUrl}`)
    const persistedUrl = await persistToSupabase(resultUrl, 'png', 'kie-images')
    return { url: persistedUrl, fullApiPrompt: prompt }
}

export interface GenerateVideoKieParams {
    prompt: string
    model: string
    firstFrameImage?: { base64: string; mimeType: string } | null
    aspectRatio?: string
    duration?: number
    resolution?: string
}

/**
 * Map standard aspect ratios to GPT 4o Image's supported `size` values.
 * GPT 4o only supports 1:1, 3:2, 2:3 — collapse other ratios to nearest.
 */
function aspectRatioToGptSize(aspectRatio: string): '1:1' | '3:2' | '2:3' {
    if (aspectRatio === '1:1') return '1:1'
    // Landscape variants → 3:2
    if (aspectRatio === '16:9' || aspectRatio === '4:3' || aspectRatio === '3:2') return '3:2'
    // Portrait variants → 2:3
    return '2:3'
}

/**
 * GPT 4o Image (OpenAI) via KIE's dedicated endpoint. Like Flux Kontext, it
 * needs reference images uploaded to a public URL first — `filesUrl` is an
 * array of URLs, NOT base64. Async pattern via taskId + recordInfo polling.
 */
async function generateImageGpt4o(params: GenerateImageKieParams): Promise<{ url: string; fullApiPrompt: string }> {
    const { prompt, aspectRatio = '1:1', referenceImage } = params

    const body: Record<string, unknown> = {
        prompt,
        size: aspectRatioToGptSize(aspectRatio),
        nVariants: 1,
        isEnhance: false,
    }

    if (referenceImage) {
        const uploadedUrl = await uploadReferenceToSupabase(
            referenceImage.base64,
            referenceImage.mimeType,
        )
        console.log(`[KIE/GPT4o] Uploaded reference to: ${uploadedUrl}`)
        body.filesUrl = [uploadedUrl]
    }

    console.log(`[KIE/GPT4o] Submitting, hasReference=${!!referenceImage}`)
    const submitRes = await withTimeout(
        fetch(`${KIE_API_BASE}/gpt4o-image/generate`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(body),
        }),
        30_000,
        'KIE GPT4o submit',
    )
    if (!submitRes.ok) {
        const text = await submitRes.text()
        throw new Error(`KIE GPT4o submit failed (${submitRes.status}): ${text}`)
    }
    const submitJson: KieCreateTaskResponse = await submitRes.json()
    if (submitJson.code !== 200 || !submitJson.data?.taskId) {
        throw new Error(`KIE GPT4o submit error: code=${submitJson.code} msg=${submitJson.msg}`)
    }
    const taskId = submitJson.data.taskId
    console.log(`[KIE/GPT4o] Task submitted: ${taskId}`)

    // GPT 4o has its own /gpt4o-image/record-info with successFlag (0=running, 1=success)
    const maxAttempts = 60
    const intervalMs = 3000
    let resultUrl: string | undefined

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const res = await fetch(
            `${KIE_API_BASE}/gpt4o-image/record-info?taskId=${encodeURIComponent(taskId)}`,
            { headers: authHeaders() },
        )
        if (!res.ok) {
            const text = await res.text()
            throw new Error(`KIE GPT4o poll failed (${res.status}): ${text}`)
        }
        const json = await res.json() as {
            code: number
            data: {
                taskId: string
                successFlag?: number
                status?: string
                response?: { resultUrls?: string[] }
                errorCode?: string
                errorMessage?: string
            }
        }
        const flag = json.data?.successFlag
        const urls = json.data?.response?.resultUrls

        if (flag === 1 && urls && urls.length > 0) {
            resultUrl = urls[0]
            break
        }
        if (flag === 2 || flag === 3) {
            throw new Error(`KIE GPT4o failed (flag=${flag}): ${json.data.errorMessage || 'Unknown'}`)
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs))
    }
    if (!resultUrl) {
        throw new Error(`KIE GPT4o timed out after ${(maxAttempts * intervalMs) / 1000}s`)
    }

    console.log(`[KIE/GPT4o] Generation complete: ${resultUrl}`)
    const persistedUrl = await persistToSupabase(resultUrl, 'png', 'kie-images')
    return { url: persistedUrl, fullApiPrompt: prompt }
}

/**
 * Generate a video via KIE AI. Submits task → polls (up to 10 min) → persists.
 */
export async function generateVideoKie(
    params: GenerateVideoKieParams,
): Promise<string> {
    const {
        prompt,
        model,
        firstFrameImage,
        aspectRatio = '16:9',
        duration = 5,
        resolution,
    } = params

    const input: Record<string, unknown> = {
        prompt,
        aspect_ratio: aspectRatio,
        duration: String(duration),
    }
    if (resolution) input.resolution = resolution

    let resolvedModel = model
    if (firstFrameImage) {
        resolvedModel = model.replace('/text-to-video', '/image-to-video')
        input.image_url = `data:${firstFrameImage.mimeType};base64,${firstFrameImage.base64}`
    }

    console.log(`[KIE] Submitting video task: model=${resolvedModel}, duration=${duration}s`)
    const taskId = await withTimeout(
        submitTask({ model: resolvedModel, input }),
        30_000,
        'KIE video submit',
    )
    console.log(`[KIE] Video task submitted: ${taskId}`)

    const urls = await pollTask(taskId, { maxAttempts: 120, intervalMs: 5000 })
    console.log(`[KIE] Video task complete: ${urls[0]}`)

    const persistedUrl = await persistToSupabase(urls[0], 'mp4', 'kie-videos')
    return persistedUrl
}
