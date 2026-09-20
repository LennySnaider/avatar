// src/services/kie/routes/gptImage25.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gptImage25Route, flareResolution } from './gptImage25.ts'
import type { ImageRouteContext } from '../context.ts'
import type { KieRefWithRole } from '../shared.ts'

const ref = (role?: string, n = 0): KieRefWithRole => ({
    mimeType: 'image/png',
    url: `https://r2.example/${role ?? 'face'}${n}.png`,
    role,
})

function ctx(over: Partial<ImageRouteContext> = {}): ImageRouteContext {
    return {
        model: 'gpt-image-2-5-flare-text-to-image',
        aspectRatio: '16:9',
        prompt: 'A woman reading by a window, soft morning light.',
        uploadRef: async (r) => r.url ?? 'https://r2.example/subida.png',
        cropToAspect: async (r) => r,
        ...over,
    }
}

test('sin referencias es text-to-image y no manda input_urls', async () => {
    const req = await gptImage25Route.build(ctx())
    assert.equal(req.model, 'gpt-image-2-5-flare-text-to-image')
    assert.equal('input_urls' in req.input, false)
})

test('con referencia cambia al id de image-to-image', async () => {
    const req = await gptImage25Route.build(ctx({ referenceImage: ref() }))
    assert.equal(req.model, 'gpt-image-2-5-flare-image-to-image')
    assert.deepEqual(req.input.input_urls, ['https://r2.example/face0.png'])
})

test('nunca viajan más de 16 referencias', async () => {
    const muchas = Array.from({ length: 25 }, (_, i) => ref('asset', i))
    const req = await gptImage25Route.build(
        ctx({ referenceImage: ref(), referenceImages: muchas }),
    )
    const urls = req.input.input_urls as string[]
    assert.ok(urls.length <= 16, `viajaron ${urls.length}`)
})

test('los cuatro ratios que solo admiten 1K no piden 2K ni 4K', async () => {
    // Pedirles más resolución es un 422 de la API.
    for (const r of ['27:16', '16:27', '9:8', '8:9']) {
        assert.equal(flareResolution(r, '4K'), '1K')
        assert.equal(flareResolution(r, '2K'), '1K')
    }
    assert.equal(flareResolution('16:9', '4K'), '4K')
    assert.equal(flareResolution('1:1', '1K'), '1K')
})

test('la resolución del ratio restringido se aplica de verdad en el input', async () => {
    const req = await gptImage25Route.build(
        ctx({ aspectRatio: '9:8', resolution: '4K' }),
    )
    assert.equal(req.input.resolution, '1K')
})

test('un ratio desconocido cae a auto, el default de la doc', async () => {
    const req = await gptImage25Route.build(ctx({ aspectRatio: '5:4' }))
    assert.equal(req.input.aspect_ratio, 'auto')
})

test('el prompt respeta el tope de la doc (20000)', async () => {
    const req = await gptImage25Route.build(
        ctx({ prompt: 'palabra '.repeat(6000) }),
    )
    assert.ok((req.input.prompt as string).length <= 20000)
})

test('no es permisivo: su prompt pasa por el saneador', () => {
    // OpenAI filtra río arriba; mandarle el prompt crudo solo cambia un rechazo
    // por otro más caro.
    assert.equal(gptImage25Route.isPermissive, false)
})
