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
 *     llamados `avatars` y `generations`) y los comentarios.
 *   - Se escanean TODAS las extensiones que Next ejecuta (.ts/.tsx/.js/.jsx/
 *     .mjs/.cjs/.mts/.cts), no sólo TypeScript: un `route.js` es una ruta
 *     perfectamente válida y sería un punto ciego de los dos candados a la vez
 *     (ESLint tampoco tenía regla para él; también se amplió allí).
 *
 * LÍMITE CONOCIDO: sólo ve el nombre de tabla escrito como literal. Un
 * `.from(variable)` se le escapa. Medido el 21-ago-2026: los únicos
 * `.from(variable)` de `src/` son buckets de Storage y el interior de
 * `orgTable`, así que hoy no hay agujero — pero si algún día se accede a una
 * tabla por variable, este script no lo verá.
 *
 * VÁLVULA DE ESCAPE — `SKIP_TENANT_CHECK=1`
 *
 * Este script es puerta del `build` (ver package.json), así que un falso
 * positivo suyo bloquea TODOS los deploys, incluidos los urgentes. Y los
 * urgentes existen: sólo en las últimas 24h este proyecto empujó tres arreglos
 * a producción (un borrado que no borraba, vídeos en blanco, las miniaturas del
 * selector caídas). Un candado sin válvula convierte un fallo del heurístico en
 * una caída de producción larga.
 *
 * Con `SKIP_TENANT_CHECK=1` el script avisa MUY fuerte y sale 0 sin mirar nada.
 * Esto NO debilita la garantía: lo que el candado impide es que un OLVIDO pase
 * inadvertido, no que alguien decida saltárselo a sabiendas. Poner la variable
 * en el proyecto de Vercel es un acto deliberado, con nombre y hora, y el aviso
 * queda escrito en el log del build para que nadie pueda decir que no lo vio.
 *
 * Cómo se usa en una emergencia:
 *   1. Vercel → Project → Settings → Environment Variables →
 *      `SKIP_TENANT_CHECK` = `1` (en el entorno que toque) y redeploy.
 *   2. Arreglar la causa (o el script, si el falso positivo era suyo).
 *   3. **QUITAR LA VARIABLE.** Si se queda puesta, el candado deja de existir y
 *      nadie se entera hasta que un cliente ve los datos de otro.
 *   En local: `SKIP_TENANT_CHECK=1 npm run build`.
 *
 * USO:
 *   node scripts/check-tenant-access.mjs      → 0 si todo limpio, 1 si no
 *   SKIP_TENANT_CHECK=1 node scripts/…        → 0 siempre, con aviso a gritos
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// La válvula va ANTES de tocar el disco: si el candado está desactivado a
// propósito, ni siquiera queremos que un fallo del propio script (una lectura
// rota, un regex que peta) tumbe el build que alguien está intentando sacar.
if (process.env.SKIP_TENANT_CHECK) {
    const raya = '='.repeat(78)
    console.warn(
        `\n${raya}\n` +
            '  ⚠️  CANDADO MULTITENANT DESACTIVADO — SKIP_TENANT_CHECK está puesto.\n' +
            '\n' +
            '  NADIE está comprobando que las consultas filtren por organization_id.\n' +
            '  Esto sólo vale para desbloquear un deploy urgente. En cuanto pase la\n' +
            '  emergencia: QUITA la variable del proyecto de Vercel y vuelve a correr\n' +
            '  `npm run check:tenant`. Si se queda puesta, el candado deja de existir\n' +
            '  y no lo sabremos hasta que un cliente vea los datos de otro.\n' +
            `${raya}\n`,
    )
    process.exit(0)
}

const RAIZ_REPO = new URL('..', import.meta.url).pathname
const RAIZ_SRC = join(RAIZ_REPO, 'src')
const FUENTE_TABLAS = join(RAIZ_SRC, 'lib', 'org', 'orgTable.ts')

