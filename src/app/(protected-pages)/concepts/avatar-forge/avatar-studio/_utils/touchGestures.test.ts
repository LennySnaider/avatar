// src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_utils/touchGestures.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    SWIPE_MIN_DISTANCE_PX,
    pointerDistance,
    pointerMidpoint,
    resolveSwipe,
} from './touchGestures.ts'

test('pointerDistance mide la separacion entre los dos dedos', () => {
    assert.equal(pointerDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5)
    assert.equal(pointerDistance({ x: 10, y: 10 }, { x: 10, y: 10 }), 0)
    // Es simetrica: da igual que dedo llego primero.
    assert.equal(
        pointerDistance({ x: 3, y: 4 }, { x: 0, y: 0 }),
        pointerDistance({ x: 0, y: 0 }, { x: 3, y: 4 }),
    )
})

test('pointerMidpoint devuelve el ancla del pellizco', () => {
    assert.deepEqual(pointerMidpoint({ x: 0, y: 0 }, { x: 10, y: 20 }), {
        x: 5,
        y: 10,
    })
    assert.deepEqual(pointerMidpoint({ x: -8, y: 4 }, { x: 8, y: -4 }), {
        x: 0,
        y: 0,
    })
})

test('resolveSwipe: izquierda trae la siguiente, derecha la anterior', () => {
    assert.equal(resolveSwipe(-120, 0), 'next')
    assert.equal(resolveSwipe(120, 0), 'prev')
})

test('resolveSwipe ignora arrastres cortos', () => {
    assert.equal(resolveSwipe(-(SWIPE_MIN_DISTANCE_PX - 1), 0), null)
    assert.equal(resolveSwipe(SWIPE_MIN_DISTANCE_PX, 0), 'prev')
    assert.equal(resolveSwipe(0, 0), null)
})

test('resolveSwipe ignora el gesto si es mas vertical que horizontal', () => {
    // 60 px de lado pero 200 de caida: eso es scroll, no navegacion.
    assert.equal(resolveSwipe(-60, 200), null)
    // El mismo lado con poca caida si pasa.
    assert.equal(resolveSwipe(-60, 20), 'next')
    // Justo en el limite del ratio 1.5 (60 >= 40 * 1.5) cuenta.
    assert.equal(resolveSwipe(-60, 40), 'next')
    assert.equal(resolveSwipe(-60, 41), null)
})

test('resolveSwipe acepta umbrales a medida', () => {
    assert.equal(resolveSwipe(-30, 0, { minDistance: 20 }), 'next')
    assert.equal(resolveSwipe(-30, 0, { minDistance: 100 }), null)
    assert.equal(resolveSwipe(-60, 50, { axisRatio: 1 }), 'next')
    assert.equal(resolveSwipe(-60, 50, { axisRatio: 2 }), null)
})

test('resolveSwipe no se traga valores invalidos', () => {
    assert.equal(resolveSwipe(Number.NaN, 0), null)
    assert.equal(resolveSwipe(-100, Number.NaN), null)
    assert.equal(resolveSwipe(Number.POSITIVE_INFINITY, 0), null)
})
