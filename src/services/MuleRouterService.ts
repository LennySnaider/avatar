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
/** Tiers del mismo API (docs: Max $0.075 premium, Plus $0.03 económico). */
const MR_EDIT_PATH: Record<'max' | 'plus', string> = {
    max: '/vendors/alibaba/v1/qwen-image-edit-max/generation',
    plus: '/vendors/alibaba/v1/qwen-image-edit-plus/generation',
}

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
    /** Imágenes EN ORDEN — su posición ES el "Image N" que nombra el prompt.
     *  El ORDEN IMPORTA: Qwen edita la PRIMERA (es su lienzo), así que con un
     *  Clone Ref este va primero y la cara entra por face-swap; sin clone la
     *  cara es la primera. Máximo 3 (tope del API). */
    images: Array<{ base64: string; mimeType: string }>
    /** "width*height", ambos en [512,2048]. Default 928*1664 (9:16). */
    size?: string
    /** Seed estable por avatar (consistencia corporal entre gens). */
    seed?: number
    /** Tier: 'max' ($0.075, default) o 'plus' ($0.03 económico). */
    tier?: 'max' | 'plus'
}): Promise<
    | { success: true; taskId: string; fullApiPrompt: string }
    | { success: false; error: string }
> {
    try {
        // El AR de salida lo fija `size` explícito, no la última imagen
        // (verificado: la hoja es 16:9 y los outputs salían 9:16 igual).
        const images = await Promise.all(
            params.images
                .slice(0, 3)
                .map((i) => uploadReferenceToSupabase(i.base64, i.mimeType)),
        )
        if (images.length === 0) {
            return { success: false, error: 'MuleRouter necesita al menos una imagen' }
        }
        const prompt = params.prompt.slice(0, 800)
        const body = {
            images,
            prompt,
            ...(params.negativePrompt
                ? { negative_prompt: params.negativePrompt.slice(0, 500) }
                : {}),
            // Nuestro prompt ya es profesional — el rewriter podría además
            // suavizar/rechazar el NSFW. Siempre off.
            prompt_extend: false,
            safety_filter: false,
            size: params.size ?? '928*1664',
            ...(typeof params.seed === 'number' ? { seed: params.seed } : {}),
        }
        const res = await fetch(
            `${MR_BASE}${MR_EDIT_PATH[params.tier ?? 'max']}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${mrKey()}`,
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(30_000),
            },
        )
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
        console.log(`[MuleRouter] Edit ${params.tier ?? 'max'} task: ${taskId}`)
        return { success: true, taskId, fullApiPrompt: prompt }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { success: false, error: msg }
    }
}

export async function checkMuleRouterImageTask(
    taskId: string,
    tier: 'max' | 'plus' = 'max',
): Promise<
    | { status: 'processing' }
    | { status: 'done'; url: string }
    | { status: 'failed'; error: string }