/**
 * Rutas donde un `.from()` crudo de tabla tenant es legítimo TAL CUAL.
 *
 * Van FICHERO A FICHERO donde se puede, no por carpeta: una carpeta exenta le
 * da barra libre al fichero que alguien añada mañana, y `src/lib/agent/` es
 * justo el módulo que más va a crecer (le queda la Fase 4). Las carpetas que
 * quedan (`webhooks/`, `cron/`, `auth/`) sí van enteras a propósito: su
 * exención es por CÓMO ENTRAN (sin sesión), no por qué ficheros son, así que
 * una ruta nueva ahí hereda la misma justificación.
 *
 * Espejan las de ESLint (`eslint.config.mjs`) salvo en dos puntos, y no es
 * descuido: (a) `src/lib/org/` sólo hace falta aquí, porque allí la regla base
 * únicamente cubre `src/app/**` y `src/components/**`; (b) ESLint exenta
 * además `lib/agent/db.ts` y `lib/agent/retrieval.ts`, que restringen el
 * IMPORT de `agentSupabase` — aquí se restringe el `.from()`, y esos dos
 * ficheros no tienen ninguno (db.ts define el cliente, retrieval.ts sólo llama
 * a un RPC). Se dejan fuera para que ninguna exención esté muerta.
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
        'src/app/api/auth/',
        'Infra de autenticación: toca la tabla `users`, que no es tenant. Exenta también en ESLint; aquí no dispara hoy, pero se deja para que las dos listas cuenten la misma historia.',
    ],
    // Núcleo del agente: entra SIN sesión (lo disparan webhook y cron) y filtra
    // por la org de la fila ya cargada. Uno a uno, no la carpeta.
    ['src/lib/agent/inboxSync.ts', 'Sincroniza el inbox de Fanvue disparado por webhook/cron; la org sale de la conexión ya resuelta.'],
    ['src/lib/agent/draftPipeline.ts', 'Genera borradores sin sesión; parte del chat ya cargado y arrastra su organization_id.'],
    ['src/lib/agent/autopilot.ts', 'Autopilot por cron; recorre chats resolviendo la org fila a fila.'],
    ['src/lib/agent/sendMessage.ts', 'Envío sin sesión desde el pipeline del agente; la org viene del chat.'],
    ['src/lib/agent/indexer.ts', 'Indexa conocimiento del avatar; recibe la organizationId ya resuelta por el llamador.'],
]

/**
 * Ficheros CON SESIÓN donde sobrevive un `.from()` crudo por una razón
 * concreta: son INSERTs (orgInsert no encaja porque hace falta `.select()`
 * encadenado o campos que el helper no acepta) o lecturas que reciben la org
 * por parámetro en vez de por ctx.
 *
 * Aquí la exención NO es un cheque en blanco: además de estar en la lista, el
 * acceso tiene que llevar en el MISMO statement un `.eq('organization_id', …)`
 * o un `organization_id:` (propiedad de insert/upsert). Mencionar la columna
 * en un `.select('id, organization_id')` o en un comentario NO cuenta —
 * seleccionar una columna no filtra nada—. Así, meter mañana un
 * `.from('generations').select()` pelado en uno de estos ficheros SIGUE
 * saliendo con código 1.
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

/** Techo de caracteres para "el mismo statement" (además se corta antes, ver abajo). */
const VENTANA_STATEMENT = 900

/**
 * Qué cuenta como ancla de organización. Antes esto era un `includes(
 * 'organization_id')` y NO comprobaba lo que decía comprobar: bastaba
 * MENCIONAR la columna, así que un `.select('id, organization_id')` —lo más
 * natural del mundo, y no filtra nada— pasaba el candado. Ahora hay que
 * FIJARLA (propiedad de un insert/upsert) o FILTRARLA (`.eq`).
 */
const ANCLA_FILTRO = /\.eq\(\s*['"`]organization_id['"`]/
const ANCLA_ASIGNACION = /organization_id\s*:/

/**
 * Un statement nuevo empieza por una de estas palabras. Sirve para cortar la
 * ventana antes de que se cuele el `organization_id` del código VECINO, que es
 * otra de las formas de aprobar un acceso que no lo merece.
 */
const INICIO_DE_STATEMENT = /\n[ \t]*(const|let|var|return|await|if|for|while|switch|function|export|try)\b/

function* archivos(dir) {
    for (const nombre of readdirSync(dir)) {
        const ruta = join(dir, nombre)
        if (statSync(ruta).isDirectory()) yield* archivos(ruta)
        // Todas las extensiones que Next ejecuta, no sólo TypeScript: un
        // `route.js` con un `.from()` pelado sería invisible para este script
        // Y para ESLint a la vez.
        else if (/\.[cm]?[jt]sx?$/.test(nombre)) yield ruta
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

/**
 * ¿El statement que empieza en `inicio` fija o filtra `organization_id`?
 *
 * El trozo que se mira se corta por lo que llegue ANTES de las tres cosas:
 * el techo de caracteres, el siguiente `.from(` y el arranque del siguiente
 * statement. Sin ese corte, un acceso pelado se aprobaba con el
 * `organization_id` del código vecino.
 *
 * Del trozo se quitan los comentarios —de línea entera y también los de final
 * de línea, que antes colaban un `// TODO: falta filtrar por organization_id`
 * como si fuera un ancla—. Quitar texto sólo puede hacer el check MÁS
 * estricto, nunca más laxo, que es la dirección segura del error.
 */
function tieneAnclaDeOrg(texto, inicio) {
    let fin = inicio + VENTANA_STATEMENT
    const siguienteFrom = texto.indexOf('.from(', inicio + 1)
    if (siguienteFrom !== -1 && siguienteFrom < fin) fin = siguienteFrom

    const bruto = texto.slice(inicio, fin)
    const corte = bruto.search(INICIO_DE_STATEMENT)
    const trozo = (corte === -1 ? bruto : bruto.slice(0, corte))
        .split('\n')
        .filter((l) => !esComentario(l))
        // `[^:]` protege el `//` de las URLs (`https://…`).
        .map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1'))
        .join('\n')

    return ANCLA_FILTRO.test(trozo) || ANCLA_ASIGNACION.test(trozo)
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
            if (tieneAnclaDeOrg(texto, m.index)) {
                porExencion.set(conAncla[0], (porExencion.get(conAncla[0]) ?? 0) + 1)
                continue
            }
            infractores.push({
                rel,
                linea: nLinea,
                tabla,
                motivo:
                    "fichero exento SOLO con ancla de org, y este acceso no la tiene: falta un `.eq('organization_id', …)` o un `organization_id:` en el mismo statement (mencionar la columna en un select o en un comentario NO cuenta)",
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
