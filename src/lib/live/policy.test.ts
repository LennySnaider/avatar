import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    capNsfwForLive,
    decideSessionStart,
    liveSessionState,
    remainingSessionSeconds,
    isEmbedAllowed,
    billableMinutes,
    type SessionStartInput,
} from './policy.ts'

test('capNsfwForLive baja explicit a suggestive y deja el resto igual', () => {
    assert.equal(capNsfwForLive('explicit'), 'suggestive')
    assert.equal(capNsfwForLive('suggestive'), 'suggestive')
    assert.equal(capNsfwForLive('sfw'), 'sfw')
})

const ready: SessionStartInput = {
    enabled: true,
    faceId: 'face-1',
    hasVoice: true,
    hasPersona: true,
    activeCount: 0,
    maxConcurrent: 3,
    minutesToday: 10,
    dailyCapMinutes: 120,
}

test('con todo en orden la sesión arranca', () => {
    assert.deepEqual(decideSessionStart(ready), { ok: true })
})

test('la configuración se comprueba antes que los topes, en orden útil', () => {
    const r = (patch: Partial<SessionStartInput>) => decideSessionStart({ ...ready, ...patch })
    assert.equal((r({ enabled: false }) as { reason: string }).reason, 'disabled')
    assert.equal((r({ faceId: null }) as { reason: string }).reason, 'no_face')
    assert.equal((r({ hasVoice: false }) as { reason: string }).reason, 'no_voice')
    assert.equal((r({ hasPersona: false }) as { reason: string }).reason, 'no_persona')
    assert.equal((r({ activeCount: 3 }) as { reason: string }).reason, 'concurrency')
    assert.equal((r({ minutesToday: 120 }) as { reason: string }).reason, 'daily_cap')
})

test('un tope diario de 0 significa sin tope', () => {
    assert.deepEqual(decideSessionStart({ ...ready, dailyCapMinutes: 0, minutesToday: 9999 }), { ok: true })
})


const base = {
    status: 'active',
    startedAt: '2026-09-23T10:00:00Z',
    lastSeenAt: '2026-09-23T10:01:00Z',
    maxSessionSeconds: 600,
}
const at = (iso: string) => Date.parse(iso)

test('liveSessionState: activa y reciente es ok', () => {
    assert.equal(liveSessionState({ ...base, nowMs: at('2026-09-23T10:01:30Z') }), 'ok')
})

test('liveSessionState: cerrada, sin heartbeat o pasada de tope', () => {
    assert.equal(liveSessionState({ ...base, status: 'ended', nowMs: at('2026-09-23T10:01:30Z') }), 'ended')
    assert.equal(liveSessionState({ ...base, nowMs: at('2026-09-23T10:03:30Z') }), 'stale')
    assert.equal(
        liveSessionState({ ...base, lastSeenAt: '2026-09-23T10:10:30Z', nowMs: at('2026-09-23T10:10:40Z') }),
        'too_long',
    )
})

test('remainingSessionSeconds nunca es negativo', () => {
    assert.equal(remainingSessionSeconds('2026-09-23T10:00:00Z', 600, at('2026-09-23T10:04:00Z')), 360)
    assert.equal(remainingSessionSeconds('2026-09-23T10:00:00Z', 600, at('2026-09-23T11:00:00Z')), 0)
})

test('isEmbedAllowed: sin lista o sin iframe siempre; con lista sólo los orígenes listados', () => {
    assert.equal(isEmbedAllowed([], null, true), true)
    assert.equal(isEmbedAllowed(['https://a.com'], null, false), true)
    assert.equal(isEmbedAllowed(['https://a.com'], 'https://A.com/', true), true)
    assert.equal(isEmbedAllowed(['https://a.com'], 'https://evil.com', true), false)
    assert.equal(isEmbedAllowed(['https://a.com'], null, true), false)
})

const callStart = '2026-09-23T10:00:00Z'
const afterSec = (s: number) => Date.parse(callStart) + s * 1000

test('billableMinutes: por minuto empezado', () => {
    assert.equal(billableMinutes(callStart, afterSec(0), 600), 0)
    assert.equal(billableMinutes(callStart, afterSec(5), 600), 1)
    assert.equal(billableMinutes(callStart, afterSec(60), 600), 1)
    assert.equal(billableMinutes(callStart, afterSec(61), 600), 2)
})

test('billableMinutes: nunca pasa del tope ni cobra tiempo negativo', () => {
    assert.equal(billableMinutes(callStart, afterSec(5000), 600), 10)
    assert.equal(billableMinutes(callStart, afterSec(-30), 600), 0)
    assert.equal(billableMinutes('no-es-fecha', afterSec(90), 600), 0)
})
