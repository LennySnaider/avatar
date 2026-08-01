'use server'

import { createHash } from 'crypto'
import {
    putMediaObject,
    r2Enabled,
    r2ObjectExists,
    getR2PublicUrl,
} from '@/lib/mediaStore'
import { createServerSupabaseClient } from '@/lib/supabase'
import {
    centerCropToAspect,
    uploadBufferToGenerations,
} from '@/lib/mediaPersist'
import { orgStoragePath } from '@/lib/storagePaths'
import { tryGetOrgContext } from '@/lib/tenant/getOrgContext'
import {
    holdForOperation,
    refundHold,
    settleHold,
    linkHoldToRef,
    insufficientTokensMessage,
} from '@/lib/billing/wallet'
import {
    resolveImageProviderId,
    resolveVideoProviderId,
} from '@/lib/billing/catalog'
import {
    sanitizePromptForGeneration,
    aggressiveSanitize,
    stripNegatedTattoos,
} from '@/utils/promptSanitizer'
import { buildImageRequest } from './kie/dispatch'
import type { KieRefWithRole } from './kie/shared'
import {
    apiTrackPendingGeneration,
    apiClearPendingGeneration,
} from './PendingGenerationService'
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
        const t = setTimeout(
            () => reject(new Error(`${label} timed out after ${ms}ms`)),
            ms,
        )
        p.then(
            (v) => {
                clearTimeout(t)
                resolve(v)
            },
            (e) => {
                clearTimeout(t)
                reject(e)
            },
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

/**
 * Deja rastro de un taskId que se sondea EN EL SERVIDOR (poll síncrono).
 *
 * El camino async ya registra su tarea desde el navegador antes de empezar a
 * sondear; el síncrono no registraba NADA: el id nacía y moría dentro de esta
 * función. Si la función se corta —el presupuesto del poll son 600s y el
 * maxDuration por defecto de Vercel es menor— la tarea sigue viva en KIE,
 * termina bien, y en la app no queda ni el id para reclamarla. Generación
 * pagada, resultado en el CDN del proveedor, y cero rastro.
 *
 * Nunca lanza (apiTrackPendingGeneration ya se lo traga): es telemetría de
 * rescate y no debe tumbar una generación que el usuario ya pagó.
 */
async function trackSyncKieTask(
    taskId: string,
    model: string,
    prompt: string,
    aspectRatio: string,
): Promise<void> {
    await apiTrackPendingGeneration({
        provider: 'kie',
        taskId,
        mediaType: 'IMAGE',
        prompt,
        aspectRatio,
        metadata: { model, syncPoll: true },
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
        throw new Error(
            `KIE createTask error: code=${json.code} msg=${json.msg}`,
        )
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
                console.warn(
                    `[KIE] recordInfo fetch aborted (>${POLL_FETCH_TIMEOUT_MS}ms), retrying`,
                )
                await new Promise((resolve) => setTimeout(resolve, intervalMs))
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
            // MISMA traduccion que el check async: hay DOS superficies de
            // fallo y parchear solo una deja el mensaje crudo por el otro
            // camino — que es justo por donde salio el reporte.
            throw new Error(
                explainKieFailure(
                    `${json.data.failCode || ''} ${json.data.failMsg || 'Unknown error'}`.trim(),
                ),
            )
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs))
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
): Promise<
    | { state: 'running' }
    | { state: 'success'; urls: string[] }
    | { state: 'fail'; error: string }
> {
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
            console.warn(
                `[KIE] recordInfo transient ${res.status}; still polling`,
            )
            return { state: 'running' }
        }
        throw new Error(`KIE recordInfo failed (${res.status}): ${text}`)
    }
    const json: KieRecordInfoResponse = await res.json()
    const state = json.data?.state
    if (state === 'success') {
        const parsed: KieResultJsonShape = json.data.resultJson
            ? JSON.parse(json.data.resultJson)
            : {}
        const urls = parsed.resultUrls ?? []
        if (urls.length === 0)
            return {
                state: 'fail',
                error: 'KIE task succeeded but returned no resultUrls',
            }
        return { state: 'success', urls }
    }
    if (state === 'fail') {
        const raw =
            `${json.data.failCode || ''} ${json.data.failMsg || 'Unknown error'}`.trim()
        return { state: 'fail', error: explainKieFailure(raw) }
    }
    return { state: 'running' }
}

/**
 * Traduce los fallos de KIE que tienen una CAUSA accionable. El mensaje crudo
 * dice QUE pasó pero no qué hacer, y el usuario acaba reportándolo como bug
 * cuando en realidad es un requisito del modelo que no le contamos.
 *
 * Se conserva SIEMPRE el texto original al final: si mañana cambian el
 * wording, el mensaje sigue siendo diagnosticable.
 */
// NO se exporta: en un archivo `'use server'` TODO export debe ser async, y
// esto es una funcion pura. Solo la usa este modulo.
function explainKieFailure(raw: string): string {
    // Kling motion-control necesita ver a una PERSONA en el vídeo que conduce
    // el movimiento. Caso real: se uso un clip que solo mostraba las piernas.
    if (/no valid characters detected/i.test(raw)) {
        // Mensaje REESCRITO (2026-07-26): decia "no muestra una persona
        // reconocible", y el usuario lo recibio con una cara en pantalla —
        // sonaba a mentira. Kling no busca "que se vea alguien": busca un
        // CUERPO del que extraer un esqueleto de movimiento. Un primer plano
        // de cara tiene persona pero no tiene de donde sacar movimiento.
        return `Kling no encontró un CUERPO del que copiar el movimiento en ese vídeo. No basta con que se vea a la persona: necesita hombros, brazos y torso para rastrear la pose. Un primer plano de cara, un plano de detalle (solo piernas o manos) o una toma muy cerrada no le sirven, aunque se vea perfectamente a alguien. Usa un clip de medio cuerpo o cuerpo entero. (${raw})`
    }
    // "This field is required" sin decir CUAL: en la practica siempre es la
    // IMAGEN de entrada de un modelo i2i/edit que salio sin refs (p.ej. avatar
    // sin referencias durante la ventana del trasplante, o un permisivo de
    // body sin imagen — bb6ebee).
    if (/this field is required/i.test(raw)) {
        return `Al modelo le falto la IMAGEN de entrada (es un modelo de edicion/i2i y el request salio sin referencias). Si el avatar no tiene refs disponibles, re-sube una foto de cara o usa un modelo de texto-a-imagen. (${raw})`
    }
    if (/face|no face detected/i.test(raw) && /detect/i.test(raw)) {
        return `El modelo no detectó una cara utilizable en la imagen de referencia. Usa una foto donde la cara se vea de frente, nítida y sin tapar. (${raw})`
    }
    return raw
}

/**
 * Upload a base64 image to Supabase Storage and return a public URL.
 * Used to pass image references to KIE endpoints that only accept HTTP URLs
 * (Flux Kontext, GPT 4o Image), not data URIs.
 *
 * CONTENT-ADDRESSED: el nombre del archivo es el sha256 del contenido, así que
 * la MISMA ref (cara/body/clone del avatar) se sube UNA vez en la vida — las
 * generaciones siguientes hacen un HEAD (~100ms) y reutilizan la URL en vez de
 * re-subir 1-3MB por ref en cada generación (y otra vez en el retry).
 */
/** Mínimo que exige KIE en cualquier imagen de entrada (error 500 explícito). */
const MIN_REF_SIDE = 240