> {
    const res = await fetch(`${MR_BASE}${MR_EDIT_PATH[tier]}/${taskId}`, {
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

// ─────────────────────────────────────────────────────────────────────────────
// VÍDEO — Wan 2.6 (Alibaba) vía MuleRouter
//
// Slugs VERIFICADOS contra la API (POST vacío → 400 "expected to be provided"
// = la ruta existe; 404 = no existe). NO hay variante "spark" ni "flash" en
// 2.6: ambas dan 404, solo existieron en 2.2.
//
// Mismo patrón que el editor de imagen: POST devuelve `task_info.id` (202) y se
// sondea con GET a la MISMA ruta + /{id}. Verificado: con un uuid inexistente
// responde "Task with ID … does not exist" (búsqueda real), no un 404 de ruta.
// ─────────────────────────────────────────────────────────────────────────────

/** Modelos de vídeo Wan 2.6 disponibles. */
export type MuleRouterVideoModel =
    /** Anima una IMAGEN (la vía natural desde la galería del Studio). */
    | 'wan2.6-i2v'
    /** Vídeo desde TEXTO, sin imagen de partida. */
    | 'wan2.6-t2v'
    /** REFERENCIA: toma vídeos del personaje para mantener su identidad. */
    | 'wan2.6-r2v'

const MR_VIDEO_PATH = (model: MuleRouterVideoModel) =>
    `/vendors/alibaba/v1/${model}/generation`

export interface MuleRouterVideoParams {
    model: MuleRouterVideoModel
    /** Movimiento/acción. Tope del API: 2000 chars (10× el del editor). */
    prompt: string
    negativePrompt?: string
    /** i2v: imagen de partida (base64 → se sube y viaja como URL). */
    image?: { base64: string; mimeType: string }
    /** r2v: vídeos del personaje ya accesibles por URL. */
    videoUrls?: string[]
    resolution?: '720P' | '1080P'
    /** El API solo acepta 5, 10 o 15. */
    duration?: 5 | 10 | 15
    /**
     * AUDIO. El API lo trae en `true` por DEFECTO: si no se apaga, inventa una
     * pista en cada generación. Aquí el default es EXPLÍCITO para que la
     * decisión sea del usuario, no de la API.
     */
    audio?: boolean
    /** Voz clonada del avatar (wav/mp3, 3-30s, ≤15MB) — conduce el vídeo. */
    audioUrl?: string
    /** Multi-plano: solo surte efecto con prompt_extend activo. */
    shotType?: 'single' | 'multi'
    /** Reescritura inteligente del prompt por parte del API. */
    promptExtend?: boolean
    seed?: number
}

export async function submitMuleRouterVideoTask(
    params: MuleRouterVideoParams,
): Promise<
    | { success: true; taskId: string; fullApiPrompt: string }
    | { success: false; error: string }
> {
    try {
        const prompt = params.prompt.slice(0, 2000)
        const body: Record<string, unknown> = {
            prompt,
            ...(params.negativePrompt
                ? { negative_prompt: params.negativePrompt.slice(0, 500) }
                : {}),
            resolution: params.resolution ?? '720P',
            ...(params.duration ? { duration: params.duration } : {}),
            // Nuestro prompt ya es deliberado; el rewriter además puede
            // suavizar el NSFW. Off salvo que se pida multi-plano, que SOLO
            // funciona con el rewriter encendido (regla del API).
            prompt_extend: params.promptExtend ?? params.shotType === 'multi',
            ...(params.shotType ? { shot_type: params.shotType } : {}),
            safety_filter: false,
            audio: params.audio ?? false,
            ...(params.audioUrl ? { audio_url: params.audioUrl } : {}),
            ...(typeof params.seed === 'number' ? { seed: params.seed } : {}),
        }

        if (params.model === 'wan2.6-i2v') {
            if (!params.image)
                return {
                    success: false,
                    error: 'wan2.6-i2v necesita una imagen de partida',
                }
            body.image = await uploadReferenceToSupabase(
                params.image.base64,
                params.image.mimeType,
            )
        }
        if (params.model === 'wan2.6-r2v') {
            if (!params.videoUrls?.length)
                return {
                    success: false,
                    error: 'wan2.6-r2v necesita al menos un vídeo de referencia',
                }
            body.video_urls = params.videoUrls
        }

        const res = await fetch(`${MR_BASE}${MR_VIDEO_PATH(params.model)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${mrKey()}`,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(60_000),
        })
        if (!res.ok) {
            const text = await res.text().catch(() => '')
            return {
                success: false,
                error: `MuleRouter ${params.model} ${res.status}: ${text.slice(0, 300)}`,
            }
        }
        const data = (await res.json()) as {
            task_info?: { id?: string; status?: string }
        }
        const taskId = data.task_info?.id
        if (!taskId)
            return { success: false, error: 'MuleRouter no devolvió task_info.id' }
        console.log(`[MuleRouter] ${params.model} task: ${taskId}`)
        return { success: true, taskId, fullApiPrompt: prompt }
    } catch (err) {
        return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
        }
    }
}

export async function checkMuleRouterVideoTask(
    taskId: string,
    model: MuleRouterVideoModel = 'wan2.6-i2v',
): Promise<
    | { status: 'processing' }
    | { status: 'done'; url: string }
    | { status: 'failed'; error: string }
> {
    const res = await fetch(
        `${MR_BASE}${MR_VIDEO_PATH(model)}/${taskId}`,
        {
            headers: { Authorization: `Bearer ${mrKey()}` },
            signal: AbortSignal.timeout(20_000),
            cache: 'no-store',
        },
    )
    // Un check fallido NO mata la tarea — el poller reintenta.
    if (!res.ok) return { status: 'processing' }
    const data = (await res.json()) as {
        task_info?: { status?: string; error?: unknown }
        videos?: string[]
        video?: string
        images?: string[]
    }
    const st = data.task_info?.status ?? ''
    if (st === 'completed' || st === 'succeeded') {
        // El campo de salida no está documentado para vídeo: se aceptan las
        // tres formas plausibles en vez de asumir una y fallar en silencio.
        const url = data.videos?.[0] ?? data.video ?? data.images?.[0]
        if (!url)
            return {
                status: 'failed',
                error: `MuleRouter completó sin vídeo (claves: ${Object.keys(data).join(', ')})`,
            }
        return { status: 'done', url }
    }
    if (st === 'failed')
        return {
            status: 'failed',
            error: `MuleRouter ${model} falló: ${JSON.stringify(data.task_info?.error ?? '').slice(0, 300)}`,
        }
    return { status: 'processing' }
}
