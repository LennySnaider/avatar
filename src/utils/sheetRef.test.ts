// src/utils/bodySheetGenerate.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esUrlPublica, tipoPorExtension } from './sheetRef.ts'

/**
 * El Body Lab mandaba sus referencias al servidor EN BASE64: la plantilla de
 * turnaround (1,88 MB → ~2,5 MB codificada) y, encadenada, la hoja nude recién
 * generada (varios MB a 2K). Eso reventaba el tope de body de Vercel con un
 * `413 Content Too Large` y dejaba el Body Lab sin poder generar. Ahora viajan
 * por URL y el proveedor las descarga él mismo.
 */

test('desde un origen público la referencia puede viajar por URL', () => {
    assert.equal(esUrlPublica('https://avatar-liart.vercel.app'), true)
    assert.equal(esUrlPublica('https://midominio.com'), true)
})

test('desde localhost NO: el proveedor no puede descargar de ahí', () => {
    // En local hay que seguir mandando los bytes, aunque pesen.
    assert.equal(esUrlPublica('http://localhost:3030'), false)
    assert.equal(esUrlPublica('https://localhost:3030'), false)
    assert.equal(esUrlPublica('http://127.0.0.1:3030'), false)
    assert.equal(esUrlPublica(''), false)
})

test('http plano tampoco vale', () => {
    assert.equal(esUrlPublica('http://midominio.com'), false)
})

test('el tipo sale de la extensión, con png por defecto', () => {
    assert.equal(tipoPorExtension('https://x/y/hoja.png'), 'image/png')
    assert.equal(tipoPorExtension('https://x/y/hoja.jpg'), 'image/jpeg')
    assert.equal(tipoPorExtension('https://x/y/hoja.jpeg?v=2'), 'image/jpeg')
    // Sin extensión reconocible: png, que es lo que devuelven los motores.
    assert.equal(tipoPorExtension('https://x/y/sin-extension'), 'image/png')
})
