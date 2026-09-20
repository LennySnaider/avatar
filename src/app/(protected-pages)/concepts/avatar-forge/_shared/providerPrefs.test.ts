// src/app/(protected-pages)/concepts/avatar-forge/_shared/providerPrefs.test.ts
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// localStorage de mentira: el módulo es 'use client' y lee `window`. Se monta
// ANTES de cualquier import del módulo bajo prueba (de ahí el import dinámico).
const store = new Map<string, string>()
;(globalThis as unknown as Record<string, unknown>).window = {
    localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
    },
}

const prefs = () => import('./providerPrefs.ts')

const BATCH = 'avatar-studio:batch-providers'
const BATCH_NSFW = 'avatar-studio:batch-providers-nsfw'
const HIDDEN = 'avatar-forge:hidden-providers'
const set = (k: string, v: string[]) => store.set(k, JSON.stringify(v))

beforeEach(() => store.clear())

test('un provider OCULTO deja de ocupar plaza en el batch', async () => {
    // El bug: se marcaban tres, se ocultaba uno desde AI Providers, y en el
    // selector solo se podían elegir dos — la plaza del oculto no se liberaba.
    const { readBatchIds } = await prefs()
    set(BATCH, ['kie-seedream-5-pro', 'kie-wan-image', 'kie-nano-banana-2'])
    set(HIDDEN, ['kie-wan-image'])
    assert.deepEqual(readBatchIds(), [
        'kie-seedream-5-pro',
        'kie-nano-banana-2',
    ])
})

test('sin ocultos el batch se queda como estaba', async () => {
    const { readBatchIds } = await prefs()
    set(BATCH, ['a', 'b', 'c'])
    assert.deepEqual(readBatchIds(), ['a', 'b', 'c'])
})

test('el recorte a 3 se aplica DESPUÉS de quitar los ocultos', async () => {
    // Si se recortara antes, un oculto en cabeza se comería la plaza de uno
    // visible y el usuario seguiría sin poder marcar el tercero.
    const { readBatchIds, BATCH_MAX } = await prefs()
    set(BATCH, ['oculto', 'a', 'b', 'c'])
    set(HIDDEN, ['oculto'])
    assert.deepEqual(readBatchIds(), ['a', 'b', 'c'])
    assert.equal(readBatchIds().length, BATCH_MAX)
})

test('el set 🌶️ sigue la misma regla', async () => {
    const { readBatchNsfwIds } = await prefs()
    set(BATCH_NSFW, ['kie-wan-image', 'kie-seedream-5-pro'])
    set(HIDDEN, ['kie-wan-image'])
    assert.deepEqual(readBatchNsfwIds(), ['kie-seedream-5-pro'])
})
