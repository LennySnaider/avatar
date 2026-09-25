import { test } from 'node:test'
import assert from 'node:assert/strict'
import { liveRowToUnitActivity } from './unitActivityRow.ts'

test('nunca activado no factura', () => {
    assert.equal(
        liveRowToUnitActivity({ enabled: false, enabled_at: null, disabled_at: null, updated_at: '2026-09-01T00:00:00Z' }),
        null,
    )
})

test('activo sigue abierto', () => {
    assert.deepEqual(
        liveRowToUnitActivity({ enabled: true, enabled_at: '2026-09-01T00:00:00Z', disabled_at: null, updated_at: '2026-09-05T00:00:00Z' }),
        { activeFrom: '2026-09-01T00:00:00Z', activeUntil: null },
    )
})

test('apagado con fecha de baja cierra ahí; sin fecha, en updated_at', () => {
    assert.deepEqual(
        liveRowToUnitActivity({ enabled: false, enabled_at: '2026-09-01T00:00:00Z', disabled_at: '2026-09-10T00:00:00Z', updated_at: '2026-09-12T00:00:00Z' }),
        { activeFrom: '2026-09-01T00:00:00Z', activeUntil: '2026-09-10T00:00:00Z' },
    )
    assert.deepEqual(
        liveRowToUnitActivity({ enabled: false, enabled_at: '2026-09-01T00:00:00Z', disabled_at: null, updated_at: '2026-09-12T00:00:00Z' }),
        { activeFrom: '2026-09-01T00:00:00Z', activeUntil: '2026-09-12T00:00:00Z' },
    )
})
