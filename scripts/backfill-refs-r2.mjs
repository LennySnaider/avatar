/**
 * BACKFILL de REFERENCIAS de avatar: Supabase Storage (`avatars`) → R2.
 *
 * Hermano de `backfill-r2.mjs`, que solo cubrió `generations`. Las referencias
 * —caras, hojas del Body Lab, angles, poses— se habían quedado 100% en Supabase
 * porque `avatar_references` no tenía dónde anotar el proveedor y
 * `uploadReference` subía directo al bucket, saltándose `putMediaObject`. Las
 * dos cosas se arreglaron el 2026-08-20; esto mueve lo que ya existía.
 *
 * MISMO PATH en los dos lados: solo cambia la base de la URL. El flip de
 * `storage_provider` va SIEMPRE al final, después de verificar que el objeto
 * llegó — así una pasada interrumpida deja cada fila apuntando a donde de
 * verdad están sus bytes, nunca a un sitio vacío.
 *
 * Idempotente y reanudable: filtra por `storage_provider='supabase'`, así que
 * re-ejecutarlo continúa donde se cortó; un PUT repetido del mismo path es
 * inocuo.
 *
 * USO:
 *   DRY_RUN=1 node scripts/backfill-refs-r2.mjs   (inventario, no toca nada)
 *   node scripts/backfill-refs-r2.mjs             (migra de verdad)
 *
 * NO borra nada del origen. Vaciar Supabase es un paso aparte y deliberado,
 * después de mirar la galería.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createClient } = require('@supabase/supabase-js')
const { AwsClient } = require('aws4fetch')

// ── env (con trim: el .env real puede llevar espacios alrededor de los =) ──
const env = readFileSync(new URL('../.env', import.meta.url), 'utf8')
const get = (k) => {
    const m = env.match(new RegExp(`^${k}=(.+)$`, 'm'))
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : undefined
}

const DB_URL = get('NEXT_PUBLIC_SUPABASE_URL')
const DB_KEY = get('SUPABASE_SERVICE_ROLE_KEY') || get('SUPABASE_SECRET_KEY')
const R2 = {
    accountId: get('R2_ACCOUNT_ID'),
    accessKeyId: get('R2_ACCESS_KEY_ID'),
    secretAccessKey: get('R2_SECRET_ACCESS_KEY'),
    bucket: get('R2_BUCKET'),
}
const DRY_RUN = process.env.DRY_RUN === '1'
const BATCH = 100
const CONCURRENCY = 4

if (!DB_URL || !DB_KEY) throw new Error('faltan vars de Supabase')
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
    if (!res.ok)
        throw new Error(
            `R2 PUT ${res.status}: ${(await res.text()).slice(0, 200)}`,
        )
}

/** ¿Llegó de verdad? El flip solo se hace tras un HEAD que confirme el objeto
 *  — un PUT con 200 y un objeto de 0 bytes deja la fila mintiendo. */
async function r2Has(path) {
    const res = await aws.fetch(r2Url(path), { method: 'HEAD' })
    return res.ok
}

// La columna debe existir. Mejor parar aquí que fallar fila a fila con un
// error críptico (lección del backfill hermano).
{
    const { error } = await supabase
        .from('avatar_references')
        .select('storage_provider')
        .limit(1)
    if (error) {
        console.error(
            '❌ La migración 20260820220000_avatar_references_r2 no está aplicada:',
            error.message,
        )
        process.exit(1)
    }
}

let migrated = 0
let failed = 0
let bytes = 0
const failures = []
const alreadyFailed = new Set()

console.log(
    DRY_RUN
        ? '\n🔍 DRY RUN — inventario por HEAD, no se sube ni voltea nada\n'
        : '\n🚚 Backfill de referencias → R2\n',
)

let dryPage = 0
for (;;) {
    const migratedBefore = migrated
    let query = supabase
        .from('avatar_references')
        .select('id, storage_path, mime_type, type')
        .eq('storage_provider', 'supabase')
        .order('created_at', { ascending: true })
    // DRY_RUN no voltea filas, así que la primera página se repetiría para
    // siempre: se pagina por offset SOLO en dry run.
    query = DRY_RUN
        ? query.range(dryPage * BATCH, dryPage * BATCH + BATCH - 1)
        : query.limit(BATCH)
    dryPage++

    const { data: rows, error } = await query
    if (error) throw new Error(error.message)
    if (!rows?.length) break

    for (let i = 0; i < rows.length; i += CONCURRENCY) {
        await Promise.all(
            rows.slice(i, i + CONCURRENCY).map(async (row) => {
                try {
                    // El bucket `avatars` es público → sin auth. DRY_RUN mide
                    // con HEAD: bajar el objeto entero solo para contarlo
                    // gastaría la MISMA cuota de egress que migrarlo.
                    const src = `${DB_URL}/storage/v1/object/public/avatars/${row.storage_path
                        .split('/')
                        .map(encodeURIComponent)
                        .join('/')}`
                    const res = await fetch(src, {
                        method: DRY_RUN ? 'HEAD' : 'GET',
                    })
                    if (!res.ok) throw new Error(`origen HTTP ${res.status}`)

                    if (DRY_RUN) {
                        migrated++
                        bytes += Number(res.headers.get('content-length') ?? 0)
                        return
                    }

                    const buf = Buffer.from(await res.arrayBuffer())
                    const contentType =
                        res.headers.get('content-type') ??
                        row.mime_type ??
                        'image/jpeg'

                    await putR2(row.storage_path, buf, contentType)
                    if (!(await r2Has(row.storage_path))) {
                        throw new Error('el PUT dijo OK pero el HEAD no lo ve')
                    }

                    const { error: upErr } = await supabase
                        .from('avatar_references')
                        .update({ storage_provider: 'r2' })
                        .eq('id', row.id)
                    if (upErr) throw new Error(`flip: ${upErr.message}`)

                    migrated++
                    bytes += buf.byteLength
                    console.log(
                        `  ✓ ${row.type.padEnd(10)} ${(buf.byteLength / 1024) | 0} KB  ${row.storage_path.slice(-40)}`,
                    )
                } catch (e) {
                    failed++
                    if (!alreadyFailed.has(row.id)) {
                        alreadyFailed.add(row.id)
                        failures.push(`${row.id} (${row.type}): ${e.message}`)
                    }
                }
            }),
        )
    }

    // Sin progreso en una pasada completa = lo que queda son filas muertas
    // (sin bytes en el origen). Seguir sería un bucle infinito.
    if (!DRY_RUN && migrated === migratedBefore) {
        console.log(
            '\n⚠️  Una pasada entera sin progreso — el resto no tiene bytes en el origen.',
        )
        break
    }
}

console.log(
    `\n${DRY_RUN ? 'Inventario' : 'Migradas'}: ${migrated} · ${(bytes / 1024 / 1024).toFixed(1)} MB · fallidas: ${failed}`,
)
if (failures.length) {
    console.log('\nFallos:')
    failures.slice(0, 30).forEach((f) => console.log(`  · ${f}`))
    if (failures.length > 30)
        console.log(`  … y ${failures.length - 30} más`)
}
if (!DRY_RUN && migrated) {
    console.log(
        '\nSiguiente: mirar la galería y el detalle de un avatar. Los objetos del\n' +
            'origen NO se han tocado — borrarlos es un paso aparte y deliberado.\n',
    )
}
