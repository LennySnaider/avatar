// src/services/kie/shared.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasNudityIntent } from './shared.ts'

/**
 * `hasNudityIntent` decide si la cláusula del Clone Ref le dice al motor
 * "Keep her FULLY dressed" o "IGNORE its clothing — follow the nudity described
 * in the scene below". Un falso positivo NO es cosmético: le ordena desvestir
 * una escena que describe ropa, y un motor literal resuelve la contradicción
 * pintando la ropa con los pezones marcados encima.
 *
 * Caso real (2026-08-19, task a9bfc27a…, Seedream 5 Pro, 🌶️ APAGADO): la escena
 * decía "off-shoulder top with a semi-sheer bodice ... ruched faux leather
 * shorts" y el prompt que recibió KIE llevaba la orden de desnudo.
 */
test('prendas: tejido transparente NO es intención de desnudo', () => {
    const prendas = [
        'a dark brown off-shoulder top with a semi-sheer bodice and satin texture',
        'a white fitted top with a sheer, mesh panel across the upper chest',
        'a black midi dress with see-through lace sleeves',
        'sheer black tights and ankle boots',
    ]
    for (const p of prendas) {
        assert.equal(hasNudityIntent(p), false, `falso positivo en: ${p}`)
    }
})

test('el arnés propio no se autodispara', () => {
    // Estas frases las escribe la app, no el usuario: si una de ellas dispara
    // el intent, TODA generación que la lleve pide desnudo.
    assert.equal(hasNudityIntent('LEG SHAPE (explicit): long toned legs'), false)
    assert.equal(
        hasNudityIntent(
            'The FRAMING stated in the scene text is MANDATORY — crop exactly as it says',
        ),
        false,
    )
})

test('desnudez real SÍ se detecta', () => {
    const desnudos = [
        'she is completely nude, standing by the window',
        'a naked woman lying on white sheets',
        'standing topless on the balcony',
        'her bare breasts visible, bottoms on',
        'she is undressed, sitting on the bed',
    ]
    for (const p of desnudos) {
        assert.equal(hasNudityIntent(p), true, `no detectado: ${p}`)
    }
})