/** Por debajo de esto el PNG ya viaja rápido y recomprimir solo añade CPU. */
const PNG_RECOMPRESS_MIN_BYTES = 400 * 1024

export async function uploadReferenceToSupabase(
    base64: string,
    mimeType: string,
): Promise<string> {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!SUPABASE_URL)
        throw new Error('NEXT_PUBLIC_SUPABASE_URL is not defined')

    const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64
    let buffer = Buffer.from(cleanBase64, 'base64')
    let effectiveMime = mimeType

    // PNG → JPEG cuando pesa de más. El PNG es SIN PÉRDIDA, así que una ref de
    // 1024px sale a 1.5-3 MB donde un JPEG de calidad alta ocupa 4-5 veces
    // menos con diferencia invisible — y el proveedor la recodifica igual al
    // recibirla. Ese peso es lo que agota el temporizador de descarga de
    // Alibaba ("Timeout while downloading url=…", 2026-07-27), y aquí no hay
    // caché de borde que lo salve: este plan de Supabase sirve `no-cache`
    // pase lo que pase (medido), así que CADA descarga cruza hasta el origen.
    //
    // NO se reescala: bajar la resolución tocaría el clonado de identidad, que
    // es lo que más nos ha costado calibrar. Solo cambia el contenedor.
    //
    // Con canal ALFA se deja el PNG: JPEG no lo tiene, y aunque hoy las
    // máscaras se queman sobre la imagen, convertir un alfa real la aplanaría
    // en silencio. Comprobarlo cuesta una lectura de metadatos.
    if (
        mimeType.includes('png') &&
        buffer.byteLength > PNG_RECOMPRESS_MIN_BYTES
    ) {
        try {
            const sharp = (await import('sharp')).default
            const meta = await sharp(buffer).metadata()
            if (!meta.hasAlpha) {
                const jpeg = await sharp(buffer)
                    .jpeg({ quality: 92, mozjpeg: true })
                    .toBuffer()
                if (jpeg.byteLength < buffer.byteLength) {
                    console.log(
                        `[KIE/ref] PNG ${(buffer.byteLength / 1048576).toFixed(2)}MB → JPEG ${(jpeg.byteLength / 1048576).toFixed(2)}MB`,
                    )
                    buffer = Buffer.from(jpeg)
                    effectiveMime = 'image/jpeg'
                }
            }
        } catch (err) {
            // Recomprimir es una OPTIMIZACIÓN: si sharp falla, sube el PNG tal
            // cual. Perder velocidad es mejor que perder la generación.
            console.warn('[KIE/ref] PNG recompress skipped:', err)
        }
    }

    // MÍNIMO DE RESOLUCIÓN. KIE rechaza con 500 "resolution must be at least
    // 240x240" — pasó el 2026-07-27 con un Reference Asset de 406x175, y el
    // fallo llega DESPUÉS de componer el prompt y subir todo, así que se
    // pierde la generación entera por un logo pequeño.
    //
    // Se escala en vez de bloquear: un asset chico (un logo, un recorte) es
    // contenido perfectamente válido, solo que no cumple el mínimo del
    // proveedor. Ampliar preserva el aspecto y no inventa nada — el modelo lo
    // iba a reescalar igual por dentro.
    if (!effectiveMime.includes('mp4')) {
        try {
            const sharp = (await import('sharp')).default
            const meta = await sharp(buffer).metadata()
            const w = meta.width ?? 0
            const h = meta.height ?? 0
            if (w > 0 && h > 0 && (w < MIN_REF_SIDE || h < MIN_REF_SIDE)) {
                const factor = MIN_REF_SIDE / Math.min(w, h)
                const out = await sharp(buffer)
                    .resize(Math.ceil(w * factor), Math.ceil(h * factor), {
                        fit: 'fill',
                        kernel: 'lanczos3',
                    })
                    .toBuffer()
                console.log(
                    `[KIE/ref] ${w}x${h} < ${MIN_REF_SIDE} → ampliada a ${Math.ceil(w * factor)}x${Math.ceil(h * factor)}`,
                )
                buffer = Buffer.from(out)
            }
        } catch (err) {
            // Igual que la recompresión: es una salvaguarda, no un requisito.
            console.warn('[KIE/ref] upscale check skipped:', err)
        }
    }

    const ext = effectiveMime.includes('mp4')
        ? 'mp4'
        : effectiveMime.includes('png')
          ? 'png'
          : effectiveMime.includes('webp')
            ? 'webp'
            : 'jpg'
    const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 32)
    const fileName = `kie-refs/${hash}.${ext}`
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/generations/${fileName}`

    // ¿Ya existe? (misma ref de una generación anterior) → salta la subida.
    // Cualquier fallo del HEAD cae al upload normal — nunca bloquea.
    // Con R2 activo el dedupe pregunta a R2 (HEAD firmado); si no, a la URL
    // pública de Supabase, como siempre.
    try {
        if (r2Enabled()) {
            if (await r2ObjectExists(fileName)) return getR2PublicUrl(fileName)
        } else {
            const head = await fetchWithAbort(
                publicUrl,
                { method: 'HEAD' },
                5_000,
            )
            if (head.ok) return publicUrl
        }
    } catch {
        /* sin caché — sube normal */
    }

    // La subida va por el almacén activo (R2 con flag; Supabase si no). Las
    // refs son las que descargan los PROVEEDORES — servirlas desde el borde de
    // Cloudflare es lo que mata los "Timeout while downloading" de Alibaba,
    // además del egress.
    const { url } = await putMediaObject({
        path: fileName,
        body: buffer,
        contentType: effectiveMime,
        // upsert: dos generaciones concurrentes con la misma ref no deben
        // fallar por "already exists" (contenido idéntico por hash).
        upsert: true,
    })
    return url
}

/**
 * URL pública de una referencia, venga ya subida o en bytes.
 *
 * Los proveedores solo aceptan URLs, así que hasta ahora TODA ref cruzaba el
 * server action en base64 para que el servidor la subiera. Cuando la ref ya
 * vive en R2 —el caso del editor: la imagen que se edita salió de la galería—
 * eso era un viaje redondo absurdo (bajar al navegador, re-subir inflada un
 * 33%, volver a guardarla) y encima chocaba con el tope de body de Vercel.
 *
 * Con `url` presente no se sube nada. `base64` sigue siendo el camino cuando
 * los bytes son NUEVOS (el composite de la máscara se pinta en el navegador y
 * no existe en ningún sitio hasta que alguien lo guarda).
 */
async function resolveRefUrl(ref: {
    base64?: string
    mimeType: string
    url?: string
}): Promise<string> {
    if (ref.url) return ref.url
    if (!ref.base64) {
        throw new Error(
            'Referencia sin contenido: hace falta `url` (ya subida) o `base64` (bytes nuevos).',
        )
    }
    return uploadReferenceToSupabase(ref.base64, ref.mimeType)
}

/**
 * Bytes de una referencia, descargándolos si solo llegó su URL.
 *
 * Casi ninguna ruta necesita los bytes —el proveedor descarga la URL él mismo—
 * pero Grok sí: hay que recortar la ref al aspect ratio pedido porque su salida
 * copia el del input. Descargar en el SERVIDOR está bien (sale del mismo R2 y
 * no cruza ningún límite de body); lo que no podía seguir pasando es que los
 * bytes viajaran desde el navegador para todas las rutas por culpa de una.
 */
async function ensureRefBytes(
    ref: KieRefWithRole,
): Promise<{ base64: string; mimeType: string }> {
    if (ref.base64) return { base64: ref.base64, mimeType: ref.mimeType }
    if (!ref.url) throw new Error('Referencia sin `url` ni `base64`.')
    const res = await fetchWithAbort(ref.url, {}, 30_000)
    if (!res.ok) {
        throw new Error(
            `No se pudo descargar la referencia: HTTP ${res.status}`,
        )
    }
    const buf = Buffer.from(await res.arrayBuffer())
    return {
        base64: buf.toString('base64'),
        mimeType: res.headers.get('content-type') || ref.mimeType,
    }
}

/** `cropToAspect` de producción: resuelve los bytes y recorta con sharp. */
async function cropRefToAspect(
    ref: KieRefWithRole,
    aspectRatio: string,
): Promise<KieRefWithRole> {
    const bytes = await ensureRefBytes(ref)
    const cropped = await cropBase64ToAspect(
        bytes.base64,
        bytes.mimeType,
        aspectRatio,
    )
    // Se devuelve SIN `url`: los bytes recortados son nuevos y no están
    // subidos en ningún sitio — conservar la url original haría que uploadRef
    // pasara la imagen SIN recortar, que es justo lo que rompe a Grok.
    return { ...ref, ...cropped, url: undefined }
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
/**
 * Infer the stored extension from a KIE result URL. Seedream pide
 * output_format jpeg; otros modelos devuelven png y los docs de Lite muestran
 * ejemplos .webp — etiquetar bien el contentType evita servir bytes con MIME
 * equivocado desde Supabase.
 */
function inferImageExt(url: string): 'jpg' | 'png' | 'webp' {
    if (/\.jpe?g(\?|$)/i.test(url)) return 'jpg'
    if (/\.webp(\?|$)/i.test(url)) return 'webp'
    return 'png'
}

async function persistToSupabase(
    sourceUrl: string,
    extension: 'mp4' | 'png' | 'jpg' | 'webp',
    subfolder: string,
    cropToAspect?: string,
): Promise<string> {
    const res = await fetch(sourceUrl)
    if (!res.ok)
        throw new Error(`Failed to download KIE result (${res.status})`)
    let buffer: Buffer = Buffer.from(await res.arrayBuffer())

    // Normalize image proportions when a provider can't honor the requested
    // aspect ratio natively (e.g. GPT-4o Image). Videos are never cropped.
    if (cropToAspect && extension !== 'mp4') {
        try {
            buffer = await centerCropToAspect(buffer, cropToAspect)
        } catch (err) {
            console.warn(
                `[KIE] center-crop to ${cropToAspect} failed, keeping original:`,
                err,
            )
        }
    }

    const contentType =
        extension === 'mp4'
            ? 'video/mp4'
            : `image/${extension === 'jpg' ? 'jpeg' : extension}`
    const leaf = `${subfolder}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${extension}`

    // F4.2.c: los resultados nacen bajo `org/{orgId}/…`. Sin contexto (no
    // debería pasar desde el Studio) cae al path plano de siempre en vez de
    // tirar: el objeto ya está descargado y la generación ya se pagó.
    const ctx = await tryGetOrgContext()
    const fileName = ctx ? orgStoragePath(ctx.organizationId, leaf) : leaf
    if (!ctx) {
        console.warn(`[KIE] persist SIN contexto de org → path legacy ${leaf}`)
    }

    return uploadBufferToGenerations(buffer, fileName, contentType)
}

export interface GenerateImageKieParams {
    prompt: string
    model: string
    aspectRatio?: string
    // `url` = la ref YA está subida y es pública: se pasa tal cual al proveedor
    // en vez de viajar en base64. Es lo que evita el 413 del editor — una foto
    // de 3.5 MB inflada por base64 (~4.6 MB) pasa del tope de 4.5 MB que Vercel
    // impone al body de una server action, y ese tope NO se puede subir desde
    // next.config (bodySizeLimit ya está en 50mb y aun así rebota).
    referenceImage?: {
        base64?: string
        mimeType: string
        url?: string
    } | null
    // Multiple references for models that accept them (Nano Banana Pro → up to
    // 8 image_input). `role` lets us label each image in the prompt so the
    // model knows which one is the face to replicate (critical for identity).
    referenceImages?: Array<{
        base64?: string
        mimeType: string
        role?: string
        url?: string
    }>
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
    // DEEPFAKE puro (dropzone Deepfake): reproduce la imagen 2 EXACTA (cuerpo,
    // outfit, pose, escena intactos) y SOLO cambia la cara por la del avatar.
    // Apaga bodyClause/curvas; la cláusula de clone cambia a face-swap total.
    deepfakeMode?: boolean
    // EDICION de una foto existente (la fuente va en referenceImage). Apaga el
    // fallback de outfit: la foto que se edita ya lleva su ropa puesta.
    editMode?: boolean
    // ¿La ref de rol 'body' es la hoja NUDE del Body Lab? Cambia la clausula:
    // con la nude se pide ademas la PIEL (lo que el texto no lograba), con la
    // vestida hay que acotar su ropa. MuleRouter ya lo distinguia; KIE no
    // recibia el dato.
    bodySheetNude?: boolean
    // El prompt ya es COMPLETO: la ruta no debe envolverlo en su ancla de
    // identidad ni recortarlo contra el presupuesto de escena. Lo usa el Body
    // Lab, cuyas hojas se definen a sí mismas (ver context.ts).
    selfContainedPrompt?: boolean
    // Region a editar en pixeles [x1,y1,x2,y2] — Wan la acepta como bbox_list.
    maskBBox?: [number, number, number, number]
    // Refuerzo de curvas EXCLUSIVO de Seedream (Pro aplana el hourglass cuando
    // describeBody describe la cadera por cm absolutos en vez de por ratio).
    // Solo la rama seedream/ lo inyecta; los demás modelos lo ignoran. Vacío
    // salvo hourglass marcado por ratio (≥1.5).
    curveBoost?: string
    // Peso del Clone Ref (0-100). 100=recrear exacto (default); bajo=inspirado.
    cloneWeight?: number
    // Negative prompt (lo que NO debe salir). Hoy lo usa el body sheet vía la
    // ruta qwen; otras rutas lo ignoran hasta que se cablee en cada una.
    // Wan base/pro NO lo soportan (docs 2026-07-23) — su ruta lo descarta.
    negativePrompt?: string
    // Seed (reproducibilidad; solo Wan base/pro lo soportan hoy). Para A/B de
    // calibración de clones: mismo seed + mismo prompt = salida estable.
    seed?: number
    // SAFE MODE (cimiento age-gate / entitlement NSFW): prende el filtro de
    // KIE en las rutas y fuerza la sanitización también en permisivos. Nadie
    // lo pasa aún — se derivará del perfil del usuario EN EL SERVIDOR (un flag
    // de cliente se falsifica).
    safeMode?: boolean
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
    // F5.0 — CHOKEPOINT (ver la nota en submitKieImageTask).
    const gate = await holdForOperation({
        kind: 'image',
        providerId: resolveImageProviderId(params.model),
    })
    if (!gate.ok) {
        return { success: false, error: insufficientTokensMessage(gate) }
    }

    const result = await generateImageKieInner(params, submitSink)

    if (!result.success) {
        await refundHold(gate.hold, 'kie_generate_failed')
        return result
    }
    // En modo submit-only el taskId es lo único que sobrevive al request; en
    // modo síncrono ya está persistido y el hold se queda liquidado por el
    // barrido (el cobro ya ocurrió — no hay nada que devolver).
    if (submitSink?.taskId) {
        await linkHoldToRef(gate.hold.holdId, 'kie_task', submitSink.taskId)
    } else {
        await settleHold(gate.hold)
    }
    return result
}

async function generateImageKieInner(
    params: GenerateImageKieParams,
    submitSink?: { taskId?: string },
): Promise<
    | { success: true; url: string; fullApiPrompt: string }
    | { success: false; error: string }
> {
    const {
        model,
        aspectRatio = '1:1',
        referenceImage,
        referenceImages,
        bodyEmphasis,
        hairEmphasis,
        eyeEmphasis,
        identityWeight,
        deepfakeMode,
        editMode,
        bodySheetNude,
        selfContainedPrompt,
        maskBBox,
        curveBoost,
        cloneWeight,
        negativePrompt,
        seed,
    } = params
    // Route to the right adapter with a given (already-sanitized) prompt.
    const runWithPrompt = async (
        promptText: string,
    ): Promise<{ url: string; fullApiPrompt: string }> => {
        if (model.startsWith('flux-kontext')) {
            return generateImageFluxKontext({
                prompt: promptText,
                model,
                aspectRatio,
                referenceImage,
            })
        }
        if (model === 'gpt-4o-image') {
            return generateImageGpt4o({
                prompt: promptText,
                model,
                aspectRatio,
                referenceImage,
            })
        }
        if (model === 'nano-banana-pro') {
            return generateImageNanoBananaPro({
                prompt: promptText,
                model,
                aspectRatio,
                referenceImage,
                referenceImages,
            })
        }
        if (model === 'gpt-image-2-text-to-image') {
            return generateImageGptImage2({
                prompt: promptText,
                model,
                aspectRatio,
                referenceImage,
                referenceImages,
            })
        }
        // Ruta genérica: el DESPACHADOR (src/services/kie/) construye el
        // {model, input} de KIE — una ruta por modelo, aislada. Aquí solo se
        // inyectan las dependencias con efecto (subir/recortar refs) y se
        // conserva abajo el submit + la escalera de moderación.
        const built = await buildImageRequest({
            model,
            aspectRatio,
            prompt: promptText,
            referenceImage,
            referenceImages,
            bodyEmphasis,
            hairEmphasis,
            eyeEmphasis,
            identityWeight,
            deepfakeMode,
            editMode,
            bodySheetNude,
            selfContainedPrompt,
            maskBBox,
            curveBoost,
            cloneWeight,
            negativePrompt,
            seed,
            safeMode: params.safeMode,
            uploadRef: resolveRefUrl,
            cropToAspect: cropRefToAspect,
        })
        const resolvedModel = built.model
        const input = built.input
        // Observabilidad veraz (auditoría 2026-07-25): el `</>` del preview debe
        // mostrar EXACTAMENTE lo que KIE recibe (input.prompt: ancla + body +
        // anatomía + escena) — antes reportaba el intermedio PRE-ancla
        // (built.fullApiPrompt) y el usuario auditaba un prompt que no era el real.
        promptText = String(input.prompt ?? built.fullApiPrompt)

        console.log(
            `[KIE] Submitting generic image task: model=${resolvedModel}`,
        )
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
                    // 80% del largo actual, piso 900: el slice fijo a 900
                    // decapitaba clauses + escena (el clone salía sin cambios).
                    const cur = String(input.prompt ?? '')
                    const target = Math.max(900, Math.floor(cur.length * 0.8))
                    const hard = cur.slice(0, target)
                    const cut = hard.lastIndexOf(' ')
                    input.prompt =
                        cut > target * 0.8 ? hard.slice(0, cut) : hard
                    console.warn(
                        `[KIE] ${resolvedModel} rejected the prompt length — retrying submit at ${String(input.prompt).length} chars`,
                    )
                } else {
                    console.warn(
                        '[KIE] Transient internal error — resubmitting once',
                    )
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
        // Se conserva fuera del try para poder dar de baja el rastro al final,
        // venga del primer submit o del reintento.
        let syncTaskId = ''
        try {
            syncTaskId = await withTimeout(
                submitTask({ model: resolvedModel, input }),
                30_000,
                'KIE image submit',
            )
            await trackSyncKieTask(
                syncTaskId,
                resolvedModel,
                promptText,
                aspectRatio,
            )
            urls = await pollTask(syncTaskId, {
                budgetMs: 600_000,
                intervalMs: 3000,
            })
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
                console.warn(
                    '[KIE] Transient internal error — resubmitting once',
                )
                await new Promise((r) => setTimeout(r, 2000))
            }
            const retryId = await withTimeout(
                submitTask({ model: resolvedModel, input }),
                30_000,
                'KIE image submit (retry)',
            )
            syncTaskId = retryId
            await trackSyncKieTask(
                retryId,
                resolvedModel,
                String(input.prompt ?? promptText),
                aspectRatio,
            )
            urls = await pollTask(retryId, {
                budgetMs: 600_000,
                intervalMs: 3000,
            })
        }
        const persistedUrl = await persistToSupabase(
            urls[0],
            inferImageExt(urls[0]),
            'kie-images',
        )
        // Copia estable en mano: deja de ser reclamable. Si no se diera de
        // baja, el reconciliador la volvería a bajar y saldría DUPLICADA en la
        // galería junto a la que guarda el cliente.
        await apiClearPendingGeneration(syncTaskId, 'delivered')
        return { url: persistedUrl, fullApiPrompt: promptText }
    }

    // Content-moderation flag from the provider (Google/OpenAI via KIE).
    // "nsfw" incluido: FLUX.2 (Black Forest Labs) responde "422 nsfw" desde SU
    // moderación upstream — nsfw_checker:false solo apaga el filtro de KIE, no
    // el del proveedor del modelo. Sin este término la escalera de sanitización
    // nunca se disparaba para FLUX.2.
    const isSensitiveBlock = (m: string) =>
        /flagged as sensitive|sensitive|safety|content policy|moderat|violat|nsfw/i.test(
            m,
        )

    // Honor "no tattoos / sin tatuajes" by removing tattoo mentions up front.
    const promptIn = stripNegatedTattoos(params.prompt)

    // The word-swap sanitizer exists for the Google/OpenAI models KIE hosts
    // (their upstream filters flag "bikini" etc.). The PERMISSIVE families run
    // with nsfw_checker OFF — sanitizing them only mangles the garment
    // ("mini bikini" → "mini swim set" made Seedream render a MINI SKIRT and
    // drop the bikini bottom, verified in prod). They get the RAW prompt;
    // sanitization stays as the on-block fallback only.
    // safeMode (age-gate/entitlement) apaga el TRATO permisivo: el prompt se
    // sanitiza como en los modelos filtrados y las rutas ya prenden el
    // nsfw_checker de KIE (ctx.safeMode).
    const isPermissiveModel =
        (model.startsWith('seedream/') ||
            model.startsWith('flux-2/') ||
            model.startsWith('qwen') ||
            model === 'z-image' ||
            model === 'wan/2-7-image' ||
            model === 'wan/2-7-image-pro' ||
            model.startsWith('grok-imagine/')) &&
        !params.safeMode

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
            if (retryPrompt === first)
                retryPrompt = aggressiveSanitize(promptIn).sanitized
            if (!retryPrompt.trim()) throw upstreamBlocked(msg)
            console.warn(
                '[KIE] Sensitive-content block — retrying with sanitized prompt',
            )
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
                console.warn(
                    '[KIE] Still blocked — retrying with aggressive sanitization',
                )
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
): Promise<
    | { success: true; taskId: string; fullApiPrompt: string }
    | { success: false; error: string }
> {
    // F5.0 — CHOKEPOINT. El gate va aquí, en la server action, no en el
    // dispatcher de cliente: llamar esta action directo desde devtools es
    // trivial. Wrapper en vez de tocar el cuerpo porque tiene ~15 `return`
    // repartidos por familia de modelo y meter el cobro en cada uno se
    // desincroniza en el primer modelo nuevo que alguien añada.
    const gate = await holdForOperation({
        kind: 'image',
        providerId: resolveImageProviderId(params.model),
    })
    if (!gate.ok) {
        return { success: false, error: insufficientTokensMessage(gate) }
    }

    const result = await submitKieImageTaskInner(params)

    if (!result.success) {
        // El submit falló → no hay tarea que cobrar.
        await refundHold(gate.hold, 'kie_submit_failed')
        return result
    }
    // Ata el hold al taskId: es la referencia con la que el persist liquida y
    // con la que la reconciliación reembolsa las huérfanas.
    await linkHoldToRef(gate.hold.holdId, 'kie_task', result.taskId)
    return result
}

async function submitKieImageTaskInner(
    params: GenerateImageKieParams,
): Promise<
    | { success: true; taskId: string; fullApiPrompt: string }
    | { success: false; error: string }
> {
    const {
        model,
        aspectRatio = '1:1',
        referenceImage,
        referenceImages,
    } = params
    const { sanitized: prompt } = sanitizePromptForGeneration(
        stripNegatedTattoos(params.prompt),
    )
    try {
        if (model === 'nano-banana-pro') {
            const refs =
                referenceImages && referenceImages.length > 0
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
            if (refs.length > 0) input.image_input = await uploadRefs(refs)
            const taskId = await withTimeout(
                submitTask({ model: 'nano-banana-pro', input }),
                30_000,
                'KIE Nano Banana Pro submit',
            )
            return { success: true, taskId, fullApiPrompt: prompt }
        }
        if (model === 'gpt-image-2-text-to-image') {
            const refs =
                referenceImages && referenceImages.length > 0
                    ? referenceImages.slice(0, 16)
                    : referenceImage
                      ? [referenceImage]
                      : []
            const input: Record<string, unknown> = {
                prompt,
                aspect_ratio: aspectRatio,
                resolution: '1K',
            }
            let kieModel = 'gpt-image-2-text-to-image'
            if (refs.length > 0) {
                input.input_urls = await uploadRefs(refs)
                kieModel = 'gpt-image-2-image-to-image'
            }
            const taskId = await withTimeout(
                submitTask({ model: kieModel, input }),
                30_000,
                'KIE GPT Image 2 submit',
            )
            return { success: true, taskId, fullApiPrompt: prompt }
        }
        // Generic permissive/diffusion models (seedream, flux-2, qwen, ideogram,
        // z-image, nano-banana-2, grok, wan-image): reuse generateImageKie's full
        // input-building (i2i refs, model-aware params) in SUBMIT-ONLY mode so the
        // long poll moves to the browser (checkKieImageTask). Same fix as video.
        const sink: { taskId?: string } = {}
        // OJO: el _Inner_, NO el `generateImageKie` exportado. Este camino ya
        // pasó por el chokepoint en `submitKieImageTask`; llamar al wrapper
        // cobraría un SEGUNDO hold por la misma imagen — y es justo la ruta de
        // los modelos permisivos, la más usada de la app.
        const r = await generateImageKieInner(params, sink)
        if (!r.success) return { success: false, error: r.error }
        if (!sink.taskId) {
            return { success: false, error: 'KIE no devolvió taskId (submit)' }
        }
        return {
            success: true,
            taskId: sink.taskId,
            fullApiPrompt: r.fullApiPrompt,
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[KIE] submit failed:', message)
        return { success: false, error: message }
    }
}

/**
 * Poll a single KIE image task (one quick check). The browser calls this every
 * few seconds. On success it returns the RAW KIE CDN URL de inmediato — un
 * <img> la renderiza YA (preview instantáneo). La copia estable a Supabase se
 * pide en PARALELO vía persistKieImageResult (el CDN de KIE expira y no da
 * CORS para fetch→blob, así que la copia sigue siendo obligatoria — solo dejó
 * de bloquear los 2-6s del final de cada generación).
 */
export async function checkKieImageTask(
    taskId: string,
): Promise<
    | { status: 'running' }
    | { status: 'done'; url: string }
    | { status: 'failed'; error: string }
> {
    try {
        const r = await checkTaskOnce(taskId)
        if (r.state === 'running') return { status: 'running' }
        if (r.state === 'fail') return { status: 'failed', error: r.error }
        return { status: 'done', url: r.urls[0] }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { status: 'failed', error: message }
    }
}

/**
 * Persist a raw KIE result URL to Supabase (stable URL, CORS-friendly). El
 * browser la llama en PARALELO al preview: muestra la URL de KIE al instante y
 * swapea a esta cuando resuelve. Extensión inferida de la URL (Seedream ya
 * pide output_format jpeg; el resto sigue devolviendo png).
 */
export async function persistKieImageResult(
    kieUrl: string,
): Promise<{ success: true; url: string } | { success: false; error: string }> {
    try {
        const url = await persistToSupabase(
            kieUrl,
            inferImageExt(kieUrl),
            'kie-images',
        )
        return { success: true, url }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[KIE] persistKieImageResult failed:', message)
        return { success: false, error: message }
    }
}

/**
 * Igual que persistKieImageResult pero para VÍDEO. Existe porque el navegador
 * NO puede bajar el resultado de algunos proveedores: el auto-save del Studio
 * hace `fetch(media.url)` desde el cliente y con la URL cruda de MuleRouter
 * revienta con "Failed to fetch" (CORS). Las imágenes de MuleRouter ya pasaban
 * por el persist de servidor — el vídeo se quedó sin él al integrarlo.
 *
 * Bajar y re-subir en SERVIDOR no tiene ese límite, y de paso la URL resultante
 * es estable (las de los proveedores caducan).
 */
export async function persistRemoteVideoResult(
    sourceUrl: string,
): Promise<{ success: true; url: string } | { success: false; error: string }> {
    try {
        const url = await persistToSupabase(sourceUrl, 'mp4', 'kie-videos')
        return { success: true, url }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[KIE] persistRemoteVideoResult failed:', message)
        return { success: false, error: message }
    }
}

/**
 * Flux Kontext uses a dedicated endpoint with camelCase fields and a different
 * polling response shape (successFlag + resultImageUrl instead of state +
 * resultJson). It supports text-to-image and image-to-image in the same
 * endpoint — pass `inputImage` to enable edit mode.
 */
async function generateImageFluxKontext(
    params: GenerateImageKieParams,
): Promise<{ url: string; fullApiPrompt: string }> {
    const { prompt, model, aspectRatio = '1:1', referenceImage } = params

    // KIE Flux Kontext hard-caps the prompt at 3000 chars (422 otherwise). The
    // compact lean note keeps us well under, but a long [FACE:]/user text could
    // still push over — trim as a safety net (the leading instruction is the
    // most important; the tail [FACE:]/preserve text is least critical to cut).
    const FLUX_PROMPT_MAX = 3000
    const safePrompt =
        prompt.length > FLUX_PROMPT_MAX
            ? prompt.slice(0, FLUX_PROMPT_MAX)
            : prompt
    if (safePrompt.length < prompt.length) {
        console.warn(
            `[KIE/Flux] prompt ${prompt.length} chars > ${FLUX_PROMPT_MAX}; truncated`,
        )
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
        const uploadedUrl = await resolveRefUrl(referenceImage)
        console.log(`[KIE/Flux] Uploaded reference to: ${uploadedUrl}`)
        body.inputImage = uploadedUrl
    }

    console.log(
        `[KIE/Flux] Submitting: model=${model}, hasReference=${!!referenceImage}`,
    )
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
        throw new Error(
            `KIE Flux Kontext submit failed (${submitRes.status}): ${text}`,
        )
    }
    const submitJson: KieCreateTaskResponse = await submitRes.json()
    if (submitJson.code !== 200 || !submitJson.data?.taskId) {
        throw new Error(
            `KIE Flux Kontext submit error: code=${submitJson.code} msg=${submitJson.msg}`,
        )
    }
    const taskId = submitJson.data.taskId
    console.log(`[KIE/Flux] Task submitted: ${taskId}`)
    // Mismo rastro que la ruta genérica: este poll también vive en el servidor
    // y sin registro el id se pierde si la función se corta.
    await trackSyncKieTask(taskId, model, safePrompt, aspectRatio)

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
                console.warn(
                    `[KIE/Flux] poll fetch aborted (>${POLL_FETCH_TIMEOUT_MS}ms), retrying`,
                )
                await new Promise((resolve) => setTimeout(resolve, intervalMs))
                continue
            }
            throw e
        }
        if (!res.ok) {
            const text = await res.text()
            throw new Error(
                `KIE Flux Kontext poll failed (${res.status}): ${text}`,
            )
        }
        const json: KieFluxKontextRecordInfoResponse = await res.json()
        const data = json.data as
            | (typeof json.data & { resultImageUrl?: string })
            | undefined
        const flag = data?.successFlag
        // KIE docs put resultImageUrl under data.response, but some fixtures
        // have shown it at the top level — accept both rather than miss it.
        const url = data?.response?.resultImageUrl ?? data?.resultImageUrl

        if (pollNum === 1) {
            console.log(
                `[KIE/Flux] first poll data: ${JSON.stringify(data).slice(0, 500)}`,
            )
        }
        console.log(
            `[KIE/Flux] poll #${pollNum}: flag=${flag}, hasUrl=${!!url}`,
        )

        if (flag === 1 && url) {
            resultUrl = url
            break
        }
        if (flag === 2 || flag === 3) {
            throw new Error(
                `KIE Flux Kontext failed (flag=${flag}): ${data?.errorMessage || data?.errorCode || 'Unknown'}`,
            )
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
    if (!resultUrl) {
        throw new Error(`KIE Flux Kontext timed out after ${budgetMs / 1000}s`)
    }

    console.log(`[KIE/Flux] Generation complete: ${resultUrl}`)
    const persistedUrl = await persistToSupabase(resultUrl, 'png', 'kie-images')
    await apiClearPendingGeneration(taskId, 'delivered')
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
    if (
        aspectRatio === '16:9' ||
        aspectRatio === '4:3' ||
        aspectRatio === '3:2'
    )
        return '3:2'
    // Portrait variants → 2:3
    return '2:3'
}

