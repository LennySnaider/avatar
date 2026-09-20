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
    // 86-91 ya no calla: Auto dice "proporcionada" (decisión 20-sep), y NO
    // "wide" ni "narrow" — eso es de los cm extremos o del chip.
    assert.match(getBodyDescriptors(m(90)), /hip width matching her shoulders seen from the front/)
    assert.doesNotMatch(getBodyDescriptors(m(90)), /wide hip|narrow hip/)
})

test('un nivel explícito sustituye a los rangos de cm, no se suma a ellos', async () => {
    const { getBodyDescriptors, HIP_WIDTH_PHRASE } = await import('./bodyDescriptors.ts')
    const base = { age: 24, height: 168, bodyType: 'hourglass', bust: 90, waist: 60 }
    // 105 cm en Auto dice "generous hip width"; a nivel 2, no.
    const d = getBodyDescriptors({ ...base, hips: 105, hipWidth: 2 } as never)
    assert.ok(d.includes(HIP_WIDTH_PHRASE[2]))
    assert.doesNotMatch(d, /generous hip width|wide lower frame/)
    // Y 80 cm a nivel 5 no dice "narrow".
    const w = getBodyDescriptors({ ...base, hips: 80, hipWidth: 5 } as never)
    assert.ok(w.includes(HIP_WIDTH_PHRASE[5]))
    assert.doesNotMatch(w, /narrow hip width|slim lower frame/)
})

test('los seis niveles hablan de la vista FRONTAL y los estrechos mandan el volumen atrás', async () => {
    const { HIP_WIDTH_PHRASE, HIP_WIDTH_LABEL } = await import('./bodyDescriptors.ts')
    assert.deepEqual(Object.keys(HIP_WIDTH_PHRASE), ['1', '2', '3', '4', '5', '6'])
    assert.deepEqual(Object.keys(HIP_WIDTH_LABEL), ['1', '2', '3', '4', '5', '6'])
    for (const n of [1, 2, 3, 4, 5, 6]) assert.match(HIP_WIDTH_PHRASE[n], /seen from the front/)
    // 1-3 conviven con un glúteo grande diciendo que el volumen va ATRÁS —
    // medido: es lo único que frena el relleno del frente con glúteo 5.
    for (const n of [1, 2, 3]) assert.match(HIP_WIDTH_PHRASE[n], /BACKWARD/)
    // 1-2 fijan también la vista TRASERA: el glúteo va en profundidad, no a los lados.
    for (const n of [1, 2]) assert.match(HIP_WIDTH_PHRASE[n], /from behind/)
    // 3 es "como los hombros", ni más ni menos.
    assert.match(HIP_WIDTH_PHRASE[3], /no wider than her shoulders/)
})

test('las etiquetas viejas de los chips siguen entendiéndose', async () => {
    // Vivieron unas horas el 20-sep; un avatar guardado con ellas no se pierde.
    const { hipWidthLevel } = await import('./bodyDescriptors.ts')
    assert.equal(hipWidthLevel({ hipWidth: 'narrow' } as never), 2)
    assert.equal(hipWidthLevel({ hipWidth: 'normal' } as never), 3)
    assert.equal(hipWidthLevel({ hipWidth: 'wide' } as never), 5)
    assert.equal(hipWidthLevel({ hipWidth: 4 } as never), 4)
    assert.equal(hipWidthLevel({ hipWidth: 9 } as never), undefined)
    assert.equal(hipWidthLevel({} as never), undefined)
})

test('los cuatro ejes convergen en el prompt de la hoja sin contradecirse', async () => {
    const { buildTurnaroundRefinePrompt } = await import('./bodySheetPrompt.ts')
    const m = { age: 24, height: 168, bodyType: 'hourglass', bust: 90, waist: 60, hips: 90,
        glutesLevel: 5, glutesShape: 'heart', hipWidth: 2 } as never
    const p = buildTurnaroundRefinePrompt(m, { nude: false })
    assert.match(p, /narrow hip width seen from the front/) // anchura (nivel 2)
    assert.match(p, /heart-shaped glutes/) // forma
    assert.match(p, /bubble/) // nivel 5 = proyección
    assert.match(p, /hips 90cm/) // perímetro
    assert.doesNotMatch(p, /with wide hips/) // y ninguna forma lo contradice
})

