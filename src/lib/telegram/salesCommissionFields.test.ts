// src/lib/telegram/salesCommissionFields.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { commissionSaleFields } from './salesCommissionFields.ts'

test('comisión asentada: settled=true y los campos pasan tal cual', () => {
    const fields = commissionSaleFields({
        ledgerId: 'ledger-1',
        commissionPct: 7,
        commissionUsd: 0.00091,
        commissionTokens: 1,
        starUsd: 0.013,
        replayed: false,
        exempt: false,
    })
    assert.deepEqual(fields, {
        commission_pct: 7,
        commission_usd: 0.00091,
        commission_tokens: 1,
        star_usd: 0.013,
        commission_ledger_id: 'ledger-1',
        commission_exempt: false,
        settled: true,
    })
})

test('sin asentar (módulo ausente, redondeo a 0, o chargeTokens falló): settled=false', () => {
    const fields = commissionSaleFields({
        ledgerId: null,
        commissionPct: 7,
        commissionUsd: 0.00065,
        commissionTokens: 0,
        starUsd: 0.013,
        replayed: false,
        exempt: false,
    })
    assert.equal(fields.settled, false)
    assert.equal(fields.commission_ledger_id, null)
    assert.equal(fields.commission_exempt, false)
})

test('organización exenta: settled=true SIN ledger, con el % y USD reales (no cero)', () => {
    const fields = commissionSaleFields({
        ledgerId: null,
        commissionPct: 7,
        commissionUsd: 0.091,
        commissionTokens: 0,
        starUsd: 0.013,
        replayed: false,
        exempt: true,
    })
    assert.deepEqual(fields, {
        commission_pct: 7,
        commission_usd: 0.091,
        commission_tokens: 0,
        star_usd: 0.013,
        commission_ledger_id: null,
        commission_exempt: true,
        settled: true,
    })
})

test('settled distingue "exenta" de "fallo": mismo ledgerId null, distinto resultado', () => {
    const fallo = commissionSaleFields({
        ledgerId: null,
        commissionPct: 20,
        commissionUsd: 1,
        commissionTokens: 1000,
        starUsd: 0.013,
        replayed: false,
        exempt: false,
    })
    const exenta = commissionSaleFields({
        ledgerId: null,
        commissionPct: 20,
        commissionUsd: 1,
        commissionTokens: 1000,
        starUsd: 0.013,
        replayed: false,
        exempt: true,
    })
    assert.equal(fallo.settled, false)
    assert.equal(exenta.settled, true)
})
