/**
 * REGENERA las miniaturas de galería a 900px (antes 400px → borrosas).
 *
 * Por qué: las cards miden ~430px CSS (~860px físicos en Retina) y el thumb
 * PREVIEW de 400px se estiraba — borroso vs el original del editor. Con las
 * generaciones en R2 el egress es gratis: leer los originales para
 * re-thumbnailear no cuesta.
 *
 * Cache-buster deliberado: los thumbs viejos viven en `thumbs/{path}.jpg`
 * con Cache-Control immutable — sobreescribirlos dejaría el borroso servido
 * por el navegador/borde por meses. Los nuevos van a `thumbs/{path}.900.jpg`
 * y la fila apunta al path nuevo → cache miss limpio. Los viejos quedan
 * huérfanos (borrables después si molesta el storage).
 *
 * Alcance: filas IMAGE con storage_provider='r2'. Regenera las que tienen
 * thumb viejo Y crea thumb a las que no tenían (esas cards cargaban el
 * original de 1-3MB). Idempotente: si thumbnail_path ya termina en .900.jpg
 * se salta. Las filas 'supabase' NO se tocan (sus bytes viven en el proyecto
 * viejo bloqueado hasta el 12-ago; las cubre el backfill del día D, que ya
 * genera a 900).
 *
 * Uso:  DRY_RUN=1 node scripts/regen-thumbs-900.mjs   (inventario)
 *       node scripts/regen-thumbs-900.mjs             (real)
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
    const m = env.match(new RegExp(`^${k}\\s*=\\s*(.+)$`, 'm'))
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : undefined
}
const SUPABASE_URL = get('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_KEY = get('SUPABASE_SERVICE_ROLE_KEY') || get('SUPABASE_SERVICE_KEY')
const R2_PUBLIC_BASE = get('NEXT_PUBLIC_R2_PUBLIC_BASE_URL')
const R2 = {
    accountId: get('R2_ACCOUNT_ID'),
    accessKeyId: get('R2_ACCESS_KEY_ID'),
    secretAccessKey: get('R2_SECRET_ACCESS_KEY'),
    bucket: get('R2_BUCKET'),
}
const DRY_RUN = process.env.DRY_RUN === '1'
const BATCH = 100
const CONCURRENCY = 6

if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('faltan vars de Supabase')
if (!R2_PUBLIC_BASE) throw new Error('falta NEXT_PUBLIC_R2_PUBLIC_BASE_URL')
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
const publicUrl = (path) =>
    `${R2_PUBLIC_BASE}/` + path.split('/').map(encodeURIComponent).join('/')

async function putR2(path, body) {
    const res = await aws.fetch(r2Url(path), {
        method: 'PUT',
        headers: {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Content-Length': String(body.byteLength),
        },
        body: new Uint8Array(body),
    })
    if (!res.ok)
        throw new Error(`R2 PUT ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

let done = 0
let skipped = 0
let failed = 0
let bytes = 0
const failures = []

let page = 0
for (;;) {
    const { data: rows, error } = await supabase
        .from('generations')
        .select('id, storage_path, thumbnail_path')
        .eq('storage_provider', 'r2')
        .eq('media_type', 'IMAGE')
        .order('created_at', { ascending: true })
        .range(page * BATCH, page * BATCH + BATCH - 1)
    if (error) throw new Error(error.message)
    if (!rows?.length) break
    page++

    for (let i = 0; i < rows.length; i += CONCURRENCY) {
        await Promise.all(
            rows.slice(i, i + CONCURRENCY).map(async (row) => {
                if (row.thumbnail_path?.endsWith('.900.jpg')) {
                    skipped++
                    return
                }
                try {
                    if (DRY_RUN) {
                        done++
                        return
                    }
                    const res = await fetch(publicUrl(row.storage_path))
                    if (!res.ok) throw new Error(`origen HTTP ${res.status}`)
                    const buf = Buffer.from(await res.arrayBuffer())
                    const thumb = await sharp(buf)
                        .resize(900, 900, {
                            fit: 'inside',
                            withoutEnlargement: true,
                        })
                        .jpeg({ quality: 85, mozjpeg: true })
                        .toBuffer()
                    const thumbPath = `thumbs/${row.storage_path}.900.jpg`
                    await putR2(thumbPath, thumb)
                    const { error: upErr } = await supabase
                        .from('generations')
                        .update({ thumbnail_path: thumbPath })
                        .eq('id', row.id)
                    if (upErr) throw new Error(`update: ${upErr.message}`)
                    done++
                    bytes += thumb.byteLength
                } catch (e) {
                    failed++
                    failures.push({ id: row.id, path: row.storage_path, error: e.message })
                    console.warn(`  ❌ ${row.id} (${row.storage_path}): ${e.message}`)
                }
            }),
        )
    }
    console.log(`  … ${done} regeneradas, ${skipped} ya al día, ${failed} fallos`)
}

console.log(
    `\n${DRY_RUN ? '[DRY RUN] ' : ''}✅ ${done} thumbs ${DRY_RUN ? 'pendientes de regenerar' : `regeneradas (${(bytes / 1048576).toFixed(1)} MB subidos)`} · ${skipped} ya a 900 · ${failed} fallos`,
)
if (failures.length) {
    console.log('\nFallos (reintentables re-corriendo el script):')
    for (const f of failures.slice(0, 20)) console.log(` - ${f.id}: ${f.error}`)
}
