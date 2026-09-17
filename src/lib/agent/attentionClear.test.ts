import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldClearAttention } from './attentionClear.ts'

test('el autopilot baja la bandera cuando nada nuevo entró después', () => {
    assert.equal(
        shouldClearAttention({ approvedBy: 'autopilot', newerInboundExists: false }),
        true,
    )
})

test('un mensaje entrante MÁS NUEVO conserva la bandera', () => {
    // El caso del `send_after`: el autopilot programó el envío, el fan escribió
    // otra vez en ese hueco y ese mensaje escaló el chat. Bajar la bandera al
    // salir el mensaje viejo enterraría una escalada que nadie ha leído.
    assert.equal(
        shouldClearAttention({ approvedBy: 'autopilot', newerInboundExists: true }),
        false,
    )
})

test('un envío aprobado a mano nunca toca la bandera', () => {
    // Ni siquiera con el chat tranquilo: ahí el humano ya está dentro y es él
    // quien cierra el caso.
    for (const approvedBy of ['user-uuid', null, undefined]) {
        assert.equal(
            shouldClearAttention({ approvedBy, newerInboundExists: false }),
            false,
        )
        assert.equal(
            shouldClearAttention({ approvedBy, newerInboundExists: true }),
            false,
        )
    }
})
