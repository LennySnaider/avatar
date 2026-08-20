/**
 * PURGA de media en Supabase Storage que ya vive en R2.
 *
 * Es el paso 6 del runbook original ("borrar los objetos de Supabase Storage")
 * y va SIEMPRE por separado del backfill: copiar es reversible, borrar no.
 *
 * DOBLE CANDADO antes de tocar nada — un objeto solo se borra si:
 *   1. existe en R2 con ese MISMO path, y
 *   2. tiene EXACTAMENTE el mismo tamaño en bytes.
 * Con un solo criterio, un PUT truncado en R2 bastaría para borrar el original.
 * Si un solo objeto del lote no pasa los dos, NO se borra NADA de ese lote:
 * mejor no liberar espacio que liberar el equivocado.
 *
 * USO (sin flags = inventario, no toca nada):
 *   node scripts/purge-supabase-media.mjs
 *   node scripts/purge-supabase-media.mjs --gens     borra dupes de generations
 *   node scripts/purge-supabase-media.mjs --refs     borra dupes de referencias
 *   node scripts/purge-supabase-media.mjs --gens --refs
 *
 * Los HUÉRFANOS (objetos sin fila en la BD) NO los toca este script: se
 * inventarían al final para que la decisión sea tuya y consciente. Borrar algo
 * que ninguna fila referencia es irreversible y sin red — el backfill no los
 * copió a R2 precisamente porque no hay fila que migrar.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createClient } = require('@supabase/supabase-js')

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8')
const get = (k) => {
    const m = env.match(new RegExp(`^${k}=(.+)$`, 'm'))
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : undefined
}

const DB_URL = get('NEXT_PUBLIC_SUPABASE_URL')
const DB_KEY = get('SUPABASE_SERVICE_ROLE_KEY') || get('SUPABASE_SECRET_KEY')
const R2_BASE = (get('NEXT_PUBLIC_R2_PUBLIC_BASE_URL') || '').replace(/\/$/, '')
if (!DB_URL || !DB_KEY) throw new Error('faltan vars de Supabase')
if (!R2_BASE) throw new Error('falta NEXT_PUBLIC_R2_PUBLIC_BASE_URL')

const supabase = createClient(DB_URL, DB_KEY)
const DO_GENS = process.argv.includes('--gens')
const DO_REFS = process.argv.includes('--refs')

const r2Url = (p) => `${R2_BASE}/${p.split('/').map(encodeURIComponent).join('/')}`

/** ¿Está en R2 con el mismo tamaño? Los dos candados en una sola pregunta. */
async function duplicadoExacto(path, size) {
    const res = await fetch(r2Url(path), { method: 'HEAD' })
    if (!res.ok) return { ok: false, motivo: `R2 ${res.status}` }
    const len = Number(res.headers.get('content-length') ?? -1)
    if (len !== size) return { ok: false, motivo: `tamaño ${len} ≠ ${size}` }
    return { ok: true }
}

/**
 * Recorre un prefijo de un bucket. `list` es por carpeta y no recursivo, así
 * que se baja en profundidad: un objeto se distingue de una carpeta porque
 * trae `metadata`.
 */
async function listarRecursivo(bucket, prefijo) {
    const salida = []
    const pendientes = [prefijo]
    while (pendientes.length) {
        const dir = pendientes.pop()
        const { data, error } = await supabase.storage
            .from(bucket)
            .list(dir, { limit: 1000 })
        if (error) throw new Error(`${bucket}/${dir}: ${error.message}`)
        for (const item of data ?? []) {
            const full = dir ? `${dir}/${item.name}` : item.name
            if (item.metadata) salida.push({ path: full, size: item.metadata.size ?? -1 })
            else pendientes.push(full)
        }
    }
    return salida
}

async function procesar(etiqueta, bucket, prefijo, ejecutar) {
    const objetos = await listarRecursivo(bucket, prefijo)
    const borrables = []
    const bloqueados = []
    for (const o of objetos) {
        const v = await duplicadoExacto(o.path, o.size)
        if (v.ok) borrables.push(o)
        else bloqueados.push({ ...o, motivo: v.motivo })
    }
    const mb = (n) => (n / 1024 / 1024).toFixed(1)
    const pesoBorrable = borrables.reduce((s, o) => s + o.size, 0)

    console.log(`\n── ${etiqueta} (${bucket}/${prefijo})`)
    console.log(`   objetos: ${objetos.length}`)
    console.log(`   duplicados verificados en R2: ${borrables.length} · ${mb(pesoBorrable)} MB`)
    if (bloqueados.length) {
        console.log(`   ⚠️  SIN duplicado verificado: ${bloqueados.length} — no se borra nada de este lote`)
        bloqueados.slice(0, 10).forEach((b) => console.log(`      · ${b.path} (${b.motivo})`))
        if (bloqueados.length > 10) console.log(`      … y ${bloqueados.length - 10} más`)
        return
    }
    if (!ejecutar) {
        console.log('   (inventario — pasa el flag para borrar)')
        return
    }
    if (!borrables.length) return

    // El remove de storage-js acepta lotes; se trocea por si el prefijo crece.
    for (let i = 0; i < borrables.length; i += 100) {
        const lote = borrables.slice(i, i + 100).map((o) => o.path)
        const { error } = await supabase.storage.from(bucket).remove(lote)
        if (error) throw new Error(`borrando: ${error.message}`)
    }
    console.log(`   🗑️  borrados ${borrables.length} objetos · ${mb(pesoBorrable)} MB liberados`)

    // Comprobación POSTERIOR: lo borrado tiene que seguir sirviéndose desde R2.
    let vivos = 0
    for (const o of borrables) {
        const res = await fetch(r2Url(o.path), { method: 'HEAD' })
        if (res.ok) vivos++
    }
    console.log(`   ✓ siguen legibles en R2: ${vivos}/${borrables.length}`)
}

