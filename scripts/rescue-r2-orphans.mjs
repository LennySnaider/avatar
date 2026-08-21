/**
 * RESCATA las generaciones HUÉRFANAS que ya viven en R2 pero no tienen fila.
 *
 * POR QUÉ EXISTEN: el servidor persiste el RESULTADO de KIE a storage en
 * cuanto `pollTask` termina (`persistToSupabase(...,'kie-images')` en
 * KieService) — antes de que el cliente decida guardarlo en la galería. Si la
 * pestaña se fue (navegación, recarga, equipo suspendido), los bytes quedan en
 * el bucket y la fila nunca se escribe. Pagadas, generadas, invisibles.
 *
 * Medido el 20-ago-2026: 1.249 objetos / 2,45 GB en R2 sin fila. Este script
 * NO mueve bytes — sólo escribe las filas que faltan. El egress de R2 es
 * gratis, así que leer los originales para sacar dimensiones y miniatura
 * tampoco cuesta.
 *
 * OJO — la mayoría de esos huérfanos NO son generaciones perdidas: son la
 * copia que el servidor dejó en `kie-images/` de algo que SÍ guardaste (el
 * cliente sube su propia copia aparte). El filtro por MD5 de `hashesVivos`
 * es lo que separa una cosa de la otra; sin él esto duplica tu galería.
 *
 * DE DÓNDE SALE CADA CAMPO (nada se inventa; lo que no se puede probar se
 * marca como rescatado y se deja explícito):
 *  - `created_at`  → el `Date.now()` que el propio path lleva incrustado. Sin
 *                    esto las 1.249 aparecerían todas "hoy" y la galería
 *                    quedaría mintiendo sobre cuándo se generó cada cosa.
 *  - `prompt`      → KIE guarda el prompt EXACTO en `param` (doble JSON). Se
 *                    llega al taskId por el `token_ledger`: el `settle` de la
 *                    tarea cae a segundos del path (mediana medida: 4,3 s).
 *                    Es NOT NULL, así que sin KIE va un texto de rescate.
 *  - `avatar_id`   → vecindad temporal con las generaciones SÍ guardadas (984
 *                    de 1.249 tienen una vecina a menos de 2 min). Fuera de
 *                    la ventana se deja null antes que adivinar.
 *  - `aspect_ratio`→ dimensiones reales del archivo, no del prompt.
 *
 * Idempotente por construcción: cada pasada recalcula los huérfanos contra la
 * BD, así que lo ya rescatado deja de serlo. No hay índice único en
 * `storage_path` — la idempotencia la da ese recálculo, no la base.
 *
 * Uso:  DRY_RUN=1 node scripts/rescue-r2-orphans.mjs   (inventario, no escribe)
 *       node scripts/rescue-r2-orphans.mjs             (real)
 */
import { readFileSync, writeFileSync } from 'node:fs'
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
const KIE_API_KEY = get('KIE_API_KEY')
const R2 = {
    accountId: get('R2_ACCOUNT_ID'),
    accessKeyId: get('R2_ACCESS_KEY_ID'),
    secretAccessKey: get('R2_SECRET_ACCESS_KEY'),
    bucket: get('R2_BUCKET'),
}
const DRY_RUN = process.env.DRY_RUN === '1'
/** Por defecto las hojas del Body Lab NO entran a la galería (ver esHojaBodyLab).
 *  Nada se destruye: sus bytes siguen en R2 y quedan listadas en el JSON de salida. */
const INCLUDE_SHEETS = process.env.INCLUDE_SHEETS === '1'
const LIMIT = Number(process.env.LIMIT || 0) // 0 = sin tope; útil para probar
const CONCURRENCY = 6
const BATCH = 100

/** Ventanas de atribución, medidas sobre los datos reales (ver cabecera). */
const LEDGER_WINDOW_S = 120
const AVATAR_WINDOW_S = 3600

/** Prefijos que NO son resultados: entradas del proveedor, thumbs, sondas. */
const NO_ES_RESULTADO = (key) =>
    key.startsWith('thumbs/') ||
    key.startsWith('kie-refs/') ||
    key.includes('/kie-refs/') ||
    // Composite con la máscara morada que se le manda al proveedor. Vivía en
    // `images/` y por eso el rescate le puso fila a 32: aparecieron en la
    // galería con la mancha encima. Es una ENTRADA, nunca un resultado.
    key.includes('/edit-refs/') ||
    key.startsWith('_tmp-vlm-probe/') ||
    key.endsWith('.emptyFolderPlaceholder')

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
const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/')
const r2Url = (p) =>
    `https://${R2.accountId}.r2.cloudflarestorage.com/${R2.bucket}/${encodePath(p)}`
