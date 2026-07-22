// src/utils/sceneSanitizer.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripSceneIdentity } from './sceneSanitizer.ts'

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
