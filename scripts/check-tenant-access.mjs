/**
 * CENTINELA DE AISLAMIENTO POR ORGANIZACIÓN — `npm run check:tenant`
 *
 * POR QUÉ EXISTE (F4.2 Tarea 6): hasta ahora el aislamiento multitenant
 * dependía de que el programador se ACORDARA de filtrar por `organization_id`.
 * Y olvidarse no rompe: la columna tiene DEFAULT, así que un INSERT sin org
 * cae callado en la organización 1, y un SELECT sin `.eq('organization_id')`
 * devuelve las filas de TODOS. Un fallo que no hace ruido no se arregla nunca.
 *
 * Este script convierte esa convención en garantía: cualquier `.from('<tabla
 * tenant>')` crudo que no esté justificado sale con código 1 y nombre y línea.
 * El camino bueno es `orgTable/orgInsert/orgUpsert` de `@/lib/org/orgTable`,
 * que ya lleva el filtro y la inyección de la org pegados al builder.
 *
 * La lista de tablas NO se copia aquí: se lee de `TENANT_TABLES` en
 * `src/lib/org/orgTable.ts`. Una copia se desincroniza el día que alguien
 * añada una tabla, y el candado dejaría de mirar justo la tabla nueva.
 *
 * DISEÑO DELIBERADAMENTE ABURRIDO. Un candado que se salta en silencio es peor
 * que no tener candado, así que:
 *   - Las exenciones son POR RUTA, explícitas y con motivo escrito al lado.
 *     Nada de adivinar por la forma del código si un acceso "parece" seguro.
 *   - Ante la duda, el script ACUSA. Prefiere un falso positivo (que se
 *     resuelve leyendo el fichero) a un falso negativo (que se descubre
 *     cuando un cliente ve los datos de otro).
 *   - Sólo se ignoran dos cosas por forma, y ambas son inequívocas:
 *     `supabase.storage.from(...)` (es un BUCKET, no una tabla: hay buckets
 *     llamados `avatars` y `generations`) y las líneas de comentario.
 *
 * LÍMITE CONOCIDO: sólo ve el nombre de tabla escrito como literal. Un
 * `.from(variable)` se le escapa. Medido el 21-ago-2026: los únicos
 * `.from(variable)` de `src/` son buckets de Storage y el interior de
 * `orgTable`, así que hoy no hay agujero — pero si algún día se accede a una
 * tabla por variable, este script no lo verá.
 *
 * USO:
 *   node scripts/check-tenant-access.mjs      → 0 si todo limpio, 1 si no
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const RAIZ_REPO = new URL('..', import.meta.url).pathname
const RAIZ_SRC = join(RAIZ_REPO, 'src')
const FUENTE_TABLAS = join(RAIZ_SRC, 'lib', 'org', 'orgTable.ts')

/**
 * Rutas donde un `.from()` crudo de tabla tenant es legítimo TAL CUAL. Son las
 * mismas exenciones que ya lleva la regla de ESLint (`eslint.config.mjs`): si
 * una cambia, la otra tiene que cambiar con ella.
 */
const EXENTOS = [
    [
        'src/lib/org/',
        'La implementación del propio candado: orgTable/orgInsert/orgUpsert son quienes ponen el filtro y la inyección de organization_id.',
    ],
    [
        'src/lib/tenant/getOrgContext.ts',
        'Bootstrap del tenant: lee organization_members para PODER construir el ctx que orgTable exige. Hoy no dispara (organization_members no es tabla tenant), pero se deja escrita para que la exención viva en un solo sitio conceptual.',
    ],
    [
        'src/app/api/webhooks/',
        'Corren SIN sesión: la org sale de la fila que el webhook ya resolvió (request_id / conexión), no de una cookie. Cada fichero documenta por qué filtra como filtra.',
    ],
    [
        'src/app/api/cron/',
        'Igual que los webhooks: sin sesión, barren TODAS las orgs a propósito y resuelven la org fila a fila.',
    ],
    [
        'src/lib/agent/',
        'Núcleo compartido que disparan webhook y cron (inboxSync, draftPipeline, autopilot, sendMessage, indexer): entra sin sesión y filtra por la org de la fila ya cargada.',
    ],
]

