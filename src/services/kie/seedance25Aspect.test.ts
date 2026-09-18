// src/services/kie/seedance25Aspect.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    seedance25AspectRatio,
    SEEDANCE_25_ADAPTIVE,
} from './seedance25Aspect.ts'

test('first-frame → adaptive aunque el usuario pida 9:16 (422 de KIE)', () => {
    assert.equal(
        seedance25AspectRatio({ requested: '9:16', hasFirstFrame: true }),
        SEEDANCE_25_ADAPTIVE,
    )
    assert.equal(
        seedance25AspectRatio({ requested: '16:9', hasFirstFrame: true }),
        SEEDANCE_25_ADAPTIVE,
    )
})

test('sin first frame (t2v o refs) → respeta el ratio pedido', () => {
    for (const r of ['1:1', '4:3', '3:4', '16:9', '9:16', '21:9']) {
        assert.equal(
            seedance25AspectRatio({ requested: r, hasFirstFrame: false }),
            r,
        )
    }
})

test('ratio fuera de la lista de la API → adaptive, no otro 422', () => {
    assert.equal(
        seedance25AspectRatio({ requested: '3:2', hasFirstFrame: false }),
        SEEDANCE_25_ADAPTIVE,
    )
    assert.equal(
        seedance25AspectRatio({ requested: '', hasFirstFrame: false }),
        SEEDANCE_25_ADAPTIVE,
    )
    assert.equal(
        seedance25AspectRatio({ hasFirstFrame: false }),
        SEEDANCE_25_ADAPTIVE,
    )
})
