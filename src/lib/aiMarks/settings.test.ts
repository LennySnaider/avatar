import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
    DEFAULT_AI_MARK_CLEANER_SETTINGS,
    aplicarParche,
    leerAjustes,
    limpiaEsteTipo,
} from './settings.ts'

describe('leerAjustes', () => {
    it('todo encendido por defecto', () => {
        assert.deepEqual(leerAjustes({}), {
            images: true,
            videos: true,
            references: true,
        })
    })

    it('respeta lo que el tenant apagó', () => {
        assert.deepEqual(leerAjustes({ videos: false }), {
            images: true,
            videos: false,
            references: true,
        })
    })

    it('un campo con basura no arrastra a los demás', () => {
        // Es la razón de leer campo a campo en vez de validar el objeto entero.
        const ajustes = leerAjustes({ images: 'no', videos: false, references: true })
        assert.equal(ajustes.images, true, 'el campo inválido cae a su default')
        assert.equal(ajustes.videos, false, 'el campo válido de al lado sobrevive')
    })

    it('tolera null, array y tipos que no son objeto', () => {
        for (const crudo of [null, undefined, [], 'texto', 42]) {
            assert.deepEqual(leerAjustes(crudo), DEFAULT_AI_MARK_CLEANER_SETTINGS)
        }
    })

    it('ignora claves desconocidas sin romperse', () => {
        const ajustes = leerAjustes({ images: false, synthid: true, futuro: 'x' })
        assert.deepEqual(ajustes, { images: false, videos: true, references: true })
    })

    it('no devuelve la misma referencia que el default', () => {
        const uno = leerAjustes(null)
        uno.images = false
        assert.equal(DEFAULT_AI_MARK_CLEANER_SETTINGS.images, true)
    })
})

describe('aplicarParche', () => {
    it('cambia sólo lo que trae el parche', () => {
        const antes = { images: true, videos: true, references: true }
        assert.deepEqual(aplicarParche(antes, { videos: false }), {
            images: true,
            videos: false,
            references: true,
        })
    })

    it('un cliente que no conoce un campo no lo borra', () => {
        const antes = { images: false, videos: true, references: false }
        assert.deepEqual(aplicarParche(antes, { videos: true }), antes)
    })

    it('ignora valores del parche con el tipo equivocado', () => {
        const antes = { images: true, videos: true, references: true }
        const despues = aplicarParche(antes, {
            images: 'false' as unknown as boolean,
        })
        assert.equal(despues.images, true)
    })

    it('no muta el objeto original', () => {
        const antes = { images: true, videos: true, references: true }
        aplicarParche(antes, { images: false })
        assert.equal(antes.images, true)
    })
})

describe('limpiaEsteTipo', () => {
    it('elige la casilla que corresponde al medio', () => {
        const ajustes = { images: true, videos: false, references: true }
        assert.equal(limpiaEsteTipo(ajustes, 'IMAGE'), true)
        assert.equal(limpiaEsteTipo(ajustes, 'VIDEO'), false)
    })
})
