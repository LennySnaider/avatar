// src/utils/sceneSanitizer.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    stripSceneIdentity,
    buildIdentityNegative,
    ANTI_WATERMARK_CLAUSE,
} from './sceneSanitizer.ts'

test('JSON: quita identidad y conserva escena', () => {
    const input = JSON.stringify({
        subject: { description: 'a golden blonde woman', age: 'young adult (20s)' },
        hair: { color: 'golden blonde', style: 'loose waves' },
        body: { frame: 'curvy with a defined waist' },
        skin: { tone: 'fair to light' },
        clothing: { top: 'black lace bra' },
        background: { setting: 'cozy living room' },
        pose: { position: 'standing near a mirror' },
    })
    const out = stripSceneIdentity(input)
    const obj = JSON.parse(out)
    assert.equal(obj.hair, undefined)
    assert.equal(obj.body, undefined)
    assert.equal(obj.skin, undefined)
    assert.equal(obj.subject.age, undefined)
    assert.deepEqual(obj.clothing, { top: 'black lace bra' })
    assert.deepEqual(obj.pose, { position: 'standing near a mirror' })
    assert.ok(obj.background.setting === 'cozy living room')
})

test('JSON: filtra must_keep de apariencia, conserva escena', () => {
    const input = JSON.stringify({
        constraints: {
            must_keep: ['golden-blonde wavy hair', 'mauve sofa', 'warm lamp on the right'],
        },
    })
    const obj = JSON.parse(stripSceneIdentity(input))
    assert.ok(!obj.constraints.must_keep.includes('golden-blonde wavy hair'))
    assert.ok(obj.constraints.must_keep.includes('mauve sofa'))
    assert.ok(obj.constraints.must_keep.includes('warm lamp on the right'))
})

test('Prosa: quita color de pelo/físico/piel, conserva escena', () => {
    const out = stripSceneIdentity(
        'a curvy blonde woman with fair skin in a red dress on a beach',
    )
    assert.ok(!/blonde/i.test(out))
    assert.ok(!/curvy/i.test(out))
    assert.ok(!/fair skin/i.test(out))
    assert.ok(/red dress/i.test(out))
    assert.ok(/beach/i.test(out))
})

test('Prosa: conserva el peinado/estilo (no es color)', () => {
    const out = stripSceneIdentity('wavy hair with a center part in a ponytail')
    assert.ok(/wavy/i.test(out))
    assert.ok(/center part/i.test(out))
    assert.ok(/ponytail/i.test(out))
})

test('Escape [LOOK:] → intacto', () => {
    const input = '[LOOK: platinum blonde wig] a woman with fair skin at a party'
    assert.equal(stripSceneIdentity(input), input)
})

test('TATTOO_RE no come contenido de escena', () => {
    const out = stripSceneIdentity(
        'a tattoo of a rose on her shoulder standing near a red car',
    )
    assert.ok(/shoulder/i.test(out))
    assert.ok(/standing/i.test(out))
    assert.ok(/red car/i.test(out))
    // "standing" truncado a mitad de palabra dejaría un fragmento "nding"
    // como token aislado (con boundary a la izquierda); no debe aparecer.
    assert.ok(!/\bnding\b/i.test(out))
})

test('JSON array de nivel superior se sanea', () => {
    const input = '[{"hair":{"color":"blonde"},"background":"a beach"}]'
    const out = stripSceneIdentity(input)
    const arr = JSON.parse(out)
    assert.equal(arr[0].hair, undefined)
    assert.equal(arr[0].background, 'a beach')
})

test('buildIdentityNegative: config curvy → anti-slimming + fijos', () => {
    const neg = buildIdentityNegative({ bust: 100, waist: 60, hips: 105 })
    assert.ok(/athletic slimness/i.test(neg))
    assert.ok(/flat chest/i.test(neg))
    assert.ok(/watermark/i.test(neg))
})

test('buildIdentityNegative: config no-curvy → solo fijos (sin anti-slimming)', () => {
    const neg = buildIdentityNegative({ bust: 84, waist: 62, hips: 90 })
    assert.ok(!/athletic slimness/i.test(neg))
    assert.ok(/watermark/i.test(neg))
})

test('buildIdentityNegative: build alto (5) dispara anti-slimming', () => {
    const neg = buildIdentityNegative({ build: 5 })
    assert.ok(/athletic slimness/i.test(neg))
})

test('ANTI_WATERMARK_CLAUSE menciona watermark y text', () => {
    assert.ok(/watermark/i.test(ANTI_WATERMARK_CLAUSE))
    assert.ok(/text/i.test(ANTI_WATERMARK_CLAUSE))
})

test('Prosa: no come "frame" fotográfico ni pose', () => {
    const out1 = stripSceneIdentity('lean forward within the frame')
    assert.ok(/forward/i.test(out1))
    assert.ok(/frame/i.test(out1))

    const out2 = stripSceneIdentity('thick fog rolling over the frame')
    assert.ok(/fog/i.test(out2))
    assert.ok(/frame/i.test(out2))
})

test('buildIdentityNegative: waist NO es señal curvy', () => {
    const neg = buildIdentityNegative({ waist: 110 })
    assert.ok(!/athletic slimness/i.test(neg))
})

// ── Etnicidad + español + JSON profundo (casos reales de BD, 2026-07-22) ──

