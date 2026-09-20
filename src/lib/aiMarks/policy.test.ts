import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { decidirEstadoInicial, type EntradaDecision } from './policy.ts'
import { DEFAULT_AI_MARK_CLEANER_SETTINGS } from './settings.ts'

function entrada(cambios: Partial<EntradaDecision> = {}): EntradaDecision {
    return {
        mediaType: 'IMAGE',
        storagePath: 'org/o1/images/1726.png',
        storageProvider: 'r2',
        moduloInstalado: true,
        ajustes: { ...DEFAULT_AI_MARK_CLEANER_SETTINGS },
        ...cambios,
    }
}

describe('decidirEstadoInicial', () => {
    it('encola cuando todo está en su sitio', () => {
        assert.deepEqual(decidirEstadoInicial(entrada()), { estado: 'pending' })
    })

    it('salta si el módulo no está instalado', () => {
        assert.deepEqual(decidirEstadoInicial(entrada({ moduloInstalado: false })), {
            estado: 'skipped',
            motivo: 'modulo_apagado',
        })
    })

    it('el módulo apagado gana sobre cualquier otro motivo', () => {
        // El tenant merece el mensaje que explica de verdad lo que pasa.
        const decision = decidirEstadoInicial(
            entrada({ moduloInstalado: false, storagePath: 'org/o1/x.gif' }),
        )
        assert.deepEqual(decision, { estado: 'skipped', motivo: 'modulo_apagado' })
    })

    it('respeta el ajuste por tipo de medio', () => {
        const ajustes = { images: true, videos: false, references: true }
        assert.deepEqual(
            decidirEstadoInicial(
                entrada({ mediaType: 'VIDEO', storagePath: 'org/o1/videos/1.mp4', ajustes }),
            ),
            { estado: 'skipped', motivo: 'ajuste_apagado' },
        )
        assert.deepEqual(decidirEstadoInicial(entrada({ ajustes })), { estado: 'pending' })
    })

    it('salta lo que no está en R2', () => {
        for (const proveedor of ['supabase', null, '']) {
            assert.deepEqual(
                decidirEstadoInicial(entrada({ storageProvider: proveedor })),
                { estado: 'skipped', motivo: 'almacenamiento_no_r2' },
            )
        }
    })

    it('no vuelve a encolar un objeto ya limpio', () => {
        assert.deepEqual(
            decidirEstadoInicial(entrada({ storagePath: 'org/o1/images/1726.clean.png' })),
            { estado: 'skipped', motivo: 'ya_limpia' },
        )
    })

    it('salta los formatos que el motor no abre', () => {
        assert.deepEqual(
            decidirEstadoInicial(entrada({ storagePath: 'org/o1/images/1726.gif' })),
            { estado: 'skipped', motivo: 'formato_no_soportado' },
        )
    })

    it('acepta los formatos que sí abre, en imagen y en vídeo', () => {
        for (const ruta of ['a.png', 'a.jpg', 'a.jpeg', 'a.webp']) {
            assert.equal(decidirEstadoInicial(entrada({ storagePath: `org/o1/images/${ruta}` })).estado, 'pending', ruta)
        }
        assert.equal(
            decidirEstadoInicial(
                entrada({ mediaType: 'VIDEO', storagePath: 'org/o1/videos/a.mp4' }),
            ).estado,
            'pending',
        )
    })
})
