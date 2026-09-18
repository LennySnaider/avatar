import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isInstagramFit, needsInstagramFit, planInstagramFit } from './instagramFitRules.ts'

test('needsInstagramFit: 9:16 y panorámicas extremas sí; 4:5, 1:1 y 16:9 no', () => {
    assert.equal(needsInstagramFit(1080, 1920), true)
    assert.equal(needsInstagramFit(2000, 1000), true)
    assert.equal(needsInstagramFit(1080, 1350), false)
    assert.equal(needsInstagramFit(1080, 1080), false)
    assert.equal(needsInstagramFit(1920, 1080), false)
    assert.equal(needsInstagramFit(0, 0), false)
})

test('planInstagramFit: una 4:5 no se toca', () => {
    assert.deepEqual(planInstagramFit(1080, 1350, 'pad'), { kind: 'none' })
    assert.deepEqual(planInstagramFit(1080, 1350, 'crop'), { kind: 'none' })
})

test('planInstagramFit pad: una 9:16 ensancha el lienzo a 4:5 y se limita a 1440 de ancho', () => {
    const plan = planInstagramFit(1080, 1920, 'pad')
    assert.equal(plan.kind, 'pad')
    if (plan.kind !== 'pad') return
    // ceil(1920 * 0.8) = 1536 > 1440 → escala 0.9375 → 1440 x 1800 (4:5 exacto)
    assert.deepEqual(plan.canvas, { width: 1440, height: 1800 })
})

test('planInstagramFit crop: una 9:16 conserva el ancho y recorta arriba y abajo por igual', () => {
    const plan = planInstagramFit(1080, 1920, 'crop')
    assert.equal(plan.kind, 'crop')
    if (plan.kind !== 'crop') return
    assert.deepEqual(plan.region, { left: 0, top: 285, width: 1080, height: 1350 })
    assert.deepEqual(plan.output, { width: 1080, height: 1350 })
})

test('planInstagramFit: una panorámica 3:1 se lleva a 1.91:1 (pad alarga, crop recorta los lados)', () => {
    const pad = planInstagramFit(3000, 1000, 'pad')
    assert.equal(pad.kind, 'pad')
    if (pad.kind === 'pad') {
        // ceil(3000 / 1.91) = 1571 → cap a 1440 de ancho → 1440 x 754
        assert.deepEqual(pad.canvas, { width: 1440, height: 754 })
    }
    const crop = planInstagramFit(3000, 1000, 'crop')
    assert.equal(crop.kind, 'crop')
    if (crop.kind === 'crop') {
        assert.deepEqual(crop.region, { left: 545, top: 0, width: 1910, height: 1000 })
        assert.deepEqual(crop.output, { width: 1440, height: 754 })
    }
})

test('isInstagramFit: solo pad y crop', () => {
    assert.equal(isInstagramFit('pad'), true)
    assert.equal(isInstagramFit('crop'), true)
    assert.equal(isInstagramFit('stretch'), false)
    assert.equal(isInstagramFit(undefined), false)
})