const publicUrl = (p) => `${R2_PUBLIC_BASE}/${encodePath(p)}`

// ─────────────────────────── inventario de R2 ───────────────────────────

/**
 * ListObjectsV2 paginado. El orden de los hijos de <Contents> lo decide R2
 * (Key, Size, LastModified, ETag) y NO coincide con el de S3 — por eso cada
 * campo se extrae por separado en vez de con una sola regex posicional.
 */
async function listarR2() {
    const todos = []
    let token = null
    do {
        const u = new URL(
            `https://${R2.accountId}.r2.cloudflarestorage.com/${R2.bucket}`,
        )
        u.searchParams.set('list-type', '2')
        u.searchParams.set('max-keys', '1000')
        if (token) u.searchParams.set('continuation-token', token)
        const res = await aws.fetch(u.toString())
        if (!res.ok) throw new Error(`list R2 ${res.status}`)
        const xml = await res.text()
        for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
            const c = m[1]
            todos.push({
                key: c.match(/<Key>([\s\S]*?)<\/Key>/)?.[1],
                size: Number(c.match(/<Size>(\d+)<\/Size>/)?.[1] ?? 0),
                // ETag = MD5 (0 subidas multipart medidas). Es el candado
                // anti-duplicado: ver el filtro de `hashesVivos` en main().
                etag: (c.match(/<ETag>([\s\S]*?)<\/ETag>/)?.[1] ?? '')
                    .replace(/&quot;|"/g, ''),
            })
        }
        token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
            ? (xml.match(/<NextContinuationToken>([^<]+)</)?.[1] ?? null)
            : null
    } while (token)
    return todos
}

/** Lee una tabla entera saltando el tope de 1000 filas de PostgREST. */
async function leerTodo(tabla, columnas, filtro = (q) => q) {
    const filas = []
    for (let desde = 0; ; desde += 1000) {
        const { data, error } = await filtro(
            supabase.from(tabla).select(columnas),
        ).range(desde, desde + 999)
        if (error) throw new Error(`${tabla}: ${error.message}`)
        filas.push(...data)
        if (data.length < 1000) return filas
    }
}

// ────────────────────────── correlación temporal ──────────────────────────

const segundos = (iso) => new Date(iso).getTime() / 1000

/** El `Date.now()` que el path lleva dentro; es la hora real de generación. */
function tsDelPath(key) {
    const m = key.split('/').pop().match(/(\d{13})/)
    return m ? Number(m[1]) / 1000 : null
}

/** Vecino más cercano por tiempo dentro de `ventana`, o null. */
function masCercano(ordenados, t, ventana) {
    let lo = 0
    let hi = ordenados.length
    while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (ordenados[mid].t < t) lo = mid + 1
        else hi = mid
    }
    let mejor = null
    for (const i of [lo - 1, lo]) {
        const c = ordenados[i]
        if (!c) continue
        const d = Math.abs(c.t - t)
        if (d <= ventana && (!mejor || d < mejor.d)) mejor = { ...c, d }
    }
    return mejor
}

// ───────────────────────────── prompt desde KIE ─────────────────────────────

/**
 * Versión compacta de `src/services/kie/taskProbe.ts` (las tres familias de
 * record-info que tiene KIE). Se duplica a propósito: este script es un
 * rescate puntual en .mjs y no puede importar el TS con alias `@/`. La
 * canónica sigue siendo la de src — si cambia el formato, se arregla allí.
 */