/**
 * Ficheros CON SESIÓN donde sobrevive un `.from()` crudo por una razón
 * concreta: son INSERTs (orgInsert no encaja porque hace falta `.select()`
 * encadenado o campos que el helper no acepta) o lecturas que reciben la org
 * por parámetro en vez de por ctx.
 *
 * Aquí la exención NO es un cheque en blanco: además de estar en la lista, el
 * acceso tiene que fijar o filtrar `organization_id` de forma explícita en el
 * mismo statement. Así, meter mañana un `.from('generations').select()` pelado
 * en uno de estos ficheros SIGUE saliendo con código 1.
 */
const CON_ANCLA_DE_ORG = [
    [
        'src/services/AvatarForgeService.ts',
        'apiCreateAvatar / apiAddAvatarReference / apiSaveGeneration / apiCreatePrompt: inserts que escriben organization_id desde ctx y encadenan .select().single().',
    ],
    [
        'src/services/SocialService.ts',
        'Alta de social_profiles y social_posts: mismo patrón de insert con organization_id de ctx.',
    ],
    [
        'src/services/KieTaskRescueService.ts',
        'Rescate de tareas KIE: recibe la organizationId ya resuelta y la usa tanto para buscar como para insertar la generación recuperada.',
    ],
    [
        'src/services/ReconcileGenerationsService.ts',
        'Reconciliador de generaciones pendientes: inserta la fila recuperada con organization_id de ctx.',
    ],
]

/** Cuántos caracteres después del `.from(` cuentan como "el mismo statement". */
const VENTANA_STATEMENT = 900

function* archivos(dir) {
    for (const nombre of readdirSync(dir)) {
        const ruta = join(dir, nombre)
        if (statSync(ruta).isDirectory()) yield* archivos(ruta)
        else if (/\.tsx?$/.test(nombre)) yield ruta
    }
}

/** Ruta relativa al repo, siempre con `/` (las listas de arriba usan `/`). */
function rutaRelativa(ruta) {
    return relative(RAIZ_REPO, ruta).split(sep).join('/')
}

/**
 * `TENANT_TABLES` sale del código, no de una copia. Si el bloque no se puede
 * leer se aborta con error: un candado que no sabe qué vigilar tiene que
 * ROMPER, nunca dar por bueno lo que no ha mirado.
 */