test('Prosa ES: quita "mujer coreana" (etnicidad), conserva persona y escena', () => {
    const out = stripSceneIdentity(
        'Retrato de estudio DSLR ultrarrealista de una impresionante mujer coreana posando con confianza dentro de un estudio de fotografía minimalista',
    )
    assert.ok(!/coreana/i.test(out))
    assert.ok(/mujer/i.test(out))
    assert.ok(/estudio de fotografía/i.test(out))
})

test('Prosa EN: quita "korean woman" (etnicidad), conserva escena', () => {
    const out = stripSceneIdentity('a stunning korean woman posing in a minimalist studio')
    assert.ok(!/korean/i.test(out))
    assert.ok(/woman/i.test(out))
    assert.ok(/studio/i.test(out))
})

test('Etnicidad de LUGAR se conserva (no es persona)', () => {
    const en = stripSceneIdentity('eating ramen at a Korean restaurant at night')
    assert.ok(/Korean restaurant/i.test(en))
    const es = stripSceneIdentity('cenando en un restaurante coreano de noche')
    assert.ok(/restaurante coreano/i.test(es))
})

test('Prosa ES: quita cabello/piel/ojos/edad en español, conserva escena', () => {
    const out = stripSceneIdentity(
        'una mujer de 25 años con cabello castaño, piel morena y ojos verdes caminando por la playa al atardecer',
    )
    assert.ok(!/castaño/i.test(out))
    assert.ok(!/morena/i.test(out))
    assert.ok(!/verdes/i.test(out))
    assert.ok(!/25 años/i.test(out))
    assert.ok(/playa/i.test(out))
    assert.ok(/atardecer/i.test(out))
})

test('Prosa ES: peinado se conserva (no es color)', () => {
    const out = stripSceneIdentity('pelo recogido en una coleta alta con mechones sueltos')
    assert.ok(/coleta/i.test(out))
    assert.ok(/pelo recogido/i.test(out))
})

test('JSON profundo: key compuesta "body_features" se borra (caso real)', () => {
    const input = JSON.stringify({
        subject: {
            description: 'Young woman with a fit, tanned physique standing on a beach.',
            apparel: 'Matching two-piece string bikini with a retro orange pattern',
        },
        body_features: 'Slender but curvy figure with a defined waist',
        environment: { setting: 'sunny beach with turquoise water' },
    })
    const obj = JSON.parse(stripSceneIdentity(input))
    assert.equal(obj.body_features, undefined)
    assert.ok(/bikini/i.test(obj.subject.apparel))
    assert.ok(!/fit, tanned physique/i.test(obj.subject.description))
    assert.ok(/beach/i.test(obj.environment.setting))
})

test('JSON profundo: "body_and_pose" (objeto) conserva la pose, borra physique', () => {
    const input = JSON.stringify({
        body_and_pose: {
            physique: 'fit, toned abdomen, visible ribcage',
            arms: 'arms crossed behind the back',
        },
    })
    const obj = JSON.parse(stripSceneIdentity(input))
    assert.ok(obj.body_and_pose)
    assert.equal(obj.body_and_pose.physique, undefined)
    assert.ok(/arms crossed/i.test(obj.body_and_pose.arms))
})

// ── Anti-sobre-borrado (hallazgos del review adversarial 2026-07-22) ──

test('JSON: ropa/paleta/luz FUERA de contexto persona quedan intactas', () => {
    const input = JSON.stringify({
        clothing: { detail: 'slim-fit blazer hugging the waist' },
        colors_and_tone: { palette: 'warm peach and tan skin tones' },
        accessories: { hairpiece: 'brown hair clip' },
        lighting: { type: 'harsh natural sunlight' },
    })
    const obj = JSON.parse(stripSceneIdentity(input))
    assert.equal(obj.clothing.detail, 'slim-fit blazer hugging the waist')
    assert.equal(obj.colors_and_tone.palette, 'warm peach and tan skin tones')
    assert.equal(obj.accessories.hairpiece, 'brown hair clip')
})

test('JSON: negative_prompt queda INTACTO (no invertir su intención)', () => {
    const input = JSON.stringify({
        negative_prompt: ['small chest', 'athletic slimness', 'slim hips', 'watermark'],
    })
    const obj = JSON.parse(stripSceneIdentity(input))
    assert.deepEqual(obj.negative_prompt, [
        'small chest',
        'athletic slimness',
        'slim hips',
        'watermark',
    ])
})

test('JSON: "face" objeto conserva expression/gaze (escena); "face" string se borra', () => {
    const asObject = JSON.parse(
        stripSceneIdentity(
            JSON.stringify({
                face: { expression: 'soft confident smile', gaze: 'into the lens' },
            }),
        ),
    )
    assert.ok(asObject.face)
    assert.equal(asObject.face.expression, 'soft confident smile')
    const asString = JSON.parse(
        stripSceneIdentity(
            JSON.stringify({ face: 'sharp jawline, high cheekbones' }),
        ),
    )
    assert.equal(asString.face, undefined)
})

test('JSON: identidad prosaica en contexto persona SÍ se sanea (subject/story)', () => {
    const input = JSON.stringify({
        subject: { description: 'a stunning korean woman with a fit, tanned physique' },
        the_vibe: { story: 'a curvy blonde woman enjoying the evening' },
    })
    const obj = JSON.parse(stripSceneIdentity(input))
    assert.ok(!/korean/i.test(obj.subject.description))
    assert.ok(!/physique/i.test(obj.subject.description))
    assert.ok(!/blonde/i.test(obj.the_vibe.story))
    assert.ok(/evening/i.test(obj.the_vibe.story))
})
