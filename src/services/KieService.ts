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
 * Cover-crop a base64 image to a target aspect ratio (server-side via sharp).
 * Grok's image-to-image has NO size params and MIRRORS the input's aspect
 * ratio (verified live: square ref + aspect_ratio:"9:16" in input → 1024x1024
 * square out), so the only way to get the requested ratio is to send a ref
 * that's already in it. Crops with a top bias when trimming height — faces
 * live in the upper third of a reference.
 */
async function cropBase64ToAspect(
    base64: string,
    mimeType: string,
    aspectRatio: string,
): Promise<{ base64: string; mimeType: string }> {
    const original = { base64, mimeType }
    const [aw, ah] = aspectRatio.split(':').map(Number)
    if (!aw || !ah) return original
    try {
        const sharp = (await import('sharp')).default
        const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64
        const buf = Buffer.from(cleanBase64, 'base64')
        const meta = await sharp(buf).metadata()
        const w = meta.width ?? 0
        const h = meta.height ?? 0
        if (!w || !h) return original
        const target = aw / ah
        if (Math.abs(w / h - target) < 0.02) return original // already there
        let cw = w
        let ch = h
        let left = 0
        let top = 0
        if (w / h > target) {
            // Wider than target → trim the sides, keep the full height.
            cw = Math.round(h * target)
            left = Math.round((w - cw) / 2)
        } else {
            // Taller than target → trim height with a top bias (keep the face).
            ch = Math.round(w / target)
            top = Math.round((h - ch) / 4)
        }
        const out = await sharp(buf)
            .extract({ left, top, width: cw, height: ch })
            .jpeg({ quality: 92 })
            .toBuffer()
        return { base64: out.toString('base64'), mimeType: 'image/jpeg' }
    } catch (e) {
        console.warn('[KIE] aspect crop failed — sending the original ref:', e)
        return original
    }
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
    // Short body-shape phrase (describeBody(measurements)) woven INTO the i2i
    // face anchor. Image-heavy models (Seedream 5.0 Pro) copy the slim build
    // of the face ref and ignore body text that only lives later in the
    // prompt — repeating the concrete descriptors inside the anchor's early
    // tokens is what makes them land.
    bodyEmphasis?: string
    // Descripción del COLOR de cabello (getHairColorDescription) para el
    // ancla i2i: como "brown hair" dentro del [BODY:] tardío no pesa, los
    // modelos imagen-pesados siguen el pelo del ref/escena. En el ancla
    // temprana funciona como override (igual que el HAIR OVERRIDE de Gemini).
    hairEmphasis?: string
    // Color de ojos (getEyeColorDescription) — mismo patrón override que el
    // pelo, para el harness condensado de los difusores genéricos.
    eyeEmphasis?: string
    // Slider de identidad del avatar (0-100). Escala la cláusula de fidelidad
    // facial del ancla i2i — port condensado de las identity instructions de
    // Gemini (deepfake >85 / high >50 / flexible ≤50). El harness COMPLETO de
    // Gemini NO se porta: revienta los caps de prompt y ya rompió Wan 2.2.
    identityWeight?: number
}

type KieRefWithRole = { base64: string; mimeType: string; role?: string }

/**
 * Selección + orden CANÓNICO de los refs que acompañan a la cara en los
 * branches i2i multi-imagen (Seedream/Wan/FLUX.2), con su cláusula indexada
 * por imagen ("Image 3 is…" — la cara siempre es la imagen 1). Antes esos
 * branches solo leían body/asset y descartaban en silencio pose/scene/clone/
 * place aunque ya viajaban en referenceImages (mismo bug que los Assets:
 * "hoodie with logo" pintaba la palabra literal "LOGO"). Orden: body primero
 * (las cláusulas de cuerpo calibradas dicen "SECOND attached image"), clone
 * AL FINAL (igual que nano-banana-pro, el patrón que arregló GPT Image 2).
 */