/**
 * GPT 4o Image (OpenAI) via KIE's dedicated endpoint. Like Flux Kontext, it
 * needs reference images uploaded to a public URL first — `filesUrl` is an
 * array of URLs, NOT base64. Async pattern via taskId + recordInfo polling.
 */
async function generateImageGpt4o(
    params: GenerateImageKieParams,
): Promise<{ url: string; fullApiPrompt: string }> {
    const { prompt, aspectRatio = '1:1', referenceImage } = params

    const body: Record<string, unknown> = {
        prompt,
        size: aspectRatioToGptSize(aspectRatio),
        nVariants: 1,
        isEnhance: false,
    }

    if (referenceImage) {
        const uploadedUrl = await resolveRefUrl(referenceImage)
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
        throw new Error(
            `KIE GPT4o submit failed (${submitRes.status}): ${text}`,
        )
    }
    const submitJson: KieCreateTaskResponse = await submitRes.json()
    if (submitJson.code !== 200 || !submitJson.data?.taskId) {
        throw new Error(
            `KIE GPT4o submit error: code=${submitJson.code} msg=${submitJson.msg}`,
        )
    }
    const taskId = submitJson.data.taskId
    console.log(`[KIE/GPT4o] Task submitted: ${taskId}`)
    // Rastro de rescate: este poll (hasta 600s) corre en el servidor y sin
    // registro el id se pierde con la función. Ver trackSyncKieTask.
    await trackSyncKieTask(taskId, params.model, prompt, aspectRatio)

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
                console.warn(
                    `[KIE/GPT4o] poll fetch aborted (>${POLL_FETCH_TIMEOUT_MS}ms), retrying`,
                )
                await new Promise((resolve) => setTimeout(resolve, intervalMs))
                continue
            }
            throw e
        }
        if (!res.ok) {
            const text = await res.text()
            throw new Error(`KIE GPT4o poll failed (${res.status}): ${text}`)
        }
        const json = (await res.json()) as {
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
            console.log(
                `[KIE/GPT4o] first poll data: ${JSON.stringify(json.data).slice(0, 500)}`,
            )
        }
        console.log(
            `[KIE/GPT4o] poll #${pollNum}: flag=${flag}, hasUrl=${!!(urls && urls.length)}`,
        )

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
            throw new Error(
                `KIE GPT4o failed (flag=${flag}, code=${code || 'n/a'}): ${message}${hint}`,
            )
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
    if (!resultUrl) {
        throw new Error(`KIE GPT4o timed out after ${budgetMs / 1000}s`)
    }

    console.log(`[KIE/GPT4o] Generation complete: ${resultUrl}`)
    // GPT-4o Image only renders 1:1 / 3:2 / 2:3, so a requested 9:16 (etc.)
    // comes back shorter than Gemini's. Crop to the requested ratio so output
    // proportions match across providers. No-ops when the ratio already matches.
    const persistedUrl = await persistToSupabase(
        resultUrl,
        'png',
        'kie-images',
        aspectRatio,
    )
    await apiClearPendingGeneration(taskId, 'delivered')
    return { url: persistedUrl, fullApiPrompt: prompt }
}

