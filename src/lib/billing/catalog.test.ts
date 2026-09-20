// src/lib/billing/catalog.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    AI_MARK_CLEAN_COST_USD,
    ASSISTANT_TURN_CEILING_USD,
    COST_MARGIN,
    MODEL_USD_PER_M,
    MODULE_SKU,
    STAR_USD,
    TOKEN_USD,
    quote,
    starsToUsd,
    tokensForCostUsd,
    tokensForUsage,
    usdToTokens,
} from './catalog.ts'

test('una Star vale lo que Telegram paga al desarrollador', () => {
    assert.equal(STAR_USD, 0.013)
    assert.equal(starsToUsd(100), 1.3)
    assert.equal(starsToUsd(0), 0)
})

test('usdToTokens NO aplica margen: una comision ya es precio, no costo', () => {
    // tokensForCostUsd multiplica por COST_MARGIN porque convierte COSTO de
    // proveedor en precio de venta. Una comision del 15% ya es nuestro ingreso:
    // aplicarle margen la triplicaria.
    assert.equal(usdToTokens(1), 1 / TOKEN_USD)
    assert.equal(usdToTokens(0.195), 195)
})

test('usdToTokens redondea hacia arriba para no regalar fracciones', () => {
    assert.equal(usdToTokens(0.0001), 1)
    assert.equal(usdToTokens(0.0195), 20)
})

test('usdToTokens devuelve 0 con importes nulos o negativos', () => {
    assert.equal(usdToTokens(0), 0)
    assert.equal(usdToTokens(-1), 0)
})

test('los sku de modulo son estables y distinguen cuota de comision', () => {
    assert.equal(MODULE_SKU.fee('telegram'), 'module_fee:telegram')
    assert.equal(MODULE_SKU.commission('telegram'), 'commission:telegram')
})

test('tokensForUsage cobra input y output por separado con precio de Flash', () => {
    // 2000 in + 1000 out en gemini-flash-latest ($0.30/M in, $2.50/M out):
    // 2000*0.30/1e6 + 1000*2.50/1e6 = 0.0006 + 0.0025 = 0.0031 USD.
    // tokensForCostUsd(0.0031) = ceil(0.0031*3/0.001) = ceil(9.3) = 10.
    const result = tokensForUsage(
        { inputTokens: 2000, outputTokens: 1000 },
        'gemini-flash-latest',
    )
    assert.equal(result.costUsd, 0.0031)
    assert.equal(result.tokens, 10)
    assert.equal(result.estimated, false)
})

test('tokensForUsage reconoce el alias gemini-2.5-flash con el mismo precio', () => {
    const flash = tokensForUsage(
        { inputTokens: 2000, outputTokens: 1000 },
        'gemini-flash-latest',
    )
    const alias = tokensForUsage(
        { inputTokens: 2000, outputTokens: 1000 },
        'gemini-2.5-flash',
    )
    assert.deepEqual(alias, flash)
})

test('tokensForUsage marca gemini-2.5-pro como estimated (precio de lista, no medido)', () => {
    const result = tokensForUsage(
        { inputTokens: 1000, outputTokens: 500 },
        'gemini-2.5-pro',
    )
    // 1000*1.25/1e6 + 500*10/1e6 = 0.00125 + 0.005 = 0.00625
    assert.equal(result.costUsd, 0.00625)
    assert.equal(result.estimated, true)
})

test('tokensForUsage cae a la tarifa de Flash con un modelo desconocido y avisa', () => {
    const originalWarn = console.warn
    let warnCalls = 0
    console.warn = () => {
        warnCalls++
    }
    try {
        const unknown = tokensForUsage(
            { inputTokens: 2000, outputTokens: 1000 },
            'un-modelo-que-no-existe',
        )
        const flash = tokensForUsage(
            { inputTokens: 2000, outputTokens: 1000 },
            'gemini-flash-latest',
        )
        assert.equal(unknown.costUsd, flash.costUsd)
        assert.equal(unknown.tokens, flash.tokens)
        assert.equal(unknown.estimated, true)
        // Segunda llamada con el MISMO modelo desconocido no vuelve a avisar.
        tokensForUsage({ inputTokens: 1, outputTokens: 1 }, 'un-modelo-que-no-existe')
        assert.equal(warnCalls, 1)
    } finally {
        console.warn = originalWarn
    }
})

