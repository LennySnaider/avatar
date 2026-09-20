// src/services/kie/dispatch.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ROUTES } from './dispatch.ts'
import { DEFAULT_PROVIDERS } from '../../app/(protected-pages)/concepts/avatar-forge/_shared/providerCatalog.ts'

/**
 * El despachador resuelve con `ROUTES.find(...)`: gana la PRIMERA ruta que
 * matchea. Mientras los `matches` sean prefijos abiertos, dar de alta un motor
 * nuevo puede caer dentro del prefijo de otro y el fallo es SILENCIOSO — no
 * lanza, simplemente genera (y cobra) el motor equivocado.
 *
 * Caso real que motivó estos tests: `qwenRoute.matches` era
 * `m.startsWith('qwen')`, así que `qwen3/pro-image-to-image` entraba por la
 * ruta de Qwen 2, y esa ruta reescribe el model a `qwen2/image-edit` en cuanto
 * hay referencia. Elegir Qwen 3 habría generado Qwen 2, con su precio.
 */

/** Modelos de imagen KIE del catálogo, más las variantes i2i que las rutas
 *  producen internamente (el flip de model las expone a reintentos y al
 *  rescate de tareas, así que también tienen que resolver sin ambigüedad). */
const MODELOS_CATALOGO = DEFAULT_PROVIDERS.filter(
    (p) => p.type === 'KIE' && p.supports_image && !!p.model,
).map((p) => p.model as string)

const VARIANTES_I2I = [
    'qwen2/image-edit',
    'seedream/4.5-edit',
    'seedream/5-pro-image-to-image',
    'flux-2/pro-image-to-image',
    'gpt-image-2-image-to-image',
    'gpt-image-2-5-flare-image-to-image',
    'qwen3/image-to-image',
]

test('ninguna ruta se solapa con otra: un modelo, como mucho una ruta', () => {
    for (const model of [...MODELOS_CATALOGO, ...VARIANTES_I2I]) {
        const matches = ROUTES.filter((r) => r.matches(model)).map(
            (r) => r.label,
        )
        assert.ok(
            matches.length <= 1,
            `"${model}" matchea ${matches.length} rutas (${matches.join(', ')}). ` +
                'Dos rutas para un modelo = la de más arriba gana en silencio.',
        )
    }
})

test('cada modelo cae en la ruta que le corresponde, no en la del vecino', () => {
    const esperado: Array<[string, string]> = [
        ['qwen2/text-to-image', 'qwen'],
        ['qwen2/image-edit', 'qwen'],
        ['qwen3/pro-image-to-image', 'qwen3'],
        ['qwen3/image-to-image', 'qwen3'],
        ['gpt-image-2-5-flare-text-to-image', 'gpt-image-2-5-flare'],
        ['gpt-image-2-5-flare-image-to-image', 'gpt-image-2-5-flare'],
        ['seedream/5-pro-image-to-image', 'seedream'],
        ['wan/2-7-image', 'wan'],
        ['z-image', 'z-image'],
    ]
    for (const [model, label] of esperado) {
        const route = ROUTES.find((r) => r.matches(model))
        assert.equal(
            route?.label,
            label,
            `"${model}" fue a parar a "${route?.label ?? 'legacy'}"`,
        )
    }
})

test('gpt-image-2 sigue SIN ruta propia: lo atiende su adaptador dedicado', () => {
    // `gpt-image-2-text-to-image` se resuelve por igualdad exacta en
    // KieService, fuera del despachador. Si algún día matchea una ruta de aquí,
    // se estaría construyendo su input dos veces y de dos maneras distintas.
    assert.equal(
        ROUTES.find((r) => r.matches('gpt-image-2-text-to-image')),
        undefined,
    )
})

test('la permisividad de cada ruta coincide con el cálculo legacy de la fachada', () => {
    // KieService delega en `routePermissive`. Esa delegación solo es inocua
    // mientras las rutas digan lo mismo que la lista que sustituyen: este test
    // es lo que lo mantiene cierto cuando alguien toque una ruta.
    const legacy = (m: string) =>
        m.startsWith('seedream/') ||
        m.startsWith('flux-2/') ||
        m.startsWith('qwen') ||
        m === 'z-image' ||
        m === 'wan/2-7-image' ||
        m === 'wan/2-7-image-pro' ||
        m.startsWith('grok-imagine/')

    const MIGRADOS_PREVIOS = [
        'seedream/5-pro-image-to-image',
        'seedream/4.5-text-to-image',
        'flux-2/pro-text-to-image',
        'qwen2/text-to-image',
        'z-image',
        'wan/2-7-image',
        'wan/2-7-image-pro',
        'grok-imagine/image-to-image',
        'ideogram/v3-text-to-image',
        'nano-banana-2',
        'nano-banana-2-lite',
    ]
    for (const m of MIGRADOS_PREVIOS) {
        const route = ROUTES.find((r) => r.matches(m))
        assert.equal(
            route?.isPermissive,
            legacy(m),
            `"${m}": la ruta dice ${route?.isPermissive} y la lista legacy ${legacy(m)}`,
        )
    }
})
