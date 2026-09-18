// src/lib/org/invitations.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    INVITATION_TTL_HOURS,
    generateInvitationToken,
    hashInvitationToken,
    invitationTokenHashEquals,
    invitationStatus,
    isInvitationLive,
    normalizeInviteEmail,
    buildInviteUrl,
} from './invitations.ts'

const NOW = new Date('2026-09-17T12:00:00.000Z')

test('el token caduca exactamente INVITATION_TTL_HOURS despues (7 dias)', () => {
    const t = generateInvitationToken(NOW)
    assert.equal(INVITATION_TTL_HOURS, 168)
    assert.equal(t.expiresAt.getTime() - NOW.getTime(), 168 * 3_600_000)
})

test('el hash guardado es el SHA-256 del token, determinista', () => {
    const t = generateInvitationToken(NOW)
    assert.equal(t.tokenHash, hashInvitationToken(t.token))
    assert.equal(hashInvitationToken('abc'), hashInvitationToken('abc'))
    assert.match(t.tokenHash, /^[0-9a-f]{64}$/)
})

test('el token es base64url: viaja en una query string sin escapes', () => {
    const t = generateInvitationToken(NOW)
    assert.doesNotMatch(t.token, /[+/=]/)
    assert.ok(t.token.length >= 40)
})

test('dos tokens seguidos son distintos', () => {
    assert.notEqual(
        generateInvitationToken(NOW).token,
        generateInvitationToken(NOW).token,
    )
})

test('invitationTokenHashEquals compara sin depender de la longitud', () => {
    const h = hashInvitationToken('x')
    assert.equal(invitationTokenHashEquals(h, h), true)
    assert.equal(invitationTokenHashEquals(h, hashInvitationToken('y')), false)
    assert.equal(invitationTokenHashEquals(h, h.slice(1)), false)
})

// ── Estado ───────────────────────────────────────────────────────────────
const future = new Date(NOW.getTime() + 60_000)
const past = new Date(NOW.getTime() - 60_000)

test('pendiente: sin aceptar, sin revocar, sin caducar', () => {
    assert.equal(
        invitationStatus(
            { expiresAt: future, acceptedAt: null, revokedAt: null },
            NOW,
        ),
        'pending',
    )
    assert.equal(
        isInvitationLive(
            { expiresAt: future, acceptedAt: null, revokedAt: null },
            NOW,
        ),
        true,
    )
})

test('caducada en el segundo justo (expiresAt <= now no vale)', () => {
    assert.equal(
        invitationStatus(
            { expiresAt: NOW, acceptedAt: null, revokedAt: null },
            NOW,
        ),
        'expired',
    )
    assert.equal(
        invitationStatus(
            { expiresAt: past, acceptedAt: null, revokedAt: null },
            NOW,
        ),
        'expired',
    )
})

test('aceptada y revocada, y la prioridad cuando se solapan', () => {
    assert.equal(
        invitationStatus(
            { expiresAt: future, acceptedAt: past, revokedAt: null },
            NOW,
        ),
        'accepted',
    )
    assert.equal(
        invitationStatus(
            { expiresAt: future, acceptedAt: null, revokedAt: past },
            NOW,
        ),
        'revoked',
    )
    // revocada + caducada -> revocada: es lo que el propietario hizo
    assert.equal(
        invitationStatus(
            { expiresAt: past, acceptedAt: null, revokedAt: past },
            NOW,
        ),
        'revoked',
    )
    // aceptada + caducada -> aceptada: la persona ya entro
    assert.equal(
        invitationStatus(
            { expiresAt: past, acceptedAt: past, revokedAt: null },
            NOW,
        ),
        'accepted',
    )
    // revocada gana a aceptada si por lo que sea hay las dos
    assert.equal(
        invitationStatus(
            { expiresAt: future, acceptedAt: past, revokedAt: past },
            NOW,
        ),
        'revoked',
    )
})

test('una caducidad ilegible se trata como caducada: lo que no se puede comprobar se rechaza', () => {
    assert.equal(
        invitationStatus(
            { expiresAt: 'no-es-fecha', acceptedAt: null, revokedAt: null },
            NOW,
        ),
        'expired',
    )
    assert.equal(
        isInvitationLive(
            { expiresAt: 'no-es-fecha', acceptedAt: null, revokedAt: null },
            NOW,
        ),
        false,
    )
})

test('acepta fechas como string ISO, que es como llegan de PostgREST', () => {
    assert.equal(
        invitationStatus(
            {
                expiresAt: future.toISOString(),
                acceptedAt: null,
                revokedAt: null,
            },
            NOW,
        ),
        'pending',
    )
})

// ── Email y URL ──────────────────────────────────────────────────────────
test('normalizeInviteEmail recorta y pasa a minusculas', () => {
    assert.equal(
        normalizeInviteEmail('  Ana.Perez@Empresa.COM '),
        'ana.perez@empresa.com',
    )
})

test('normalizeInviteEmail rechaza lo que no tiene forma de email', () => {
    assert.equal(normalizeInviteEmail(''), null)
    assert.equal(normalizeInviteEmail('a@b'), null)
    assert.equal(normalizeInviteEmail('a b@c.d'), null)
    assert.equal(normalizeInviteEmail('sin-arroba.com'), null)
})

test('buildInviteUrl no duplica la barra y percent-encodea el token', () => {
    assert.equal(
        buildInviteUrl('https://app.test/', 'tok'),
        'https://app.test/accept-invite?token=tok',
    )
    assert.equal(
        buildInviteUrl('https://app.test', 'tok'),
        'https://app.test/accept-invite?token=tok',
    )
    assert.equal(
        buildInviteUrl('https://app.test', 'a b&c'),
        'https://app.test/accept-invite?token=a%20b%26c',
    )
})