const ORG = '00000000-0000-0000-0000-000000000001'

await procesar(
    'Generaciones duplicadas',
    'generations',
    `org/${ORG}/images`,
    DO_GENS,
)

// Referencias: solo las filas que YA están volteadas a r2 (el backfill las
// copió y verificó). Se listan desde la BD, no desde el bucket, para no rozar
// jamás un objeto cuya fila siga diciendo 'supabase'.
{
    const { data: rows, error } = await supabase
        .from('avatar_references')
        .select('storage_path, storage_provider')
    if (error) throw new Error(error.message)
    const enR2 = (rows ?? []).filter((r) => r.storage_provider === 'r2')
    const enSupabase = (rows ?? []).length - enR2.length
    console.log(`\n── Referencias de avatar (avatars/…/references)`)
    console.log(`   filas: ${rows?.length ?? 0} · en r2: ${enR2.length} · aún en supabase: ${enSupabase}`)
    if (enSupabase) {
        console.log('   ⚠️  quedan filas sin migrar — corre antes backfill-refs-r2.mjs')
    } else {
        const borrables = []
        const bloqueados = []
        for (const r of enR2) {
            const { data: info } = await supabase.storage
                .from('avatars')
                .list(r.storage_path.split('/').slice(0, -1).join('/'), {
                    limit: 1000,
                    search: r.storage_path.split('/').pop(),
                })
            const size = info?.[0]?.metadata?.size ?? -1
            if (size < 0) continue // ya no está en Supabase: nada que borrar
            const v = await duplicadoExacto(r.storage_path, size)
            if (v.ok) borrables.push({ path: r.storage_path, size })
            else bloqueados.push({ path: r.storage_path, motivo: v.motivo })
        }
        const mb = (n) => (n / 1024 / 1024).toFixed(1)
        const peso = borrables.reduce((s, o) => s + o.size, 0)
        console.log(`   duplicados verificados en R2: ${borrables.length} · ${mb(peso)} MB`)
        if (bloqueados.length) {
            console.log(`   ⚠️  SIN duplicado verificado: ${bloqueados.length} — no se borra nada`)
            bloqueados.slice(0, 10).forEach((b) => console.log(`      · ${b.path} (${b.motivo})`))
        } else if (DO_REFS && borrables.length) {
            for (let i = 0; i < borrables.length; i += 100) {
                const lote = borrables.slice(i, i + 100).map((o) => o.path)
                const { error: delErr } = await supabase.storage.from('avatars').remove(lote)
                if (delErr) throw new Error(`borrando refs: ${delErr.message}`)
            }
            console.log(`   🗑️  borrados ${borrables.length} objetos · ${mb(peso)} MB liberados`)
            let vivos = 0
            for (const o of borrables) {
                const res = await fetch(r2Url(o.path), { method: 'HEAD' })
                if (res.ok) vivos++
            }
            console.log(`   ✓ siguen legibles en R2: ${vivos}/${borrables.length}`)
        } else if (borrables.length) {
            console.log('   (inventario — pasa --refs para borrar)')
        }
    }
}

// ── HUÉRFANOS: se informan, NUNCA se borran desde aquí ──────────────────────
{
    const objetos = await listarRecursivo('avatars', '')
    const refs = await supabase.from('avatar_references').select('storage_path')
    const vivos = new Set((refs.data ?? []).map((r) => r.storage_path))
    const huerfanos = objetos.filter(
        (o) => o.path.split('/')[1] === 'references' && !vivos.has(o.path),
    )
    const peso = huerfanos.reduce((s, o) => s + o.size, 0)
    if (huerfanos.length) {
        console.log(
            `\n── HUÉRFANOS (informativo, este script NO los toca)\n` +
                `   ${huerfanos.length} objetos · ${(peso / 1024 / 1024).toFixed(1)} MB en avatars/…/references sin ninguna fila.\n` +
                `   No están en R2 (el backfill migra filas, no objetos sueltos), así que\n` +
                `   borrarlos es DEFINITIVO. Decisión consciente, no automática.`,
        )
    }
}

console.log()