/**
 * Upload reference images to public URLs (KIE needs URLs, not base64), in the
 * given order. The prompt's REFERENCE MAPPING (built by avatarPromptBuilder)
 * labels them as Image 1..N, so order here must match the caller's role order.
 */
async function uploadRefs(
    refs: Array<{ base64?: string; mimeType: string; url?: string }>,
): Promise<string[]> {
    return Promise.all(refs.map((r) => resolveRefUrl(r)))
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
    const {
        prompt,
        aspectRatio = '1:1',
        referenceImage,
        referenceImages,
    } = params

    // Nano Banana Pro accepts up to 8 reference images. Send the full set
    // (face + angle + body + pose + scene); the prompt already carries the
    // REFERENCE MAPPING describing each. Fall back to the single face ref.
    const refs =
        referenceImages && referenceImages.length > 0
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

    console.log(
        `[KIE/NanoBananaPro] Submitting: refs=${refs.length}, ratio=${aspectRatio}`,
    )
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
    const {
        prompt,
        aspectRatio = '1:1',
        referenceImage,
        referenceImages,
    } = params

    const refs =
        referenceImages && referenceImages.length > 0
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
        console.log(
            `[KIE/GptImage2] Image-to-image with ${refs.length} reference(s)`,
        )
    }

    // Healthy gpt-image-2 i2i tasks vary widely (≈213s … 355s, sometimes more);
    // a few hang forever (intermittent KIE bug). Poll a generous budget so slow-
    // but-healthy tasks complete; the rare hang fails at the budget and the user
    // just regenerates. (No short-budget auto-retry: it would abandon legit slow
    // tasks, and two long attempts can't fit under Vercel's 800s maxDuration.)
    console.log(
        `[KIE/GptImage2] Submitting: model=${kieModel}, ratio=${aspectRatio}`,
    )
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
    if (aspect === '16:9' || aspect === '9:16' || aspect === '1:1')
        return aspect
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
async function submitVideoKling3(
    params: GenerateVideoKieParams,
): Promise<string> {
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

    console.log(
        `[KIE/Kling3] Submitting: duration=${duration}s, mode=${input.mode}, aspect=${input.aspect_ratio}, sound=${sound}, i2v=${!!firstFrameImage}`,
    )
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
    if (!SUPABASE_URL)
        throw new Error('NEXT_PUBLIC_SUPABASE_URL is not defined')

    const ext = mimeType.includes('quicktime') ? 'mov' : 'mp4'
    const path = `kie-refs/motion-${Date.now()}-${Math.random().toString(36).slice(2, 11)}.${ext}`

    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase.storage
        .from('generations')
        .createSignedUploadUrl(path)
    if (error || !data) {
        throw new Error(
            `Failed to create motion video upload URL: ${error?.message ?? 'no data'}`,
        )
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
    /**
     * Duración del vídeo CONDUCTOR, que es la que sale (motion-control copia el
     * movimiento del clip entero). Es el precio: el vídeo se cobra por segundo.
     * Si no llega, el quote aplica su clip mínimo — nunca sale gratis, pero
     * INFRAVALORA un clip largo, así que el cliente debería mandarla siempre.
     */
    durationSeconds?: number
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
        durationSeconds,
    } = params

    // Validate before any side-effectful upload: a driving video is required.
    // An empty-string URL counts as absent.
    if (!motionVideoUrl && !motionVideoBase64) {
        throw new Error(
            'Kling 3.0 motion-control (KIE) requires a driving video (upload or URL). Presets are not supported on KIE.',
        )
    }

    // F5.0 — CHOKEPOINT. Esta ruta era la ÚNICA de generación sin medir: no
    // escribía nada en el ledger, así que su consumo no existía para el
    // measure-only. Va DESPUÉS de validar el vídeo conductor (no se cobra un
    // request que ni siquiera se va a enviar) y ANTES de subir nada.
    const gate = await holdForOperation({
        kind: 'video',
        providerId: resolveVideoProviderId('kling-3.0'),
        seconds: durationSeconds ?? 0,
    })
    if (!gate.ok) {
        throw new Error(insufficientTokensMessage(gate))
    }

    const imageUrl = await uploadReferenceToSupabase(
        characterImage.base64,
        characterImage.mimeType,
    )

    let videoUrl: string | null = motionVideoUrl || null // '' → null
    if (!videoUrl && motionVideoBase64) {
        videoUrl = await uploadReferenceToSupabase(
            motionVideoBase64,
            'video/mp4',
        )
    }
    if (!videoUrl) {
        throw new Error(
            'Kling 3.0 motion-control (KIE) requires a driving video (upload or URL). Presets are not supported on KIE.',
        )
    }

    // Kling 3.0 motion-control 500ea ("internal error, please try again
    // later", failCode 500, 0 créditos) con el arnés [BODY —]/[FACE:] en el
    // prompt — forense del task 3ee350cc: prompt 1,586 chars, DENTRO del
    // límite documentado de 2,500 (docs.kie.ai motion-control-v3), video
    // conductor válido (14.3s ∈ 3-30s, 576x1024 >340px, aspecto 0.56 ∈
    // 2:5-5:2). No es longitud ni el video: es el CONTENIDO estructurado —
    // mismo modo de falla que Wan 2.2 turbo (verificado 2x en vivo ahí). En
    // motion-control la identidad viaja en la IMAGEN (input_urls) y el
    // movimiento en el VIDEO conductor: el texto solo aporta estilo, así que
    // se stripean los bloques [LABEL ...] (con dos puntos O raya — el arnés
    // de cuerpo usa "[BODY — ...]") y el resto respeta el cap de la doc.
    const motionPrompt = (prompt ?? '')
        .replace(/\[[A-Z][A-Z_ ]*\s*[:—-][^\]]*\]/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, 2400)

    const input: Record<string, unknown> = {
        input_urls: [imageUrl],
        video_urls: [videoUrl],
        mode: resolution === '1080p' ? '1080p' : '720p',
        character_orientation: characterOrientation,
        background_source: 'input_video',
    }
    if (motionPrompt) input.prompt = motionPrompt
    if (prompt && motionPrompt.length !== prompt.trim().length) {
        console.log(
            `[KIE/Kling3-MC] Prompt stripped del arnés: ${prompt.length}→${motionPrompt.length} chars`,
        )
    }

    console.log(
        `[KIE/Kling3-MC] Submitting motion-control: mode=${input.mode}, orientation=${characterOrientation}`,
    )

    let taskId: string
    try {
        taskId = await withTimeout(
            submitTask({ model: 'kling-3.0/motion-control', input }),
            30_000,
            'KIE Kling 3.0 motion-control submit',
        )
    } catch (e) {
        await refundHold(gate.hold, 'kie_motion_control_submit_failed')
        throw e
    }
    console.log(`[KIE/Kling3-MC] Task submitted: ${taskId}`)
    await linkHoldToRef(gate.hold.holdId, 'kie_task', taskId)

    // RECLAMABLE desde este instante. Era la única ruta que no se registraba, y
    // el agujero se veía así: el poll dura minutos (medido: 269s) dentro de una
    // server action, la respuesta no llega al navegador ("Failed to fetch"), y
    // el usuario se queda sin el vídeo aunque KIE lo generó y cobró. Al no
    // haber fila, el barrido contestaba "Nada que recuperar" — el peor mensaje
    // posible, porque afirma que no hay nada cuando hay una generación pagada.
    await apiTrackPendingGeneration({
        provider: 'kie',
        taskId,
        mediaType: 'VIDEO',
        prompt: prompt ?? undefined,
        metadata: { model: 'kling-3.0/motion-control', mode: input.mode },
    })

    let urls: string[]
    try {
        urls = await pollTask(taskId, { budgetMs: 600_000, intervalMs: 5000 })
    } catch (e) {
        // Devuelve el cobro Y baja el rastro: el proveedor no entregó nada.
        await apiClearPendingGeneration(taskId, 'failed')
        throw e
    }
    console.log(`[KIE/Kling3-MC] Generation complete: ${urls[0]}`)

    const persisted = await persistToSupabase(urls[0], 'mp4', 'kie-videos')
    // Confirma el cobro y baja el rastro — mismo cierre que el resto de rutas.
    await apiClearPendingGeneration(taskId, 'delivered')
    return persisted
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
        return {
            success: false,
            error: e instanceof Error ? e.message : String(e),
        }
    }
}

