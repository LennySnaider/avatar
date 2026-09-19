// src/services/kie/motionPrompt.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripPromptHarness } from './motionPrompt.ts'

/**
 * INCIDENTE 2026-09-19 — "Wan 2.2 Sin Censura" devolvía 500 en TODA generación.
 *
 * Forense (tasks 85bb757a / d7a0570d, y repro A/B/C/D en vivo el mismo día):
 * `state:fail, failCode:500, failMsg:"Internal Error", costTime:15ms` — KIE lo
 * rechaza ANTES de tocar la GPU. El ledger lo confirma desde el 18-sep: cada
 * `video:kie-wan-2-2-uncensored` es hold→refund(provider_task_failed), CERO
 * settles. El modelo NO está caído: con un prompt limpio y el MISMO payload
 * devuelve MP4 (verificado en vivo).
 *
 * Causa raíz: el guardia que quita el arnés estructurado nació en julio-2026
 * contra `[BODY: …]` (dos puntos). Después el store pasó a emitir
 * `[BODY — … ]` (RAYA), y la regex dejó de casar EN SILENCIO. El bloque
 * sobrevivía, el corte a 800 chars lo partía por la mitad dejando un `[` sin
 * cerrar — y de paso se comía el texto de movimiento ENTERO, que en i2v es lo
 * único que importa (la identidad viaja en la imagen).
 *
 * Kling 3.0 motion-control ya había sufrido lo mismo y se arregló SOLO allí;
 * esta función es ese arreglo, compartido, para que no puedan volver a divergir.
 */

const CABECERA_BODY =
    "[BODY — the subject's EXACT and MANDATORY physique, proportions, weight and " +
    'body volume; this OVERRIDES any other body, physique, build, weight or ' +
    '"fit/toned/slim" description anywhere else in this prompt. Do NOT slim down, ' +
    'normalise, reduce, average or flatten her body — preserve these proportions ' +
    'and volume exactly: hourglass silhouette, extremely small dramatically ' +
    'cinched waist, long legs, athletic muscular legs (bust 86cm, waist 45cm, ' +
    'hips 95cm)]'
const MOVIMIENTO =
    'She turns slowly toward the camera and smiles, hair moving in the breeze'

test('EL BUG: el bloque [BODY — …] con RAYA se quita igual que con dos puntos', () => {
    const conRaya = `${CABECERA_BODY} ${MOVIMIENTO}`
    const salida = stripPromptHarness(conRaya, 800)

    assert.ok(
        !salida.includes('[BODY'),
        `el arnés con raya sobrevivió: ${salida.slice(0, 120)}`,
    )
    assert.ok(
        salida.includes('turns slowly toward the camera'),
        `se perdió el texto de MOVIMIENTO, que es lo único que lee un i2v: ${salida}`,
    )
})

test('el formato viejo con dos puntos sigue quitándose (no hay regresión)', () => {
    const salida = stripPromptHarness(
        `[BODY: hourglass silhouette, long legs] [FACE: oval face, green eyes] ${MOVIMIENTO}`,
        800,
    )
    assert.equal(salida, MOVIMIENTO)
})

test('el guion simple ([AUDIO CONSTRAINT - …]) también se quita', () => {
    const salida = stripPromptHarness(
        `[AUDIO CONSTRAINT - STRICTLY ENFORCE]: no background music. ${MOVIMIENTO}`,
        800,
    )
    assert.ok(!salida.includes('[AUDIO CONSTRAINT'), salida)
    assert.ok(salida.includes('turns slowly'), salida)
})

/**
 * La RED DE SEGURIDAD. Aunque mañana aparezca una etiqueta con un separador que
 * la regex no contemple, lo que NUNCA puede salir de aquí es un `[` sin cerrar:
 * ese corchete huérfano es exactamente lo que Wan 2.2 rechaza con 500.
 */
test('jamás deja un corchete abierto sin cerrar, pase lo que pase', () => {
    const exoticos = [
        `[BODY ~ separador raro: hourglass silhouette] ${MOVIMIENTO}`,
        `[BODY – en dash, no em dash: long legs] ${MOVIMIENTO}`,
        `${MOVIMIENTO} [COLA SIN CERRAR: esto no cierra nunca`,
    ]
    for (const p of exoticos) {
        const salida = stripPromptHarness(p, 800)
        assert.equal(
            (salida.match(/\[/g) ?? []).length,
            (salida.match(/\]/g) ?? []).length,
            `corchetes descuadrados en: ${salida}`,
        )
    }
})

test('el recorte no puede partir un bloque por la mitad', () => {
    // Cabecera de 400+ chars con un tope de 200: el corte cae DENTRO del bloque.
    const salida = stripPromptHarness(`${CABECERA_BODY} ${MOVIMIENTO}`, 200)
    assert.ok(!salida.includes('['), `quedó un bloque partido: ${salida}`)
})

test('un prompt sin arnés pasa intacto y respeta el tope', () => {
    assert.equal(stripPromptHarness(MOVIMIENTO, 800), MOVIMIENTO)
    assert.equal(stripPromptHarness('a'.repeat(900), 800).length, 800)
})

test('si el arnés era TODO el prompt, devuelve cadena vacía (el caller decide)', () => {
    assert.equal(stripPromptHarness(CABECERA_BODY, 800), '')
})
