// src/lib/org/guards.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    requirePermission,
    ctxCan,
    isExpectedDenial,
    PermissionDeniedError,
    ACTION_LABEL,
} from './guards.ts'
import { PERMISSIONS } from './permissions.ts'
import type { OrgContext } from '@/lib/tenant/getOrgContext'

const ctx = (role: string): OrgContext =>
    ({
        userId: 'u1',
        organizationId: 'org-1',
        role,
    }) as OrgContext

test('requirePermission deja pasar a quien tiene el permiso', () => {
    assert.doesNotThrow(() =>
        requirePermission(ctx('operator'), 'generation:create'),
    )
    assert.doesNotThrow(() =>
        requirePermission(ctx('admin'), 'connection:manage'),
    )
    assert.doesNotThrow(() => requirePermission(ctx('owner'), 'members:manage'))
})

test('requirePermission lanza PermissionDeniedError con el detalle del rechazo', () => {
    try {
        requirePermission(ctx('operator'), 'connection:manage')
        assert.fail('tenia que haber lanzado')
    } catch (e) {
        assert.ok(e instanceof PermissionDeniedError)
        assert.equal(e.code, 'PERMISSION_DENIED')
        assert.equal(e.permission, 'connection:manage')
        assert.equal(e.role, 'operator')
    }
})

test('el mensaje nombra el rol y la accion, y se puede enseñar tal cual', () => {
    const e = new PermissionDeniedError('pricing:manage', 'operator')
    assert.match(e.message, /Operador/)
    assert.match(e.message, /precios/)
    // Sin jerga interna: nada de 'pricing:manage' delante del usuario.
    assert.equal(e.message.includes('pricing:manage'), false)
})

test('un rol desconocido tampoco pasa por el guard', () => {
    assert.throws(
        () => requirePermission(ctx('viewer'), 'content:read'),
        PermissionDeniedError,
    )
})

test('ctxCan responde sin lanzar', () => {
    assert.equal(ctxCan(ctx('operator'), 'sale:send'), true)
    assert.equal(ctxCan(ctx('operator'), 'billing:manage'), false)
})

test('isExpectedDenial distingue un rechazo legitimo de una averia', () => {
    // De esto depende que el log no se llene de "no eres administrador".
    assert.equal(
        isExpectedDenial(
            new PermissionDeniedError('module:manage', 'operator'),
        ),
        true,
    )
    assert.equal(isExpectedDenial(new Error('boom')), false)
    assert.equal(isExpectedDenial(null), false)
    assert.equal(isExpectedDenial('PERMISSION_DENIED'), false)
})

test('isExpectedDenial tambien cubre el modulo no instalado', () => {
    const e = Object.assign(
        new Error('El módulo "telegram" no está instalado'),
        {
            code: 'MODULE_NOT_INSTALLED',
        },
    )
    assert.equal(isExpectedDenial(e), true)
})

test('todo permiso tiene su frase en castellano', () => {
    // Sin esto, un permiso nuevo sale al usuario como `undefined` en la frase.
    for (const permiso of PERMISSIONS) {
        assert.equal(typeof ACTION_LABEL[permiso], 'string', permiso)
        assert.ok(ACTION_LABEL[permiso].length > 0, permiso)
    }
})
