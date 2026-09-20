import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { claveDeCobro, cotizar, debeCobrar } from './billing.ts'
import type { InformeLimpieza } from './types.ts'

function informe(cambios: Partial<InformeLimpieza> = {}): InformeLimpieza {
    return {
        estado: 'cleaned',
        visibles: [],
        metadatos: { encontrados: [], removidos: [], sobrevivientes: [] },
        backend: 'migan',
        versionMotor: '0.41.1',
        duracionMs: 2200,
        escribioSalida: true,
        escribioMiniatura: true,
        ...cambios,
    }
}

const logoRemovido = {
    etiqueta: 'gemini',
    confianzaAntes: 0.9,
    confianzaDespues: 0.0,
    estado: 'removida' as const,
}

describe('debeCobrar', () => {
    it('cobra cuando se quitó un logo', () => {
        assert.equal(debeCobrar(informe({ visibles: [logoRemovido] })), true)
    })

    it('cobra cuando sólo se quitaron metadatos', () => {
        // Es el caso mayoritario medido: casi ninguna imagen trae logo, casi
        // todas traen C2PA.
        const meta = { encontrados: ['c2pa'], removidos: ['c2pa'], sobrevivientes: [] }
        assert.equal(debeCobrar(informe({ metadatos: meta })), true)
    })

    it('NO cobra cuando no había nada que quitar', () => {
        assert.equal(
            debeCobrar(informe({ estado: 'no_marks', escribioSalida: false })),
            false,
        )
    })

    it('NO cobra si no se escribió salida, aunque el estado diga otra cosa', () => {
        assert.equal(
            debeCobrar(informe({ estado: 'cleaned', escribioSalida: false, visibles: [logoRemovido] })),
            false,
        )
    })

    it('NO cobra un archivo rechazado (HDR y similares)', () => {
        assert.equal(
            debeCobrar(informe({ estado: 'rejected', escribioSalida: false })),
            false,
        )
    })

    it('cobra un parcial si de verdad quitó algo', () => {
        const parcial = informe({
            estado: 'partial',
            visibles: [logoRemovido],
            metadatos: { encontrados: ['c2pa'], removidos: [], sobrevivientes: ['c2pa'] },
        })
        assert.equal(debeCobrar(parcial), true)
    })

    it('NO cobra un parcial en el que no se quitó nada', () => {
        const persiste = {
            etiqueta: 'kling',
            confianzaAntes: 0.8,
            confianzaDespues: 0.8,
            estado: 'persiste' as const,
        }
        assert.equal(debeCobrar(informe({ estado: 'partial', visibles: [persiste] })), false)
    })
})

describe('cotizar', () => {
    it('una imagen cuesta lo mismo con o sin logo', () => {
        const conLogo = cotizar(informe({ visibles: [logoRemovido] }), 'IMAGE')
        const sinLogo = cotizar(informe(), 'IMAGE')
        assert.equal(conLogo.tokens, sinLogo.tokens)
    })

    it('un vídeo con relleno cuesta más que uno sin relleno', () => {
        const conRelleno = cotizar(informe({ visibles: [logoRemovido] }), 'VIDEO')
        const sinRelleno = cotizar(informe(), 'VIDEO')
        assert.ok(conRelleno.tokens > sinRelleno.tokens)
    })

    it('una marca que persiste no se cobra como relleno caro', () => {
        // No se rellenó nada útil: no se paga el precio del relleno.
        const persiste = {
            etiqueta: 'kling',
            confianzaAntes: 0.8,
            confianzaDespues: 0.8,
            estado: 'persiste' as const,
        }
        const q = cotizar(informe({ visibles: [persiste] }), 'VIDEO')
        assert.equal(q.tokens, cotizar(informe(), 'VIDEO').tokens)
    })
})

describe('claveDeCobro', () => {
    it('es estable por generación, para que el reintento no cobre dos veces', () => {
        assert.equal(claveDeCobro('abc-123'), 'ai_mark_clean:abc-123')
        assert.equal(claveDeCobro('abc-123'), claveDeCobro('abc-123'))
    })
})