async function promptDeKie(taskId) {
    if (!KIE_API_KEY) return null
    const pedir = async (path) => {
        try {
            const r = await fetch(
                `https://api.kie.ai/api/v1${path}?taskId=${encodeURIComponent(taskId)}`,
                {
                    headers: { Authorization: `Bearer ${KIE_API_KEY}` },
                    signal: AbortSignal.timeout(30_000),
                },
            )
            return r.ok ? await r.json() : null
        } catch {
            return null
        }
    }
    const desParam = (param) => {
        if (!param) return null
        try {
            const outer = JSON.parse(param)
            const inner =
                typeof outer.input === 'string'
                    ? JSON.parse(outer.input)
                    : outer.input
            const p = inner?.prompt ?? outer.prompt
            return typeof p === 'string' && p.trim() ? p : null
        } catch {
            return null
        }
    }
    const jobs = await pedir('/jobs/recordInfo')
    if (jobs?.data?.state) {
        return {
            prompt: desParam(jobs.data.param),
            model: jobs.data.model ?? null,
            family: 'jobs',
        }
    }
    for (const [path, family] of [
        ['/flux/kontext/record-info', 'flux-kontext'],
        ['/gpt4o-image/record-info', 'gpt4o-image'],
    ]) {
        const j = await pedir(path)
        if (j?.data) return { prompt: desParam(j.data.param), model: null, family }
    }
    return null
}

// ──────────────────────────── imagen: dims + thumb ────────────────────────────

const RATIOS = [
    ['9:16', 9 / 16],
    ['3:4', 3 / 4],
    ['1:1', 1],
    ['4:3', 4 / 3],
    ['16:9', 16 / 9],
]
const ratioMasCercano = (w, h) =>
    RATIOS.reduce((a, b) =>
        Math.abs(b[1] - w / h) < Math.abs(a[1] - w / h) ? b : a,
    )[0]

/**
 * ¿Es una HOJA del Body Lab (el turnaround de 4 ángulos sobre fondo liso)?
 *
 * KIE re-hospeda esas hojas en el MISMO prefijo que los resultados de galería
 * y sin fila, así que un rescate ciego mete 201 hojas entre las fotos. El
 * aspecto NO basta: hay generaciones 16:9 legítimas (verificadas a ojo) y hay
 * hojas con fondo degradado que rompen cualquier umbral de color.
 *
 * Lo que sí separa (validado contra 24 muestras al azar de cada lado): la hoja
 * tiene el fondo liso dominante Y **exactamente cuatro** columnas de figura.
 * Una escena real cubre el encuadre entero → una sola "joroba".
 */
function esHojaBodyLab(rgb, W, H) {
    const px = (i, j) => {
        const o = (j * W + i) * 3
        return [rgb[o], rgb[o + 1], rgb[o + 2]]
    }
    const muestras = []
    for (let j = 0; j < 3; j++) for (let i = 0; i < W; i += 4) muestras.push(px(i, j))
    for (const i of [0, 1, W - 2, W - 1]) for (let j = 0; j < H; j++) muestras.push(px(i, j))
    const fondo = [0, 1, 2].map((k) => {
        const v = muestras.map((m) => m[k]).sort((a, b) => a - b)
        return v[v.length >> 1]
    })
    const lejos = (p) =>
        Math.abs(p[0] - fondo[0]) + Math.abs(p[1] - fondo[1]) + Math.abs(p[2] - fondo[2]) > 60

    let jorobas = 0
    let dentro = false
    let ancho = 0
    let cubierto = 0
    for (let i = 0; i < W; i++) {
        let n = 0
        for (let j = 0; j < H; j++) if (lejos(px(i, j))) n++
        cubierto += n / H
        if (n / H > 0.2) {
            if (!dentro) { dentro = true; ancho = 0 }
            ancho++
        } else {
            if (dentro && ancho >= 6) jorobas++
            dentro = false
        }
    }
    if (dentro && ancho >= 6) jorobas++
    return jorobas === 4 && cubierto / W < 0.75
}

async function subirR2(path, body, contentType) {
    const res = await aws.fetch(r2Url(path), {
        method: 'PUT',
        body,
        headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
        },
    })
    if (!res.ok) throw new Error(`PUT ${path} → ${res.status}`)
}

/**
 * Baja el original (egress R2 = gratis), mide y deja la miniatura de 900px en
 * `thumbs/{path}.900.jpg` — el mismo layout que `regen-thumbs-900.mjs`. Sin
 * thumb, cada card de la galería bajaría el original de 1-3 MB.
 */
