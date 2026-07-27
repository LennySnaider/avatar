/**
 * Almacén de media — R2 con caída a Supabase Storage.
 *
 * POR QUÉ EXISTE (2026-07-27): Supabase bloqueó el proyecto por egress —
 * 140 GB en 15 días contra 5 GB de cuota. Dos causas multiplicadas: las cards
 * bajaban el original completo (1-3 MB para pintar 200px) y este plan sirve
 * TODO con `cache-control: no-cache` (medido subiendo un PNG con max-age y
 * leyendo la cabecera de vuelta), así que Cloudflare jamás cacheaba nada.
 *
 * R2 invierte el modelo de cobro: cobra por almacenar (tenemos 1.61 GB, el
 * free tier da 10) y REGALA el egress — que es exactamente donde ardían los
 * 140 GB. Y al servir con un `cache-control` que sí controlamos, las
 * descargas repetidas ni siquiera llegan al bucket.
 *
 * SOLO servidor: firma con credenciales secretas (aws4fetch, SigV4). Las URLs
 * públicas para el cliente se construyen en `storagePaths.ts`, que es puro.
 *
 * Gotchas de R2 aplicados (referencia .agents/skills/cloudflare/references/r2):
 *  - el S3Client/firma exige `region: 'auto'`
 *  - cuerpos con longitud conocida (siempre mandamos Buffer, nunca stream)
 *  - el Cache-Control del PUT se guarda como httpMetadata y se SIRVE de vuelta
 */
import { AwsClient } from 'aws4fetch'
import { createServerSupabaseClient } from '@/lib/supabase'

/** Content-addressed o con timestamp único en el nombre → inmutable: la caché
 * eterna es segura y es la que mantiene el egress en ~0 tras la primera vez. */
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable'

type R2Config = {
    accountId: string
    accessKeyId: string
    secretAccessKey: string
    bucket: string
}

function r2Config(): R2Config | null {
    const accountId = process.env.R2_ACCOUNT_ID
    const accessKeyId = process.env.R2_ACCESS_KEY_ID
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
    const bucket = process.env.R2_BUCKET
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null
    return { accountId, accessKeyId, secretAccessKey, bucket }
}

/**
 * ¿Está R2 activo? Exige el flag EXPLÍCITO además de las credenciales: así
 * poner las llaves en .env no cambia el comportamiento por sí solo, y el
 * rollback es una variable de entorno (R2_ENABLED=false), no un deploy.
 */
export function r2Enabled(): boolean {
    return process.env.R2_ENABLED === 'true' && r2Config() !== null
}

let awsClient: AwsClient | null = null
function getAwsClient(cfg: R2Config): AwsClient {
    if (!awsClient) {
        awsClient = new AwsClient({
            accessKeyId: cfg.accessKeyId,
            secretAccessKey: cfg.secretAccessKey,
            // R2 exige 'auto' — sin región la firma S3 falla en TODAS las
            // llamadas (gotcha #1 de la referencia).
            region: 'auto',
            service: 's3',
        })
    }
    return awsClient
}

function r2ObjectUrl(cfg: R2Config, path: string): string {
    // Codificar por segmento: los paths llevan '/' reales de carpeta, pero un
    // nombre con espacios o caracteres raros debe viajar escapado.
    const encoded = path.split('/').map(encodeURIComponent).join('/')
    return `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}/${encoded}`
}

export type PutMediaResult = {
    /** URL pública servible (R2 público o Supabase public). */
    url: string
    /** Quién guarda el objeto — se persiste en la fila para que el lector
     * construya la URL correcta durante la transición. */
    provider: 'r2' | 'supabase'
}

/**
 * Sube un objeto de media al almacén activo y devuelve su URL pública.
 *
 * Mismo path lógico en ambos proveedores (p.ej. `kie-refs/{hash}.jpg` o
 * `{user}/gen-123.png`): el backfill puede mover objetos sin renombrar nada y
 * el lector solo cambia la base según el provider.
 */
export async function putMediaObject(opts: {
    path: string
    body: Buffer
    contentType: string
    cacheControl?: string
    /** Sobrescribir si ya existe (content-addressed → mismo contenido). */
    upsert?: boolean
}): Promise<PutMediaResult> {
    const cacheControl = opts.cacheControl ?? IMMUTABLE_CACHE

    if (r2Enabled()) {
        const cfg = r2Config()!
        const res = await getAwsClient(cfg).fetch(r2ObjectUrl(cfg, opts.path), {
            method: 'PUT',
            headers: {
                'Content-Type': opts.contentType,
                // R2 guarda esto como httpMetadata y lo SIRVE tal cual — el
                // control que Supabase nos negaba y que mantiene el borde
                // caliente entre sesiones.
                'Cache-Control': cacheControl,
                'Content-Length': String(opts.body.byteLength),
            },
            body: new Uint8Array(opts.body),
        })
        if (!res.ok) {
            const text = await res.text().catch(() => '')
            throw new Error(
                `R2 PUT failed (${res.status}) for ${opts.path}: ${text.slice(0, 300)}`,
            )
        }
        return { url: getR2PublicUrl(opts.path), provider: 'r2' }
    }

    // Caída a Supabase: exactamente el comportamiento previo, para que con el
    // flag apagado nada cambie ni un byte.
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not defined')
    const supabase = createServerSupabaseClient()
    const { error } = await supabase.storage
        .from('generations')
        .upload(opts.path, opts.body, {
            contentType: opts.contentType,
            cacheControl: '31536000',
            upsert: opts.upsert ?? false,
        })
    if (error) throw new Error(`Failed to persist media: ${error.message}`)
    return {
        url: `${SUPABASE_URL}/storage/v1/object/public/generations/${opts.path}`,
        provider: 'supabase',
    }
}

/**
 * URL pública de un objeto en R2. Servidor y cliente comparten la base vía
 * NEXT_PUBLIC_R2_PUBLIC_BASE_URL (dominio propio o pub-*.r2.dev).
 */
export function getR2PublicUrl(path: string): string {
    const base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL
    if (!base) throw new Error('NEXT_PUBLIC_R2_PUBLIC_BASE_URL is not defined')
    const encoded = path.split('/').map(encodeURIComponent).join('/')
    return `${base.replace(/\/$/, '')}/${encoded}`
}

/**
 * URL PREFIRMADA para que el NAVEGADOR suba directo a R2 (PUT).
 *
 * Es el equivalente del signed-upload de Supabase y mantiene la regla
 * anti-413: los binarios nunca pasan por un server action. La firma va por
 * query (SigV4, solo `host` firmado), así que el browser puede mandar
 * Content-Type y Cache-Control como cabeceras libres.
 */
export async function createPresignedPutUrl(
    path: string,
    expiresSeconds = 3600,
): Promise<string> {
    const cfg = r2Config()
    if (!cfg) throw new Error('R2 no está configurado')
    const url = new URL(r2ObjectUrl(cfg, path))
    url.searchParams.set('X-Amz-Expires', String(expiresSeconds))
    const signed = await getAwsClient(cfg).sign(
        new Request(url.toString(), { method: 'PUT' }),
        { aws: { signQuery: true } },
    )
    return signed.url
}

/** ¿Existe ya el objeto en R2? (HEAD firmado — para el dedupe de refs.) */
export async function r2ObjectExists(path: string): Promise<boolean> {
    if (!r2Enabled()) return false
    const cfg = r2Config()!
    const res = await getAwsClient(cfg).fetch(r2ObjectUrl(cfg, path), {
        method: 'HEAD',
    })
    return res.ok
}