function planExtraRefs(
    referenceImages: KieRefWithRole[] | undefined,
    maxExtras: number,
): { extras: KieRefWithRole[]; clauses: string; hasBody: boolean } {
    const byRole = (role: string) =>
        (referenceImages ?? []).filter((r) => r.role === role)
    const ordered = [
        ...byRole('body').slice(0, 3),
        ...byRole('bust').slice(0, 1),
        ...byRole('glutes').slice(0, 1),
        ...byRole('asset').slice(0, 3),
        ...byRole('pose').slice(0, 1),
        ...byRole('scene').slice(0, 1),
        ...byRole('place').slice(0, 1),
        ...byRole('clone').slice(0, 1),
    ].slice(0, maxExtras)
    const parts: string[] = []
    ordered.forEach((r, i) => {
        const n = i + 2
        switch (r.role) {
            // GUARD crítico en refs de región (aprendido en vivo: sin el
            // IGNORE, Seedream clonaba la ROPA/ESCENA/desnudez de la foto de
            // referencia y tiraba el [CLONE:] del texto — outputs en la playa
            // de la foto de glúteos o directamente desnuda).
            case 'bust':
                parts.push(
                    `Image ${n} shows her real BUST — copy ONLY its exact size, shape and fullness onto the generated body. IGNORE that image's clothing or nudity, pose, scene, lighting and background COMPLETELY; her outfit, pose and the scene come ONLY from the text description.`,
                )
                break
            case 'glutes':
                parts.push(
                    `Image ${n} shows her real GLUTES and hips — copy ONLY their exact size, shape, fullness and projection onto the generated body, thighs proportionally full to match. IGNORE that image's clothing or nudity, pose, scene, lighting and background COMPLETELY; her outfit, pose and the scene come ONLY from the text description.`,
                )
                break
            case 'asset':
                parts.push(
                    `Image ${n} is a brand asset (logo/graphic/product) — print this EXACT design on her clothing or props wherever the outfit shows a logo or graphic, reproducing its shapes, colors and lettering faithfully; never write placeholder text such as "LOGO".`,
                )
                break
            case 'pose':
                parts.push(
                    `Image ${n} is a POSE reference — copy ONLY the body position and pose from it; do NOT copy its face, identity, body proportions or clothing.`,
                )
                break
            case 'scene':
                parts.push(
                    `Image ${n} is a STYLE/SCENE reference — use it for the setting, lighting and composition; REPLACE its subject with her.`,
                )
                break
            case 'place':
                parts.push(
                    `Image ${n} shows the LOCATION — place her inside THIS exact environment, keeping its architecture, furniture, background and lighting; IGNORE any person appearing in it.`,
                )
                break
            case 'clone':
                parts.push(
                    `Image ${n} is the CLONE source — recreate its EXACT pose, body position, outfit, hands, any object held, framing, camera angle, lighting and setting. The person in image ${n} is a FACELESS MANNEQUIN: IGNORE their face and identity completely; the face comes ONLY from the FIRST image.`,
                )
                break
        }
    })
    return {
        extras: ordered,
        clauses: parts.length > 0 ? ` ${parts.join(' ')}` : '',
        hasBody: ordered.some((r) => r.role === 'body'),
    }
}

/**
 * Generate an image via KIE AI. Routes to the right endpoint based on the
 * model family — KIE has dedicated endpoints per family, not a single unified
 * createTask for everything.
 */
export async function generateImageKie(
    params: GenerateImageKieParams,
    // When provided, run in SUBMIT-ONLY mode: build the input, submit the KIE
    // task, write its id into `submitSink.taskId`, and return WITHOUT the long
    // server-side poll. The browser then polls `checkKieImageTask` — keeping the
    // server request short so a 50–140s generation can't outlive the serverless/
    // HTTP window (which silently lost finished results and double-charged).
    submitSink?: { taskId?: string },
): Promise<
    | { success: true; url: string; fullApiPrompt: string }
    | { success: false; error: string }
