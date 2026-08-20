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
// Tras el trasplante hay DOS proyectos con papeles distintos y el script
// debe separarlos o no cura nada:
//   - BD = el NUEVO (vars estándar): ahí viven las filas que la app lee y
//     ahí debe aterrizar el flip storage_provider='r2'. Voltear la BD vieja
//     dejaría la galería igual de rota tras mover todos los bytes.
//   - MEDIA = el VIEJO (OLD_*): ahí están los objetos huérfanos. Fallback al
//     nuevo para las ~7 filas 'supabase' cuyos bytes sí viven en el nuevo.
const DB_URL = get('NEXT_PUBLIC_SUPABASE_URL')
const DB_KEY = get('SUPABASE_SERVICE_ROLE_KEY') || get('SUPABASE_SECRET_KEY')
const MEDIA_URLS = [get('OLD_SUPABASE_URL'), DB_URL].filter(Boolean)
const R2 = {
    accountId: get('R2_ACCOUNT_ID'),
    accessKeyId: get('R2_ACCESS_KEY_ID'),
    secretAccessKey: get('R2_SECRET_ACCESS_KEY'),
    bucket: get('R2_BUCKET'),
}
const DRY_RUN = process.env.DRY_RUN === '1'
// BATCH grande a propósito: las filas MUERTAS (sin objeto en el origen, p.ej.
// las 23 de ad5f9bfe… perdidas desde dic-2025) son las más viejas y el orden
// asc las deja SIEMPRE al frente de la página. Con batch 25 cada pasada eran
// ellas + ~2 filas útiles → horas de head-of-line. Con 200, son ruido fijo.
const BATCH = 200
const CONCURRENCY = 4

if (!DB_URL || !DB_KEY) throw new Error('faltan vars de Supabase (BD nueva)')
if (!MEDIA_URLS.length) throw new Error('falta OLD_SUPABASE_URL (fuente de media)')
if (Object.values(R2).some((v) => !v)) throw new Error('faltan vars de R2')

const supabase = createClient(DB_URL, DB_KEY)
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

/** Miniatura de card: mismo criterio que el cliente (900px — a 400 la card
 *  retina de ~430px CSS se veía borrosa; ver IMAGE_SIZES.PREVIEW). */
async function makeThumb(buffer) {
    return sharp(buffer)
        .resize(900, 900, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85, mozjpeg: true })
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
// Una fila muerta reaparece en TODAS las pasadas (nunca se voltea): se
// reporta una sola vez o el log son miles de líneas repetidas.
const alreadyFailed = new Set()

let dryPage = 0
for (;;) {
    const migratedBefore = migrated
    let query = supabase
        .from('generations')
        .select('id, storage_path, media_type, thumbnail_path')
        .eq('storage_provider', 'supabase')
        .order('created_at', { ascending: true })
    // DRY_RUN no voltea filas, así que la primera página se repetiría para
    // siempre: se pagina por offset SOLO en dry run. En real, el flip hace
    // avanzar la query sola.
    query = DRY_RUN
        ? query.range(dryPage * BATCH, dryPage * BATCH + BATCH - 1)
        : query.limit(BATCH)
    dryPage++
    const { data: rows, error } = await query
    if (error) throw new Error(error.message)
    if (!rows?.length) break

    // Tandas pequeñas con concurrencia suave: gentil con la cuota recién
    // reseteada y con el rate del origen.
    for (let i = 0; i < rows.length; i += CONCURRENCY) {
        await Promise.all(
            rows.slice(i, i + CONCURRENCY).map(async (row) => {
                try {
                    // Viejo primero (ahí está el 99%), nuevo de fallback
                    // (las ~7 filas 'supabase' cuyos bytes ya viven ahí).
                    // DRY_RUN inventaría con HEAD: bajar el objeto entero
                    // solo para contarlo gastaría la MISMA cuota que migrarlo.
                    let res = null
                    for (const base of MEDIA_URLS) {
                        res = await fetch(`${base}/storage/v1/object/public/generations/${row.storage_path}`, {
                            method: DRY_RUN ? 'HEAD' : 'GET',
                        })
                        if (res.ok) break
                    }
                    if (!res?.ok) throw new Error(`origen HTTP ${res?.status}`)

                    if (DRY_RUN) {
                        migrated++
                        bytes += Number(res.headers.get('content-length') ?? 0)
                        return
                    }

                    const buf = Buffer.from(await res.arrayBuffer())
                    const contentType =
                        res.headers.get('content-type') ??
                        (row.media_type === 'VIDEO' ? 'video/mp4' : 'image/jpeg')

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
                    if (!alreadyFailed.has(row.id)) {
                        alreadyFailed.add(row.id)
                        failed++
                        failures.push({ id: row.id, path: row.storage_path, error: e.message })
                        console.warn(`  ❌ ${row.id} (${row.storage_path}): ${e.message}`)
                    }
                }
            }),
        )
    }
    console.log(`  … ${migrated} migradas · ${failed} fallidas · ${(bytes / 1048576).toFixed(0)} MB`)

    // Cero migradas NUEVAS en esta pasada = solo quedan filas que fallan
    // (siguen en 'supabase' y la query las devolvería otra vez): parar aquí
    // en vez de reintentar las mismas en bucle infinito.
    if (!DRY_RUN && migrated === migratedBefore) {
        console.error('❌ Pasada sin progreso — quedan solo filas fallidas, revisar la lista')
        break
    }
}

console.log(`\n${DRY_RUN ? '[DRY RUN] ' : ''}TOTAL: ${migrated} migradas · ${failed} fallidas · ${(bytes / 1048576).toFixed(1)} MB movidos`)
if (failures.length) {
    console.log('\nFallidas (siguen en supabase, re-ejecutar reintenta):')
    for (const f of failures.slice(0, 20)) console.log(` - ${f.id} ${f.path}: ${f.error}`)
}