function leerTablasTenant() {
    const fuente = readFileSync(FUENTE_TABLAS, 'utf8')
    const bloque = fuente.match(
        /export const TENANT_TABLES\s*=\s*\[([\s\S]*?)\]\s*as const/,
    )
    if (!bloque) {
        console.error(
            `[check:tenant] No se pudo leer TENANT_TABLES de ${rutaRelativa(FUENTE_TABLAS)}.\n` +
                'Si el bloque cambió de forma, ajusta este script — no lo dejes pasar.',
        )
        process.exit(1)
    }
    const tablas = [...bloque[1].matchAll(/['"]([a-z0-9_]+)['"]/g)].map((m) => m[1])
    if (tablas.length === 0) {
        console.error('[check:tenant] TENANT_TABLES se leyó VACÍO. Abortando.')
        process.exit(1)
    }
    return new Set(tablas)
}

/** ¿La línea es un comentario? (JSDoc, `//` suelto o apertura de bloque). */
function esComentario(linea) {
    const t = linea.trim()
    return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')
}

function coincideRuta(rel, prefijo) {
    return prefijo.endsWith('/') ? rel.startsWith(prefijo) : rel === prefijo
}

function buscarExencion(rel, lista) {
    return lista.find(([prefijo]) => coincideRuta(rel, prefijo))
}

const TABLAS_TENANT = leerTablasTenant()
// El literal puede venir con comilla simple, doble o backtick; la backreference
// obliga a que abra y cierre con la misma.
const RE_FROM = /\.from\(\s*(['"`])([A-Za-z_][A-Za-z0-9_]*)\1\s*\)/g

const infractores = []
let ficherosLeidos = 0
let accesosTenant = 0
const porExencion = new Map()

for (const ruta of archivos(RAIZ_SRC)) {
    ficherosLeidos++
    const texto = readFileSync(ruta, 'utf8')
    if (!texto.includes('.from(')) continue

    const rel = rutaRelativa(ruta)
    const lineas = texto.split('\n')

    for (const m of texto.matchAll(RE_FROM)) {
        const tabla = m[2]
        if (!TABLAS_TENANT.has(tabla)) continue

        // `supabase.storage.from('generations')` es un BUCKET homónimo, no la
        // tabla. Se mira el texto de delante porque el `.storage` suele quedar
        // en la línea anterior.
        if (/\.storage\s*$/.test(texto.slice(0, m.index))) continue

        const nLinea = texto.slice(0, m.index).split('\n').length
        if (esComentario(lineas[nLinea - 1])) continue

        accesosTenant++

        const exento = buscarExencion(rel, EXENTOS)
        if (exento) {
            porExencion.set(exento[0], (porExencion.get(exento[0]) ?? 0) + 1)
            continue
        }

        const conAncla = buscarExencion(rel, CON_ANCLA_DE_ORG)
        if (conAncla) {
            // El statement se acota por caracteres y por el siguiente `.from(`:
            // así un acceso no puede aprobarse con el `organization_id` del
            // que viene detrás.
            let fin = m.index + VENTANA_STATEMENT
            const siguiente = texto.indexOf('.from(', m.index + 1)
            if (siguiente !== -1 && siguiente < fin) fin = siguiente
            const trozo = texto
                .slice(m.index, fin)
                .split('\n')
                .filter((l) => !esComentario(l))
                .join('\n')

            if (trozo.includes('organization_id')) {
                porExencion.set(conAncla[0], (porExencion.get(conAncla[0]) ?? 0) + 1)
                continue
            }
            infractores.push({
                rel,
                linea: nLinea,
                tabla,
                motivo: 'fichero exento SOLO con ancla de org, y este acceso no fija ni filtra organization_id',
            })
            continue
        }

        infractores.push({
            rel,
            linea: nLinea,
            tabla,
            motivo: 'acceso crudo a tabla tenant fuera de orgTable',
        })
    }
}

if (infractores.length > 0) {
    console.error(
        `\n[check:tenant] ${infractores.length} acceso(s) sin scope de organización:\n`,
    )
    for (const i of infractores) {
        console.error(`  ${i.rel}:${i.linea}  .from('${i.tabla}')`)
        console.error(`      → ${i.motivo}`)
    }
    console.error(
        '\nCómo se arregla (en este orden):\n' +
            "  1. Con sesión:  const ctx = await getOrgContext()  →  orgTable(ctx, 'tabla')\n" +
            '                  para INSERT/UPSERT: orgInsert / orgUpsert (inyectan organization_id).\n' +
            '  2. Sin sesión (webhook/cron): resuelve la org desde la fila que ya cargaste,\n' +
            '     fíltrala a mano y DOCUMENTA el porqué en la cabecera del fichero.\n' +
            '  3. Si de verdad es un caso nuevo y legítimo: añádelo a EXENTOS o a\n' +
            '     CON_ANCLA_DE_ORG en este script, con el motivo escrito. Una exención sin\n' +
            '     motivo escrito es una fuga esperando a que nadie se acuerde.\n',
    )
    process.exit(1)
}

console.log(
    `[check:tenant] OK — ${ficherosLeidos} ficheros de src/, ${TABLAS_TENANT.size} tablas tenant, ` +
        `${accesosTenant} acceso(s) directo(s), todos justificados:`,
)
for (const [prefijo, n] of [...porExencion].sort()) {
    console.log(`  ${n.toString().padStart(3)}  ${prefijo}`)
}