test('tokensForUsage trata conteos ausentes como 0', () => {
    const result = tokensForUsage({}, 'gemini-flash-latest')
    assert.equal(result.costUsd, 0)
    assert.equal(result.tokens, 0)
    const withNulls = tokensForUsage(
        { inputTokens: null, outputTokens: null },
        'gemini-flash-latest',
    )
    assert.equal(withNulls.costUsd, 0)
    assert.equal(withNulls.tokens, 0)
})

test('MODEL_USD_PER_M trae los tres modelos del Estratega', () => {
    assert.deepEqual(MODEL_USD_PER_M['gemini-flash-latest'], { input: 0.3, output: 2.5 })
    assert.deepEqual(MODEL_USD_PER_M['gemini-2.5-flash'], { input: 0.3, output: 2.5 })
    assert.equal(MODEL_USD_PER_M['gemini-2.5-pro'].estimated, true)
})

test('quote({kind:assistant_turn}) reserva el TECHO por turno, no el promedio', () => {
    // wallet_settle solo puede bajar de lo reservado (least(...)) — el hold
    // tiene que ser el techo medido (Fase 0: hasta $0.043 con MCP), no el
    // promedio de $0.004 de un turno de lectura simple.
    const q = quote({ kind: 'assistant_turn' })
    assert.deepEqual(q, {
        sku: 'assistant_turn',
        tokens: tokensForCostUsd(ASSISTANT_TURN_CEILING_USD),
        costUsd: ASSISTANT_TURN_CEILING_USD,
        estimated: true,
    })
})

test('quote({kind:assistant_turn, maxTokens}) respeta el override (tope de org_modules.settings)', () => {
    const q = quote({ kind: 'assistant_turn', maxTokens: 500 })
    assert.equal(q.sku, 'assistant_turn')
    assert.equal(q.tokens, 500)
    // costUsd es el inverso de tokensForCostUsd: consistente con `tokens`,
    // no un segundo precio independiente.
    assert.equal(q.costUsd, (500 * TOKEN_USD) / COST_MARGIN)
    assert.equal(q.estimated, true)
})

test('limpieza de marcas: una imagen cuesta lo que costó limpiarla, con el margen de siempre', () => {
    const q = quote({ kind: 'ai_mark_clean', mediaType: 'IMAGE' })
    assert.equal(q.sku, 'module_usage:ai-mark-cleaner:image')
    assert.equal(q.tokens, tokensForCostUsd(AI_MARK_CLEAN_COST_USD.imagen.usd))
    assert.equal(q.estimated, false, 'el coste está medido, no estimado')
})

test('limpieza de marcas: un vídeo sin relleno cuesta casi lo mismo que una imagen', () => {
    // Es el caso común: se le pasa el proveedor al motor y no escanea las
    // siete marcas, así que sólo borra metadatos.
    const q = quote({ kind: 'ai_mark_clean', mediaType: 'VIDEO' })
    assert.equal(q.sku, 'module_usage:ai-mark-cleaner:video')
    assert.equal(q.tokens, tokensForCostUsd(AI_MARK_CLEAN_COST_USD.videoSinRelleno.usd))
})

test('limpieza de marcas: rellenar fotograma a fotograma cuesta mucho más', () => {
    const barato = quote({ kind: 'ai_mark_clean', mediaType: 'VIDEO' })
    const caro = quote({
        kind: 'ai_mark_clean',
        mediaType: 'VIDEO',
        rellenoDeFotogramas: true,
    })
    assert.ok(caro.tokens > barato.tokens * 10, 'el relleno domina el coste')
    assert.equal(caro.tokens, tokensForCostUsd(AI_MARK_CLEAN_COST_USD.videoConRelleno.usd))
})

test('limpieza de marcas: el sku lleva el prefijo que el resumen del módulo sabe leer', () => {
    // Un sku con forma propia dejaría el resumen de ese módulo a cero.
    const prefijo = MODULE_SKU.usagePrefix('ai-mark-cleaner')
    for (const mediaType of ['IMAGE', 'VIDEO'] as const) {
        assert.ok(quote({ kind: 'ai_mark_clean', mediaType }).sku.startsWith(prefijo))
    }
})
