// src/lib/assistant/tools/index.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectTools } from '../registry.ts'
import type { AssistantScreen, AssistantToolDef } from '../types.ts'

// `./index.ts` arrastra `@/lib/org/orgTable` → `@/lib/supabase`, que CONSTRUYE
// el cliente en el momento del import y exige la URL en el entorno. Estos
// placeholders sólo permiten que el módulo cargue: el test no ejecuta ninguna
// herramienta, sólo mira el catálogo (nombres, permisos, pantallas), así que
// no llega a haber ni una petición.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://localhost:54321'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'anon-de-mentira'
/** El import va DENTRO de los tests porque `tsx --test` compila a CJS y no
 *  admite `await` en el nivel superior; el caché de módulos hace que sólo se
 *  cargue una vez. */
async function catalogo(): Promise<AssistantToolDef[]> {
    const { READ_TOOLS } = await import('./index.ts')
    return READ_TOOLS
}

const PANTALLAS: AssistantScreen[] = [
    'inbox',
    'social-accounts',
    'social-posts',
    'studio',
    'modules',
    'other',
]

test('Fase 1 es SÓLO LECTURA: ninguna herramienta escribe', async () => {
    const READ_TOOLS = await catalogo()
    const escriben = READ_TOOLS.filter((t) => t.mutating).map((t) => t.name)
    assert.deepEqual(escriben, [])
})

test('todas piden content:read (el permiso mínimo que ya exige la ruta)', async () => {
    const READ_TOOLS = await catalogo()
    for (const t of READ_TOOLS) {
        assert.equal(
            t.permission,
            'content:read',
            `${t.name} pide otro permiso`,
        )
    }
})

test('los nombres son únicos y las descripciones no están vacías', async () => {
    const READ_TOOLS = await catalogo()
    const nombres = READ_TOOLS.map((t) => t.name)
    assert.equal(new Set(nombres).size, nombres.length)
    for (const t of READ_TOOLS) {
        assert.ok(t.description.length > 20, `${t.name} sin descripción útil`)
    }
})

test('listAvatars va primera y está en todas las pantallas', async () => {
    const READ_TOOLS = await catalogo()
    assert.equal(READ_TOOLS[0].name, 'listAvatars')
    assert.equal(READ_TOOLS[0].screens, 'all')
})

test('ninguna pantalla se queda sin herramientas para un owner', async () => {
    const READ_TOOLS = await catalogo()
    for (const screen of PANTALLAS) {
        const elegidas = selectTools(READ_TOOLS, { role: 'owner', screen })
        assert.ok(elegidas.length > 0, `${screen} se queda sin catálogo`)
    }
})

test('un operator conserva todo el catálogo de lectura', async () => {
    const READ_TOOLS = await catalogo()
    assert.equal(
        selectTools(READ_TOOLS, { role: 'operator', screen: 'other' }).length,
        READ_TOOLS.length,
    )
})

test('las pantallas declaradas son valores válidos de AssistantScreen', async () => {
    const READ_TOOLS = await catalogo()
    for (const t of READ_TOOLS) {
        if (t.screens === 'all') continue
        for (const s of t.screens) {
            assert.ok(
                PANTALLAS.includes(s),
                `${t.name} declara la pantalla ${s}`,
            )
        }
    }
})
