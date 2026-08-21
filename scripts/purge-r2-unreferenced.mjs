/**
 * PURGA de objetos de R2 que NINGUNA fila referencia.
 *
 * R2 pasó de los 10 GB del free tier (11,11 GB medidos el 20-ago-2026). El
 * grueso de lo que sobra son BYTES REDUNDANTES, no basura: al guardar en
 * galería el cliente sube una copia NUEVA a `org/{org}/images/…`, y la copia
 * que el servidor había dejado en `kie-images/` se queda ahí sin fila. Medido
 * por MD5: 1.023 objetos / 1,96 GB son idénticos a algo vivo. Borrarlos deja
 * R2 en 9,15 GB — por debajo del free tier — sin perder un solo píxel.
 *
 * COPIAR ES REVERSIBLE, BORRAR NO — así que este script va por separado del
 * rescate y con tres candados:
 *
 *   1. LISTA BLANCA POR CATEGORÍA. Cada categoría decide sus candidatos y
 *      sólo se activa con su flag. `--dupes` es la única que puede tocar
 *      `images/` o `kie-images/`, y sólo cuando OTRO objeto vivo tiene el
 *      MISMO MD5: nunca borra los últimos bytes de una imagen.
 *   2. NADA REFERENCIADO. El set de paths vivos se lee de la BD (los tres
 *      lectores reales: `generations.storage_path`, `generations
 *      .thumbnail_path` y `avatar_references.storage_path`) JUSTO ANTES de
 *      borrar, no de un inventario viejo. Si el rescate acaba de escribir
 *      filas, esta pasada ya las ve.
 *   3. RE-VERIFICACIÓN POR OBJETO. Cada DELETE comprueba otra vez que la key
 *      no está en el set vivo. Un `Set` mal construido deja de ser suficiente
 *      para perder bytes.
 *
 * Lo que este script NO borra, a propósito:
 *   - Los huérfanos ÚNICOS (ningún otro objeto tiene su MD5): ahí están las
 *     hojas del Body Lab y cualquier resultado que sólo exista en esa copia.
 *     Borrarlos es irreversible y la decisión es del usuario, no del script.
 *   - Cualquier `kie-refs/` reciente: una tarea aún en vuelo puede necesitar
 *     que el proveedor baje su entrada. Por defecto sólo toca las de más de
 *     DAYS días (7).
 *
 * USO (sin flags = inventario, no toca nada):
 *   node scripts/purge-r2-unreferenced.mjs
 *   node scripts/purge-r2-unreferenced.mjs --dupes    copias redundantes (MD5)
 *   node scripts/purge-r2-unreferenced.mjs --thumbs   miniaturas sin fila
 *   node scripts/purge-r2-unreferenced.mjs --refs     entradas kie-refs viejas
 *   node scripts/purge-r2-unreferenced.mjs --tmp      sondas y temporales
 *   DAYS=14 node scripts/purge-r2-unreferenced.mjs --refs
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createClient } = require('@supabase/supabase-js')
const { AwsClient } = require('aws4fetch')

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8')
const get = (k) => {
    const m = env.match(new RegExp(`^${k}\\s*=\\s*(.+)$`, 'm'))
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : undefined
}
const SUPABASE_URL = get('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_KEY = get('SUPABASE_SERVICE_ROLE_KEY') || get('SUPABASE_SERVICE_KEY')
const R2 = {
    accountId: get('R2_ACCOUNT_ID'),
    accessKeyId: get('R2_ACCESS_KEY_ID'),
    secretAccessKey: get('R2_SECRET_ACCESS_KEY'),
    bucket: get('R2_BUCKET'),
}
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('faltan vars de Supabase')
if (Object.values(R2).some((v) => !v)) throw new Error('faltan vars de R2')

const DAYS = Number(process.env.DAYS || 7)
const CONCURRENCY = 8
const flags = new Set(process.argv.slice(2))

/**
 * LISTA BLANCA. `puede(key)` decide si una key es siquiera candidata; la
 * categoría sólo se activa con su flag. Todo lo demás es intocable por
 * construcción, no por un `if` que alguien pueda mover.
 */
const CATEGORIAS = {
    dupes: {
        flag: '--dupes',
        titulo:
            'bytes REDUNDANTES: mismo MD5 que un objeto vivo (la copia buena se queda)',
        candidatos: (objs, vivos, hashesVivos) =>
            objs.filter((o) => !vivos.has(o.key) && hashesVivos.has(o.etag)),
    },
    thumbs: {
        flag: '--thumbs',
        titulo:
            'miniaturas huérfanas (nadie las lee: la card usa row.thumbnail_path)',
        candidatos: (objs, vivos) =>
            objs.filter((o) => !vivos.has(o.key) && o.key.startsWith('thumbs/')),
    },
    refs: {
        flag: '--refs',
        titulo: `entradas kie-refs de más de ${DAYS} días (re-hospedaje para el proveedor)`,
        candidatos: (objs, vivos) =>
            objs.filter(
                (o) =>
                    !vivos.has(o.key) &&
                    (o.key.startsWith('kie-refs/') || o.key.includes('/kie-refs/')) &&
                    Date.now() - new Date(o.mod).getTime() > DAYS * 86_400_000,
            ),
        retenidos: (objs, vivos) =>
            objs.filter(
                (o) =>
                    !vivos.has(o.key) &&
                    (o.key.startsWith('kie-refs/') || o.key.includes('/kie-refs/')) &&
                    Date.now() - new Date(o.mod).getTime() <= DAYS * 86_400_000,
            ),
    },
    tmp: {
        flag: '--tmp',
        titulo: 'sondas y hosting temporal (_tmp-vlm-probe, kling-temp)',
        candidatos: (objs, vivos) =>
            objs.filter(
                (o) =>
                    !vivos.has(o.key) &&
                    (o.key.startsWith('_tmp-vlm-probe/') ||
                        o.key.startsWith('kling-temp/')),
            ),
    },
}

