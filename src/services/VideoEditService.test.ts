// src/services/VideoEditService.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTrimArgs } from './VideoEditService.ts'

/**
 * El bug que motivó estos tests: recortar un clip de 10s y guardar devolvía
 * 1 segundo. La causa no estaba en la UI sino en el comando: con `-c copy` el
 * corte solo cae en un keyframe, y un vídeo real de la galería tenía DOS en
 * diez segundos (0.00s y 8.33s). Pedir un trozo intermedio saltaba al de 8.33
 * y sobraba 1.67s de vídeo.
 */

const pos = (args: string[], flag: string) => args.indexOf(flag)

test('el seek va ANTES de la entrada: si no, recorrería el archivo entero', () => {
    const args = buildTrimArgs('in.mp4', 'out.mp4', 2, 7.8)
    assert.ok(pos(args, '-ss') < pos(args, '-i'), args.join(' '))
})

test('la duración viaja en -t y es la del trozo pedido, no un tiempo absoluto', () => {
    // Con el seek en la entrada, los tiempos de salida cuentan desde el corte:
    // un `-to 7.800` habría dejado 5.8s de material en 7.8 → recorte de más.
    const args = buildTrimArgs('in.mp4', 'out.mp4', 2, 7.8)
    assert.equal(args[pos(args, '-t') + 1], '5.800')
    assert.equal(pos(args, '-to'), -1, 'un -to absoluto recorta de más')
})

test('NUNCA copia el flujo: es lo que hacía imposible el corte exacto', () => {
    const args = buildTrimArgs('in.mp4', 'out.mp4', 1, 4)
    assert.equal(args.includes('copy'), false, args.join(' '))
    assert.ok(args.includes('libx264'))
    assert.ok(args.includes('aac'), 'sin audio re-encodeado el concat luego falla')
})

test('un corte que empieza en 0 sigue pidiendo su duración completa', () => {
    const args = buildTrimArgs('in.mp4', 'out.mp4', 0, 5.8)
    assert.equal(args[pos(args, '-ss') + 1], '0.000')
    assert.equal(args[pos(args, '-t') + 1], '5.800')
})

test('el caso medido: 10s con keyframes en 0 y 8.33 se corta donde se pide', () => {
    // Antes: el corte saltaba al keyframe de 8.33 y devolvía 1.67s.
    const args = buildTrimArgs('in.mp4', 'out.mp4', 2.5, 8.3)
    assert.equal(args[pos(args, '-ss') + 1], '2.500')
    assert.equal(args[pos(args, '-t') + 1], '5.800')
})

test('la salida es el último argumento, como espera ffmpeg', () => {
    const args = buildTrimArgs('in.mp4', 'salida.mp4', 0, 1)
    assert.equal(args[args.length - 1], 'salida.mp4')
})
