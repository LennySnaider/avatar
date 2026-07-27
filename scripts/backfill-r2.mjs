/**
 * BACKFILL Supabase Storage → R2 (F4 del plan anti-egress).
 *
 * Mueve cada generación con storage_provider='supabase' a R2, genera su
 * miniatura, y SOLO entonces voltea la fila. Idempotente y reanudable: el
 * filtro por provider hace que re-ejecutarlo continúe donde se cortó, y un
 * PUT repetido sobre el mismo path es inocuo (mismo contenido).
 *
 * RUNBOOK DEL DÍA D (desbloqueo del proyecto — 12-ago o upgrade):
 *   1. aplicar supabase/migrations/20260728010000_r2_media_provider.sql
 *   2. deploy con R2_ENABLED=true (Vercel: subir también las vars R2_*)
 *   3. DRY_RUN=1 node scripts/backfill-r2.mjs   (inventario, no toca nada)
 *   4. node scripts/backfill-r2.mjs             (migra de verdad)
 *   5. verificar una muestra en la galería
 *   6. borrar los objetos de Supabase Storage (recupera el 161% de storage)
 *
 * La bajada desde Supabase (~1.7 GB) es egress DE UNA VEZ contra la cuota
 * fresca del ciclo — por eso corre después del reset, nunca antes.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createClient } = require('@supabase/supabase-js')
const sharp = require('sharp')
const { AwsClient } = require('aws4fetch')

// ── env (con trim: el .env real lleva espacios alrededor de los =) ──
const env = readFileSync(new URL('../.env', import.meta.url), 'utf8')
const get = (k) => {
    const m = env.match(new RegExp(`^${k}=(.+)$`, 'm'))
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : undefined
}
const SUPABASE_URL = get('NEXT_PUBLIC_SUPABASE_URL') || get('SUPABASE_URL')
const SERVICE_KEY = get('SUPABASE_SERVICE_ROLE_KEY') || get('SUPABASE_SERVICE_KEY')
const R2 = {
    accountId: get('R2_ACCOUNT_ID'),
    accessKeyId: get('R2_ACCESS_KEY_ID'),
    secretAccessKey: get('R2_SECRET_ACCESS_KEY'),
    bucket: get('R2_BUCKET'),
}
const DRY_RUN = process.env.DRY_RUN === '1'
const BATCH = 25
const CONCURRENCY = 4

if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('faltan vars de Supabase')
if (Object.values(R2).some((v) => !v)) throw new Error('faltan vars de R2')

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
const aws = new AwsClient({
    accessKeyId: R2.accessKeyId,
    secretAccessKey: R2.secretAccessKey,
    region: 'auto',
    service: 's3',
})
const r2Url = (path) =>
    `https://${R2.accountId}.r2.cloudflarestorage.com/${R2.bucket}/` +
    path.split('/').map(encodeURIComponent).join('/')

const IMMUTABLE = 'public, max-age=31536000, immutable'

async function putR2(path, body, contentType) {
    const res = await aws.fetch(r2Url(path), {
        method: 'PUT',
        headers: {
            'Content-Type': contentType,
            'Cache-Control': IMMUTABLE,
            'Content-Length': String(body.byteLength),
        },
        body: new Uint8Array(body),
    })
    if (!res.ok) throw new Error(`R2 PUT ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

/** Miniatura de card: mismo criterio que el cliente (≈400px, jpeg q82). */
async function makeThumb(buffer) {
    return sharp(buffer)
        .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer()
}

// La columna debe existir — si la migración no se aplicó, mejor parar aquí
// que fallar fila a fila con un error críptico.
{
    const { error } = await supabase
        .from('generations')
        .select('storage_provider')
        .limit(1)
    if (error) {
        console.error('❌ La migración 20260728010000 no está aplicada:', error.message)
        process.exit(1)
    }
}

let migrated = 0
let failed = 0
let bytes = 0
const failures = []

for (;;) {
    const migratedBefore = migrated
    const { data: rows, error } = await supabase
        .from('generations')
        .select('id, storage_path, media_type, thumbnail_path')
        .eq('storage_provider', 'supabase')
        .order('created_at', { ascending: true })
        .limit(BATCH)
    if (error) throw new Error(error.message)
    if (!rows?.length) break

    // Tandas pequeñas con concurrencia suave: gentil con la cuota recién
    // reseteada y con el rate del origen.
    for (let i = 0; i < rows.length; i += CONCURRENCY) {
        await Promise.all(
            rows.slice(i, i + CONCURRENCY).map(async (row) => {
                const src = `${SUPABASE_URL}/storage/v1/object/public/generations/${row.storage_path}`
                try {
                    const res = await fetch(src)
                    if (!res.ok) throw new Error(`origen HTTP ${res.status}`)
                    const buf = Buffer.from(await res.arrayBuffer())
                    const contentType =
                        res.headers.get('content-type') ??
                        (row.media_type === 'VIDEO' ? 'video/mp4' : 'image/jpeg')

                    if (DRY_RUN) {
                        migrated++
                        bytes += buf.byteLength
                        return
                    }

                    await putR2(row.storage_path, buf, contentType)

                    // Thumb solo para imagen y solo si no existe ya.
                    let thumbnailPath = row.thumbnail_path ?? null
                    if (row.media_type !== 'VIDEO' && !thumbnailPath) {
                        try {
                            const thumb = await makeThumb(buf)
                            thumbnailPath = `thumbs/${row.storage_path}.jpg`
                            await putR2(thumbnailPath, thumb, 'image/jpeg')
                        } catch (e) {
                            // Best-effort: la card cae al original.
                            console.warn(`  thumb saltado ${row.id}:`, e.message)
                            thumbnailPath = row.thumbnail_path ?? null
                        }
                    }

                    // El flip va AL FINAL: si algo falló antes, la fila sigue
                    // diciendo 'supabase' y la próxima pasada la reintenta.
                    const { error: upErr } = await supabase
                        .from('generations')
                        .update({
                            storage_provider: 'r2',
                            ...(thumbnailPath ? { thumbnail_path: thumbnailPath } : {}),
                        })
                        .eq('id', row.id)
                    if (upErr) throw new Error(`update: ${upErr.message}`)

                    migrated++
                    bytes += buf.byteLength
                } catch (e) {
                    failed++
                    failures.push({ id: row.id, path: row.storage_path, error: e.message })
                    console.warn(`  ❌ ${row.id} (${row.storage_path}): ${e.message}`)
                }
            }),
        )
    }
    console.log(`  … ${migrated} migradas · ${failed} fallidas · ${(bytes / 1048576).toFixed(0)} MB`)

    // Cero migradas NUEVAS en esta pasada = solo quedan filas que fallan
    // (siguen en 'supabase' y la query las devolvería otra vez): parar aquí
    // en vez de reintentar las mismas en bucle infinito.
    if (migrated === migratedBefore) {
        console.error('❌ Pasada sin progreso — quedan solo filas fallidas, revisar la lista')
        break
    }
}

console.log(`\n${DRY_RUN ? '[DRY RUN] ' : ''}TOTAL: ${migrated} migradas · ${failed} fallidas · ${(bytes / 1048576).toFixed(1)} MB movidos`)
if (failures.length) {
    console.log('\nFallidas (siguen en supabase, re-ejecutar reintenta):')
    for (const f of failures.slice(0, 20)) console.log(` - ${f.id} ${f.path}: ${f.error}`)
}