export async function generateMotionControlKieSafe(
    params: GenerateMotionControlKieParams,
): Promise<KieVideoSafeResult> {
    try {
        const url = await generateMotionControlKie(params)
        return { success: true, url }
    } catch (e) {
        return {
            success: false,
            error: e instanceof Error ? e.message : String(e),
        }
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
/**
 * Grok Imagine Video 1.5 Preview (xAI vía KIE) — image-to-video, #1 en el I2V
 * Arena de KIE. `image_urls` = ARRAY de URLs http públicas (se sube el first
 * frame a Supabase, como Seedance) + prompt de movimiento. duration 1-15s,
 * 480p/720p. `aspect_ratio: 'auto'` sigue el tamaño de la imagen (ideal 9:16).
 * OJO FILTRO: con imagen externa el modo spicy se degrada a normal → SFW-only
 * (mismo filtro que Grok imagen). Para video NSFW: Wan 2.2 uncensored. Precio
 * sin medir — leer creditsConsumed del primer run.
 */
async function submitVideoGrokImagine(
    params: GenerateVideoKieParams,
): Promise<string> {
    const {
        prompt,
        firstFrameImage,
        aspectRatio,
        duration = 8,
        resolution = '720p',
    } = params
    const GROK_AR = new Set(['1:1', '16:9', '9:16', '3:2', '2:3', 'auto'])
    const input: Record<string, unknown> = {
        prompt,
        // docs: entero 1-15 (default 8); nuestro default de video es 5 → clamp.
        duration: Math.min(15, Math.max(1, Math.round(duration))),
        resolution: resolution === '720p' ? '720p' : '480p',
        // 'auto' sigue el tamaño de la imagen (lo ideal para animar el avatar).
        aspect_ratio:
            firstFrameImage || !aspectRatio || !GROK_AR.has(aspectRatio)
                ? 'auto'
                : aspectRatio,
        nsfw_checker: false,
    }
    if (firstFrameImage) {
        const url = await uploadReferenceToSupabase(
            firstFrameImage.base64,
            firstFrameImage.mimeType,
        )
        input.image_urls = [url]
    }
    console.log(
        `[KIE/Grok] grok-imagine-video-1-5-preview: duration=${input.duration}s, res=${input.resolution}, ar=${input.aspect_ratio}, hasImage=${!!firstFrameImage}`,
    )
    const taskId = await withTimeout(
        submitTask({ model: 'grok-imagine-video-1-5-preview', input }),
        30_000,
        'KIE Grok video submit',
    )
    console.log(`[KIE/Grok] Video task submitted: ${taskId}`)
    return taskId
}

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
    if (params.model === 'grok-imagine-video-1-5-preview') {
        return submitVideoGrokImagine(params)
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

    console.log(
        `[KIE] Submitting video task: model=${resolvedModel}, duration=${duration}s`,
    )
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
): Promise<
    { success: true; taskId: string } | { success: false; error: string }
> {
    // F5.0 — CHOKEPOINT. El video cobra POR SEGUNDO, así que la duración es
    // parte del precio: sin ella un clip de 10s costaría lo mismo que uno de 5
    // (el quote asume el clip mínimo si no llega, nunca gratis).
    const gate = await holdForOperation({
        kind: 'video',
        providerId: resolveVideoProviderId(params.model),
        seconds: params.duration ?? 5,
    })
    if (!gate.ok) {
        return { success: false, error: insufficientTokensMessage(gate) }
    }
    try {
        const taskId = await submitVideoKieTaskId(params)
        await linkHoldToRef(gate.hold.holdId, 'kie_task', taskId)
        return { success: true, taskId }
    } catch (e) {
        await refundHold(gate.hold, 'kie_video_submit_failed')
        return {
            success: false,
            error: e instanceof Error ? e.message : String(e),
        }
    }
}

/**
 * ByteDance Seedance 2.0. Unified /jobs/createTask submit, polling via
 * /jobs/recordInfo. Reference image must be a public HTTP URL (we upload
 * to Supabase first), and duration must be an integer (not stringified).
 */
async function submitVideoSeedance(
    params: GenerateVideoKieParams,
): Promise<string> {
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
            allRefs
                .slice(0, 9)
                .map((ref) =>
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

    console.log(
        `[KIE/Seedance] Submitting: duration=${duration}s, resolution=${resolution}, aspect=${aspectRatio}, hasFirstFrame=${!!firstFrameImage}, refsCount=${referenceImages?.length ?? 0}`,
    )
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
async function submitVideoWan27(
    params: GenerateVideoKieParams,
): Promise<string> {
    const {
        prompt,
        firstFrameImage,
        duration = 5,
        resolution = '1080p',
    } = params

    if (!firstFrameImage) {
        throw new Error(
            'Wan 2.7 requires a reference image (first frame). Add a face or general reference and try again.',
        )
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

    console.log(
        `[KIE/Wan2.7] Submitting: duration=${duration}s, resolution=${resolution}`,
    )
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
async function submitVideoWan22(
    params: GenerateVideoKieParams,
): Promise<string> {
    const { prompt, firstFrameImage, resolution = '720p' } = params

    if (!firstFrameImage) {
        throw new Error(
            'Wan 2.2 requiere una imagen de referencia (first frame). Agrega una face/general ref o usa Animate sobre una imagen.',
        )
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
        console.log(
            `[KIE/Wan2.2] Prompt stripped for turbo: ${prompt.length}→${String(input.prompt).length} chars`,
        )
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
): Promise<
    { success: true; taskId: string } | { success: false; error: string }
> {
    try {
        const imageUrl = await uploadReferenceToSupabase(
            params.image.base64,
            params.image.mimeType,
        )

        // Kling 3.0: genera SOLO el video (mudo) — la voz la pone el paso 2
        // (Volcengine lipsync). `sound: false` porque la tarifa con audio es
        // más cara y su pista se descartaría igual; tampoco se envía audio en
        // el element (verificado: Kling lo ignora — pista casi silente).
        if (params.model === 'kling') {
            const elementUrls = [imageUrl]
            for (const extra of params.elementImages ?? []) {
                if (elementUrls.length >= 4) break
                elementUrls.push(
                    await uploadReferenceToSupabase(
                        extra.base64,
                        extra.mimeType,
                    ),
                )
            }
            // El element exige mínimo 2 URLs — duplicar la principal si falta.
            if (elementUrls.length < 2) elementUrls.push(imageUrl)

            // Video 3-15s: audio + 1s de margen, acotado al rango válido.
            const videoDuration = Math.min(
                15,
                Math.max(3, Math.ceil(params.durationSec ?? 10) + 1),
            )

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
                        description:
                            'the avatar character speaking naturally to the camera, lips moving as if talking',
                        element_input_urls: elementUrls,
                    },
                ],
            }

            console.log(
                '[KIE] Submitting talking-head task (kling-3.0/video + audio element)',
            )
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
                  prompt: (params.prompt || DEFAULT_TALKING_PROMPT).slice(
                      0,
                      300,
                  ),
                  // '720' | '1080' — 720 mantiene el costo a raya para clips cortos.
                  output_resolution: '720',
              }
            : {
                  image_url: imageUrl,
                  audio_url: params.audioUrl,
                  prompt: (params.prompt || DEFAULT_TALKING_PROMPT).slice(
                      0,
                      5000,
                  ),
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
): Promise<
    { success: true; taskId: string } | { success: false; error: string }
> {
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
): Promise<
    | { status: 'running' }
    | { status: 'done'; url: string }
    | { status: 'failed'; error: string }
> {
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
