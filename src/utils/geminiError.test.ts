// src/utils/geminiError.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { geminiFailureMessage, isProviderOutage } from './geminiError.ts'

/** Error tal cual lo lanza @google/genai: Error con `.status` colgado. */
const apiError = (status: number, message: string) =>
    Object.assign(new Error(message), { status })

test('403 de facturación: dice que NO es la imagen y apunta al billing', () => {
    const out = geminiFailureMessage(
        apiError(
            403,
            '{"error":{"code":403,"message":"Lightning dunning decision is deny for project: projects/583399317943","status":"PERMISSION_DENIED"}}',
        ),
        'Failed to describe image',
    )
    assert.match(out, /billing|facturaci/i)
    assert.match(out, /not about the image|no es la imagen/i)
    // El id del proyecto se conserva: sin él no se sabe QUÉ cuenta revisar
    assert.match(out, /583399317943/)
})

test('403 sin cuerpo reconocible sigue señalando la key/proyecto', () => {
    const out = geminiFailureMessage(apiError(403, 'PERMISSION_DENIED'), 'x')
    assert.match(out, /403/)
    assert.doesNotMatch(out, /^x$/)
})

test('429 se reporta como cuota, no como fallo de la imagen', () => {
    const out = geminiFailureMessage(
        apiError(429, 'RESOURCE_EXHAUSTED: quota'),
        'Failed to describe image',
    )
    assert.match(out, /quota|cuota/i)
    assert.doesNotMatch(out, /billing/i)
})

test('400 conserva el detalle de la API (dice QUÉ estaba mal en la petición)', () => {
    const out = geminiFailureMessage(
        apiError(400, 'Invalid value at inline_data.mime_type'),
        'Failed to describe image',
    )
    assert.match(out, /400/)
    assert.match(out, /mime_type/)
})

test('error local sin status conserva su mensaje real', () => {
    const out = geminiFailureMessage(
        new Error('Invalid base64 image data: base64 string is null or undefined.'),
        'Failed to describe image',
    )
    assert.match(out, /Failed to describe image/)
    assert.match(out, /Invalid base64 image data/)
})

test('no-Error (string lanzado) no rompe', () => {
    assert.match(geminiFailureMessage('boom', 'Failed to describe image'), /boom/)
})

test('mensajes kilométricos se recortan (no se vuelca un JSON entero a la UI)', () => {
    const out = geminiFailureMessage(new Error('x'.repeat(5000)), 'Failed')
    assert.ok(out.length < 400, `demasiado largo: ${out.length}`)
})

// --- isProviderOutage: decide si vale la pena pagarle a KIE el reintento ---

test('SÍ es caída: 403 de cuenta, 429 de cuota y 5xx', () => {
    assert.equal(isProviderOutage(apiError(403, 'PERMISSION_DENIED')), true)
    assert.equal(isProviderOutage(apiError(429, 'RESOURCE_EXHAUSTED')), true)
    assert.equal(isProviderOutage(apiError(500, 'Internal')), true)
    assert.equal(isProviderOutage(apiError(503, 'Service Unavailable')), true)
})

test('SÍ es caída: fallo de red sin status', () => {
    assert.equal(isProviderOutage(new TypeError('fetch failed')), true)
    assert.equal(
        isProviderOutage(Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' })),
        true,
    )
})

test('NO es caída: 400 — la petición iba mal, en KIE fallaría igual', () => {
    assert.equal(isProviderOutage(apiError(400, 'Invalid base64')), false)
})

test('NO es caída: rechazo de CONTENIDO — KIE daría el mismo rechazo y cobraría', () => {
    assert.equal(isProviderOutage(new Error('blocked: PROHIBITED_CONTENT')), false)
    assert.equal(isProviderOutage(new Error('finishReason: SAFETY')), false)
})

test('NO es caída: error local nuestro (base64 vacío)', () => {
    assert.equal(
        isProviderOutage(new Error('Invalid base64 image data: base64 string is null')),
        false,
    )
})
