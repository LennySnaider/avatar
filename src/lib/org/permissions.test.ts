// src/lib/org/permissions.test.ts
//
// Este fichero ES la especificación del reparto de roles. Si mañana alguien
// cambia la matriz, aquí se ve exactamente qué se rompió y si era a propósito.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    PERMISSIONS,
    PERMISSIONS_BY_ROLE,
    ORG_ROLES,
    can,
    isOrgRole,
    permissionsOf,
    type Permission,
} from './permissions.ts'

// ── Lo que un OPERATOR sí puede: operar y generar ────────────────────────
const OPERATOR_PUEDE: Permission[] = [
    'content:read',
    'content:write',
    'content:delete',
    'generation:create',
    'persona:write',
    'inbox:reply',
    'sale:send',
    'publish:social',
]

for (const permiso of OPERATOR_PUEDE) {
    test(`operator PUEDE ${permiso}`, () => {
        assert.equal(can('operator', permiso), true)
    })
}

// ── Lo que un OPERATOR no puede: el negocio ──────────────────────────────
const OPERATOR_NO_PUEDE: Permission[] = [
    'avatar:delete',
    'voice:delete',
    'connection:manage',
    'pricing:manage',
    'ai:autonomy',
    'module:manage',
    'billing:manage',
    'members:manage',
    'plan:manage',
]

for (const permiso of OPERATOR_NO_PUEDE) {
    test(`operator NO puede ${permiso}`, () => {
        assert.equal(can('operator', permiso), false)
    })
}

test('el borrado va partido: el operator borra contenido pero no avatares ni voces', () => {
    // Descartar una generación y reemplazar la cara de un avatar son BORRADOS
    // que forman parte de editar: si el operator no pudiera, el estudio le
    // fallaría a media faena. Lo irreversible sigue siendo de admin.
    assert.equal(can('operator', 'content:delete'), true)
    assert.equal(can('operator', 'avatar:delete'), false)
    assert.equal(can('operator', 'voice:delete'), false)
})

test('el operator vende pero no pone los precios', () => {
    assert.equal(can('operator', 'sale:send'), true)
    assert.equal(can('operator', 'pricing:manage'), false)
})

test('el operator genera (gasta tokens) pero no enciende la IA autonoma', () => {
    assert.equal(can('operator', 'generation:create'), true)
    assert.equal(can('operator', 'ai:autonomy'), false)
})

// ── Admin y owner ────────────────────────────────────────────────────────
test('admin puede todo menos los miembros y el plan', () => {
    for (const permiso of PERMISSIONS) {
        const esperado =
            permiso !== 'members:manage' && permiso !== 'plan:manage'
        assert.equal(can('admin', permiso), esperado, permiso)
    }
})

test('owner puede todos los permisos', () => {
    for (const permiso of PERMISSIONS) {
        assert.equal(can('owner', permiso), true, permiso)
    }
})

test('la herencia se cumple: operator subconjunto de admin subconjunto de owner', () => {
    for (const permiso of permissionsOf('operator')) {
        assert.equal(can('admin', permiso), true, permiso)
    }
    for (const permiso of permissionsOf('admin')) {
        assert.equal(can('owner', permiso), true, permiso)
    }
})

// ── Invariantes de la propia matriz ──────────────────────────────────────
test('ningun permiso queda huerfano: todos los concede algun rol', () => {
    // Caza el permiso que se declara, se usa en un guard y nadie tiene nunca:
    // una accion que jamas se podria ejecutar, y que sin este test parece viva.
    for (const permiso of PERMISSIONS) {
        const alguien = ORG_ROLES.some((rol) => can(rol, permiso))
        assert.equal(alguien, true, `nadie tiene ${permiso}`)
    }
})

test('todo rol declarado tiene su conjunto en la matriz', () => {
    for (const rol of ORG_ROLES) {
        assert.ok(PERMISSIONS_BY_ROLE[rol] instanceof Set, rol)
    }
})

// ── `viewer`: el rol que mira y no toca (F4.4) ───────────────────────────
test('viewer solo puede LEER', () => {
    assert.equal(can('viewer', 'content:read'), true)
    for (const permiso of PERMISSIONS) {
        if (permiso === 'content:read') continue
        assert.equal(can('viewer', permiso), false, permiso)
    }
})

test('operator hereda todo lo de viewer', () => {
    // El spread ES la herencia: si alguien reescribe OPERATOR a mano y se deja
    // un permiso de viewer fuera, degradar a un operador le daria MAS de lo que
    // tiene un viewer en esa linea. Este test lo impide.
    for (const permiso of PERMISSIONS) {
        if (can('viewer', permiso)) {
            assert.equal(can('operator', permiso), true, permiso)
        }
    }
})

// ── Falla cerrado ante lo que NO es un rol de organizacion ───────────────
test('un rol desconocido no hereda NADA', () => {
    // Si una migracion amplia el enum y nadie toca la matriz, el rol nuevo se
    // queda sin permisos. La alternativa (heredar "por parecerse") seria una
    // subida de privilegios silenciosa.
    //
    // `superadmin` sigue aqui a proposito: el admin de plataforma NO entra por
    // la matriz de la organizacion. Cuando suplanta a un tenant lo hace con un
    // rol REAL (`viewer` sin concesion, `owner` con ella), nunca con un rol
    // inventado que esta matriz tendria que reconocer.
    for (const permiso of PERMISSIONS) {
        assert.equal(can('superadmin', permiso), false, permiso)
        assert.equal(can('platform_admin', permiso), false, permiso)
        assert.equal(can('god', permiso), false, permiso)
    }
})

test('sin rol resuelto no se puede nada', () => {
    assert.equal(can(null, 'content:read'), false)
    assert.equal(can(undefined, 'content:read'), false)
    assert.equal(can('', 'content:read'), false)
})

test('isOrgRole solo acepta los cuatro roles reales', () => {
    assert.equal(isOrgRole('owner'), true)
    assert.equal(isOrgRole('admin'), true)
    assert.equal(isOrgRole('operator'), true)
    assert.equal(isOrgRole('viewer'), true)
    assert.equal(isOrgRole(null), false)
    assert.equal(isOrgRole(42), false)
    // 'toString' existe en Object.prototype: `in` sin cuidado lo aceptaria.
    assert.equal(isOrgRole('toString'), false)
})
