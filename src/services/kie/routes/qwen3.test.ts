// src/services/kie/routes/qwen3.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { qwen3Route } from './qwen3.ts'
import type { ImageRouteContext } from '../context.ts'
import type { KieRefWithRole } from '../shared.ts'

const ref = (role?: string): KieRefWithRole => ({
    mimeType: 'image/png',
    url: `https://r2.example/${role ?? 'face'}.png`,
    role,
})

function ctx(over: Partial<ImageRouteContext> = {}): ImageRouteContext {
    return {
        model: 'qwen3/pro-image-to-image',
        aspectRatio: '16:9',
        prompt: 'A woman standing in a sunlit kitchen, wearing a linen dress.',
        referenceImage: ref(),
        uploadRef: async (r) => r.url ?? 'https://r2.example/subida.png',
        cropToAspect: async (r) => r,
        ...over,
    }
}

test('sin imagen de entrada no construye nada: lanza antes del cobro', async () => {
    // KIE ACEPTA el task sin `image_urls` y falla luego con un 500 sin cuerpo:
    // dejarlo pasar es pagar un hold por una tarea imposible.
    await assert.rejects(
        () => qwen3Route.build(ctx({ referenceImage: null })),
        /editor.*imagen de entrada/i,
    )
})

test('el model NUNCA se reescribe a qwen2: es otro motor y otro precio', async () => {
    // El bug que motivó todo esto: la ruta de Qwen 2 matcheaba `qwen3/*` y
    // reescribía el model a `qwen2/image-edit` en cuanto había referencia.
    const req = await qwen3Route.build(ctx())
    assert.equal(req.model, 'qwen3/pro-image-to-image')
    const base = await qwen3Route.build(ctx({ model: 'qwen3/image-to-image' }))
    assert.equal(base.model, 'qwen3/image-to-image')
})

test('image_urls es un ARRAY, con la cara primero', async () => {
    // Qwen 2 usa `image_url` (singular); aquí el campo es otro y el tipo también.
    const req = await qwen3Route.build(ctx())
    assert.ok(Array.isArray(req.input.image_urls))
    assert.deepEqual(req.input.image_urls, ['https://r2.example/face.png'])
    assert.equal(req.input.image_url, undefined)
})

test('los acompañantes se respetan hasta el tope declarado', async () => {
    const req = await qwen3Route.build(
        ctx({ referenceImages: [ref('body'), ref('asset'), ref('clone')] }),
    )
    const urls = req.input.image_urls as string[]
    assert.equal(urls[0], 'https://r2.example/face.png')
    assert.ok(urls.length <= 3, `maxRefs=3 pero viajaron ${urls.length}`)
})

test('image_size lleva el ratio crudo, no el vocabulario de fal', async () => {
    for (const r of ['1:1', '16:9', '9:16', '4:3', '3:4']) {
        const req = await qwen3Route.build(ctx({ aspectRatio: r }))
        assert.equal(req.input.image_size, r)
    }
})

test('un ratio que la API no acepta cae al fallback en vez de dar 422', async () => {
    const req = await qwen3Route.build(ctx({ aspectRatio: '5:4' }))
    assert.equal(req.input.image_size, '16:9')
})

test('la resolución elegida manda; sin elección, la del motor', async () => {
    assert.equal((await qwen3Route.build(ctx())).input.resolution, '2K')
    assert.equal(
        (await qwen3Route.build(ctx({ resolution: '1K' }))).input.resolution,
        '1K',
    )
})

test('prompt_extend va apagado: no queremos reescrituras invisibles', async () => {
    const req = await qwen3Route.build(ctx())
    assert.equal(req.input.prompt_extend, false)
})

test('nsfw_checker sigue a safeMode', async () => {
    assert.equal((await qwen3Route.build(ctx())).input.nsfw_checker, false)
    assert.equal(
        (await qwen3Route.build(ctx({ safeMode: true }))).input.nsfw_checker,
        true,
    )
})

test('el prompt respeta el tope de la doc (5000)', async () => {
    const req = await qwen3Route.build(ctx({ prompt: 'palabra '.repeat(2000) }))
    assert.ok(
        (req.input.prompt as string).length <= 5000,
        `prompt de ${(req.input.prompt as string).length} chars`,
    )
})

test('los campos opcionales no viajan vacíos', async () => {
    const limpio = await qwen3Route.build(ctx())
    assert.equal('negative_prompt' in limpio.input, false)
    assert.equal('seed' in limpio.input, false)

    const conSeed = await qwen3Route.build(
        ctx({ seed: 42, negativePrompt: 'blurry' }),
    )
    assert.equal(conSeed.input.seed, 42)
    assert.equal(conSeed.input.negative_prompt, 'blurry')

    // Fuera del rango de la doc: un 422 por un dato que no aporta.
    const fuera = await qwen3Route.build(ctx({ seed: 99999999999 }))
    assert.equal('seed' in fuera.input, false)
})
