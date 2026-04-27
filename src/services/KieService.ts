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

async function fetchWithAbort(
    url: string,
    init: RequestInit,
    timeoutMs: number,
): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
        return await fetch(url, { ...init, signal: controller.signal })
    } finally {
        clearTimeout(timer)
    }
}

function isAbortError(e: unknown): boolean {
    return e instanceof Error && e.name === 'AbortError'
}

const POLL_FETCH_TIMEOUT_MS = 30_000

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
    options?: { budgetMs?: number; intervalMs?: number },
): Promise<string[]> {
    const budgetMs = options?.budgetMs ?? 600_000
    const intervalMs = options?.intervalMs ?? 5000
    const startedAt = Date.now()

    while (Date.now() - startedAt < budgetMs) {
        let res: Response
        try {
            res = await fetchWithAbort(
                `${KIE_API_BASE}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
                { headers: authHeaders() },
                POLL_FETCH_TIMEOUT_MS,
            )
        } catch (e) {
            if (isAbortError(e)) {
                console.warn(`[KIE] recordInfo fetch aborted (>${POLL_FETCH_TIMEOUT_MS}ms), retrying`)
                await new Promise(resolve => setTimeout(resolve, intervalMs))
                continue
            }
            throw e
        }
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
    throw new Error(`KIE task timed out after ${budgetMs / 1000}s`)
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
    const urls = await pollTask(taskId, { budgetMs: 180_000, intervalMs: 3000 })
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

    // Flux Kontext Max can take 3-8 min especially with reference images.
    // Wall-clock budget so a hung fetch can't push real elapsed past Vercel Pro maxDuration (800s).
    const budgetMs = 600_000
    const intervalMs = 5000
    const startedAt = Date.now()
    let resultUrl: string | undefined
    let pollNum = 0

    while (Date.now() - startedAt < budgetMs) {
        pollNum++
        let res: Response
        try {
            res = await fetchWithAbort(
                `${KIE_API_BASE}/flux/kontext/record-info?taskId=${encodeURIComponent(taskId)}`,
                { headers: authHeaders() },
                POLL_FETCH_TIMEOUT_MS,
            )
        } catch (e) {
            if (isAbortError(e)) {
                console.warn(`[KIE/Flux] poll fetch aborted (>${POLL_FETCH_TIMEOUT_MS}ms), retrying`)
                await new Promise(resolve => setTimeout(resolve, intervalMs))
                continue
            }
            throw e
        }
        if (!res.ok) {
            const text = await res.text()
            throw new Error(`KIE Flux Kontext poll failed (${res.status}): ${text}`)
        }
        const json: KieFluxKontextRecordInfoResponse = await res.json()
        const data = json.data as (typeof json.data & { resultImageUrl?: string }) | undefined
        const flag = data?.successFlag
        // KIE docs put resultImageUrl under data.response, but some fixtures
        // have shown it at the top level — accept both rather than miss it.
        const url = data?.response?.resultImageUrl ?? data?.resultImageUrl

        if (pollNum === 1) {
            console.log(`[KIE/Flux] first poll data: ${JSON.stringify(data).slice(0, 500)}`)
        }
        console.log(`[KIE/Flux] poll #${pollNum}: flag=${flag}, hasUrl=${!!url}`)

        if (flag === 1 && url) {
            resultUrl = url
            break
        }
        if (flag === 2 || flag === 3) {
            throw new Error(`KIE Flux Kontext failed (flag=${flag}): ${data?.errorMessage || data?.errorCode || 'Unknown'}`)
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs))
    }
    if (!resultUrl) {
        throw new Error(`KIE Flux Kontext timed out after ${budgetMs / 1000}s`)
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

    // GPT 4o /gpt4o-image/record-info: successFlag 0=running, 1=success, 2/3=fail.
    const budgetMs = 300_000
    const intervalMs = 3000
    const startedAt = Date.now()
    let resultUrl: string | undefined
    let pollNum = 0

    while (Date.now() - startedAt < budgetMs) {
        pollNum++
        let res: Response
        try {
            res = await fetchWithAbort(
                `${KIE_API_BASE}/gpt4o-image/record-info?taskId=${encodeURIComponent(taskId)}`,
                { headers: authHeaders() },
                POLL_FETCH_TIMEOUT_MS,
            )
        } catch (e) {
            if (isAbortError(e)) {
                console.warn(`[KIE/GPT4o] poll fetch aborted (>${POLL_FETCH_TIMEOUT_MS}ms), retrying`)
                await new Promise(resolve => setTimeout(resolve, intervalMs))
                continue
            }
            throw e
        }
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

        if (pollNum === 1) {
            console.log(`[KIE/GPT4o] first poll data: ${JSON.stringify(json.data).slice(0, 500)}`)
        }
        console.log(`[KIE/GPT4o] poll #${pollNum}: flag=${flag}, hasUrl=${!!(urls && urls.length)}`)

        if (flag === 1 && urls && urls.length > 0) {
            resultUrl = urls[0]
            break
        }
        if (flag === 2 || flag === 3) {
            // KIE proxies OpenAI for GPT 4o Image. When OpenAI's safety system
            // refuses the request (people in revealing clothing, near-nudity,
            // suggestive prompts, copyrighted likenesses, etc.), KIE relays it
            // back as flag=3 with errorMessage "Internal Error" — opaque on
            // purpose to avoid teaching users how to bypass moderation.
            const code = json.data?.errorCode
            const message = json.data?.errorMessage || 'Unknown'
            const looksLikeModeration = /internal error/i.test(message) && !code
            const hint = looksLikeModeration
                ? ' (likely OpenAI content policy — try Flux Kontext for outfit/swimwear edits)'
                : ''
            throw new Error(`KIE GPT4o failed (flag=${flag}, code=${code || 'n/a'}): ${message}${hint}`)
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs))
    }
    if (!resultUrl) {
        throw new Error(`KIE GPT4o timed out after ${budgetMs / 1000}s`)
    }

    console.log(`[KIE/GPT4o] Generation complete: ${resultUrl}`)
    const persistedUrl = await persistToSupabase(resultUrl, 'png', 'kie-images')
    return { url: persistedUrl, fullApiPrompt: prompt }
}

/**
 * Generate a video via KIE AI. Routes to the right adapter based on the
 * model — newer KIE endpoints (Seedance, Wan) require HTTP-only references
 * and integer durations, so they can't share the legacy generic body.
 */
export async function generateVideoKie(
    params: GenerateVideoKieParams,
): Promise<string> {
    if (params.model === 'bytedance/seedance-2') {
        return generateVideoSeedance(params)
    }
    if (params.model === 'wan/2-7-image-to-video') {
        return generateVideoWan27(params)
    }

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

    const urls = await pollTask(taskId, { budgetMs: 600_000, intervalMs: 5000 })
    console.log(`[KIE] Video task complete: ${urls[0]}`)

    const persistedUrl = await persistToSupabase(urls[0], 'mp4', 'kie-videos')
    return persistedUrl
}

/**
 * ByteDance Seedance 2.0. Unified /jobs/createTask submit, polling via
 * /jobs/recordInfo. Reference image must be a public HTTP URL (we upload
 * to Supabase first), and duration must be an integer (not stringified).
 */
async function generateVideoSeedance(params: GenerateVideoKieParams): Promise<string> {
    const {
        prompt,
        firstFrameImage,
        aspectRatio = '16:9',
        duration = 5,
        resolution = '720p',
    } = params

    const input: Record<string, unknown> = {
        prompt,
        aspect_ratio: aspectRatio,
        duration,
        resolution,
    }
    if (firstFrameImage) {
        const url = await uploadReferenceToSupabase(
            firstFrameImage.base64,
            firstFrameImage.mimeType,
        )
        console.log(`[KIE/Seedance] Uploaded reference to: ${url}`)
        input.first_frame_url = url
    }

    console.log(`[KIE/Seedance] Submitting: duration=${duration}s, resolution=${resolution}, aspect=${aspectRatio}, hasReference=${!!firstFrameImage}`)
    const taskId = await withTimeout(
        submitTask({ model: 'bytedance/seedance-2', input }),
        30_000,
        'KIE Seedance submit',
    )
    console.log(`[KIE/Seedance] Task submitted: ${taskId}`)

    const urls = await pollTask(taskId, { budgetMs: 600_000, intervalMs: 5000 })
    console.log(`[KIE/Seedance] Generation complete: ${urls[0]}`)

    return persistToSupabase(urls[0], 'mp4', 'kie-videos')
}

/**
 * Wan 2.7 image-to-video. Requires a first frame; aspect ratio is inferred
 * from the reference image rather than being a separate parameter.
 */
async function generateVideoWan27(params: GenerateVideoKieParams): Promise<string> {
    const {
        prompt,
        firstFrameImage,
        duration = 5,
        resolution = '1080p',
    } = params

    if (!firstFrameImage) {
        throw new Error('Wan 2.7 requires a reference image (first frame). Add a face or general reference and try again.')
    }

    const url = await uploadReferenceToSupabase(
        firstFrameImage.base64,
        firstFrameImage.mimeType,
    )
    console.log(`[KIE/Wan2.7] Uploaded reference to: ${url}`)

    const input: Record<string, unknown> = {
        prompt,
        first_frame_url: url,
        duration,
        resolution,
    }

    console.log(`[KIE/Wan2.7] Submitting: duration=${duration}s, resolution=${resolution}`)
    const taskId = await withTimeout(
        submitTask({ model: 'wan/2-7-image-to-video', input }),
        30_000,
        'KIE Wan 2.7 submit',
    )
    console.log(`[KIE/Wan2.7] Task submitted: ${taskId}`)

    const urls = await pollTask(taskId, { budgetMs: 600_000, intervalMs: 5000 })
    console.log(`[KIE/Wan2.7] Generation complete: ${urls[0]}`)

    return persistToSupabase(urls[0], 'mp4', 'kie-videos')
}
