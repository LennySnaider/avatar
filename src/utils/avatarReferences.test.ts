// src/utils/avatarReferences.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newestReference } from './avatarReferences.ts'

/**
 * El bug que esto impide repetir (reporte 2026-09-19, "Seedream muestra los
 * pezones con 🌶️ apagado"): `apiGetAvatarReferences` devuelve las filas de
 * más vieja a más nueva y dos lectores hacían `rows[0]` creyendo que era "la
 * última guardada". Con dos hojas `body` por avatar (las del 26-jul que
 * re-insertó el rescate del 13-sep + la regenerada después) viajaba SIEMPRE la
 * vieja — y la de MiaUltra era una hoja mal generada, con el top transparente.
 * La elección no puede depender del orden en que llegan las filas.
 */
const row = (id: string, created_at: string) => ({ id, created_at })

test('elige la fila más nueva aunque llegue la última (orden ascendente)', () => {
    const rows = [
        row('vieja', '2026-07-26T03:41:24Z'),
        row('nueva', '2026-08-03T14:55:03Z'),
    ]
    assert.equal(newestReference(rows)?.id, 'nueva')
})

test('elige la fila más nueva aunque llegue la primera (orden descendente)', () => {
    const rows = [
        row('nueva', '2026-08-03T14:55:03Z'),
        row('vieja', '2026-07-26T03:41:24Z'),
    ]
    assert.equal(newestReference(rows)?.id, 'nueva')
})

test('con una sola fila la devuelve tal cual', () => {
    const only = row('única', '2026-07-26T03:41:24Z')
    assert.equal(newestReference([only]), only)
})

test('sin filas devuelve undefined (también con null/undefined)', () => {
    assert.equal(newestReference([]), undefined)
    assert.equal(newestReference(null), undefined)
    assert.equal(newestReference(undefined), undefined)
})
