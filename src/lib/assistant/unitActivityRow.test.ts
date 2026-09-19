// src/lib/assistant/unitActivityRow.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    rowToUnitActivity,
    type StrategistModuleRow,
} from './unitActivityRow.ts'

function fila(
    overrides: Partial<StrategistModuleRow> = {},
): StrategistModuleRow {
    return {
        installed_at: '2026-09-01T00:00:00.000Z',
        uninstalled_at: null,
        status: 'installed',
        ...overrides,
    }
}

test('instalado y sin baja: sigue activo (activeUntil null)', () => {
    assert.deepEqual(rowToUnitActivity(fila()), {
        activeFrom: '2026-09-01T00:00:00.000Z',
        activeUntil: null,
    })
})

test('desinstalado: el periodo termina en uninstalled_at', () => {
    assert.deepEqual(
        rowToUnitActivity(
            fila({
                status: 'uninstalled',
                uninstalled_at: '2026-09-20T10:00:00.000Z',
            }),
        ),
        {
            activeFrom: '2026-09-01T00:00:00.000Z',
            activeUntil: '2026-09-20T10:00:00.000Z',
        },
    )
})

test('sin installed_at no hay nada que facturar', () => {
    assert.equal(rowToUnitActivity(fila({ installed_at: null })), null)
    assert.equal(rowToUnitActivity(fila({ installed_at: '' })), null)
})

test('una reinstalación (status installed con baja vieja) NO arrastra la baja', () => {
    // `setModuleStatus` reabre la MISMA fila, así que un `uninstalled_at`
    // anterior puede sobrevivir a la reinstalación: manda el estado.
    assert.deepEqual(
        rowToUnitActivity(
            fila({
                status: 'installed',
                uninstalled_at: '2026-08-15T00:00:00.000Z',
            }),
        ),
        {
            activeFrom: '2026-09-01T00:00:00.000Z',
            activeUntil: null,
        },
    )
})
