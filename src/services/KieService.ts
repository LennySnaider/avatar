'use server'

import { createServerSupabaseClient } from '@/lib/supabase'
import type {
    KieCreateTaskRequest,
    KieCreateTaskResponse,
    KieRecordInfoResponse,
    KieResultJsonShape,
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
 * Generate an image via KIE AI. Submits task → polls → persists to Supabase.
 * Auto-selects image-to-image variant of the model when a reference is provided
 * (assumes KIE follows the convention `<provider>/text-to-image` vs
 * `<provider>/image-to-image`).
 */
export async function generateImageKie(
    params: GenerateImageKieParams,
): Promise<{ url: string; fullApiPrompt: string }> {
    const { prompt, model, aspectRatio = '1:1', referenceImage } = params

    const input: Record<string, unknown> = {
        prompt,
        aspect_ratio: aspectRatio,
    }

    let resolvedModel = model
    if (referenceImage) {
        // Switch to image-to-image variant if the model expose one.
        resolvedModel = model.replace('/text-to-image', '/image-to-image')
        input.image_url = `data:${referenceImage.mimeType};base64,${referenceImage.base64}`
    }

    console.log(`[KIE] Submitting image task: model=${resolvedModel}`)
    const taskId = await withTimeout(
        submitTask({ model: resolvedModel, input }),
        30_000,
        'KIE image submit',
    )
    console.log(`[KIE] Image task submitted: ${taskId}`)

    const urls = await pollTask(taskId, { maxAttempts: 60, intervalMs: 3000 })
    console.log(`[KIE] Image task complete: ${urls[0]}`)

    const persistedUrl = await persistToSupabase(urls[0], 'png', 'kie-images')
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
