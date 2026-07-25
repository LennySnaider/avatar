'use server'

/**
 * MuleRouter (api.mulerouter.ai) — Qwen Image Edit Max DIRECTO, en UNA fase.
 *
 * Validado live 2026-07-25 (test decisivo con el face ref real de Raven):
 * retrato → cuerpo entero SIN anclaje al encuadre (el defecto estructural del
 * qwen2/image-edit de KIE), cara conservada, NSFW real con safety_filter:false,
 * ~26s, $0.075/imagen. Reemplaza a la 2-fases (t2i + face-swap) para Qwen.
 *
 * Límites del API (docs 2026-07-25): prompt ≤ 800 chars, negative ≤ 500,
 * 1-3 imágenes (URL pública o base64), size [512,2048] "w*h". Async task:
 * POST /vendors/alibaba/v1/qwen-image-edit-max/generation → task_info.id,
 * luego GET .../generation/{id} hasta completed/succeeded|failed.
 *
 * OJO Cloudflare: bloquea user-agents no-navegador raros (python-urllib dio
 * 403 código 1010); fetch de Node pasa normal.
 */

import { uploadReferenceToSupabase } from './KieService'

const MR_BASE = 'https://api.mulerouter.ai'
const MR_EDIT_MAX = '/vendors/alibaba/v1/qwen-image-edit-max/generation'

function mrKey(): string {
    const key = process.env.MULEROUTER_API_KEY
    if (!key)
        throw new Error(
            'MULEROUTER_API_KEY no está configurada (agregar a .env.local y a Vercel)',
        )
    return key
}

export async function submitMuleRouterImageTask(params: {
    /** Prompt FINAL (se capea defensivo a 800 — el caller ya comprime). */
    prompt: string
    negativePrompt?: string
    /** Face ref del avatar (base64) — se sube a Supabase y viaja como URL. */
    faceRef: { base64: string; mimeType: string }
    /** "width*height", ambos en [512,2048]. Default 928*1664 (9:16). */
    size?: string
}): Promise<
    | { success: true; taskId: string; fullApiPrompt: string }
    | { success: false; error: string }
> {
    try {
        const faceUrl = await uploadReferenceToSupabase(
            params.faceRef.base64,
            params.faceRef.mimeType,
        )
        const prompt = params.prompt.slice(0, 800)
        const body = {
            images: [faceUrl],
            prompt,
            ...(params.negativePrompt
                ? { negative_prompt: params.negativePrompt.slice(0, 500) }
                : {}),
            // Nuestro prompt ya es profesional — el rewriter podría además
            // suavizar/rechazar el NSFW. Siempre off.
            prompt_extend: false,
            safety_filter: false,
            size: params.size ?? '928*1664',
        }
        const res = await fetch(`${MR_BASE}${MR_EDIT_MAX}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${mrKey()}`,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30_000),
        })
        if (!res.ok) {
            const text = await res.text().catch(() => '')
            return {
                success: false,
                error: `MuleRouter submit ${res.status}: ${text.slice(0, 300)}`,
            }
        }
        const data = (await res.json()) as {
            task_info?: { id?: string; status?: string }
        }
        const taskId = data.task_info?.id
        if (!taskId)
            return {
                success: false,
                error: 'MuleRouter no devolvió task_info.id',
            }
        console.log(`[MuleRouter] Edit Max task: ${taskId}`)
        return { success: true, taskId, fullApiPrompt: prompt }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { success: false, error: msg }
    }
}

export async function checkMuleRouterImageTask(taskId: string): Promise<
    | { status: 'processing' }
    | { status: 'done'; url: string }
    | { status: 'failed'; error: string }
> {
    const res = await fetch(`${MR_BASE}${MR_EDIT_MAX}/${taskId}`, {
        headers: { Authorization: `Bearer ${mrKey()}` },
        signal: AbortSignal.timeout(20_000),
        cache: 'no-store',
    })
    if (!res.ok) {
        // Un check fallido NO mata la tarea — el poller reintenta.
        return { status: 'processing' }
    }
    const data = (await res.json()) as {
        task_info?: { status?: string; error?: unknown }
        images?: string[]
    }
    const st = data.task_info?.status ?? ''
    if (st === 'completed' || st === 'succeeded') {
        const url = data.images?.[0]
        if (!url)
            return {
                status: 'failed',
                error: 'MuleRouter completó sin imágenes',
            }
        return { status: 'done', url }
    }
    if (st === 'failed') {
        return {
            status: 'failed',
            error: `MuleRouter task failed: ${JSON.stringify(data.task_info?.error ?? '').slice(0, 300)}`,
        }
    }
    return { status: 'processing' }
}
