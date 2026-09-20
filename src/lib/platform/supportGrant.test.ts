import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    isGrantLive,
    resolveImpersonation,
    type SupportGrant,
} from './supportGrant.ts'

const AHORA = new Date('2026-09-20T12:00:00Z')
const ORG = 'org-a'

const concesion = (over: Partial<SupportGrant> = {}): SupportGrant => ({
    organizationId: ORG,
    kind: 'tenant',
    expiresAt: '2026-09-20T13:00:00Z',
    revokedAt: null,
    ...over,
})

// ── isGrantLive ──────────────────────────────────────────────────────────
test('una concesión sin revocar y sin vencer está viva', () => {
    assert.equal(isGrantLive(concesion(), AHORA), true)
})

test('una concesión vencida está muerta', () => {
    assert.equal(
        isGrantLive(concesion({ expiresAt: '2026-09-20T11:59:59Z' }), AHORA),
        false,
    )
})

test('una concesión revocada está muerta aunque no haya vencido', () => {
    assert.equal(
        isGrantLive(concesion({ revokedAt: '2026-09-20T11:00:00Z' }), AHORA),
        false,
    )
})

test('sin concesión no hay nada vivo', () => {
    assert.equal(isGrantLive(null, AHORA), false)
    assert.equal(isGrantLive(undefined, AHORA), false)
})

// ── resolveImpersonation ─────────────────────────────────────────────────
test('quien NO es admin de plataforma no suplanta, tenga lo que tenga', () => {
    // El caso que importa: una cookie `org_override` falsificada por un usuario
    // normal no puede abrirle la puerta a otra organización.
    const d = resolveImpersonation({
        isPlatformAdmin: false,
        targetOrganizationId: ORG,
        grant: concesion(),
        now: AHORA,
    })
    assert.equal(d.allowed, false)
})

test('admin de plataforma SIN concesión entra a mirar', () => {
    const d = resolveImpersonation({
        isPlatformAdmin: true,
        targetOrganizationId: ORG,
        grant: null,
        now: AHORA,
    })
    assert.equal(d.allowed, true)
    assert.equal(d.role, 'viewer')
    assert.equal(d.elevated, false)
    assert.equal(d.kind, null)
})

test('admin de plataforma CON concesión viva opera como owner', () => {
    const d = resolveImpersonation({
        isPlatformAdmin: true,
        targetOrganizationId: ORG,
        grant: concesion(),
        now: AHORA,
    })
    assert.equal(d.allowed, true)
    assert.equal(d.role, 'owner')
    assert.equal(d.elevated, true)
    assert.equal(d.kind, 'tenant')
})

test('el break-glass también eleva, pero se distingue', () => {
    // Se distingue porque la bitácora y el banner lo pintan distinto: entrar
    // porque el cliente no podía abrirte la puerta no es lo mismo que entrar
    // porque te la abrió.
    const d = resolveImpersonation({
        isPlatformAdmin: true,
        targetOrganizationId: ORG,
        grant: concesion({ kind: 'break_glass' }),
        now: AHORA,
    })
    assert.equal(d.role, 'owner')
    assert.equal(d.kind, 'break_glass')
})

test('una concesión VENCIDA degrada a mirar, no cierra la puerta', () => {
    const d = resolveImpersonation({
        isPlatformAdmin: true,
        targetOrganizationId: ORG,
        grant: concesion({ expiresAt: '2026-09-20T11:00:00Z' }),
        now: AHORA,
    })
    assert.equal(d.allowed, true)
    assert.equal(d.role, 'viewer')
    assert.equal(d.elevated, false)
})

test('una concesión de OTRA organización no eleva aquí', () => {
    // Sin esta comprobación, un permiso que un tenant concedió para SU cuenta
    // serviría para escribir en la de cualquier otro. La concesión es por
    // organización, no un salvoconducto global.
    const d = resolveImpersonation({
        isPlatformAdmin: true,
        targetOrganizationId: 'org-b',
        grant: concesion({ organizationId: ORG }),
        now: AHORA,
    })
    assert.equal(d.allowed, true)
    assert.equal(d.role, 'viewer')
    assert.equal(d.elevated, false)
})
