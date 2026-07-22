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
