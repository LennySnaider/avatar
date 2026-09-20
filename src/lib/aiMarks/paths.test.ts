import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { esLimpiable, esRutaLimpia, rutaLimpia, rutaMiniatura } from './paths.ts'

describe('rutaLimpia', () => {
    it('inserta el sufijo antes de la extension', () => {
        assert.equal(
            rutaLimpia('org/o1/images/1726.png'),
            'org/o1/images/1726.clean.png',
        )
        assert.equal(
            rutaLimpia('org/o1/videos/1726.mp4'),
            'org/o1/videos/1726.clean.mp4',
        )
    })

    it('es idempotente: re-procesar no encadena sufijos', () => {
        const unaVez = rutaLimpia('org/o1/images/1726.png')
        assert.equal(rutaLimpia(unaVez), unaVez)
    })

    it('es determinista: dos llamadas dan la misma clave', () => {
        // De esto depende que un reintento sobrescriba en vez de dejar basura.
        assert.equal(
            rutaLimpia('org/o1/images/1726.png'),
            rutaLimpia('org/o1/images/1726.png'),
        )
    })

    it('mantiene la carpeta, que es lo que valida la pertenencia a la org', () => {
        const limpia = rutaLimpia('org/abc-123/images/1726.png')
        assert.ok(limpia.startsWith('org/abc-123/images/'))
    })

    it('tolera una ruta sin extension', () => {
        assert.equal(rutaLimpia('org/o1/images/1726'), 'org/o1/images/1726.clean')
    })

    it('no confunde un punto de la carpeta con la extension', () => {
        assert.equal(
            rutaLimpia('org/o.1/images/sin-extension'),
            'org/o.1/images/sin-extension.clean',
        )
    })
})

describe('esRutaLimpia', () => {
    it('distingue el objeto limpio del original', () => {
        assert.equal(esRutaLimpia('org/o1/images/1726.clean.png'), true)
        assert.equal(esRutaLimpia('org/o1/images/1726.png'), false)
    })

    it('no marca como limpio un nombre que solo contiene la palabra', () => {
        assert.equal(esRutaLimpia('org/o1/images/cleanup.png'), false)
    })
})

describe('esLimpiable', () => {
    it('acepta los formatos que el motor abre', () => {
        for (const ruta of ['a.png', 'a.jpg', 'a.jpeg', 'a.webp', 'a.mp4']) {
            assert.equal(esLimpiable(ruta), true, ruta)
        }
    })

    it('rechaza lo que el motor no abre', () => {
        for (const ruta of ['a.gif', 'a.mov', 'a.webm', 'a.mp3', 'a']) {
            assert.equal(esLimpiable(ruta), false, ruta)
        }
    })

    it('no distingue mayusculas', () => {
        assert.equal(esLimpiable('org/o1/images/FOTO.PNG'), true)
    })
})

describe('rutaMiniatura', () => {
    it('replica el formato del ticket de miniaturas existente', () => {
        assert.equal(
            rutaMiniatura('org/o1/images/1726.clean.png'),
            'thumbs/org/o1/images/1726.clean.png.jpg',
        )
    })
})
