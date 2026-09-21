// src/services/kie/engineCaps.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { engineCaps } from './engineCaps.ts'
import { DEFAULT_PROVIDERS } from '../../app/(protected-pages)/concepts/avatar-forge/_shared/providerCatalog.ts'

/**
 * El test que da licencia para tocar los 11 predicados dispersos: si
 * `engineCaps` devuelve `undefined` para todos los motores anteriores, cada
 * call site con `engineCaps(m)?.X ?? <expresión de hoy>` evalúa exactamente el
 * booleano de hoy. Es la prueba literal de "no cambié nada de lo que factura".
 */
/** Los únicos motores que pueden estar descritos. Cualquier otro que aparezca
 *  aquí significa que un predicado que delega con `??` cambió de valor. */
const MOTORES_NUEVOS = new Set([
    'qwen3/pro-image-to-image',
    'gpt-image-2-5-flare-text-to-image',
])

test('ningún motor preexistente queda descrito en engineCaps', () => {
    const descritos = DEFAULT_PROVIDERS.filter(
        (p) => !!p.model && engineCaps(p.model) !== undefined,
    ).map((p) => p.model as string)

    assert.deepEqual(
        descritos.filter((m) => !MOTORES_NUEVOS.has(m)),
        [],
        'un motor viejo con caps cambia el valor de los predicados que delegan',
    )
    // Y los nuevos SÍ tienen que estar: un alta a medias es la otra mitad del bug.
    assert.deepEqual(new Set(descritos), MOTORES_NUEVOS)
})

test('qwen3 no entra al flujo de dos fases', () => {
    // El Studio activa el two-phase con `startsWith('qwen')` y la fase 1
    // hardcodea `qwen2/text-to-image`: heredarlo serían dos motores y dos
    // cobros por un solo pick del usuario.
    assert.equal(engineCaps('qwen3/pro-image-to-image')?.twoPhase, false)
})

test('qwen3 exige imagen de entrada; Flare no', () => {
    assert.equal(engineCaps('qwen3/pro-image-to-image')?.requiresRefs, true)
    assert.equal(
        engineCaps('gpt-image-2-5-flare-text-to-image')?.requiresRefs,
        false,
    )
})

test('qwen3 entra al 🌶️: medido en vivo, no rebota río arriba', () => {
    // 19-sep-2026, task 303a85d6…: prompt explícito con `nsfw_checker: false`
    // → success en 22s y cobro normal. Si se comprobara que devuelve vestida,
    // este flag se apaga y este test cambia con él.
    assert.equal(engineCaps('qwen3/pro-image-to-image')?.explicitCapable, true)
})

test('qwen3 recibe el Clone Ref con la cara difuminada, como Seedream', () => {
    // 20-sep-2026: con la cara del clone a la vista (regla heredada de Qwen 2
    // por el prefijo `qwen`), Qwen 3 Pro conservó la cara de la FOTO en Clone
    // 65 y 100 (2/2); la misma petición con el clone difuminado pintó la de
    // la avatar (1/1). El Studio delega en este cap con `??`, así que Qwen 2 y
    // Wan siguen recibiendo el clone a la vista.
    assert.equal(engineCaps('qwen3/pro-image-to-image')?.cloneRaw, false)
    assert.equal(engineCaps('qwen3/image-to-image')?.cloneRaw, false)
    assert.equal(engineCaps('gpt-image-2-5-flare-image-to-image')?.cloneRaw, false)
    // Qwen 2 no está descrito: el prefijo sigue mandando ahí.
    assert.equal(engineCaps('qwen2/image-edit'), undefined)
})

test('pro y no-pro comparten contrato pero no precio', () => {
    const pro = engineCaps('qwen3/pro-image-to-image')
    const base = engineCaps('qwen3/image-to-image')
    assert.equal(pro?.id, 'kie-qwen3-pro')
    assert.equal(base?.id, 'kie-qwen3')
    assert.equal(base?.requiresRefs, pro?.requiresRefs)
    assert.deepEqual(base?.resolutions, pro?.resolutions)
})

test('las dos variantes de Flare comparten capacidades', () => {
    const t2i = engineCaps('gpt-image-2-5-flare-text-to-image')
    const i2i = engineCaps('gpt-image-2-5-flare-image-to-image')
    assert.equal(t2i?.id, 'kie-gpt-image-2-5-flare')
    assert.deepEqual(t2i, i2i)
    assert.equal(t2i?.maxRefs, 16)
})

test('GPT Image 2 sigue sin caps: su adaptador dedicado no cambia', () => {
    assert.equal(engineCaps('gpt-image-2-text-to-image'), undefined)
    assert.equal(engineCaps('gpt-image-2-image-to-image'), undefined)
})

test('engineCaps tolera model nulo o vacío sin lanzar', () => {
    assert.equal(engineCaps(null), undefined)
    assert.equal(engineCaps(undefined), undefined)
    assert.equal(engineCaps(''), undefined)
})

test('el Body Lab ofrece SOLO los dos motores de la prueba en curso', async () => {
    // Reducción deliberada (20-sep-2026) para comparar medidas en igualdad de
    // condiciones. Un editor i2i puro como Qwen 3 puede estar aquí porque la
    // hoja parte de la plantilla de turnaround; si esa plantilla no carga, lo
    // que lo protege es el fallback a Wan de `bodySheetGenerate`.
    const { getBodyLabModels, DEFAULT_PROVIDERS: TODOS } = await import(
        '../../app/(protected-pages)/concepts/avatar-forge/_shared/providerCatalog.ts'
    )
    assert.deepEqual(
        getBodyLabModels(TODOS).map((p) => p.model),
        ['seedream/5-pro-image-to-image', 'qwen3/pro-image-to-image'],
    )
})

test('el Body Lab manda el prompt de la hoja TAL CUAL, sin ancla de identidad', async () => {
    // El ancla habla de conservar una cara que la plantilla no aporta: metida
    // aquí deforma la hoja y hace que la vestida y la nude salgan con cuerpos
    // distintos. Por eso el Body Lab pone `selfContainedPrompt`.
    const { qwen3Route } = await import('./routes/qwen3.ts')
    const hoja =
        'Turnaround sheet, three views, mini bikini, hip-to-waist ratio 1.5.'
    const req = await qwen3Route.build({
        model: 'qwen3/pro-image-to-image',
        aspectRatio: '16:9',
        prompt: hoja,
        referenceImage: { mimeType: 'image/png', url: 'https://r2/tmpl.png' },
        selfContainedPrompt: true,
        bodyEmphasis: 'hourglass 90-60-100',
        hairEmphasis: 'copper red hair',
        uploadRef: async (r: { url?: string }) => r.url ?? '',
        cropToAspect: async (r: unknown) => r,
    } as never)
    assert.equal(req.input.prompt, hoja)
    assert.equal(
        /FIRST image is the person/.test(String(req.input.prompt)),
        false,
    )
})
