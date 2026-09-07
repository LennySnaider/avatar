import test from 'node:test'
import assert from 'node:assert/strict'
import {
    MAX_DISPLAY_NAME_LENGTH,
    checkDisplayName,
    normalizeDisplayName,
} from './profileName'

/**
 * Prueba de la regla del nombre visible. NO toca la base de datos: la
 * validacion es pura, asi que todo lo que hay que demostrar (que lo vacio se
 * rechaza, que lo largo se rechaza, que lo que pasa sale normalizado) se
 * demuestra en memoria. Correrla contra la base sólo añadiria el riesgo de
 * renombrar a alguien de verdad sin aportar ninguna certeza extra — el usuario
 * real de este proyecto se llama "Lenny Snaiderman" y aqui no se toca.
 */

test('normalizeDisplayName recorta y colapsa espacios', () => {
    assert.equal(normalizeDisplayName('  Lenny  '), 'Lenny')
    assert.equal(normalizeDisplayName('Lenny   Snaiderman'), 'Lenny Snaiderman')
    // Tabulador y salto de linea NO se borran: se colapsan a un espacio. Si se
    // borraran, pegar un nombre desde un documento juntaria las palabras.
    assert.equal(
        normalizeDisplayName('\tLenny\nSnaiderman '),
        'Lenny Snaiderman',
    )
    // El espacio duro (nbsp) tambien entra en \s.
    assert.equal(
        normalizeDisplayName('Lenny\u00A0Snaiderman'),
        'Lenny Snaiderman',
    )
})

test('normalizeDisplayName quita caracteres de control invisibles', () => {
    // El NUL y el BEL no se ven en el input pero si se guardan y se pintan en
    // la cabecera. Un nombre no puede llevarlos.
    assert.equal(normalizeDisplayName('Len\u0000ny'), 'Lenny')
    assert.equal(normalizeDisplayName('Lenny\u0007'), 'Lenny')
    // Borrar el invisible no debe dejar un doble espacio detras.
    assert.equal(normalizeDisplayName('a \u0000 b'), 'a b')
})

test('checkDisplayName rechaza lo vacio y lo que solo son espacios', () => {
    for (const input of ['', '   ', '\t\n', '\u0000 \u0007']) {
        const result = checkDisplayName(input)
        assert.equal(result.ok, false)
        assert.equal(
            result.ok === false && result.message,
            'Please enter your name.',
        )
    }
})

test('checkDisplayName rechaza lo que no es una cadena', () => {
    // El llamador real es una server action: sus argumentos los pone quien
    // llama, no el formulario.
    for (const input of [undefined, null, 42, {}, ['Lenny']]) {
        assert.equal(checkDisplayName(input).ok, false)
    }
})

test('checkDisplayName aplica el tope de longitud sobre el valor YA normalizado', () => {
    const justo = 'a'.repeat(MAX_DISPLAY_NAME_LENGTH)
    const pasado = 'a'.repeat(MAX_DISPLAY_NAME_LENGTH + 1)

    assert.equal(checkDisplayName(justo).ok, true)
    assert.equal(checkDisplayName(pasado).ok, false)

    // Los espacios de sobra NO cuentan para el tope: se van antes de medir. Si
    // se midiera lo tecleado, pegar un nombre con espacios finales daria un
    // rechazo que el usuario no puede explicarse.
    assert.equal(checkDisplayName(`   ${justo}   `).ok, true)
})

test('checkDisplayName devuelve el valor exacto que hay que guardar', () => {
    const result = checkDisplayName('  Lenny   Snaiderman  ')
    assert.equal(result.ok, true)
    assert.equal(result.ok === true && result.value, 'Lenny Snaiderman')
})