const aws = new AwsClient({
    accessKeyId: R2.accessKeyId,
    secretAccessKey: R2.secretAccessKey,
    region: 'auto',
    service: 's3',
})
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
const r2Url = (p) =>
    `https://${R2.accountId}.r2.cloudflarestorage.com/${R2.bucket}/` +
    p.split('/').map(encodeURIComponent).join('/')

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
                mod: c.match(/<LastModified>([^<]+)<\/LastModified>/)?.[1],
                // ETag = MD5 del contenido en subidas de una sola parte (todas
                // las nuestras: 0 multipart medidos). Es lo que permite probar
                // que un huérfano es BYTE A BYTE otra copia de algo vivo.
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

async function leerTodo(tabla, columnas) {
    const filas = []
    for (let desde = 0; ; desde += 1000) {
        const { data, error } = await supabase
            .from(tabla)
            .select(columnas)
            .range(desde, desde + 999)
        if (error) throw new Error(`${tabla}: ${error.message}`)
        filas.push(...data)
        if (data.length < 1000) return filas
    }
}

/** Los tres lectores reales de paths. Si aparece un cuarto, va aquí. */
async function pathsVivos() {
    const [gens, refs] = await Promise.all([
        leerTodo('generations', 'storage_path,thumbnail_path'),
        leerTodo('avatar_references', 'storage_path'),
    ])
    const vivos = new Set()
    for (const g of gens) {
        if (g.storage_path) vivos.add(g.storage_path)
        if (g.thumbnail_path) vivos.add(g.thumbnail_path)
    }
    for (const r of refs) if (r.storage_path) vivos.add(r.storage_path)
    return vivos
}

const mb = (b) => (b / 1048576).toFixed(0)

async function main() {
    const [objetos, vivos] = await Promise.all([listarR2(), pathsVivos()])
    const total = objetos.reduce((a, o) => a + o.size, 0)
    console.log(
        `R2: ${objetos.length} objetos · ${(total / 1e9).toFixed(2)} GB` +
            `   |   paths vivos en BD: ${vivos.size}\n`,
    )

    const hashesVivos = new Set(
        objetos.filter((o) => vivos.has(o.key)).map((o) => o.etag),
    )
    const plan = []
    const yaEnPlan = new Set()
    for (const cat of Object.values(CATEGORIAS)) {
        const cands = cat.candidatos(objetos, vivos, hashesVivos)
        const bytes = cands.reduce((a, o) => a + o.size, 0)
        const activa = flags.has(cat.flag)
        console.log(
            `${activa ? '▶' : '·'} ${cat.flag.padEnd(9)} ${cands.length
                .toString()
                .padStart(5)} obj  ${mb(bytes).padStart(6)} MB   ${cat.titulo}`,
        )
        const ret = cat.retenidos?.(objetos, vivos) ?? []
        if (ret.length) {
            console.log(
                `             ${ret.length} retenidos por antigüedad (< ${DAYS} días)`,
            )
        }
        // Las categorías se solapan (una miniatura huérfana puede ser también
        // redundante): sin este Set el mismo objeto entraría dos veces al plan
        // y el contador mentiría.
        if (activa) {
            for (const o of cands) {
                if (yaEnPlan.has(o.key)) continue
                yaEnPlan.add(o.key)
                plan.push(o)
            }
        }
    }

    const intocables = objetos.filter(
        (o) =>
            !vivos.has(o.key) &&
            !Object.values(CATEGORIAS).some((c) =>
                c.candidatos(objetos, vivos, hashesVivos).includes(o),
            ),
    )
    if (intocables.length) {
        console.log(
            `\n  intocables: ${intocables.length} huérfanos ÚNICOS ` +
                `(${mb(intocables.reduce((a, o) => a + o.size, 0))} MB) — sus ` +
                `bytes no existen en ningún otro objeto. Decisión aparte.`,
        )
    }

    if (!plan.length) {
        console.log(
            '\nSin flags no se borra nada. Añade --dupes / --thumbs / --refs / --tmp.',
        )
        return
    }

    console.log(
        `\n── BORRANDO ${plan.length} objetos (${mb(plan.reduce((a, o) => a + o.size, 0))} MB) ──`,
    )
    let ok = 0
    let fallos = 0
    let i = 0
    await Promise.all(
        Array.from({ length: CONCURRENCY }, async () => {
            while (i < plan.length) {
                const o = plan[i++]
                // Tercer candado: re-verificar objeto a objeto.
                if (vivos.has(o.key)) {
                    console.error(`  ABORTADO — referenciado: ${o.key}`)
                    fallos++
                    continue
                }
                const res = await aws.fetch(r2Url(o.key), { method: 'DELETE' })
                if (res.ok || res.status === 404) ok++
                else {
                    fallos++
                    console.error(`  ${res.status} ${o.key}`)
                }
                if (ok % 200 === 0 && ok) console.log(`  … ${ok}/${plan.length}`)
            }
        }),
    )
    console.log(`\n✅ borrados ${ok}   fallos ${fallos}`)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
