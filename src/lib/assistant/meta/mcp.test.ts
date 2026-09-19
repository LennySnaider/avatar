// src/lib/assistant/meta/mcp.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    META_MCP_READ_TOOLS,
    filterToolsByWhitelist,
    missingFromWhitelist,
    schemaCharsOf,
} from './mcp.ts'
import type { ToolSet } from 'ai'

const fake = (description: string) =>
    ({
        description,
        inputSchema: {},
        execute: async () => null,
    }) as unknown as ToolSet[string]

const catalogo: ToolSet = {
    ads_get_ad_accounts: fake('cuentas'),
    ads_insights_performance_trend: fake('tendencia'),
    ads_create_campaign: fake('CREA una campaña'),
    ads_update_budget: fake('CAMBIA el presupuesto'),
}

test('la lista blanca son las 5 herramientas de LECTURA de Fase 0', () => {
    assert.deepEqual(
        [...META_MCP_READ_TOOLS],
        [
            'ads_get_ad_accounts',
            'ads_get_ad_entities',
            'ads_insights_performance_trend',
            'ads_insights_advertiser_context',
            'ads_insights_anomaly_signal',
        ],
    )
})

test('filtra el catálogo a la lista blanca y deja fuera todo lo que escribe', () => {
    const filtradas = filterToolsByWhitelist(catalogo, META_MCP_READ_TOOLS)
    assert.deepEqual(Object.keys(filtradas).sort(), [
        'ads_get_ad_accounts',
        'ads_insights_performance_trend',
    ])
    assert.equal(filtradas.ads_get_ad_accounts, catalogo.ads_get_ad_accounts)
})

test('una lista blanca vacía no expone NADA (no es "todo")', () => {
    assert.deepEqual(filterToolsByWhitelist(catalogo, []), {})
})

test('un catálogo vacío no revienta', () => {
    assert.deepEqual(filterToolsByWhitelist({}, META_MCP_READ_TOOLS), {})
})

test('no se cuelan propiedades heredadas del prototipo', () => {
    // Si el filtro usara `name in all`, "toString" y "constructor" pasarían
    // y acabaríamos exponiendo una función del prototipo como herramienta.
    assert.deepEqual(
        filterToolsByWhitelist(catalogo, ['toString', 'constructor']),
        {},
    )
})

test('missingFromWhitelist avisa de lo que el MCP ya no sirve', () => {
    assert.deepEqual(missingFromWhitelist(catalogo, META_MCP_READ_TOOLS), [
        'ads_get_ad_entities',
        'ads_insights_advertiser_context',
        'ads_insights_anomaly_signal',
    ])
    assert.deepEqual(
        missingFromWhitelist(catalogo, ['ads_get_ad_accounts']),
        [],
    )
})

test('schemaCharsOf mide lo que cuesta el catálogo, no cuántas herramientas hay', () => {
    assert.ok(schemaCharsOf(catalogo) > schemaCharsOf({ a: fake('x') }))
    assert.equal(schemaCharsOf({}), JSON.stringify({}).length)
})
