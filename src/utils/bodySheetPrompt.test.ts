// src/utils/bodySheetPrompt.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sameBodyShape } from './bodySheetPrompt.ts'
import type { PhysicalMeasurements } from '@/@types/supabase'

/**
 * `sameBodyShape` decide si la hoja del Body Lab quedó desactualizada. Un falso
 * positivo NO es cosmético: el overlay "Cambiaste los atributos" tapa el cuerpo,
 * esconde la variante nude y deja al usuario sin poder guardar lo que acaba de
 * pagar. Comparaba `JSON.stringify` de los objetos tal cual, que depende del
 * orden de las claves — y los editores emiten `{...measurements, ...patch}`.
 */

const base = {
    age: 24,
    height: 168,
    bodyType: 'hourglass',
    bust: 92,
    waist: 60,
    hips: 100,
} as unknown as PhysicalMeasurements

const como = (o: Record<string, unknown>) =>
    o as unknown as PhysicalMeasurements

test('el mismo cuerpo con las claves en otro orden NO está desactualizado', () => {
    const reordenado = como({
        hips: 100,
        waist: 60,
        bust: 92,
        bodyType: 'hourglass',
        height: 168,
        age: 24,
    })
    assert.equal(sameBodyShape(base, reordenado), true)
})

test('una clave añadida al final por un editor no lo desactualiza', () => {
    // `{...measurements, ...patch}` manda al final lo que antes no estaba, y
    // el cuerpo derivado añade `shape` por su cuenta.
    const conShape = como({ ...base, shape: 'hourglass' })
    const shapeDelante = como({ shape: 'hourglass', ...base })
    assert.equal(sameBodyShape(conShape, shapeDelante), true)
})

test('vacío y ausente son el mismo cuerpo', () => {
    assert.equal(sameBodyShape(base, como({ ...base, legType: undefined })), true)
    assert.equal(sameBodyShape(base, como({ ...base, legType: '' })), true)
    assert.equal(sameBodyShape(base, como({ ...base, legType: null })), true)
})

test('un número escrito como texto es el mismo número', () => {
    // Un <input type="number"> devuelve string.
    assert.equal(sameBodyShape(base, como({ ...base, waist: '60' })), true)
    assert.equal(sameBodyShape(base, como({ ...base, height: ' 168 ' })), true)
})

test('un cambio REAL sí desactualiza la hoja', () => {
    assert.equal(sameBodyShape(base, como({ ...base, waist: 70 })), false)
    assert.equal(sameBodyShape(base, como({ ...base, bodyType: 'pear' })), false)
    assert.equal(sameBodyShape(base, como({ ...base, legType: 'long' })), false)
})

test('los campos que la hoja no dibuja siguen sin desactualizarla', () => {
    // Cambiar el color de pezón o de pelo no cambia el cuerpo: pedir regenerar
    // por eso sería quemar tokens.
    assert.equal(sameBodyShape(base, como({ ...base, nippleColor: 'rosy' })), true)
    assert.equal(sameBodyShape(base, como({ ...base, hairColor: 'red' })), true)
    assert.equal(sameBodyShape(base, como({ ...base, eyeColor: 'green' })), true)
})

test('sin medidas guardadas no se compara nada', () => {
    assert.equal(sameBodyShape(null, null), true)
    assert.equal(sameBodyShape(base, null), false)
})

// ─────────────────────────────────────────────────────────────────────────────
// `diffBodyShape`: el aviso de "desactualizado" se deriva de esta lista, así
// que no puede aparecer sin un atributo que lo justifique. Cuando el aviso
// salía con el formulario intacto, nadie podía nombrar el campo culpable.
// ─────────────────────────────────────────────────────────────────────────────

test('sin cambios reales la lista va vacía', async () => {
    const { diffBodyShape } = await import('./bodySheetPrompt.ts')
    assert.deepEqual(diffBodyShape(base, como({ ...base })), [])
    assert.deepEqual(
        diffBodyShape(base, como({ hips: 100, waist: 60, bust: 92, bodyType: 'hourglass', height: 168, age: 24 })),
        [],
    )
})

test('nombra exactamente el atributo que cambió', async () => {
    const { diffBodyShape } = await import('./bodySheetPrompt.ts')
    assert.deepEqual(diffBodyShape(base, como({ ...base, waist: 70 })), ['waist'])
    assert.deepEqual(
        diffBodyShape(base, como({ ...base, waist: 70, hips: 105 })).sort(),
        ['hips', 'waist'],
    )
})

test('los nombres se muestran en castellano', async () => {
    const { describeBodyShapeDiff } = await import('./bodySheetPrompt.ts')
    assert.equal(describeBodyShapeDiff(['waist', 'hips']), 'cintura, cadera')
    // Un campo sin etiqueta se enseña tal cual antes que no decir nada.
    assert.equal(describeBodyShapeDiff(['loQueSea']), 'loQueSea')
})

test('sin hoja previa no hay cambios que mostrar', async () => {
    const { diffBodyShape } = await import('./bodySheetPrompt.ts')
    assert.deepEqual(diffBodyShape(base, null), [])
    assert.deepEqual(diffBodyShape(null, base), [])
})

test('el aviso y la lista no pueden discrepar', async () => {
    const { diffBodyShape, sameBodyShape } = await import('./bodySheetPrompt.ts')
    const casos = [
        [base, como({ ...base })],
        [base, como({ ...base, waist: 70 })],
        [base, como({ ...base, nippleColor: 'rosy' })],
        [base, como({ ...base, legType: '' })],
    ] as const
    for (const [a, b] of casos) {
        assert.equal(
            sameBodyShape(a, b),
            diffBodyShape(a, b).length === 0,
            `discrepan para ${JSON.stringify(b)}`,
        )
    }
})
