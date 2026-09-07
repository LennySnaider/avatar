import test from 'node:test'
import assert from 'node:assert/strict'
import {
    CLOCK_SKEW_TOLERANCE_MS,
    REVOCATION_CACHE_TTL_MS,
    isSessionRevoked,
    toEpochMs,
} from './sessionRevocation'

/**
 * Prueba de la regla que expulsa a las sesiones anteriores a un cambio de
 * contrasena. NO toca la base: la regla es una comparacion de dos instantes, y
 * la lectura de la columna vive aparte (passwordChangedAt.ts) precisamente para
 * que esto se pueda demostrar en memoria.
 *
 * Lo que se demuestra aqui es lo unico que puede salir mal en una comparacion de
 * fechas, que son siempre las mismas tres cosas: el SIGNO (expulsar al reves,
 * echando al que acaba de entrar y dejando dentro al intruso), la ZONA HORARIA
 * (comerse el huso al parsear y desplazar el instante horas enteras) y el caso
 * VACIO (tratar "todavia no hay marca" como motivo para revocar, que al aplicar
 * la migracion echaria a todos los usuarios conectados).
 */

const T = Date.parse('2026-09-06T12:00:00.000Z')

test('sin marca de cambio no se revoca nada', () => {
    // Es el estado de TODAS las filas justo despues de aplicar la migracion.
    // Si esto devolviera true, desplegar la columna cerraria la sesion de todo
    // el mundo — incluido el usuario real, que esta usando la app.
    for (const marca of [null, undefined, '', '   ']) {
        assert.equal(
            isSessionRevoked({
                sessionStartedAt: T,
                passwordChangedAt: marca,
            }),
            false,
        )
    }
})

test('un token sin el claim sessionStartedAt no se revoca', () => {
    // Los tokens emitidos ANTES de este cambio no llevan el claim. No se puede
    // saber si empezaron antes o despues del cambio; se dejan pasar y caducan
    // solos. Revocarlos habria expulsado a todo el mundo en el despliegue.
    for (const inicio of [undefined, null, '', 0, NaN, -1, 'ayer', {}, []]) {
        assert.equal(
            isSessionRevoked({
                sessionStartedAt: inicio,
                passwordChangedAt: new Date(T).toISOString(),
            }),
            false,
        )
    }
})

test('la sesion anterior al cambio SI se revoca (el signo, en la direccion buena)', () => {
    // El intruso entro hace un dia; la victima acaba de cambiar la contrasena.
    const sesionDelIntruso = T - 24 * 60 * 60 * 1000
    assert.equal(
        isSessionRevoked({
            sessionStartedAt: sesionDelIntruso,
            passwordChangedAt: new Date(T).toISOString(),
        }),
        true,
    )
})

test('la sesion posterior al cambio NO se revoca (el signo, al reves)', () => {
    // La victima vuelve a entrar con la contrasena nueva. Si esto revocara,
    // quedaria fuera de su propia cuenta en bucle, con la clave correcta.
    const sesionNueva = T + 60 * 1000
    assert.equal(
        isSessionRevoked({
            sessionStartedAt: sesionNueva,
            passwordChangedAt: new Date(T).toISOString(),
        }),
        false,
    )
})

test('empatar al milisegundo no revoca', () => {
    assert.equal(
        isSessionRevoked({
            sessionStartedAt: T,
            passwordChangedAt: new Date(T).toISOString(),
        }),
        false,
    )
})

test('el margen de reloj se aplica a favor del token, y solo hasta su limite', () => {
    const marca = new Date(T).toISOString()

    // Justo dentro del margen: la sesion parece anterior por poco (relojes de
    // dos instancias distintas). No se revoca.
    assert.equal(
        isSessionRevoked({
            sessionStartedAt: T - (CLOCK_SKEW_TOLERANCE_MS - 1),
            passwordChangedAt: marca,
        }),
        false,
    )

    // Exactamente en el borde: sigue sin revocar (la comparacion es estricta).
    assert.equal(
        isSessionRevoked({
            sessionStartedAt: T - CLOCK_SKEW_TOLERANCE_MS,
            passwordChangedAt: marca,
        }),
        false,
    )

    // Un milisegundo mas alla del margen: se revoca. Si el margen se tragara
    // tambien esto, dejaria de haber invalidacion.
    assert.equal(
        isSessionRevoked({
            sessionStartedAt: T - CLOCK_SKEW_TOLERANCE_MS - 1,
            passwordChangedAt: marca,
        }),
        true,
    )
})

test('el margen NO alcanza al caso real: un intruso de hace un minuto se va fuera', () => {
    assert.ok(CLOCK_SKEW_TOLERANCE_MS < 60_000)
    assert.equal(
        isSessionRevoked({
            sessionStartedAt: T - 60_000,
            passwordChangedAt: new Date(T).toISOString(),
        }),
        true,
    )
})

test('toEpochMs respeta el huso horario del ISO-8601', () => {
    // ESTA es la prueba que importa de las fechas: el mismo instante escrito de
    // tres formas tiene que dar el MISMO numero. Cualquier parseo casero
    // (cortar por la "T", quedarse con los primeros 19 caracteres) se come el
    // "+02:00" y desplaza el instante DOS HORAS — suficiente para dejar dentro
    // al intruso o para echar al dueno de la cuenta.
    const enZulu = '2026-09-06T12:00:00.000Z'
    const enMadrid = '2026-09-06T14:00:00.000+02:00'
    const enMexico = '2026-09-06T06:00:00.000-06:00'

    assert.equal(toEpochMs(enZulu), T)
    assert.equal(toEpochMs(enMadrid), T)
    assert.equal(toEpochMs(enMexico), T)
})

test('un cambio escrito en otro huso revoca igual que en Zulu', () => {
    const sesionAnterior = T - 60 * 60 * 1000
    // Misma decision con la marca escrita en hora de Madrid que en Zulu.
    assert.equal(
        isSessionRevoked({
            sessionStartedAt: sesionAnterior,
            passwordChangedAt: '2026-09-06T14:00:00.000+02:00',
        }),
        true,
    )
    // Y la sesion posterior sigue sin revocarse con el mismo formato.
    assert.equal(
        isSessionRevoked({
            sessionStartedAt: T + 60 * 60 * 1000,
            passwordChangedAt: '2026-09-06T14:00:00.000+02:00',
        }),
        false,
    )
})

test('toEpochMs acepta el formato que devuelve PostgREST para timestamptz', () => {
    // Supabase serializa `timestamptz` con microsegundos y offset explicito.
    assert.equal(toEpochMs('2026-09-06T12:00:00.000+00:00'), T)
    assert.equal(toEpochMs('2026-09-06T12:00:00+00:00'), T)
})

test('toEpochMs devuelve null para lo que no es un instante util', () => {
    for (const basura of [
        null,
        undefined,
        '',
        '   ',
        'not a date',
        '2026-13-45T99:99:99Z',
        NaN,
        Infinity,
        -Infinity,
        0,
        -1,
        {},
        [],
        true,
        new Date('nope'),
    ]) {
        assert.equal(toEpochMs(basura), null)
    }
})

test('toEpochMs acepta numeros y Date ya resueltos', () => {
    assert.equal(toEpochMs(T), T)
    assert.equal(toEpochMs(new Date(T)), T)
})

test('la ventana de cache mantiene la expulsion por debajo del minuto', () => {
    // El criterio que se pidio: efectiva en menos de un minuto. Esta asercion
    // existe para que subir la ventana "un poco" rompa una prueba en vez de
    // romper la promesa en silencio.
    assert.ok(REVOCATION_CACHE_TTL_MS < 60_000)
})
