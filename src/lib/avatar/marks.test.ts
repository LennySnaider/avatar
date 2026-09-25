import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    MARK_ZONES,
    MARK_ZONE_IDS,
    buildMarksTag,
    findZone,
    markPhrase,
    zoneLabel,
    inkIntensityPhrase,
} from './marks.ts'

test('las zonas laterales llevan {side} y las centrales no', () => {
    for (const zone of MARK_ZONES) {
        assert.equal(
            zone.phrase.includes('{side}'),
            zone.lateral,
            `${zone.id}: lateral=${zone.lateral} pero la frase es "${zone.phrase}"`,
        )
    }
})

test('los ids son únicos', () => {
    assert.equal(new Set(MARK_ZONE_IDS).size, MARK_ZONE_IDS.length)
})

test('el lado se resuelve en la frase del prompt', () => {
    assert.equal(
        markPhrase({ zone: 'antebrazo_interior', side: 'right' }),
        'inner right forearm, the soft underside on the same face as the palm',
    )
    assert.equal(
        markPhrase({ zone: 'dorso_mano', side: 'right' }),
        'back of the right hand',
    )
    assert.equal(
        markPhrase({ zone: 'ingle', side: 'right' }),
        'right groin, bikini line',
    )
})

test('una zona central ignora el lado', () => {
    assert.equal(markPhrase({ zone: 'nuca', side: 'right' }), 'nape of the neck')
    assert.equal(markPhrase({ zone: 'lumbar', side: null }), 'lower back')
})

test('una zona lateral SIN lado sale sin lado, no se lo inventa', () => {
    // Un lado equivocado rompe la continuidad más que omitirlo.
    assert.equal(
        markPhrase({ zone: 'antebrazo_interior' }),
        'inner forearm, the soft underside on the same face as the palm',
    )
    assert.equal(markPhrase({ zone: 'hombro', side: null }), 'shoulder')
    assert.ok(!markPhrase({ zone: 'dorso_mano' }).includes('{side}'))
})

test('una zona desconocida no produce frase', () => {
    assert.equal(markPhrase({ zone: 'oreja_izquierda_interior' }), '')
    assert.equal(findZone('no_existe'), null)
})

test('la etiqueta de la UI concuerda en género y número', () => {
    assert.equal(
        zoneLabel({ zone: 'antebrazo_interior', side: 'right' }),
        'Antebrazo interior derecho',
    )
    assert.equal(zoneLabel({ zone: 'ingle', side: 'left' }), 'Ingle izquierda')
    assert.equal(zoneLabel({ zone: 'dorso_mano', side: 'right' }), 'Dorso de la mano derecha')
    assert.equal(zoneLabel({ zone: 'costillas', side: 'left' }), 'Costillas izquierdas')
    assert.equal(zoneLabel({ zone: 'dedos', side: 'right' }), 'Dedos derechos')
    assert.equal(zoneLabel({ zone: 'nuca', side: 'right' }), 'Nuca')
})

test('el tag reúne las marcas con sus cláusulas', () => {
    const tag = buildMarksTag([
        {
            zone: 'antebrazo_interior',
            side: 'right',
            content: 'peonía con hojas y capullo de rosa',
            inkStyle: 'negro y gris, línea fina',
            orientation: 'de la muñeca al codo',
        },
        {
            zone: 'ingle',
            side: 'right',
            content: 'rosa pequeña con tallo',
            inkStyle: 'trazo grueso',
        },
    ])
    assert.ok(tag.startsWith('[MARKS —'))
    assert.ok(tag.endsWith(']'))
    assert.ok(
        tag.includes(
            'inner right forearm, the soft underside on the same face as the palm — peonía con hojas y capullo de rosa',
        ),
    )
    assert.ok(tag.includes('right groin, bikini line — rosa pequeña con tallo'))
    // Las cláusulas que evitan los fallos conocidos.
    assert.ok(tag.includes('not clothing'))
    assert.ok(tag.includes('in frame and uncovered'))
    // La marca es obligatoria si su zona se ve: decirlo como permiso
    // ("solo si...") hacía que el modelo se saltara la mano medio tapada.
    assert.ok(tag.includes('MUST be drawn there'))
    assert.ok(tag.includes('do not move it to another part of the body'))
    // La zona manda sobre el texto libre: el análisis de la foto escribe
    // cosas como "casi todo el antebrazo exterior" y, corregida la zona,
    // ese texto viejo se peleaba con la frase — y ganaba.
    assert.ok(tag.includes('authoritative'))
})

test('sin marcas no hay tag', () => {
    assert.equal(buildMarksTag([]), '')
})

test('una marca de zona desconocida se cae del tag, no lo rompe', () => {
    const tag = buildMarksTag([
        { zone: 'inventada', content: 'algo' },
        { zone: 'nuca', content: 'estrella pequeña' },
    ])
    assert.ok(tag.includes('nape of the neck — estrella pequeña'))
    assert.ok(!tag.includes('algo'))
})

test('interior y exterior llevan ancla anatómica, no solo la palabra', () => {
    // "inner forearm" a secas el modelo se lo salta: la cara visible depende
    // de la pose. La frase tiene que apoyarse en algo que se vea en la imagen.
    for (const id of [
        'antebrazo_interior',
        'antebrazo_exterior',
        'brazo_interior',
        'brazo_exterior',
        'muslo_interior',
        'muslo_exterior',
    ]) {
        const zone = findZone(id)
        assert.ok(zone, id)
        assert.ok(
            zone.phrase.includes(','),
            `${id}: la frase no explica qué cara es: "${zone.phrase}"`,
        )
    }
})

test('la intensidad se traduce a un estado de la tinta, no a un porcentaje', () => {
    // Un modelo de imagen no sabe dibujar "al 40%", pero sí tinta gastada.
    assert.ok(inkIntensityPhrase(100).includes('fresh'))
    assert.ok(inkIntensityPhrase(40).includes('faded'))
    assert.ok(inkIntensityPhrase(10).includes('faint'))
    // Nunca devuelve vacío, ni con basura: el prompt del horneado la incrusta.
    for (const v of [0, 10, 55, 100, NaN]) {
        assert.ok(inkIntensityPhrase(v).length > 10, String(v))
        assert.ok(!inkIntensityPhrase(v).includes('%'))
    }
})