> {
    const { model, aspectRatio = '1:1', referenceImage, referenceImages, bodyEmphasis, hairEmphasis, eyeEmphasis, identityWeight } = params
    // Override de pelo compartido por los anclas i2i (seedream/wan): recolorea
    // aunque el ref o la escena sugieran otro tono.
    const hairClause = hairEmphasis
        ? ` Her hair MUST be ${hairEmphasis} — if the hair in the reference photo or the scene suggests a different color, RECOLOR it to this exact color.`
        : ''
    const eyeClause = eyeEmphasis ? ` Her eyes MUST be ${eyeEmphasis}.` : ''
    // Fidelidad facial escalada por el slider de identidad (port condensado de
    // las identity instructions de Gemini). ≤50 = flexible: solo el keep-face
    // base de cada ancla.
    const faceFidelityClause =
        identityWeight === undefined
            ? ''
            : identityWeight > 85
              ? ' FACE FIDELITY: match the reference face EXACTLY — same bone structure, nose, eye shape and spacing, lips, jawline, freckles/moles; do NOT beautify or genericize it.'
              : identityWeight > 50
                ? ' Keep her face strongly consistent with the reference — no drift.'
                : ''

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
        // Fallback to generic createTask flow. Each model family takes its own
        // size param + permissive flags (nsfw_checker=false disables KIE's
        // content filter — the whole point, Gemini/OpenAI block fashion/sensual).
        // These are wired for TEXT→IMAGE only: their image-to-image endpoints
        // take an http-URL ARRAY (input_urls/image_urls), not our base64 ref, so
        // we skip the reference (avatar-locked i2i for them is a follow-up). The
        // last `else` keeps the legacy shape for Grok/others (incl. base64 i2i).
        let resolvedModel = model
        // These models CAP prompt length (Seedream 3000, FLUX/Qwen/Ideogram 5000,
        // Nano Banana 2 20000). Our full avatar prompt (body + face + scene +
        // clone) can blow past it → KIE 500 "text length cannot exceed the
        // maximum". Cap at a word boundary, a bit under the limit for margin.
        // Kept well under each model's documented max — KIE's enforced limit is
        // stricter than the docs (4900 still 500'd on FLUX.2), and for i2i the
        // identity rides on the images so the text can be short anyway.
        // Seedream gets extra budget (documented cap 3000): the i2i face/body
        // anchor below adds ~430 chars AFTER this cap, so 2400 + anchor ≈ 2830
        // stays under the limit while letting more body-spec text survive.
        const promptCap = model.startsWith('nano-banana-2') ? 19000 : model === 'z-image' ? 1500 : model.startsWith('seedream/') ? 2400 : 1800
        let capped = promptText
        if (capped.length > promptCap) {
            capped = capped.slice(0, promptCap)
            const lastSpace = capped.lastIndexOf(' ')
            if (lastSpace > promptCap * 0.85) capped = capped.slice(0, lastSpace)
            console.warn(`[KIE] Prompt capped ${promptText.length}→${capped.length} for ${model}`)
        }
        const input: Record<string, unknown> = { prompt: capped }
        // Studio aspect ratio → the `image_size` enum some models want instead.
        const asImageSize = () => {
            switch (aspectRatio) {
                case '16:9':
                    return 'landscape_16_9'
                case '9:16':
                    return 'portrait_16_9'
                case '4:3':
                    return 'landscape_4_3'
                case '3:4':
                    return 'portrait_4_3'
                default:
                    return 'square_hd'
            }
        }
        if (model.startsWith('seedream/')) {
            input.aspect_ratio = aspectRatio
            // Lite en 'basic' degrada la CARA (reporte usuario: rasgos algo
            // deformados vs Pro con las mismas refs). Medido live: en 5-lite
            // 'high' cuesta LO MISMO (5.5cr) → gratis; en 5-pro 'high' cuesta
            // el DOBLE (14cr vs 7cr) y su cara ya va bien en basic → se queda.
            input.quality = model.startsWith('seedream/5-lite') ? 'high' : 'basic'
            input.nsfw_checker = false
        } else if (model.startsWith('flux-2/')) {
            input.aspect_ratio = aspectRatio
            input.resolution = '2K'
            input.nsfw_checker = false
        } else if (model === 'z-image') {
            input.aspect_ratio = aspectRatio
            input.nsfw_checker = false
        } else if (model.startsWith('qwen/')) {
            input.image_size = asImageSize()
            input.enable_safety_checker = false
            input.nsfw_checker = false
        } else if (model === 'wan/2-7-image') {
            // Wan 2.7 Image (Alibaba) — unified t2i + edit on the SAME id.
            // Precio plano 4.8cr (~$0.024) POR IMAGEN en 1K y 2K (medido
            // live) → 2K. n=1 OBLIGATORIO: sin él KIE genera 4 imágenes y
            // cobra 4× (19.2cr, verificado live). Sin moderación upstream
            // (edit NSFW verificado → success), a diferencia de
            // Qwen/FLUX.2/Grok que bloquean en SU lado.
            input.aspect_ratio = aspectRatio
            input.resolution = '2K'
            input.n = 1
            input.nsfw_checker = false
        } else if (model.startsWith('ideogram/')) {
            input.image_size = asImageSize()
            input.rendering_speed = 'QUALITY'
        } else if (model.startsWith('nano-banana-2')) {
            input.aspect_ratio = aspectRatio
            // Lite (gemini-3.1-flash-lite) is the speed/price point (~$0.034 @1K,
            // ~4s) — 2K would double its cost. Full nano-banana-2 stays at 2K.
            input.resolution = model === 'nano-banana-2-lite' ? '1K' : '2K'
        } else if (model === 'grok-imagine/image-to-image') {
            // Grok Imagine (xAI) — i2i ONLY + permissive (nsfw_checker off; xAI
            // barely censors, the reason we're adding it). No aspect_ratio /
            // image_size in its schema. Identity rides on the face ref, uploaded
            // → http URL into image_urls[] in the i2i lock block below.
            input.nsfw_checker = false
        } else {
            // Legacy generic: aspect_ratio + optional base64 i2i.
            input.aspect_ratio = aspectRatio
            if (referenceImage) {
                resolvedModel = model.replace('/text-to-image', '/image-to-image')
                input.image_url = `data:${referenceImage.mimeType};base64,${referenceImage.base64}`
            }
        }
        // i2i IDENTITY LOCK (experiment): FLUX.2 / Qwen can keep the avatar's
        // face from a reference — but their image-to-image endpoints need an HTTP
        // URL (FLUX.2: input_urls[]; Qwen: image_url), NOT base64. Upload the face
        // → public URL → switch to the i2i model. Falls back to text-only if the
        // upload fails so a generation never hard-errors on this.
        if (
            referenceImage &&
            (model.startsWith('flux-2/') ||
                model.startsWith('qwen/') ||
                model.startsWith('seedream/') ||
                model.startsWith('nano-banana-2') ||
                model === 'wan/2-7-image' ||
                model === 'grok-imagine/image-to-image')
        ) {
            try {
                if (model === 'grok-imagine/image-to-image') {
                    // Grok i2i takes up to 1 URL → send the face (identity
                    // anchor). It MIRRORS the ref's aspect ratio (no size params,
                    // verified live), so crop the ref to the requested ratio
                    // first or the output stays stuck at the ref's shape.
                    const cropped = await cropBase64ToAspect(
                        referenceImage.base64,
                        referenceImage.mimeType,
                        aspectRatio,
                    )
                    const refUrl = await uploadReferenceToSupabase(
                        cropped.base64,
                        cropped.mimeType,
                    )
                    input.image_urls = [refUrl]
                    // Single-input: paridad mínima — keep-face + fidelidad +
                    // overrides de pelo/ojos.
                    if (hairClause || eyeClause || faceFidelityClause) {
                        input.prompt = `Keep the EXACT face and likeness of the person in the reference image.${faceFidelityClause}${hairClause}${eyeClause} ${input.prompt}`
                    }
                    console.log(`[KIE] Grok i2i with 1 identity ref (AR-cropped)${hairClause ? ' + hair override' : ''}`)
                } else if (model.startsWith('seedream/')) {
                    // Seedream has real i2i variants that keep identity AND honor
                    // aspect_ratio/quality at the same credits as t2i (verified
                    // live: 4.5-edit + 5-lite-image-to-image, 9:16 out, same
                    // woman). Face ref → image_urls + swap to the i2i model id.
                    // Seedream 5 supports MULTI-image i2i (up to 10) → when a
                    // Body Ref exists, send it as image 2: 5.0 Pro weighs
                    // images far harder than text, so the body must be an
                    // IMAGE to win against the face ref's slim build.
                    // Refs extra en orden canónico (body/asset/pose/scene/
                    // place/clone) + cláusulas indexadas — Seedream 5 acepta
                    // hasta 10 imágenes.
                    const { extras, clauses: extraClauses, hasBody } =
                        planExtraRefs(referenceImages, 9)
                    const urls: string[] = [
                        await uploadReferenceToSupabase(
                            referenceImage.base64,
                            referenceImage.mimeType,
                        ),
                    ]
                    for (const r of extras) {
                        urls.push(
                            await uploadReferenceToSupabase(r.base64, r.mimeType),
                        )
                    }
                    resolvedModel =
                        model === 'seedream/4.5-text-to-image'
                            ? 'seedream/4.5-edit'
                            : model.replace('text-to-image', 'image-to-image')
                    input.image_urls = urls
                    // Two-way anchor. (1) Face rides on IMAGE 1: without an
                    // explicit keep-face instruction the identity drifts toward
                    // the written description (verified with a headshot ref +
                    // conflicting text). (2) Body: 5.0 Pro copies the face
                    // ref's slim build and ignores body text that appears
                    // later in the prompt (verified live: same prompt → Pro
                    // slim, Lite curvy). So the body rides on IMAGE 2 when a
                    // Body Ref exists; otherwise the CONCRETE descriptors
                    // (bodyEmphasis) are repeated inside the anchor's early
                    // tokens — not just a "follow the text below" pointer.
                    const bodyClause =
                        hasBody
                            ? `The SECOND attached image shows her real BODY — replicate its exact body shape, proportions, curves and build; do NOT take the body from the first image. IGNORE the second image's clothing, pose, scene, lighting and background — her outfit, pose and the scene come ONLY from the text description.`
                            : `Use the reference image ONLY for the face and identity: do NOT copy the body, build, weight or proportions from it — the person in the photo may look slimmer than she really is.${
                                  bodyEmphasis
                                      ? ` Her real body is: ${bodyEmphasis}. Render THAT body, visibly fuller and curvier than the reference photo suggests.`
                                      : ' Her body proportions MUST follow the text description below exactly (bust, waist, hips and thighs as written).'
                              }`
                    // Puntero final: sube la saliencia de la escena/pose que
                    // viene DESPUÉS del ancla — en 5-lite (modelo chico) un
                    // ancla larga diluía la pose (reporte: Lite la perdió,
                    // Pro no).
                    const seedreamAnchor = `The person in the FIRST attached reference image is the subject — keep her EXACT face, facial features and likeness from that image.${faceFidelityClause} ${bodyClause}${hairClause}${eyeClause}${extraClauses} Follow the SCENE, POSE and ACTION described below EXACTLY.`
                    // Presupuesto ANCHOR-AWARE: el cap estático de 2400 asumía
                    // un ancla de ~430 chars. Con el ancla crecida (fidelity +
                    // curvas + cláusulas de refs) el total podía rebasar el
                    // límite duro de KIE (~3000) y el retry de longitud
                    // recortaba TODO a 900 — decapitando la escena/pose. Se
                    // recorta AQUÍ la escena (nunca el ancla) para caber.
                    const sceneRoom = Math.max(600, 2900 - seedreamAnchor.length)
                    let sceneText = String(input.prompt)
                    if (sceneText.length > sceneRoom) {
                        sceneText = sceneText.slice(0, sceneRoom)
                        const sp = sceneText.lastIndexOf(' ')
                        if (sp > sceneRoom * 0.85) sceneText = sceneText.slice(0, sp)
                        console.warn(`[KIE] Seedream scene re-capped to ${sceneText.length} chars (anchor ${seedreamAnchor.length})`)
                    }
                    input.prompt = `${seedreamAnchor} ${sceneText}`
                    console.log(`[KIE] Seedream i2i (${resolvedModel}) with ${urls.length} ref(s) (roles: face${extras.length > 0 ? ', ' + extras.map((r) => r.role).join(', ') : ''}${hairClause ? ' + hair override' : ''})`)
                } else if (model.startsWith('nano-banana-2')) {
                    // nano-banana-2 / -lite take image_input[] (URL array, up to
                    // 14) on the SAME model id — no i2i variant swap needed.
                    // Mirrors the nano-banana-pro wiring (verified live with
                    // image_input on the same endpoint family). Face + optional
                    // Body Ref; Gemini models follow the keep-face note well.
                    // TODOS los refs en el ORDEN original (como nano-banana-
                    // pro): el REFERENCE MAPPING del harness (buildAvatarPrompt
                    // en el caller) etiqueta Image 1..N por ese orden — antes
                    // este branch re-armaba la lista (solo face+body+asset) y
                    // las etiquetas de pose/scene/clone mentían o se perdían.
                    const nbRefs = (
                        referenceImages && referenceImages.length > 0
                            ? referenceImages
                            : [referenceImage]
                    ).slice(0, 14)
                    const nbUrls: string[] = []
                    for (const r of nbRefs) {
                        nbUrls.push(await uploadReferenceToSupabase(r.base64, r.mimeType))
                    }
                    input.image_input = nbUrls
                    input.prompt = `The person in the first attached reference image is the subject — keep her EXACT face, facial features and likeness.${hairClause} ${input.prompt}`
                    console.log(`[KIE] ${model} with ${nbUrls.length} ref(s) via image_input (roles: ${nbRefs.map((r) => ('role' in r && r.role) || 'face').join(', ')})`)
                } else if (model === 'wan/2-7-image') {
                    // Wan 2.7 edita/genera con refs en el MISMO id: input_urls
                    // (hasta 9). Cara primero + Body Ref opcional; conserva el
                    // aspect_ratio/resolution ya seteados en el branch t2i.
                    // Igual que Seedream 5 Pro, pesa MÁS las imágenes que el
                    // texto: sin ancla de cuerpo copia el build delgado del
                    // face ref e ignora las medidas [BODY:] que van después
                    // (reporte del usuario: misma generación → Gemini con las
                    // medidas, Wan plano). Mismo two-way anchor que Seedream:
                    // cuerpo por IMAGEN 2 si hay Body Ref; si no, los
                    // descriptores concretos (bodyEmphasis) dentro del ancla.
                    // En EDICIÓN (sin bodyEmphasis ni Body Ref) se conserva el
                    // keep-face simple verificado — el cuerpo ya viene en la
                    // foto fuente y no hay que "engordarlo".
                    // Refs extra en orden canónico + cláusulas indexadas —
                    // Wan acepta hasta 9 input_urls (cara + 8 extras).
                    const {
                        extras: wanExtras,
                        clauses: wanExtraClauses,
                        hasBody: wanHasBody,
                    } = planExtraRefs(referenceImages, 8)
                    const wanUrls: string[] = [
                        await uploadReferenceToSupabase(
                            referenceImage.base64,
                            referenceImage.mimeType,
                        ),
                    ]
                    for (const r of wanExtras) {
                        wanUrls.push(await uploadReferenceToSupabase(r.base64, r.mimeType))
                    }
                    input.input_urls = wanUrls
                    // Calibración POR REGIÓN (2ª ronda, verificada con casos
                    // reales): la amplificación global de Seedream hacía que
                    // Wan SE PASARA en busto/torso (Evelyn), pero la precisión
                    // pura lo dejaba CORTO en caderas (Ana 90/60/100 salía
                    // slim). El sesgo de Wan es copiar el build del face ref en
                    // la CADERA/muslos → amplificar SOLO lower body, con guard
                    // explícito de busto/masa.
                    const wanBodyClause =
                        wanHasBody
                            ? ` The SECOND attached image shows her real BODY — replicate its exact body shape, proportions, curves and build; do NOT take the body from the first image. IGNORE the second image's clothing, pose, scene, lighting and background — her outfit, pose and the scene come ONLY from the text description.`
                            : bodyEmphasis
                              ? ` Use the reference image ONLY for the face and identity — do NOT copy the body proportions from it: the person in the photo looks SLIMMER than the character really is. Her real body is: ${bodyEmphasis}. Her hips, glutes and thighs must be visibly FULLER and WIDER than in the reference photo — the narrow waist makes the hip curve obvious. Keep the bust true to the spec: do NOT inflate the chest or add overall body mass beyond it.`
                              : ''
                    input.prompt = `The person in the FIRST attached reference image is the subject — keep her EXACT face, facial features and likeness from that image.${faceFidelityClause}${wanBodyClause}${hairClause}${eyeClause}${wanExtraClauses} Follow the SCENE, POSE and ACTION described below EXACTLY. ${input.prompt}`
                    console.log(`[KIE] Wan 2.7 Image with ${wanUrls.length} ref(s) via input_urls (roles: face${wanExtras.length > 0 ? ', ' + wanExtras.map((r) => r.role).join(', ') : ''}${wanBodyClause && !wanHasBody ? ' + body-text anchor' : ''}${hairClause ? ' + hair override' : ''})`)
                } else if (model.startsWith('flux-2/')) {
                    // FLUX.2 takes up to 8 refs → send the face (identity anchor) +
                    // a Body Ref (imitate the body) so BOTH are locked from images,
                    // not just the face. Measurements text stays the default when
                    // there's no Body Ref.
                    // Mismo plan de refs extra que Seedream/Wan (≤8 URLs
                    // total) + ancla keep-face con override de pelo — antes
                    // FLUX.2 no llevaba ancla y descartaba assets/pose/scene.
                    const {
                        extras: fluxExtras,
                        clauses: fluxClauses,
                        hasBody: fluxHasBody,
                    } = planExtraRefs(referenceImages, 7)
                    const urls: string[] = [
                        await uploadReferenceToSupabase(
                            referenceImage.base64,
                            referenceImage.mimeType,
                        ),
                    ]
                    for (const r of fluxExtras) {
                        urls.push(await uploadReferenceToSupabase(r.base64, r.mimeType))
                    }
                    resolvedModel = model.replace('text-to-image', 'image-to-image')
                    input.input_urls = urls
                    const fluxBodyClause = fluxHasBody
                        ? ` The SECOND attached image shows her real BODY — replicate its exact body shape, proportions, curves and build; do NOT take the body from the first image. IGNORE the second image's clothing, pose, scene, lighting and background — her outfit, pose and the scene come ONLY from the text description.`
                        : ''
                    input.prompt = `The person in the FIRST attached image is the subject — keep her EXACT face, facial features and likeness from that image.${faceFidelityClause}${fluxBodyClause}${hairClause}${eyeClause}${fluxClauses} Follow the SCENE, POSE and ACTION described below EXACTLY. ${input.prompt}`
                    console.log(`[KIE] FLUX.2 i2i with ${urls.length} ref(s) (roles: face${fluxExtras.length > 0 ? ', ' + fluxExtras.map((r) => r.role).join(', ') : ''})`)
                } else {
                    // qwen/image-to-image: single image_url (face); size from the ref.
                    const refUrl = await uploadReferenceToSupabase(
                        referenceImage.base64,
                        referenceImage.mimeType,
                    )
                    resolvedModel = model.replace('text-to-image', 'image-to-image')
                    input.image_url = refUrl
                    delete input.image_size
                    // Single-input: paridad mínima — keep-face + fidelidad +
                    // overrides de pelo/ojos.
                    input.prompt = `Keep the EXACT face and likeness of the person in the reference image.${faceFidelityClause}${hairClause}${eyeClause} ${input.prompt}`
                }
            } catch (e) {
                console.warn('[KIE] ref upload failed, staying text-only:', e)
            }
        }

        console.log(`[KIE] Submitting generic image task: model=${resolvedModel}`)
        // Submit-only (browser-polled) path: hand back the taskId, skip the poll.
        // Keeps the sync path's self-healing SUBMIT retries — createTask rejects
        // both failures synchronously, so they belong here too:
        // - "text length cannot exceed the maximum limit": KIE enforces stricter
        //   per-model/variant caps than documented → shrink to ~900 chars (the
        //   identity anchor leads the prompt, so it survives) and resubmit once.
        // - "internal error, please try again later": transient, resubmit once.
        if (submitSink) {
            try {
                submitSink.taskId = await withTimeout(
                    submitTask({ model: resolvedModel, input }),
                    30_000,
                    'KIE image submit',
                )
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                const isTransient = /internal error/i.test(msg)
                const isTooLong = /text length|maximum limit/i.test(msg)
                if (!isTransient && !isTooLong) throw err
                if (isTooLong) {
                    const hard = String(input.prompt ?? '').slice(0, 900)
                    const cut = hard.lastIndexOf(' ')
                    input.prompt = cut > 700 ? hard.slice(0, cut) : hard
                    console.warn(
                        `[KIE] ${resolvedModel} rejected the prompt length — retrying submit at ${String(input.prompt).length} chars`,
                    )
                } else {
                    console.warn('[KIE] Transient internal error — resubmitting once')
                    await new Promise((r) => setTimeout(r, 2000))
                }
                submitSink.taskId = await withTimeout(
                    submitTask({ model: resolvedModel, input }),
                    30_000,
                    'KIE image submit (retry)',
                )
            }
            return { url: '', fullApiPrompt: promptText }
        }
        // Self-healing retries (ONE resubmit) for two recoverable failures:
        // - "internal error, please try again later" — transient on KIE's side
        //   (their own message says to retry).
        // - "text length cannot exceed the maximum limit" — KIE enforces
        //   per-model limits STRICTER than documented (and they vary by model /
        //   i2i variant), so a prompt inside our generic cap can still bounce.
        //   Shrink hard to ~900 chars and resubmit: the identity-critical part
        //   (body preamble + [FACE:]) leads the prompt, so it's what survives.
        let urls: string[]
        try {
            const taskId = await withTimeout(submitTask({ model: resolvedModel, input }), 30_000, 'KIE image submit')
            urls = await pollTask(taskId, { budgetMs: 600_000, intervalMs: 3000 })
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            const isTransient = /internal error/i.test(msg)
            const isTooLong = /text length|maximum limit/i.test(msg)
            if (!isTransient && !isTooLong) throw err
            if (isTooLong) {
                const hard = String(input.prompt ?? '').slice(0, 900)
                const cut = hard.lastIndexOf(' ')
                input.prompt = cut > 700 ? hard.slice(0, cut) : hard
                console.warn(
                    `[KIE] ${resolvedModel} rejected the prompt length — retrying at ${String(input.prompt).length} chars`,
                )
            } else {
                console.warn('[KIE] Transient internal error — resubmitting once')
                await new Promise((r) => setTimeout(r, 2000))
            }
            const retryId = await withTimeout(submitTask({ model: resolvedModel, input }), 30_000, 'KIE image submit (retry)')
            urls = await pollTask(retryId, { budgetMs: 600_000, intervalMs: 3000 })
        }
        const persistedUrl = await persistToSupabase(urls[0], 'png', 'kie-images')
        return { url: persistedUrl, fullApiPrompt: promptText }
    }

    // Content-moderation flag from the provider (Google/OpenAI via KIE).
    // "nsfw" incluido: FLUX.2 (Black Forest Labs) responde "422 nsfw" desde SU
    // moderación upstream — nsfw_checker:false solo apaga el filtro de KIE, no
    // el del proveedor del modelo. Sin este término la escalera de sanitización
    // nunca se disparaba para FLUX.2.
    const isSensitiveBlock = (m: string) =>
        /flagged as sensitive|sensitive|safety|content policy|moderat|violat|nsfw/i.test(m)

    // Honor "no tattoos / sin tatuajes" by removing tattoo mentions up front.
    const promptIn = stripNegatedTattoos(params.prompt)

    // The word-swap sanitizer exists for the Google/OpenAI models KIE hosts
    // (their upstream filters flag "bikini" etc.). The PERMISSIVE families run
    // with nsfw_checker OFF — sanitizing them only mangles the garment
    // ("mini bikini" → "mini swim set" made Seedream render a MINI SKIRT and
    // drop the bikini bottom, verified in prod). They get the RAW prompt;
    // sanitization stays as the on-block fallback only.
    const isPermissiveModel =
        model.startsWith('seedream/') ||
        model.startsWith('flux-2/') ||
        model.startsWith('qwen/') ||
        model === 'z-image' ||
        model === 'wan/2-7-image' ||
        model.startsWith('grok-imagine/')

    // Submit-only mode: ONE submit, no sanitization ladder (permissive models
    // rarely block with nsfw off — same single-submit behavior as the other
    // async KIE image models). The browser polls checkKieImageTask afterward.
    if (submitSink) {
        try {
            const first = isPermissiveModel
                ? promptIn
                : sanitizePromptForGeneration(promptIn).sanitized
            return { success: true, ...(await runWithPrompt(first)) }
        } catch (err) {
            return {
                success: false,
                error: err instanceof Error ? err.message : String(err),
            }
        }
    }

    try {
        // Attempt 1: raw for permissive models; light sanitization (bikini →
        // two-piece swimwear, etc.) for the filtered Google/OpenAI families.
        const first = isPermissiveModel
            ? promptIn
            : sanitizePromptForGeneration(promptIn).sanitized
        try {
            return { success: true, ...(await runWithPrompt(first)) }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            if (!isSensitiveBlock(msg)) throw err
            // Attempt 2 on a content block: light sanitization if we haven't
            // tried it yet, else aggressive (strip revealing terms entirely) —
            // same recovery the direct Gemini path uses.
            // Si sanitizar VACÍA el prompt (p.ej. era solo "topless"), no
            // reenviamos: KIE respondería el críptico 500 "prompt is required".
            // Devolvemos el bloqueo real con la salida recomendada.
            const upstreamBlocked = (m: string) =>
                new Error(
                    `La moderación del proveedor del modelo bloqueó este contenido (${m}) y no queda prompt utilizable tras sanitizar. Para ediciones NSFW usa Wan 2.7 Image · KIE.`,
                )
            let retryPrompt = isPermissiveModel
                ? sanitizePromptForGeneration(promptIn).sanitized
                : aggressiveSanitize(promptIn).sanitized
            // Si la sanitización ligera no cambió NADA (p.ej. "topless" no está
            // en sus reglas), reintentar sería repetir la misma petición
            // bloqueada — salta directo a la agresiva.
            if (retryPrompt === first) retryPrompt = aggressiveSanitize(promptIn).sanitized
            if (!retryPrompt.trim()) throw upstreamBlocked(msg)
            console.warn('[KIE] Sensitive-content block — retrying with sanitized prompt')
            try {
                return { success: true, ...(await runWithPrompt(retryPrompt)) }
            } catch (err2) {
                const msg2 = err2 instanceof Error ? err2.message : String(err2)
                if (!isSensitiveBlock(msg2) || !isPermissiveModel) throw err2
                // Attempt 3 (permissive only): aggressive as the last resort.
                const { sanitized: aggressive } = aggressiveSanitize(promptIn)
                if (!aggressive.trim()) throw upstreamBlocked(msg2)
                // Ya se intentó exactamente esto en el intento 2 — no repetir.
                if (aggressive === retryPrompt) throw err2
                console.warn('[KIE] Still blocked — retrying with aggressive sanitization')
                return { success: true, ...(await runWithPrompt(aggressive)) }
            }
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
        // Generic permissive/diffusion models (seedream, flux-2, qwen, ideogram,
        // z-image, nano-banana-2, grok, wan-image): reuse generateImageKie's full
        // input-building (i2i refs, model-aware params) in SUBMIT-ONLY mode so the
        // long poll moves to the browser (checkKieImageTask). Same fix as video.
        const sink: { taskId?: string } = {}
        const r = await generateImageKie(params, sink)
        if (!r.success) return { success: false, error: r.error }
        if (!sink.taskId) {
            return { success: false, error: 'KIE no devolvió taskId (submit)' }
        }
        return { success: true, taskId: sink.taskId, fullApiPrompt: r.fullApiPrompt }
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
    // 600s to match every other KIE poll budget in this file (Flux/pollTask) —
    // the OpenAI proxy queue routinely exceeds 300s under load.
    const budgetMs = 600_000
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
async function submitVideoKling3(params: GenerateVideoKieParams): Promise<string> {
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
    return taskId
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
 * SUBMIT a KIE video task and return its taskId immediately (NO long poll).
 * Routes per model — newer KIE endpoints (Seedance, Wan) need HTTP-only
 * references + integer durations, so they can't share the legacy generic body.
 *
 * Why submit-only: the previous flow held ONE server request open the full
 * 50–140s while polling KIE. When that wait outlived the serverless function /
 * HTTP connection window, the client's await REJECTED even though KIE finished
 * — so successful videos were never added to the gallery, and the user, seeing
 * a "failure", re-generated → duplicate task → double charge. The browser now
 * polls `checkKieVideoTask` instead, so no single request runs long.
 */
async function submitVideoKieTaskId(
    params: GenerateVideoKieParams,
): Promise<string> {
    if (params.model === 'bytedance/seedance-2') {
        return submitVideoSeedance(params)
    }
    if (params.model === 'wan/2-7-image-to-video') {
        return submitVideoWan27(params)
    }
    if (params.model === 'wan/2-2-a14b-image-to-video-turbo') {
        return submitVideoWan22(params)
    }
    if (params.model === 'kling-3.0/video') {
        return submitVideoKling3(params)
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
    return taskId
}

/**
 * Poll+persist wrapper so existing SERVER callers keep the URL-returning API.
 * Still susceptible to the long-request timeout — new CLIENT code should use
 * `submitVideoKieTask` + browser polling (`checkKieVideoTask`) instead.
 */
export async function generateVideoKie(
    params: GenerateVideoKieParams,
): Promise<string> {
    const taskId = await submitVideoKieTaskId(params)
    const urls = await pollTask(taskId, { budgetMs: 600_000, intervalMs: 5000 })
    return persistToSupabase(urls[0], 'mp4', 'kie-videos')
}

/**
 * Error-as-data SUBMIT for the browser-polled video flow (mirrors
 * `submitKieImageTask` / `submitTalkingVideoKieTask`). Returns a taskId fast;
 * the client then polls `checkKieVideoTask` until the mp4 is ready.
 */
export async function submitVideoKieTask(
    params: GenerateVideoKieParams,
): Promise<{ success: true; taskId: string } | { success: false; error: string }> {
    try {
        return { success: true, taskId: await submitVideoKieTaskId(params) }
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
}

/**
 * ByteDance Seedance 2.0. Unified /jobs/createTask submit, polling via
 * /jobs/recordInfo. Reference image must be a public HTTP URL (we upload
 * to Supabase first), and duration must be an integer (not stringified).
 */
async function submitVideoSeedance(params: GenerateVideoKieParams): Promise<string> {
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
    return taskId
}

/**
 * Wan 2.7 image-to-video. Requires a first frame; aspect ratio is inferred
 * from the reference image rather than being a separate parameter.
 */
async function submitVideoWan27(params: GenerateVideoKieParams): Promise<string> {
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
    return taskId
}

/**
 * Wan 2.2 A14B image-to-video TURBO — el modelo de video SIN CENSURA. Es
 * open-weights (Apache 2.0, sin filtro embebido) y en KIE `nsfw_checker`
 * viene en false POR DEFECTO (docs.kie.ai/market/wan/2-2-a14b-image-to-video-turbo);
 * lo mandamos explícito por si el default cambia. i2v-only: la identidad
 * viaja en la imagen (first frame). Sin parámetros de duración/aspect —
 * el output hereda el ratio de la imagen; resolución 480p/720p.
 */
async function submitVideoWan22(params: GenerateVideoKieParams): Promise<string> {
    const { prompt, firstFrameImage, resolution = '720p' } = params

    if (!firstFrameImage) {
        throw new Error('Wan 2.2 requiere una imagen de referencia (first frame). Agrega una face/general ref o usa Animate sobre una imagen.')
    }

    const url = await uploadReferenceToSupabase(
        firstFrameImage.base64,
        firstFrameImage.mimeType,
    )
    console.log(`[KIE/Wan2.2] Uploaded reference to: ${url}`)

    // Wan 2.2 turbo 500s ("Internal Error, Please try again later") on the
    // structured avatar harness — verified live 2026-07-17: same image, prompt
    // WITH [BODY:]/[FACE:] blocks (925 chars) → fail 500 twice (task
    // 80cea769…); short motion-only prompt → success. In i2v the identity
    // rides on the IMAGE anyway, so strip the bracket blocks (motion text is
    // what matters) and keep the rest well under the choke point. Wan 2.7
    // tolerates the harness fine — this is 2.2-only.
    const motionPrompt = prompt
        .replace(/\[[A-Z][A-Z_ ]*:[^\]]*\]/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, 800)

    const input: Record<string, unknown> = {
        prompt: motionPrompt || 'natural subtle motion, cinematic',
        image_url: url,
        // Only 480p/720p exist on this endpoint — clamp anything higher.
        resolution: resolution === '480p' ? '480p' : '720p',
        nsfw_checker: false,
    }
    if (motionPrompt.length !== prompt.trim().length) {
        console.log(`[KIE/Wan2.2] Prompt stripped for turbo: ${prompt.length}→${String(input.prompt).length} chars`)
    }

    console.log(`[KIE/Wan2.2] Submitting: resolution=${input.resolution}`)
    const taskId = await withTimeout(
        submitTask({ model: 'wan/2-2-a14b-image-to-video-turbo', input }),
        30_000,
        'KIE Wan 2.2 submit',
    )
    console.log(`[KIE/Wan2.2] Task submitted: ${taskId}`)
    return taskId
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
