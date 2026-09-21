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

test('sin Clone Ref, la cara es el lienzo y los extras la acompañan', async () => {
    const req = await qwen3Route.build(
        ctx({ referenceImages: [ref('body'), ref('asset')] }),
    )
    const urls = req.input.image_urls as string[]
    assert.equal(urls[0], 'https://r2.example/face.png')
    assert.ok(urls.length <= 3, `maxRefs=3 pero viajaron ${urls.length}`)
})

test('CON Clone Ref el lienzo es el CLONE y la cara va SEGUNDA', async () => {
    // El bug que llegó a producción: Qwen EDITA la primera imagen. Con la cara
    // ahí, devolvía a la mujer del clone —tres avatares distintas salieron
    // idénticas y una pelirroja salió morena—. Verificado en vivo: invirtiendo
    // el orden, sale la avatar con el vestuario y el sitio del clone.
    const req = await qwen3Route.build(
        ctx({ referenceImages: [ref('face'), ref('clone')] }),
    )
    assert.deepEqual(req.input.image_urls, [
        'https://r2.example/clone.png',
        'https://r2.example/face.png',
    ])
})

test('el peso del Clone Ref sigue los tramos de cloneTier, no una copia', async () => {
    // A 65% (STRONG) viajaba "keep framing close to the first image": una
    // orden de COPIA sobre un editor de la imagen 1 → fotocopias del clone
    // (reporte 20-sep). STRONG es "otra toma de la misma sesión".
    const con = async (cloneWeight: number) =>
        (await qwen3Route.build(ctx({ referenceImages: [ref('clone')], cloneWeight })))
            .input.prompt as string
    assert.match(await con(100), /CLONE source: recreate its EXACT pose/)
    assert.match(await con(65), /ANOTHER SHOT of that session/)
    assert.match(await con(65), /never a pixel copy/)
    assert.doesNotMatch(await con(65), /close to the FIRST image|minor natural variation/)
    assert.match(await con(40), /STYLE reference/)
    assert.match(await con(15), /MOOD reference/)
    // Los umbrales son los de cloneTier (75 / 50 / 25), no otros.
    assert.match(await con(75), /EXACT pose/)
    assert.match(await con(50), /ANOTHER SHOT/)
    assert.match(await con(25), /STYLE reference/)
})

test('con desnudo en la escena, el clone no impone su ropa', async () => {
    const p = (await qwen3Route.build(ctx({ referenceImages: [ref('clone')], cloneWeight: 65, nsfwIntent: true }))).input.prompt as string
    assert.match(p, /IGNORE its clothing/)
    assert.doesNotMatch(p, /every garment/)
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

// ─────────────────────────────────────────────────────────────────────────────
// Identidad del avatar. Estos tests nacen de un fallo en producción: la ruta
// llamaba a `stripIdentityRedundancy` copiando a Qwen 2 —que borra el preámbulo
// de edad, [BODY:] y [FACE:]— pero SIN copiar el ancla que Qwen 2 pone para
// compensarlo. El prompt llegaba al motor con la escena y el clone solamente,
// así que tres avatares distintas salieron idénticas y una pelirroja salió
// morena. Los tests de antes miraban la FORMA del request (que `image_urls`
// fuese un array, que el model no se reescribiera) y ninguno miraba si la
// persona seguía ahí.
// ─────────────────────────────────────────────────────────────────────────────

const conIdentidad = (over: Partial<ImageRouteContext> = {}) =>
    ctx({
        prompt:
            'A 24 year old woman. [BODY: hourglass] [FACE: oval face] standing in a dark room. ' +
            '[CLONE: a woman with long wavy hair in a white corset]',
        referenceImages: [ref('face'), ref('clone')],
        hairEmphasis: 'long wavy COPPER RED hair',
        eyeEmphasis: 'green eyes',
        bodyEmphasis: 'hourglass, 90-60-100',
        ...over,
    })

test('el color de pelo del avatar viaja aunque el strip borre los tags', async () => {
    const req = await qwen3Route.build(conIdentidad())
    assert.match(req.input.prompt as string, /COPPER RED/i)
})

test('los ojos y el cuerpo del avatar también sobreviven', async () => {
    const p = (await qwen3Route.build(conIdentidad())).input.prompt as string
    assert.match(p, /green eyes/i)
    assert.match(p, /90-60-100/)
})

test('la identidad va DELANTE de la escena: en un editor literal manda el frente', async () => {
    const p = (await qwen3Route.build(conIdentidad())).input.prompt as string
    assert.ok(
        p.indexOf('FIRST image') < p.indexOf('[CLONE:'),
        'el ancla de identidad quedó detrás del clone',
    )
})

test('con Clone Ref, la cara y el pelo salen de la SEGUNDA imagen', async () => {
    const p = (await qwen3Route.build(conIdentidad())).input.prompt as string
    assert.match(p, /FACE SWAP is MANDATORY/i)
    assert.match(p, /face from the SECOND image/i)
    // El pelo también: sin decirlo, el motor lo tomaba del lienzo (medido).
    assert.match(p, /HAIR also comes from the SECOND image/i)
    // Y no puede quedar la orden contraria de "la primera imagen es la persona".
    assert.equal(/FIRST image is the person/i.test(p), false)
})

test('el spec corporal no se duplica si la escena ya lo trae', async () => {
    // Body Lab o prompt de perfil pegado: inyectarlo otra vez lo amplifica.
    const p = (
        await qwen3Route.build(
            conIdentidad({
                prompt: 'standing in a room. Her hip-to-waist ratio is 1.5, bust 90cm.',
            }),
        )
    ).input.prompt as string
    assert.equal(p.includes('Her body: hourglass'), false)
})

test('sin datos de identidad el ancla no inventa nada', async () => {
    const p = (
        await qwen3Route.build(
            ctx({ hairEmphasis: undefined, eyeEmphasis: undefined }),
        )
    ).input.prompt as string
    assert.equal(/Her hair MUST be/.test(p), false)
    assert.equal(/Her eyes are/.test(p), false)
    // El face-lock sí va SIEMPRE: es lo que impide que el motor invente cara.
    assert.match(p, /FIRST image is the person/i)
})
