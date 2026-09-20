import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
    MS_ANTES_DE_DARLA_POR_PERDIDA,
    avisarAlPublicar,
    chipParaGeneracion,
} from './presentation.ts'
import type { EstadoPersistido } from './types.ts'

const AHORA = Date.parse('2026-09-20T12:00:00.000Z')

function estado(cambios: Partial<EstadoPersistido> = {}): EstadoPersistido {
    return {
        rutaOriginal: 'org/o1/images/1.png',
        intentos: 0,
        registradaEn: new Date(AHORA).toISOString(),
        ...cambios,
    }
}

const informeLimpio = {
    estado: 'cleaned' as const,
    visibles: [
        { etiqueta: 'gemini', confianzaAntes: 0.97, confianzaDespues: 0.02, estado: 'removida' as const },
    ],
    metadatos: { encontrados: ['c2pa'], removidos: ['c2pa'], sobrevivientes: [] },
    backend: 'migan',
    versionMotor: '0.41.1',
    duracionMs: 2200,
    escribioSalida: true,
    escribioMiniatura: true,
}

describe('chipParaGeneracion', () => {
    it('sin estado no pinta nada (generaciones anteriores a la feature)', () => {
        assert.deepEqual(chipParaGeneracion('none', null, AHORA), { tipo: 'ninguno' })
        assert.deepEqual(chipParaGeneracion(null, null, AHORA), { tipo: 'ninguno' })
    })

    it('limpio enumera lo que se quitó', () => {
        const chip = chipParaGeneracion('cleaned', estado({ informe: informeLimpio }), AHORA)
        assert.deepEqual(chip, { tipo: 'limpio', removidas: ['gemini', 'c2pa'] })
    })

    it('parcial separa lo quitado de lo que sobrevivió', () => {
        const informe = {
            ...informeLimpio,
            estado: 'partial' as const,
            visibles: [
                { etiqueta: 'kling', confianzaAntes: 0.8, confianzaDespues: 0.7, estado: 'persiste' as const },
            ],
            metadatos: { encontrados: ['c2pa'], removidos: ['c2pa'], sobrevivientes: ['xmp'] },
        }
        const chip = chipParaGeneracion('partial', estado({ informe }), AHORA)
        assert.deepEqual(chip, {
            tipo: 'parcial',
            removidas: ['c2pa'],
            sobrevivientes: ['kling', 'xmp'],
        })
    })

    it('sin marcas es su propio estado, no un fallo', () => {
        assert.deepEqual(chipParaGeneracion('no_marks', estado(), AHORA), { tipo: 'sin_marcas' })
    })

    it('fallido lleva el motivo y es reintentable', () => {
        const chip = chipParaGeneracion('failed', estado({ error: 'timeout', intentos: 3 }), AHORA)
        assert.deepEqual(chip, { tipo: 'fallido', error: 'timeout', reintentable: true })
    })

    it('saltado informa el motivo concreto', () => {
        const chip = chipParaGeneracion('skipped', estado({ motivoSalto: 'ajuste_apagado' }), AHORA)
        assert.deepEqual(chip, { tipo: 'sin_modulo', motivo: 'ajuste_apagado' })
    })

    it('pendiente reciente se muestra como limpiando', () => {
        const recien = estado({ registradaEn: new Date(AHORA - 30_000).toISOString() })
        assert.deepEqual(chipParaGeneracion('pending', recien, AHORA), { tipo: 'limpiando' })
    })

    it('pendiente viejo se presenta como fallido reintentable, no como spinner eterno', () => {
        const viejo = estado({
            registradaEn: new Date(AHORA - MS_ANTES_DE_DARLA_POR_PERDIDA - 1000).toISOString(),
        })
        const chip = chipParaGeneracion('pending', viejo, AHORA)
        assert.equal(chip.tipo, 'fallido')
    })

    it('para una fila tomada cuenta desde que se tomó, no desde que nació', () => {
        const tomadaHaceNada = estado({
            registradaEn: new Date(AHORA - MS_ANTES_DE_DARLA_POR_PERDIDA - 60_000).toISOString(),
            tomadaEn: new Date(AHORA - 5_000).toISOString(),
        })
        assert.deepEqual(chipParaGeneracion('running', tomadaHaceNada, AHORA), { tipo: 'limpiando' })
    })

    it('una fecha ilegible no convierte la fila en fallida', () => {
        const rota = estado({ registradaEn: 'no-es-una-fecha' })
        assert.deepEqual(chipParaGeneracion('pending', rota, AHORA), { tipo: 'limpiando' })
    })
})

describe('avisarAlPublicar', () => {
    it('avisa cuando el archivo puede llevar marcas', () => {
        assert.equal(avisarAlPublicar({ tipo: 'fallido', error: 'x', reintentable: true }), true)
        assert.equal(avisarAlPublicar({ tipo: 'limpiando' }), true)
        assert.equal(avisarAlPublicar({ tipo: 'parcial', removidas: [], sobrevivientes: ['c2pa'] }), true)
    })

    it('no molesta cuando no hay nada que advertir', () => {
        assert.equal(avisarAlPublicar({ tipo: 'limpio', removidas: ['c2pa'] }), false)
        assert.equal(avisarAlPublicar({ tipo: 'sin_marcas' }), false)
        assert.equal(avisarAlPublicar({ tipo: 'ninguno' }), false)
        assert.equal(avisarAlPublicar({ tipo: 'sin_modulo', motivo: 'modulo_apagado' }), false)
    })
})
