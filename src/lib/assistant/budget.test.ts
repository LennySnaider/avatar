// src/lib/assistant/budget.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    DEFAULT_STRATEGIST_SETTINGS,
    budgetAllows,
    readStrategistSettings,
} from './budget.ts'

// Los defaults están en TOKENS DE MONEDERO (lo que el hold aparta del saldo),
// no en tokens del LLM: 200 por turno queda por encima del techo de 150
// (`tokensForCostUsd(ASSISTANT_TURN_CEILING_USD)`) y 2 500 al día son ~2,50
// USD a precio de cliente. Ver la cabecera de `budget.ts`.
test('los valores por defecto están en tokens de monedero y son los acordados', () => {
    assert.deepEqual(DEFAULT_STRATEGIST_SETTINGS, {
        dailyTokenCap: 2_500,
        perTurnTokenCap: 200,
        mode: 'approve',
    })
})

test('el tope por turno por defecto deja pasar el turno MCP medido (129) y el techo por defecto (150)', () => {
    assert.ok(DEFAULT_STRATEGIST_SETTINGS.perTurnTokenCap > 150)
    // Y el diario tiene que dar para más de un turno del tope: un tope diario
    // por debajo del de turno haría imposible gastar lo que se promete.
    assert.ok(
        DEFAULT_STRATEGIST_SETTINGS.dailyTokenCap >
            DEFAULT_STRATEGIST_SETTINGS.perTurnTokenCap,
    )
})

test('readStrategistSettings: sin settings (null/undefined) devuelve los defaults', () => {
    assert.deepEqual(readStrategistSettings(null), DEFAULT_STRATEGIST_SETTINGS)
    assert.deepEqual(
        readStrategistSettings(undefined),
        DEFAULT_STRATEGIST_SETTINGS,
    )
    assert.deepEqual(readStrategistSettings({}), DEFAULT_STRATEGIST_SETTINGS)
})

test('readStrategistSettings: lo que NO es objeto no revienta, cae a defaults', () => {
    for (const basura of ['{"dailyTokenCap":1}', 42, true, [], () => 1]) {
        assert.deepEqual(
            readStrategistSettings(basura),
            DEFAULT_STRATEGIST_SETTINGS,
            `falla con ${String(basura)}`,
        )
    }
})

test('readStrategistSettings: respeta los topes válidos de la organización', () => {
    assert.deepEqual(
        readStrategistSettings({
            dailyTokenCap: 50_000,
            perTurnTokenCap: 5_000,
        }),
        { dailyTokenCap: 50_000, perTurnTokenCap: 5_000, mode: 'approve' },
    )
})

test('readStrategistSettings: cada campo cae por separado (uno malo no tira el otro)', () => {
    assert.deepEqual(
        readStrategistSettings({
            dailyTokenCap: 'mucho',
            perTurnTokenCap: 5_000,
        }),
        {
            dailyTokenCap: DEFAULT_STRATEGIST_SETTINGS.dailyTokenCap,
            perTurnTokenCap: 5_000,
            mode: 'approve',
        },
    )
})

test('readStrategistSettings: topes imposibles caen al default, no a cero', () => {
    for (const malo of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, -0]) {
        assert.equal(
            readStrategistSettings({ dailyTokenCap: malo }).dailyTokenCap,
            DEFAULT_STRATEGIST_SETTINGS.dailyTokenCap,
            `falla con ${String(malo)}`,
        )
    }
})

test('readStrategistSettings: un tope fraccionario se redondea hacia abajo', () => {
    assert.equal(
        readStrategistSettings({ perTurnTokenCap: 1500.9 }).perTurnTokenCap,
        1500,
    )
})

test("readStrategistSettings: en Fase 1 el modo es SIEMPRE 'approve'", () => {
    assert.equal(readStrategistSettings({ mode: 'auto' }).mode, 'approve')
    assert.equal(readStrategistSettings({ mode: 'approve' }).mode, 'approve')
    assert.equal(readStrategistSettings({ mode: 7 }).mode, 'approve')
})

test('budgetAllows: queda presupuesto', () => {
    assert.deepEqual(budgetAllows({ usedToday: 50_000, dailyCap: 200_000 }), {
        allowed: true,
        remaining: 150_000,
    })
})

test('budgetAllows: agotado exacto ya NO deja pasar', () => {
    assert.deepEqual(budgetAllows({ usedToday: 200_000, dailyCap: 200_000 }), {
        allowed: false,
        remaining: 0,
    })
})

test('budgetAllows: pasarse no devuelve un restante negativo', () => {
    assert.deepEqual(budgetAllows({ usedToday: 250_000, dailyCap: 200_000 }), {
        allowed: false,
        remaining: 0,
    })
})

test('budgetAllows: un contador roto NO bloquea, pero un tope roto SÍ', () => {
    assert.deepEqual(
        budgetAllows({ usedToday: Number.NaN, dailyCap: 200_000 }),
        {
            allowed: true,
            remaining: 200_000,
        },
    )
    assert.deepEqual(budgetAllows({ usedToday: -10, dailyCap: 200_000 }), {
        allowed: true,
        remaining: 200_000,
    })
    assert.deepEqual(budgetAllows({ usedToday: 0, dailyCap: 0 }), {
        allowed: false,
        remaining: 0,
    })
    assert.deepEqual(budgetAllows({ usedToday: 0, dailyCap: Number.NaN }), {
        allowed: false,
        remaining: 0,
    })
})