async function medirYThumbnail(key) {
    // UA explícito: el dominio público de R2 responde 403 al agente por defecto
    // de algunos clientes; con curl/navegador va. Se pierde media hora si no.
    const res = await fetch(publicUrl(key), { headers: { 'User-Agent': 'curl/8.4' } })
    if (!res.ok) throw new Error(`GET ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    const meta = await sharp(buf).metadata()

    // Sólo las apaisadas pueden ser hojas: el Body Lab siempre las saca en 16:9.
    let hoja = false
    if (meta.width > meta.height) {
        const W = 160
        const H = 90
        const { data } = await sharp(buf)
            .resize(W, H, { fit: 'fill' })
            .removeAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true })
        hoja = esHojaBodyLab(data, W, H)
    }
    if (hoja) return { hoja: true }

    const thumbPath = `thumbs/${key}.900.jpg`
    if (!DRY_RUN) {
        const thumb = await sharp(buf)
            .resize(900, 900, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 82 })
            .toBuffer()
        await subirR2(thumbPath, thumb, 'image/jpeg')
    }
    return {
        hoja: false,
        aspect_ratio: ratioMasCercano(meta.width, meta.height),
        thumbnail_path: thumbPath,
        dims: `${meta.width}x${meta.height}`,
    }
}

// ─────────────────────────────────── main ───────────────────────────────────

async function main() {
    console.log(DRY_RUN ? '── DRY_RUN (no escribe nada) ──' : '── RESCATE REAL ──')

    const [objetos, gens, refs, ledger] = await Promise.all([
        listarR2(),
        leerTodo('generations', 'avatar_id,user_id,organization_id,storage_path,thumbnail_path,created_at'),
        leerTodo('avatar_references', 'storage_path'),
        leerTodo('token_ledger', 'kind,sku,ref_type,ref_id,created_at', (q) =>
            q.eq('kind', 'settle'),
        ),
    ])

    const enBD = new Set()
    for (const g of gens) {
        if (g.storage_path) enBD.add(g.storage_path)
        if (g.thumbnail_path) enBD.add(g.thumbnail_path)
    }
    for (const r of refs) if (r.storage_path) enBD.add(r.storage_path)

    /**
     * CANDADO ANTI-DUPLICADO (aprendido a golpes el 20-ago-2026).
     *
     * Al guardar en galería, el cliente sube una copia NUEVA a
     * `org/{org}/images/…`; la que el servidor dejó en `kie-images/` se queda
     * sin fila AUNQUE la generación esté guardada. Sin este filtro el rescate
     * mete un duplicado por cada generación que sí tenías: la primera pasada
     * insertó 1.048 filas de las que 916 eran copias exactas.
     *
     * "Cerca en el tiempo" NO sirve como criterio — generas en tandas. El
     * único criterio honesto es el CONTENIDO: si otro objeto vivo tiene el
     * mismo MD5, esta imagen ya está en la galería.
     */
    const hashesVivos = new Set(
        objetos.filter((o) => enBD.has(o.key)).map((o) => o.etag),
    )
    let huerfanos = objetos
        .filter(
            (o) =>
                !enBD.has(o.key) &&
                !NO_ES_RESULTADO(o.key) &&
                !hashesVivos.has(o.etag),
        )
        .map((o) => ({ ...o, t: tsDelPath(o.key) }))
        .filter((o) => o.t !== null)
        .sort((a, b) => a.t - b.t)
    if (LIMIT) huerfanos = huerfanos.slice(0, LIMIT)

    const settles = ledger
        .filter((r) => r.ref_id)
        .map((r) => ({ t: segundos(r.created_at), ref_id: r.ref_id, sku: r.sku, ref_type: r.ref_type }))
        .sort((a, b) => a.t - b.t)
    const guardadas = gens
        .filter((g) => g.avatar_id)
        .map((g) => ({ t: segundos(g.created_at), avatar_id: g.avatar_id, user_id: g.user_id, organization_id: g.organization_id }))
        .sort((a, b) => a.t - b.t)

    const gb = (huerfanos.reduce((a, o) => a + o.size, 0) / 1e9).toFixed(2)
    console.log(`objetos en R2: ${objetos.length} · en BD: ${enBD.size}`)
    console.log(`HUÉRFANOS a rescatar: ${huerfanos.length} (${gb} GB)\n`)

    const filas = []
    const hojas = []
    const fallos = []
    const stats = { conPrompt: 0, conAvatar: 0, video: 0, imagen: 0 }

    let i = 0
    await Promise.all(
        Array.from({ length: CONCURRENCY }, async () => {
            while (i < huerfanos.length) {
                const o = huerfanos[i++]
                const n = i
                try {
                    const esVideo = /\.(mp4|webm|mov)$/i.test(o.key)
                    const settle = masCercano(settles, o.t, LEDGER_WINDOW_S)
                    const vecina = masCercano(guardadas, o.t, AVATAR_WINDOW_S)

                    let prompt = null
                    let kie = null
                    if (settle?.ref_type === 'kie_task') {
                        kie = await promptDeKie(settle.ref_id)
                        prompt = kie?.prompt ?? null
                    }
                    let extra = { hoja: false, aspect_ratio: null, thumbnail_path: null }
                    if (!esVideo) extra = await medirYThumbnail(o.key)
                    // Las hojas se apartan ANTES de contar: si no, el informe
                    // dice "avatar atribuido 53/15" y deja de ser un informe.
                    if (extra.hoja && !INCLUDE_SHEETS) {
                        hojas.push(o.key)
                        continue
                    }
                    if (prompt) stats.conPrompt++
                    if (vecina) stats.conAvatar++
                    esVideo ? stats.video++ : stats.imagen++

                    filas.push({
                        user_id: vecina?.user_id ?? 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                        organization_id:
                            o.key.startsWith('org/')
                                ? o.key.split('/')[1]
                                : (vecina?.organization_id ??
                                   '00000000-0000-0000-0000-000000000001'),
                        avatar_id: vecina?.avatar_id ?? null,
                        media_type: esVideo ? 'VIDEO' : 'IMAGE',
                        storage_path: o.key,
                        thumbnail_path: extra.thumbnail_path,
                        storage_provider: 'r2',
                        aspect_ratio: extra.aspect_ratio,
                        created_at: new Date(o.t * 1000).toISOString(),
                        prompt:
                            prompt ??
                            '(rescatada del storage — el prompt no quedó registrado)',
                        metadata: {
                            rescued: true,
                            rescued_from: 'r2-orphan',
                            rescued_at: new Date().toISOString(),
                            kie_task_id: settle?.ref_id ?? null,
                            kie_family: kie?.family ?? null,
                            sku: settle?.sku ?? null,
                            avatar_attribution: vecina
                                ? `vecindad ±${Math.round(vecina.d)}s`
                                : 'sin vecina en 1h',
                        },
                    })
                    if (n % 50 === 0)
                        console.log(`  … ${n}/${huerfanos.length}`)
                } catch (err) {
                    fallos.push(`${o.key}: ${err.message}`)
                }
            }
        }),
    )

    console.log(`\nimágenes ${stats.imagen} · vídeos ${stats.video}`)
    console.log(`hojas del Body Lab apartadas: ${hojas.length}`)
    console.log(`prompt real de KIE: ${stats.conPrompt}/${filas.length}`)
    console.log(`avatar atribuido:   ${stats.conAvatar}/${filas.length}`)
    if (hojas.length) {
        writeFileSync(
            new URL('../.rescue-hojas-body-lab.json', import.meta.url),
            JSON.stringify(hojas, null, 2),
        )
        console.log(
            '  (listadas en .rescue-hojas-body-lab.json — INCLUDE_SHEETS=1 las mete)',
        )
    }
    if (fallos.length) {
        console.log(`\nFALLOS (${fallos.length}):`)
        for (const f of fallos.slice(0, 20)) console.log('  ', f)
    }

    if (DRY_RUN) {
        console.log('\nDRY_RUN: no se insertó nada. Muestra de 3 filas:')
        for (const f of filas.slice(0, 3)) {
            console.log(
                `  ${f.created_at.slice(0, 19)} ${f.media_type} ${f.aspect_ratio ?? '-'} avatar=${f.avatar_id ?? 'null'}`,
            )
            console.log(`     ${f.storage_path}`)
            console.log(`     prompt: ${f.prompt.slice(0, 90)}`)
        }
        return
    }

    let insertadas = 0
    for (let k = 0; k < filas.length; k += BATCH) {
        const lote = filas.slice(k, k + BATCH)
        const { error } = await supabase.from('generations').insert(lote)
        if (error) {
            console.error(`  lote ${k}: ${error.message}`)
            continue
        }
        insertadas += lote.length
        console.log(`  insertadas ${insertadas}/${filas.length}`)
    }
    console.log(`\n✅ RESCATE: ${insertadas} generaciones devueltas a la galería`)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
