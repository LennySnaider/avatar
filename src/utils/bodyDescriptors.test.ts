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

// ─────────────────────────────────────────────────────────────────────────────
// Eje de ANCHURA FRONTAL (20-sep-2026). Los cm de cadera son perímetro e
// incluyen los glúteos: no fijan lo ancha que se ve de frente. Auto = derivar de
// los cm como siempre; fijarlo manda sobre los rangos de cm.
// ─────────────────────────────────────────────────────────────────────────────

test('Auto conserva exactamente las frases de anchura por rangos de cm', async () => {
    const { getBodyDescriptors } = await import('./bodyDescriptors.ts')
    const m = (hips: number) =>
        ({ age: 24, height: 168, bodyType: 'hourglass', bust: 90, waist: 60, hips }) as never
    assert.match(getBodyDescriptors(m(105)), /generous hip width/)
    assert.match(getBodyDescriptors(m(80)), /narrow hip width/)
    assert.match(getBodyDescriptors(m(95)), /proportionate hips/)
    // El hueco 86-91 sigue sin frase de anchura en Auto: no se inventa nada.
    assert.doesNotMatch(getBodyDescriptors(m(90)), /hip width|wide|narrow hips/)
})

test('un eje explícito sustituye a los rangos de cm, no se suma a ellos', async () => {
    const { getBodyDescriptors, HIP_WIDTH_PHRASE } = await import('./bodyDescriptors.ts')
    const base = { age: 24, height: 168, bodyType: 'hourglass', bust: 90, waist: 60 }
    // 105 cm en Auto dice "generous hip width"; con 'narrow' explícito, no.
    const d = getBodyDescriptors({ ...base, hips: 105, hipWidth: 'narrow' } as never)
    assert.ok(d.includes(HIP_WIDTH_PHRASE.narrow))
    assert.doesNotMatch(d, /generous hip width|wide lower frame/)
    // Y 80 cm con 'wide' no dice "narrow".
    const w = getBodyDescriptors({ ...base, hips: 80, hipWidth: 'wide' } as never)
    assert.ok(w.includes(HIP_WIDTH_PHRASE.wide))
    assert.doesNotMatch(w, /narrow hip width|slim lower frame/)
})

test('las tres frases hablan de la vista FRONTAL y no pelean con la proyección', async () => {
    const { HIP_WIDTH_PHRASE, HIP_WIDTHS } = await import('./bodyDescriptors.ts')
    assert.deepEqual([...HIP_WIDTHS], Object.keys(HIP_WIDTH_PHRASE))
    for (const w of HIP_WIDTHS) assert.match(HIP_WIDTH_PHRASE[w], /seen from the front/)
    // 'estrecha' con glúteo alto es el caso del reporte: el volumen va ATRÁS.
    assert.match(HIP_WIDTH_PHRASE.narrow, /BACKWARD/)
})

test('los cuatro ejes convergen en el prompt de la hoja sin contradecirse', async () => {
    // La forma del glúteo NO viaja en describeBody (la compone la hoja vía
    // buildBodySheetCurves); el sitio donde se juntan todos los ejes es el
    // prompt de la hoja, y ahí es donde tiene que leerse coherente.
    const { buildTurnaroundRefinePrompt } = await import('./bodySheetPrompt.ts')
    const m = { age: 24, height: 168, bodyType: 'hourglass', bust: 90, waist: 60, hips: 90,
        glutesLevel: 5, glutesShape: 'heart', hipWidth: 'narrow' } as never
    const p = buildTurnaroundRefinePrompt(m, { nude: false })
    assert.match(p, /narrow hip width seen from the front/) // anchura (eje nuevo)
    assert.match(p, /heart-shaped glutes/) // forma
    assert.match(p, /bubble/) // nivel 5 = proyección
    assert.match(p, /hips 90cm/) // perímetro
    assert.doesNotMatch(p, /with wide hips/) // y ninguna forma lo contradice
})
