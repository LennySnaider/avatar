'use server'

import { createServerSupabaseClient } from '@/lib/supabase'
import { centerCropToAspect, uploadBufferToGenerations } from '@/lib/mediaPersist'
import { sanitizePromptForGeneration, aggressiveSanitize, stripNegatedTattoos } from '@/utils/promptSanitizer'
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
 * Single status check (one recordInfo fetch) for the ASYNC client-polling flow.
 * Returns the current state without holding the server function open — the
 * browser calls this repeatedly so a slow KIE task (12+ min) never trips the
 * Vercel function timeout, and we never abandon a task that's still running.
 */
async function checkTaskOnce(
    taskId: string,
): Promise<{ state: 'running' } | { state: 'success'; urls: string[] } | { state: 'fail'; error: string }> {
    let res: Response
    try {
        res = await fetchWithAbort(
            `${KIE_API_BASE}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
            { headers: authHeaders() },
            POLL_FETCH_TIMEOUT_MS,
        )
    } catch (e) {
        if (isAbortError(e)) return { state: 'running' } // transient — keep polling
        throw e
    }
    if (!res.ok) {
        const text = await res.text()
        // 5xx = KIE infra hiccup (502/503/504), NOT a task failure — keep polling
        // (same treatment as a network AbortError above). A long task makes many
        // poll calls, so a single transient 5xx must not abandon a running task.
        // 4xx stays terminal (a 400/404 is a real misconfigured request).
        if (res.status >= 500) {
            console.warn(`[KIE] recordInfo transient ${res.status}; still polling`)
            return { state: 'running' }
        }
        throw new Error(`KIE recordInfo failed (${res.status}): ${text}`)
    }
    const json: KieRecordInfoResponse = await res.json()
    const state = json.data?.state
    if (state === 'success') {
        const parsed: KieResultJsonShape = json.data.resultJson ? JSON.parse(json.data.resultJson) : {}
        const urls = parsed.resultUrls ?? []
        if (urls.length === 0) return { state: 'fail', error: 'KIE task succeeded but returned no resultUrls' }
        return { state: 'success', urls }
    }
    if (state === 'fail') {
        return { state: 'fail', error: `${json.data.failCode || ''} ${json.data.failMsg || 'Unknown error'}`.trim() }
    }
    return { state: 'running' }
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

    const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg'
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
    cropToAspect?: string,
): Promise<string> {
    const res = await fetch(sourceUrl)
    if (!res.ok) throw new Error(`Failed to download KIE result (${res.status})`)
    let buffer: Buffer = Buffer.from(await res.arrayBuffer())

    // Normalize image proportions when a provider can't honor the requested
    // aspect ratio natively (e.g. GPT-4o Image). Videos are never cropped.
    if (cropToAspect && extension !== 'mp4') {
        try {
            buffer = await centerCropToAspect(buffer, cropToAspect)
        } catch (err) {
            console.warn(`[KIE] center-crop to ${cropToAspect} failed, keeping original:`, err)
        }
    }

    const contentType = extension === 'mp4' ? 'video/mp4' : `image/${extension === 'jpg' ? 'jpeg' : 'png'}`
    const fileName = `${subfolder}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${extension}`

    return uploadBufferToGenerations(buffer, fileName, contentType)
}

export interface GenerateImageKieParams {
    prompt: string
    model: string
    aspectRatio?: string
    referenceImage?: { base64: string; mimeType: string } | null
    // Multiple references for models that accept them (Nano Banana Pro → up to
    // 8 image_input). `role` lets us label each image in the prompt so the
    // model knows which one is the face to replicate (critical for identity).
    referenceImages?: Array<{ base64: string; mimeType: string; role?: string }>
}

/**
 * Generate an image via KIE AI. Routes to the right endpoint based on the
 * model family — KIE has dedicated endpoints per family, not a single unified
 * createTask for everything.
 */
export async function generateImageKie(
    params: GenerateImageKieParams,
): Promise<
    | { success: true; url: string; fullApiPrompt: string }
    | { success: false; error: string }
> {
    const { model, aspectRatio = '1:1', referenceImage, referenceImages } = params

    // Route to the right adapter with a given (already-sanitized) prompt.
    const runWithPrompt = async (promptText: string): Promise<{ url: string; fullApiPrompt: string }> => {
        if (model.startsWith('flux-kontext')) {
            return generateImageFluxKontext({ prompt: promptText, model, aspectRatio, referenceImage })
        }
        if (model === 'gpt-4o-image') {
            return generateImageGpt4o({ prompt: promptText, model, aspectRatio, referenceImage })
        }
        if (model === 'nano-banana-pro') {
            return generateImageNanoBananaPro({ prompt: promptText, model, aspectRatio, referenceImage, referenceImages })
        }
        if (model === 'gpt-image-2-text-to-image') {
            return generateImageGptImage2({ prompt: promptText, model, aspectRatio, referenceImage, referenceImages })
        }
        // Fallback to generic createTask flow (Grok and others)
        const input: Record<string, unknown> = { prompt: promptText, aspect_ratio: aspectRatio }
        let resolvedModel = model
        if (referenceImage) {
            resolvedModel = model.replace('/text-to-image', '/image-to-image')
            input.image_url = `data:${referenceImage.mimeType};base64,${referenceImage.base64}`
        }
        console.log(`[KIE] Submitting generic image task: model=${resolvedModel}`)
        const taskId = await withTimeout(submitTask({ model: resolvedModel, input }), 30_000, 'KIE image submit')
        const urls = await pollTask(taskId, { budgetMs: 600_000, intervalMs: 3000 })
        const persistedUrl = await persistToSupabase(urls[0], 'png', 'kie-images')
        return { url: persistedUrl, fullApiPrompt: promptText }
    }

    // Content-moderation flag from the provider (Google/OpenAI via KIE).
    const isSensitiveBlock = (m: string) =>
        /flagged as sensitive|sensitive|safety|content policy|moderat|violat/i.test(m)

    // Honor "no tattoos / sin tatuajes" by removing tattoo mentions up front.
    const promptIn = stripNegatedTattoos(params.prompt)

    try {
        // Attempt 1: light sanitization (bikini → swim set, etc.).
        const { sanitized } = sanitizePromptForGeneration(promptIn)
        try {
            return { success: true, ...(await runWithPrompt(sanitized)) }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            if (!isSensitiveBlock(msg)) throw err
            // Attempt 2: aggressive sanitization (strip revealing/swimwear terms
            // entirely) — same recovery the direct Gemini path uses on a block.
            const { sanitized: aggressive } = aggressiveSanitize(promptIn)
            console.warn('[KIE] Sensitive-content block — retrying with aggressive sanitization')
            return { success: true, ...(await runWithPrompt(aggressive)) }
        }
    } catch (err) {
        // Return the real error as DATA so it survives the server→client
        // boundary (thrown server-action errors get sanitized to a generic
        // 500 in production, hiding the actual KIE/moderation message).
        const message = err instanceof Error ? err.message : String(err)
        console.error('[KIE] Image generation failed:', message)
        return { success: false, error: message }
    }
}

/**
 * ASYNC submit for unified-createTask image models (gpt-image-2, nano-banana-pro).
 * Returns a taskId immediately (no long poll) so the browser can poll
 * `checkKieImageTask` — KIE can take 12+ min and the old synchronous poll
 * abandoned slow tasks at 600s (orphaned results + wasted credits + phantom
 * re-runs). Use this for those two models; flux/gpt-4o stay on generateImageKie.
 */
export async function submitKieImageTask(
    params: GenerateImageKieParams,
): Promise<{ success: true; taskId: string; fullApiPrompt: string } | { success: false; error: string }> {
    const { model, aspectRatio = '1:1', referenceImage, referenceImages } = params
    const { sanitized: prompt } = sanitizePromptForGeneration(stripNegatedTattoos(params.prompt))
    try {
        if (model === 'nano-banana-pro') {
            const refs = referenceImages && referenceImages.length > 0
                ? referenceImages.slice(0, 8)
                : referenceImage ? [referenceImage] : []
            const input: Record<string, unknown> = { prompt, aspect_ratio: aspectRatio, resolution: '2K', output_format: 'png' }
            if (refs.length > 0) input.image_input = await uploadRefs(refs)
            const taskId = await withTimeout(submitTask({ model: 'nano-banana-pro', input }), 30_000, 'KIE Nano Banana Pro submit')
            return { success: true, taskId, fullApiPrompt: prompt }
        }
        if (model === 'gpt-image-2-text-to-image') {
            const refs = referenceImages && referenceImages.length > 0
                ? referenceImages.slice(0, 16)
                : referenceImage ? [referenceImage] : []
            const input: Record<string, unknown> = { prompt, aspect_ratio: aspectRatio, resolution: '1K' }
            let kieModel = 'gpt-image-2-text-to-image'
            if (refs.length > 0) { input.input_urls = await uploadRefs(refs); kieModel = 'gpt-image-2-image-to-image' }
            const taskId = await withTimeout(submitTask({ model: kieModel, input }), 30_000, 'KIE GPT Image 2 submit')
            return { success: true, taskId, fullApiPrompt: prompt }
        }
        return { success: false, error: `submitKieImageTask: modelo no soportado (${model})` }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[KIE] submit failed:', message)
        return { success: false, error: message }
    }
}

/**
 * Poll a single KIE image task (one quick check). The browser calls this every
 * few seconds. On success it persists the result to Supabase and returns the URL.
 */
export async function checkKieImageTask(
    taskId: string,
): Promise<{ status: 'running' } | { status: 'done'; url: string } | { status: 'failed'; error: string }> {
    try {
        const r = await checkTaskOnce(taskId)
        if (r.state === 'running') return { status: 'running' }
        if (r.state === 'fail') return { status: 'failed', error: r.error }
        // success → persist (gpt-image-2 & nano-banana-pro honor aspect_ratio natively, no crop)
        const url = await persistToSupabase(r.urls[0], 'png', 'kie-images')
        return { status: 'done', url }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { status: 'failed', error: message }
    }
}

/**
 * Flux Kontext uses a dedicated endpoint with camelCase fields and a different
 * polling response shape (successFlag + resultImageUrl instead of state +
 * resultJson). It supports text-to-image and image-to-image in the same
 * endpoint — pass `inputImage` to enable edit mode.
 */
async function generateImageFluxKontext(params: GenerateImageKieParams): Promise<{ url: string; fullApiPrompt: string }> {
    const { prompt, model, aspectRatio = '1:1', referenceImage } = params

    // KIE Flux Kontext hard-caps the prompt at 3000 chars (422 otherwise). The
    // compact lean note keeps us well under, but a long [FACE:]/user text could
    // still push over — trim as a safety net (the leading instruction is the
    // most important; the tail [FACE:]/preserve text is least critical to cut).
    const FLUX_PROMPT_MAX = 3000
    const safePrompt = prompt.length > FLUX_PROMPT_MAX ? prompt.slice(0, FLUX_PROMPT_MAX) : prompt
    if (safePrompt.length < prompt.length) {
        console.warn(`[KIE/Flux] prompt ${prompt.length} chars > ${FLUX_PROMPT_MAX}; truncated`)
    }

    const body: Record<string, unknown> = {
        prompt: safePrompt,
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
    /**
     * Optional avatar reference images (face, body, generals) to anchor
     * identity across the cut. Currently only honoured by Seedance-2 via
     * the model's `reference_image_urls[]` channel — other KIE-hosted
     * models that don't expose a reference channel ignore this silently.
     */
    referenceImages?: Array<{ base64: string; mimeType: string }>
    aspectRatio?: string
    duration?: number
    resolution?: string
    /** Kling 3.0 native audio (`sound`). Ignored by other KIE models. */
    sound?: boolean
}

/**
 * Map standard aspect ratios to GPT 4o Image's supported `size` values.
 *
 * The KIE GPT 4o Image API accepts ONLY three values for `size`: '1:1',
 * '3:2', '2:3' (confirmed via the OpenAPI schema at
 * https://docs.kie.ai/4o-image-api/generate-4-o-image). This is an
 * upstream OpenAI constraint, not a KIE one.
 *
 * What this means for the user:
 *  - 16:9 / 4:3 / 3:2 → all clamp to 3:2  (mild landscape, not wide)
 *  - 9:16 / 3:4 / 2:3 → all clamp to 2:3  (mild portrait, not tall)
 *
 * Images generated with GPT 4o therefore look "less vertical" than the
 * same prompt run through Gemini Nano Banana or Kling v3 (which support
 * 9:16 natively). If true vertical output is required, the UI surfaces
 * a warning so the user can pick a different provider before generating.
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
    // GPT-4o Image only renders 1:1 / 3:2 / 2:3, so a requested 9:16 (etc.)
    // comes back shorter than Gemini's. Crop to the requested ratio so output
    // proportions match across providers. No-ops when the ratio already matches.
    const persistedUrl = await persistToSupabase(resultUrl, 'png', 'kie-images', aspectRatio)
    return { url: persistedUrl, fullApiPrompt: prompt }
}

/**
 * Upload reference images to public URLs (KIE needs URLs, not base64), in the
 * given order. The prompt's REFERENCE MAPPING (built by avatarPromptBuilder)
 * labels them as Image 1..N, so order here must match the caller's role order.
 */
async function uploadRefs(
    refs: Array<{ base64: string; mimeType: string }>,
): Promise<string[]> {
    return Promise.all(refs.map((r) => uploadReferenceToSupabase(r.base64, r.mimeType)))
}

/**
 * Nano Banana Pro (Google Gemini 3 Pro Image) via KIE's unified createTask.
 *
 * Same underlying model as the direct Gemini path, but ~30% cheaper through
 * KIE's discounted reselling. Unlike GPT-4o it honors aspect_ratio NATIVELY
 * (incl. 9:16), so no center-crop is needed. Reference images go as an array
 * of public URLs in `image_input` (not base64), so we upload first.
 *
 * Note: 1K and 2K cost the same on KIE (18 credits / ~$0.09), so we request 2K
 * for better quality at no extra cost.
 */
async function generateImageNanoBananaPro(
    params: GenerateImageKieParams,
): Promise<{ url: string; fullApiPrompt: string }> {
    const { prompt, aspectRatio = '1:1', referenceImage, referenceImages } = params

    // Nano Banana Pro accepts up to 8 reference images. Send the full set
    // (face + angle + body + pose + scene); the prompt already carries the
    // REFERENCE MAPPING describing each. Fall back to the single face ref.
    const refs = (referenceImages && referenceImages.length > 0)
        ? referenceImages.slice(0, 8)
        : referenceImage
            ? [referenceImage]
            : []

    const input: Record<string, unknown> = {
        prompt,
        aspect_ratio: aspectRatio,
        resolution: '2K',
        output_format: 'png',
    }
    if (refs.length > 0) {
        input.image_input = await uploadRefs(refs)
    }

    console.log(`[KIE/NanoBananaPro] Submitting: refs=${refs.length}, ratio=${aspectRatio}`)
    const taskId = await withTimeout(
        submitTask({ model: 'nano-banana-pro', input }),
        30_000,
        'KIE Nano Banana Pro submit',
    )
    const urls = await pollTask(taskId, { budgetMs: 600_000, intervalMs: 3000 })
    // nano-banana-pro honors aspect_ratio natively — no crop needed.
    const persistedUrl = await persistToSupabase(urls[0], 'png', 'kie-images')
    return { url: persistedUrl, fullApiPrompt: prompt }
}

/**
 * GPT Image 2 (OpenAI's newest image model) via KIE's unified createTask.
 *
 * Newer than gpt-4o-image and honors aspect_ratio NATIVELY (incl. 9:16), so no
 * center-crop is needed. Picks the right KIE endpoint by whether references are
 * present: with refs → `gpt-image-2-image-to-image` (input_urls, up to 16) so
 * it can match the avatar's identity; without refs → `gpt-image-2-text-to-image`.
 * Requests 2K for better quality.
 *
 * Note: OpenAI moderation is strict on real-person/suggestive content — it may
 * still refuse some references even though the API accepts them.
 */
async function generateImageGptImage2(
    params: GenerateImageKieParams,
): Promise<{ url: string; fullApiPrompt: string }> {
    const { prompt, aspectRatio = '1:1', referenceImage, referenceImages } = params

    const refs = (referenceImages && referenceImages.length > 0)
        ? referenceImages.slice(0, 16)
        : referenceImage
            ? [referenceImage]
            : []

    const input: Record<string, unknown> = {
        prompt,
        aspect_ratio: aspectRatio,
        // 1K (not 2K): KIE's gpt-image-2 i2i at 2K is unusably slow — it hangs
        // for many minutes (3 refs → 500/15-min; even 2 refs stays "running").
        // 1K completes fast and reliably; KIE just can't do 2K on this model.
        resolution: '1K',
    }
    let kieModel = 'gpt-image-2-text-to-image'
    if (refs.length > 0) {
        input.input_urls = await uploadRefs(refs)
        kieModel = 'gpt-image-2-image-to-image'
        console.log(`[KIE/GptImage2] Image-to-image with ${refs.length} reference(s)`)
    }

    // Healthy gpt-image-2 i2i tasks vary widely (≈213s … 355s, sometimes more);
    // a few hang forever (intermittent KIE bug). Poll a generous budget so slow-
    // but-healthy tasks complete; the rare hang fails at the budget and the user
    // just regenerates. (No short-budget auto-retry: it would abandon legit slow
    // tasks, and two long attempts can't fit under Vercel's 800s maxDuration.)
    console.log(`[KIE/GptImage2] Submitting: model=${kieModel}, ratio=${aspectRatio}`)
    const taskId = await withTimeout(
        submitTask({ model: kieModel, input }),
        30_000,
        'KIE GPT Image 2 submit',
    )
    const urls = await pollTask(taskId, { budgetMs: 600_000, intervalMs: 3000 })
    // gpt-image-2 honors aspect_ratio natively — no crop needed.
    const persistedUrl = await persistToSupabase(urls[0], 'png', 'kie-images')
    return { url: persistedUrl, fullApiPrompt: prompt }
}

/**
 * KIE Kling 3.0 only accepts 16:9, 9:16, 1:1. Map other ratios to the nearest
 * supported one rather than letting the API 400.
 */
function clampKlingAspect(aspect: string): '16:9' | '9:16' | '1:1' {
    if (aspect === '16:9' || aspect === '9:16' || aspect === '1:1') return aspect
    if (aspect === '4:3') return '16:9'
    if (aspect === '3:4') return '9:16'
    return '9:16' // avatar default is vertical
}

/**
 * Kling 3.0 video (kling-3.0/video) via the unified /jobs/createTask flow.
 * Native audio via `sound`; quality via `mode` (std=720p, pro=1080p) — NO
 * separate `resolution` field (unlike Seedance/Wan). Image, if present, must
 * be a public HTTP URL (uploaded to Supabase first) → image-to-video; absent
 * → text-to-video.
 */
async function generateVideoKling3(params: GenerateVideoKieParams): Promise<string> {
    const {
        prompt,
        firstFrameImage,
        aspectRatio = '9:16',
        duration = 5,
        resolution,
        sound = false,
    } = params

    const input: Record<string, unknown> = {
        prompt,
        sound,
        // KIE requires `multi_shots` explicitly even for a normal single-shot
        // video (omitting it → 422 "multi_shots cannot be empty"). false = use
        // the top-level `prompt` as one continuous shot (no `multi_prompt`).
        multi_shots: false,
        duration: Number(duration),
        aspect_ratio: clampKlingAspect(aspectRatio),
        mode: resolution === '1080p' ? 'pro' : 'std',
    }

    if (firstFrameImage) {
        const url = await uploadReferenceToSupabase(
            firstFrameImage.base64,
            firstFrameImage.mimeType,
        )
        console.log(`[KIE/Kling3] Uploaded first frame to: ${url}`)
        input.image_urls = [url]
    }

    console.log(`[KIE/Kling3] Submitting: duration=${duration}s, mode=${input.mode}, aspect=${input.aspect_ratio}, sound=${sound}, i2v=${!!firstFrameImage}`)
    const taskId = await withTimeout(
        submitTask({ model: 'kling-3.0/video', input }),
        30_000,
        'KIE Kling 3.0 submit',
    )
    console.log(`[KIE/Kling3] Task submitted: ${taskId}`)

    const urls = await pollTask(taskId, { budgetMs: 600_000, intervalMs: 5000 })
    console.log(`[KIE/Kling3] Generation complete: ${urls[0]}`)

    return persistToSupabase(urls[0], 'mp4', 'kie-videos')
}

export interface MotionVideoUploadTicket {
    path: string
    token: string
    publicUrl: string
}

/**
 * Signed upload URL so the browser can PUT large driving videos straight to
 * Supabase Storage. Vercel caps request bodies at ~4.5MB (platform limit —
 * next.config's bodySizeLimit can't raise it), so base64 videos inside a
 * server-action POST 413 on anything but tiny clips.
 */
export async function createMotionVideoUploadUrl(
    mimeType: string,
): Promise<MotionVideoUploadTicket> {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not defined')

    const ext = mimeType.includes('quicktime') ? 'mov' : 'mp4'
    const path = `kie-refs/motion-${Date.now()}-${Math.random().toString(36).slice(2, 11)}.${ext}`

    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase.storage
        .from('generations')
        .createSignedUploadUrl(path)
    if (error || !data) {
        throw new Error(`Failed to create motion video upload URL: ${error?.message ?? 'no data'}`)
    }

    return {
        path,
        token: data.token,
        publicUrl: `${SUPABASE_URL}/storage/v1/object/public/generations/${path}`,
    }
}

export interface GenerateMotionControlKieParams {
    characterImage: { base64: string; mimeType: string }
    /** Driving video as a public HTTP URL (preferred — already hosted). */
    motionVideoUrl?: string | null
    /** OR a base64 video to upload to Supabase first. */
    motionVideoBase64?: string | null
    prompt?: string
    /** Our VideoResolution string; '1080p' → mode '1080p', else → '720p'. */
    resolution?: string
    characterOrientation?: 'video' | 'image'
}

/**
 * Kling 3.0 motion-control (kling-3.0/motion-control), video-to-video. Needs
 * BOTH a character image (input_urls) and a driving video (video_urls), each
 * as a public HTTP URL. NO preset motions (KIE doesn't expose them). Quality
 * via `mode` ('720p' | '1080p') — a DIFFERENT enum from kling-3.0/video's
 * std/pro; sending std/pro here → 500 "mode is not within the range of
 * allowed options".
 */
export async function generateMotionControlKie(
    params: GenerateMotionControlKieParams,
): Promise<string> {
    const {
        characterImage,
        motionVideoUrl,
        motionVideoBase64,
        prompt,
        resolution,
        characterOrientation = 'video',
    } = params

    // Validate before any side-effectful upload: a driving video is required.
    // An empty-string URL counts as absent.
    if (!motionVideoUrl && !motionVideoBase64) {
        throw new Error(
            'Kling 3.0 motion-control (KIE) requires a driving video (upload or URL). Presets are not supported on KIE.',
        )
    }

    const imageUrl = await uploadReferenceToSupabase(
        characterImage.base64,
        characterImage.mimeType,
    )

    let videoUrl: string | null = motionVideoUrl || null // '' → null
    if (!videoUrl && motionVideoBase64) {
        videoUrl = await uploadReferenceToSupabase(motionVideoBase64, 'video/mp4')
    }
    if (!videoUrl) {
        throw new Error(
            'Kling 3.0 motion-control (KIE) requires a driving video (upload or URL). Presets are not supported on KIE.',
        )
    }

    const input: Record<string, unknown> = {
        input_urls: [imageUrl],
        video_urls: [videoUrl],
        mode: resolution === '1080p' ? '1080p' : '720p',
        character_orientation: characterOrientation,
        background_source: 'input_video',
    }
    if (prompt) input.prompt = prompt

    console.log(`[KIE/Kling3-MC] Submitting motion-control: mode=${input.mode}, orientation=${characterOrientation}`)
    const taskId = await withTimeout(
        submitTask({ model: 'kling-3.0/motion-control', input }),
        30_000,
        'KIE Kling 3.0 motion-control submit',
    )
    console.log(`[KIE/Kling3-MC] Task submitted: ${taskId}`)

    const urls = await pollTask(taskId, { budgetMs: 600_000, intervalMs: 5000 })
    console.log(`[KIE/Kling3-MC] Generation complete: ${urls[0]}`)

    return persistToSupabase(urls[0], 'mp4', 'kie-videos')
}

export interface KieVideoSafeResult {
    success: boolean
    url?: string
    error?: string
}

/**
 * Error-as-data wrappers for the KIE video generators. A thrown error from a
 * `'use server'` action is masked as a generic 500 ("An error occurred in the
 * Server Components render") in production, hiding the real reason. Returning the
 * message as DATA lets the client surface the actual KIE error (422 missing field,
 * RAI moderation, rate-limit, etc.) — same pattern as `generateImageKie` and
 * `GeminiService.generateVideoSafe`.
 */
export async function generateVideoKieSafe(
    params: GenerateVideoKieParams,
): Promise<KieVideoSafeResult> {
    try {
        const url = await generateVideoKie(params)
        return { success: true, url }
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
}

export async function generateMotionControlKieSafe(
    params: GenerateMotionControlKieParams,
): Promise<KieVideoSafeResult> {
    try {
        const url = await generateMotionControlKie(params)
        return { success: true, url }
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
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
    if (params.model === 'kling-3.0/video') {
        return generateVideoKling3(params)
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
        referenceImages,
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

    // Seedance 2.0 supports THREE mutually-exclusive scenarios per the
    // official docs (https://docs.kie.ai/market/bytedance/seedance-2):
    //   1. Image-to-Video (First Frame) — first_frame_url alone
    //   2. Image-to-Video (First & Last) — first_frame_url + last_frame_url
    //   3. Multimodal Reference-to-Video — reference_image_urls alone
    // Mixing first_frame_url with reference_image_urls causes the API to
    // silently ignore the refs (which is exactly the bug we hit when the
    // generated continuation didn't preserve the avatar's face).
    //
    // For Continue-Video-with-Identity we need both signals, so we use the
    // hybrid approach the docs explicitly suggest:
    //   "Multimodal Reference-to-Video can simulate a 'First Frame +
    //    Multimodal Reference' effect by using reference images as prompts
    //    for the first or last frames."
    // i.e. drop first_frame_url and stuff the captured frame into
    // reference_image_urls[0] alongside the avatar refs. The model picks
    // up the frame as a contextual reference rather than a literal start
    // — pose continuity is approximate but identity is preserved.
    if (referenceImages && referenceImages.length > 0) {
        const allRefs: Array<{ base64: string; mimeType: string }> = []
        if (firstFrameImage) allRefs.push(firstFrameImage)
        allRefs.push(...referenceImages)

        const refUrls = await Promise.all(
            allRefs.slice(0, 9).map((ref) =>
                uploadReferenceToSupabase(ref.base64, ref.mimeType),
            ),
        )
        console.log(
            `[KIE/Seedance] Reference-to-Video mode: ${refUrls.length} refs ` +
            `(frame=${firstFrameImage ? '1' : '0'}, avatar=${referenceImages.length})`,
        )
        input.reference_image_urls = refUrls
    } else if (firstFrameImage) {
        const url = await uploadReferenceToSupabase(
            firstFrameImage.base64,
            firstFrameImage.mimeType,
        )
        console.log(`[KIE/Seedance] First-frame mode: uploaded to ${url}`)
        input.first_frame_url = url
    }

    console.log(`[KIE/Seedance] Submitting: duration=${duration}s, resolution=${resolution}, aspect=${aspectRatio}, hasFirstFrame=${!!firstFrameImage}, refsCount=${referenceImages?.length ?? 0}`)
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

// =============================================
// TALKING HEAD (InfiniteTalk) & LIPSYNC (Volcengine)
// =============================================

export interface GenerateTalkingVideoKieParams {
    /** Imagen de retrato del avatar (face ref o primera general ref). */
    image: { base64: string; mimeType: string }
    /** URL pública del audio TTS (bucket generations). Máx 10MB. */
    audioUrl: string
    /** Guía visual opcional (máx 5000 chars infinitalk / 1000 omnihuman). */
    prompt?: string
    resolution?: '480p' | '720p'
    /**
     * Motor talking-head: InfiniteTalk (clips largos), OmniHuman 1.5 de
     * ByteDance (audio ≤60s, óptimo ≤15s, mejores gestos) o Kling 3.0 vía
     * elements (mejor calidad de video; audio 5-30s, video 3-15s).
     */
    model?: 'infinitalk' | 'omnihuman' | 'kling'
    /**
     * Solo Kling: imágenes extra del personaje para el element (necesita 2-4
     * URLs en total; si faltan se duplica la imagen principal).
     */
    elementImages?: Array<{ base64: string; mimeType: string }>
    /** Solo Kling: duración del audio TTS en segundos, para dimensionar el video (3-15s). */
    durationSec?: number
}

const DEFAULT_TALKING_PROMPT =
    'A person speaking naturally to the camera, natural facial expressions and head movement, lips moving in perfect sync with the audio'

/**
 * ASYNC submit para InfiniteTalk (infinitalk/from-audio): imagen de retrato +
 * audio → video talking-head con lipsync real. Devuelve el taskId de inmediato
 * para que el NAVEGADOR pollee `checkKieVideoTask` — InfiniteTalk suele tardar
 * más de 10 min y el poll síncrono abandonaba jobs sanos a los 600s (créditos
 * gastados + resultado huérfano). Mismo patrón que submitKieImageTask.
 */
export async function submitTalkingVideoKieTask(
    params: GenerateTalkingVideoKieParams,
): Promise<{ success: true; taskId: string } | { success: false; error: string }> {
    try {
        const imageUrl = await uploadReferenceToSupabase(params.image.base64, params.image.mimeType)

        // Kling 3.0: genera SOLO el video (mudo) — la voz la pone el paso 2
        // (Volcengine lipsync). `sound: false` porque la tarifa con audio es
        // más cara y su pista se descartaría igual; tampoco se envía audio en
        // el element (verificado: Kling lo ignora — pista casi silente).
        if (params.model === 'kling') {
            const elementUrls = [imageUrl]
            for (const extra of params.elementImages ?? []) {
                if (elementUrls.length >= 4) break
                elementUrls.push(await uploadReferenceToSupabase(extra.base64, extra.mimeType))
            }
            // El element exige mínimo 2 URLs — duplicar la principal si falta.
            if (elementUrls.length < 2) elementUrls.push(imageUrl)

            // Video 3-15s: audio + 1s de margen, acotado al rango válido.
            const videoDuration = Math.min(15, Math.max(3, Math.ceil(params.durationSec ?? 10) + 1))

            const input: Record<string, unknown> = {
                prompt: `${(params.prompt || DEFAULT_TALKING_PROMPT).slice(0, 2000)} @avatar_speaker`,
                image_urls: [imageUrl],
                sound: false,
                multi_shots: false,
                duration: videoDuration,
                mode: 'pro',
                kling_elements: [
                    {
                        name: 'avatar_speaker',
                        description: 'the avatar character speaking naturally to the camera, lips moving as if talking',
                        element_input_urls: elementUrls,
                    },
                ],
            }

            console.log('[KIE] Submitting talking-head task (kling-3.0/video + audio element)')
            const taskId = await withTimeout(
                submitTask({ model: 'kling-3.0/video', input }),
                30_000,
                'KIE talking-head submit',
            )
            console.log(`[KIE] Talking-head task submitted: ${taskId}`)
            return { success: true, taskId }
        }

        const isOmniHuman = params.model === 'omnihuman'
        const kieModel = isOmniHuman ? 'omnihuman-1-5' : 'infinitalk/from-audio'
        const input: Record<string, unknown> = isOmniHuman
            ? {
                  image_url: imageUrl,
                  audio_url: params.audioUrl,
                  // La doc dice "máx 1000, 300 recomendado" pero el API rechaza
                  // >300 con 422 "prompt must be <= 300 characters".
                  prompt: (params.prompt || DEFAULT_TALKING_PROMPT).slice(0, 300),
                  // '720' | '1080' — 720 mantiene el costo a raya para clips cortos.
                  output_resolution: '720',
              }
            : {
                  image_url: imageUrl,
                  audio_url: params.audioUrl,
                  prompt: (params.prompt || DEFAULT_TALKING_PROMPT).slice(0, 5000),
                  resolution: params.resolution ?? '720p',
              }

        console.log(`[KIE] Submitting talking-head task (${kieModel})`)
        const taskId = await withTimeout(
            submitTask({ model: kieModel, input }),
            30_000,
            'KIE talking-head submit',
        )
        console.log(`[KIE] Talking-head task submitted: ${taskId}`)
        return { success: true, taskId }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        console.error('[KIE] talking-head submit failed:', message)
        return { success: false, error: message }
    }
}

export interface LipsyncVideoKieParams {
    /** URL pública del video existente (galería / bucket generations). */
    videoUrl: string
    /** URL pública del audio TTS. Máx 10MB. */
    audioUrl: string
    /** 'lite' re-sincroniza labios rápido; 'basic' soporta escenas múltiples. */
    mode?: 'lite' | 'basic'
}

/**
 * ASYNC submit para Volcengine video-to-video lipsync: re-anima la boca de un
 * video existente para seguir el audio dado. Mismo flujo de polling en el
 * navegador que InfiniteTalk (checkKieVideoTask).
 */
export async function submitLipsyncVideoKieTask(
    params: LipsyncVideoKieParams,
): Promise<{ success: true; taskId: string } | { success: false; error: string }> {
    try {
        const input: Record<string, unknown> = {
            mode: params.mode ?? 'lite',
            video_url: params.videoUrl,
            audio_url: params.audioUrl,
            align_audio: true,
        }

        console.log('[KIE] Submitting volcengine lipsync task')
        const taskId = await withTimeout(
            submitTask({ model: 'volcengine/video-to-video-lip-sync', input }),
            30_000,
            'KIE lipsync submit',
        )
        console.log(`[KIE] Lipsync task submitted: ${taskId}`)
        return { success: true, taskId }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        console.error('[KIE] lipsync submit failed:', message)
        return { success: false, error: message }
    }
}

/**
 * Poll de UN chequeo para tasks de video KIE (InfiniteTalk / lipsync). El
 * navegador lo llama cada pocos segundos; en success persiste el mp4 a
 * Supabase y devuelve la URL estable. Espejo de checkKieImageTask.
 */
export async function checkKieVideoTask(
    taskId: string,
): Promise<{ status: 'running' } | { status: 'done'; url: string } | { status: 'failed'; error: string }> {
    try {
        const r = await checkTaskOnce(taskId)
        if (r.state === 'running') return { status: 'running' }
        if (r.state === 'fail') return { status: 'failed', error: r.error }
        const url = await persistToSupabase(r.urls[0], 'mp4', 'kie-videos')
        return { status: 'done', url }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { status: 'failed', error: message }
    }
}