// ─────────────────────────────────────────────────────────────────────────────
// Cintura (20-sep-2026). Para 90/60/90 (ratio 0,667) viajaban 7 pistas de
// cintura y "cinched" tres veces desde tres sitios que no se conocen entre sí;
// un motor literal pintaba corsé. La intensidad la pone el RATIO; la silueta y
// el rango de cm no la repiten.
// ─────────────────────────────────────────────────────────────────────────────

test('90/60/90 es un reloj de arena NATURAL, no un corsé', async () => {
    const { describeBody } = await import('./bodyDescriptors.ts')
    const d = describeBody({ age: 24, height: 168, bodyType: 'average', bust: 89, waist: 60, hips: 90, shape: 'hourglass', glutesLevel: 5, glutesShape: 'heart' } as never)
    assert.equal((d.match(/cinched/gi) ?? []).length, 0, d)
    assert.match(d, /naturally defined waist/)
})

test('la intensidad de la cintura sigue al ratio, banda por banda', async () => {
    const { describeShapeAndBuild } = await import('./bodyDescriptors.ts')
    const con = (waist: number, hips: number) =>
        describeShapeAndBuild({ age: 24, height: 168, bodyType: 'average', bust: 89, waist, hips, shape: 'hourglass' } as never)
    assert.match(con(45, 85), /extremely small, dramatically cinched/) // 0.53
    assert.match(con(55, 95), /sharply cinched/) // 0.58
    assert.match(con(60, 90), /naturally defined waist/) // 0.667
    assert.doesNotMatch(con(60, 90), /sharply|cinched/)
    assert.match(con(70, 95), /clearly defined narrow waist/) // 0.74
})

test('el rango de cm no repite la intensidad que ya pone el ratio', async () => {
    const { getBodyDescriptors } = await import('./bodyDescriptors.ts')
    const d = getBodyDescriptors({ age: 24, height: 168, bodyType: 'average', bust: 89, waist: 60, hips: 90 } as never)
    assert.doesNotMatch(d, /cinched/)
    assert.match(d, /defined waistline/)
    // La cintura EXTREMA por cm (≤50) sigue diciendo lo suyo: ese caso es a
    // propósito exagerado.
    assert.match(getBodyDescriptors({ age: 24, height: 168, bodyType: 'average', bust: 89, waist: 48, hips: 100 } as never), /wasp/)
})

// ─────────────────────────────────────────────────────────────────────────────
// Glúteo 6 + cadera estrecha (20-sep-2026). Principio del usuario: el glúteo
// dice CUÁNTO; nunca hacia los lados. Con 6/6 la hoja entra en modo XXL y un
// texto fijo ordenaba "MASSIVE glutes dominating the frame" por detrás, que le
// ganaba al eje de anchura; y su vista frontal imponía "dramatically cinched"
// aunque la cintura fuera normal.
// ─────────────────────────────────────────────────────────────────────────────

test('con glúteo 6 y cadera moderada, la vista trasera de la hoja mantiene la cadera estrecha', async () => {
    const { buildTurnaroundRefinePrompt } = await import('./bodySheetPrompt.ts')
    const p = buildTurnaroundRefinePrompt({ age: 24, height: 173, bodyType: 'average', bust: 89, waist: 60, hips: 90, shape: 'hourglass', glutesLevel: 6, glutesShape: 'round', hipWidth: 1 } as never, { nude: false })
    assert.doesNotMatch(p, /dominating the frame/)
    assert.match(p, /as narrow as in the front view/)
    assert.match(p, /do not spread sideways/)
    // Y el glúteo 6 ya no dicta la cintura: eso lo hace el ratio.
    assert.doesNotMatch(p, /dramatically cinched waist/)
})

test('la frase del nivel 6 fija la cadera por delante Y por detrás', async () => {
    const { glutesLevelPhrase } = await import('./bodyDescriptors.ts')
    const f = glutesLevelPhrase({ age: 24, height: 173, bodyType: 'average', bust: 89, waist: 60, hips: 90, glutesLevel: 6 } as never)
    assert.match(f, /MASSIVE/) // sigue siendo enorme
    assert.match(f, /from the front AND from behind/)
    assert.match(f, /not sideways spread/)
})

test('el XXL por CADERA real (>=130) no cambia: ahí la anchura sí viene de los cm', async () => {
    const { buildTurnaroundRefinePrompt } = await import('./bodySheetPrompt.ts')
    const p = buildTurnaroundRefinePrompt({ age: 24, height: 173, bodyType: 'average', bust: 100, waist: 70, hips: 135, shape: 'pear', glutesLevel: 6 } as never, { nude: false })
    assert.match(p, /hips flare dramatically wider than her shoulders/)
})
