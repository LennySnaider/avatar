// src/utils/bodyDescriptors.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GLUTES_SHAPE_PHRASE } from './bodyDescriptors.ts'

/**
 * Doctrina del Body Lab, escrita dos veces en el módulo y ahora afirmada aquí:
 * la ANCHURA de cadera la fijan los cm; el nivel de glúteo es PROYECCIÓN; la
 * forma es GEOMETRÍA. Una forma que afirme anchura por su cuenta contradice a
 * los cm y un motor literal obedece a la frase (reporte 20-sep-2026: cadera
 * 90 cm + Heart → caderas anchas en Qwen 3, porque 'heart' decía "wide hips").
 */

const AFIRMA_ANCHURA =
    /\b(wide|wider|widest|broad|slim|narrow)\s+(hips?|hip width)\b|\bwidest at the bottom\b|\bwith wide\b/i

test('ninguna forma de glúteo afirma anchura de cadera por su cuenta', () => {
    for (const [forma, frase] of Object.entries(GLUTES_SHAPE_PHRASE)) {
        assert.equal(
            AFIRMA_ANCHURA.test(frase),
            false,
            `'${forma}' afirma anchura: "${frase}"`,
        )
    }
})

test('las formas remiten la anchura a los cm medidos', () => {
    // Las tres que antes la contradecían la devuelven explícitamente a los cm,
    // con la misma frase que ya usan los niveles 4 y 6.
    for (const forma of ['heart', 'v-shape', 'a-shape']) {
        assert.match(GLUTES_SHAPE_PHRASE[forma], /hip width stays true to her measured hips/i)
    }
})

test('la forma sigue describiendo geometría, no tamaño', () => {
    // Regla del 1-ago ('round'): la forma no lleva tamaño escondido.
    for (const [forma, frase] of Object.entries(GLUTES_SHAPE_PHRASE)) {
        assert.equal(/\b(massive|huge|enormous|tiny|small)\b/i.test(frase), false, forma)
    }
})
