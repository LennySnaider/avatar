// src/lib/billing/period.test.ts
import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import {
    previousPeriodUtc,
    unitDaysInPeriod,
    periodBounds,
    isUnitActivityValid,
    type UnitActivity,
} from './period.ts'

test('una unidad activa todo el mes cobra los dias del mes (septiembre: 30)', () => {
    const activity: UnitActivity = { activeFrom: '2026-09-01T00:00:00.000Z', activeUntil: null }
    assert.equal(unitDaysInPeriod(activity, '2026-09'), 30)
})

test('una unidad conectada el 28 de septiembre y todavia activa da 3 dias', () => {
    const activity: UnitActivity = { activeFrom: '2026-09-28T00:00:00.000Z', activeUntil: null }
    assert.equal(unitDaysInPeriod(activity, '2026-09'), 3) // 28, 29, 30
})

test('una unidad desconectada antes de que empiece el mes da 0', () => {
    const activity: UnitActivity = {
        activeFrom: '2026-08-01T00:00:00.000Z',
        activeUntil: '2026-08-15T00:00:00.000Z',
    }
    assert.equal(unitDaysInPeriod(activity, '2026-09'), 0)
})

test('una unidad conectada despues de que acabe el mes da 0', () => {
    const activity: UnitActivity = { activeFrom: '2026-10-01T00:00:00.000Z', activeUntil: null }
    assert.equal(unitDaysInPeriod(activity, '2026-09'), 0)
})

test('conectarse a las 23:50 cuenta ese dia entero (dia tocado, no horas)', () => {
    const activity: UnitActivity = { activeFrom: '2026-09-28T23:50:00.000Z', activeUntil: null }
    // Mismo resultado que conectarse a medianoche del mismo dia: la hora no
    // debe cambiar el cobro, solo el dia natural tocado.
    assert.equal(unitDaysInPeriod(activity, '2026-09'), 3)
})

test('una unidad que abarca mas que el mes queda topada en los dias del mes', () => {
    const activity: UnitActivity = {
        activeFrom: '2026-01-01T00:00:00.000Z',
        activeUntil: '2026-12-31T00:00:00.000Z',
    }
    assert.equal(unitDaysInPeriod(activity, '2026-09'), 30)
})

test('previousPeriodUtc en enero devuelve diciembre del año anterior', () => {
    const fixedNow = Date.parse('2027-01-15T12:00:00.000Z')
    mock.timers.enable({ apis: ['Date'], now: fixedNow })
    try {
        assert.equal(previousPeriodUtc(), '2026-12')
    } finally {
        mock.timers.reset()
    }
})

test('el paso de diciembre a enero no desplaza ni un dia', () => {
    // Diciembre tiene 31 dias: activa desde antes y sigue activa al cerrar el
    // año -> tiene que dar 31, ni 30 (redondeo corto) ni 32 (fuga a enero).
    const activeThroughTurn: UnitActivity = { activeFrom: '2026-11-15T00:00:00.000Z', activeUntil: null }
    assert.equal(unitDaysInPeriod(activeThroughTurn, '2026-12'), 31)
    // Mirada desde enero, esa misma unidad no debe robarle ni prestarle un
    // dia a diciembre: enero cuenta solo lo suyo.
    assert.equal(unitDaysInPeriod(activeThroughTurn, '2027-01'), 31)

    // Conectarse justo al filo (1 de enero 00:00) no debe sumar nada a
    // diciembre del año que cierra.
    const startsRightAtTurn: UnitActivity = { activeFrom: '2027-01-01T00:00:00.000Z', activeUntil: null }
    assert.equal(unitDaysInPeriod(startsRightAtTurn, '2026-12'), 0)
    assert.equal(unitDaysInPeriod(startsRightAtTurn, '2027-01'), 31)
})

test('febrero de año bisiesto tiene 29 dias, uno normal 28', () => {
    const active: UnitActivity = { activeFrom: '2028-02-01T00:00:00.000Z', activeUntil: null }
    assert.equal(unitDaysInPeriod(active, '2028-02'), 29) // 2028 es bisiesto

    const activeNormal: UnitActivity = { activeFrom: '2026-02-01T00:00:00.000Z', activeUntil: null }
    assert.equal(unitDaysInPeriod(activeNormal, '2026-02'), 28) // 2026 no lo es
})

test('activeFrom no interpretable da 0 dias (dato roto, no "sin actividad")', () => {
    const activity: UnitActivity = { activeFrom: 'esto-no-es-una-fecha', activeUntil: null }
    assert.equal(unitDaysInPeriod(activity, '2026-09'), 0)
})

test('activeUntil no interpretable da 0 dias: ya NO cuenta como "activa hasta el cierre"', () => {
    // Antes de este arreglo, un activeUntil roto caia en la misma rama que
    // null y devolvia el mes entero (30) -- cobro de MAS por un dato basura.
    // Es exactamente la asimetria que este test existe para que no vuelva.
    const activity: UnitActivity = {
        activeFrom: '2026-09-01T00:00:00.000Z',
        activeUntil: 'esto-tampoco-es-una-fecha',
    }
    assert.equal(unitDaysInPeriod(activity, '2026-09'), 0)
})

test('fechas invertidas o iguales (fin no posterior al inicio) dan 0 dias', () => {
    const invertida: UnitActivity = {
        activeFrom: '2026-09-20T00:00:00.000Z',
        activeUntil: '2026-09-10T00:00:00.000Z',
    }
    assert.equal(unitDaysInPeriod(invertida, '2026-09'), 0)

    const iguales: UnitActivity = {
        activeFrom: '2026-09-10T00:00:00.000Z',
        activeUntil: '2026-09-10T00:00:00.000Z',
    }
    assert.equal(unitDaysInPeriod(iguales, '2026-09'), 0)
})

test('isUnitActivityValid acepta los dos casos validos y rechaza los tres rotos', () => {
    // Validos: sigue activa (activeUntil null), y ventana cerrada normal.
    assert.equal(isUnitActivityValid({ activeFrom: '2026-09-01T00:00:00.000Z', activeUntil: null }), true)
    assert.equal(
        isUnitActivityValid({ activeFrom: '2026-09-01T00:00:00.000Z', activeUntil: '2026-09-10T00:00:00.000Z' }),
        true,
    )

    // Rotos: activeFrom ilegible, activeUntil ilegible, fin <= inicio.
    assert.equal(isUnitActivityValid({ activeFrom: 'basura', activeUntil: null }), false)
    assert.equal(isUnitActivityValid({ activeFrom: '2026-09-01T00:00:00.000Z', activeUntil: 'basura' }), false)
    assert.equal(
        isUnitActivityValid({
            activeFrom: '2026-09-10T00:00:00.000Z',
            activeUntil: '2026-09-10T00:00:00.000Z',
        }),
        false,
    )
})

test('periodBounds lanza con un mes fuera de rango', () => {
    assert.throws(() => periodBounds('2026-13'), /período inválido/)
    assert.throws(() => periodBounds('2026-00'), /período inválido/)
})

test('periodBounds lanza con una cadena mal formada', () => {
    assert.throws(() => periodBounds('esto-no-es-un-periodo'), /período inválido/)
    assert.throws(() => periodBounds('2026-9'), /período inválido/) // sin cero a la izquierda
    assert.throws(() => periodBounds(''), /período inválido/)
})
