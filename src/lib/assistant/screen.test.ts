// src/lib/assistant/screen.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { screenFromPathname } from './screen.ts'

test('las rutas reales de la app se mapean a su pantalla', () => {
    assert.equal(screenFromPathname('/concepts/avatar-forge/inbox'), 'inbox')
    assert.equal(
        screenFromPathname('/concepts/avatar-forge/social/accounts'),
        'social-accounts',
    )
    assert.equal(
        screenFromPathname('/concepts/avatar-forge/social/posts'),
        'social-posts',
    )
    assert.equal(
        screenFromPathname('/concepts/avatar-forge/avatar-studio'),
        'studio',
    )
    assert.equal(screenFromPathname('/account/modules'), 'modules')
})

test('cualquier otra ruta cae en "other", nunca en undefined', () => {
    assert.equal(screenFromPathname('/dashboards/ecommerce'), 'other')
    assert.equal(screenFromPathname('/'), 'other')
    assert.equal(screenFromPathname('/concepts/avatar-forge'), 'other')
})

test('sin ruta (null, undefined, vacío) también es "other"', () => {
    assert.equal(screenFromPathname(null), 'other')
    assert.equal(screenFromPathname(undefined), 'other')
    assert.equal(screenFromPathname(''), 'other')
})

test('la barra final y las subrutas no cambian la pantalla', () => {
    assert.equal(
        screenFromPathname('/concepts/avatar-forge/social/accounts/'),
        'social-accounts',
    )
    assert.equal(
        screenFromPathname('/concepts/avatar-forge/social/posts/abc-123'),
        'social-posts',
    )
})

test('mayúsculas, query y hash no despistan', () => {
    assert.equal(
        screenFromPathname('/Concepts/Avatar-Forge/Social/Accounts'),
        'social-accounts',
    )
    assert.equal(
        screenFromPathname('/concepts/avatar-forge/inbox?chat=7#top'),
        'inbox',
    )
})

test('el orden de las reglas no deja que "/social" se coma a sus hijas', () => {
    // Si `/social/posts` se comprobara después de una regla genérica de
    // social, esto devolvería la pantalla equivocada y el catálogo de
    // herramientas del turno sería el de otra pantalla.
    assert.notEqual(
        screenFromPathname('/concepts/avatar-forge/social/posts'),
        'social-accounts',
    )
})

test('un segmento que sólo EMPIEZA igual no cuenta', () => {
    // `/inbox-legacy` no es el inbox: se compara segmento completo.
    assert.equal(screenFromPathname('/concepts/inbox-legacy'), 'other')
})
