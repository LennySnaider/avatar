// src/lib/modules/navigation.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterNavigation } from './navigation.ts'
import type { NavigationTree } from '@/@types/navigation'
import type { Permission } from '@/lib/org/permissions'

const item = (
    key: string,
    meta: { requiredModule?: string; requiredPermission?: Permission } = {},
    subMenu: NavigationTree[] = [],
): NavigationTree => ({
    key,
    path: `/${key}`,
    title: key,
    translateKey: `nav.${key}`,
    icon: '',
    type: subMenu.length > 0 ? 'collapse' : 'item',
    authority: [],
    subMenu,
    ...(Object.keys(meta).length ? { meta } : {}),
})

const sinNada = { installedModules: [], role: null }

// ── Módulos (lo que ya se probaba) ───────────────────────────────────────
test('un item sin requiredModule pasa siempre', () => {
    const out = filterNavigation([item('inbox')], sinNada)
    assert.equal(out.length, 1)
    assert.equal(out[0].key, 'inbox')
})

test('un item con modulo no instalado desaparece', () => {
    const out = filterNavigation(
        [item('telegram', { requiredModule: 'telegram' })],
        sinNada,
    )
    assert.deepEqual(out, [])
})

test('el mismo item aparece cuando el modulo esta instalado', () => {
    const out = filterNavigation(
        [item('telegram', { requiredModule: 'telegram' })],
        {
            installedModules: ['telegram'],
            role: null,
        },
    )
    assert.equal(out.length, 1)
})

test('el filtro entra en los submenus', () => {
    const tree = [
        item('avatarForge', {}, [
            item('inbox'),
            item('telegram', { requiredModule: 'telegram' }),
        ]),
    ]
    const out = filterNavigation(tree, sinNada)
    assert.equal(out[0].subMenu.length, 1)
    assert.equal(out[0].subMenu[0].key, 'inbox')
})

test('un collapse que se queda sin hijos desaparece, para no dejar un menu vacio', () => {
    const tree = [
        item('telegramGroup', {}, [
            item('stats', { requiredModule: 'telegram' }),
        ]),
    ]
    assert.deepEqual(filterNavigation(tree, sinNada), [])
})

test('un item hoja sin hijos NO se confunde con un collapse vacio', () => {
    const leaf: NavigationTree = {
        ...item('dashboard'),
        type: 'item',
        subMenu: [],
    }
    assert.equal(filterNavigation([leaf], sinNada).length, 1)
})

test('no muta el arbol de entrada', () => {
    const tree = [
        item('avatarForge', {}, [
            item('telegram', { requiredModule: 'telegram' }),
        ]),
    ]
    filterNavigation(tree, sinNada)
    assert.equal(tree[0].subMenu.length, 1)
})

// ── Rol ──────────────────────────────────────────────────────────────────
test('un item con requiredPermission se oculta al operator y se ve para admin', () => {
    const tree = [
        item('connections', { requiredPermission: 'connection:manage' }),
    ]
    assert.deepEqual(
        filterNavigation(tree, { installedModules: [], role: 'operator' }),
        [],
    )
    assert.equal(
        filterNavigation(tree, { installedModules: [], role: 'admin' }).length,
        1,
    )
    assert.equal(
        filterNavigation(tree, { installedModules: [], role: 'owner' }).length,
        1,
    )
})

test('sin rol resuelto (null) los items con permiso se ocultan y el resto se queda: falla cerrado', () => {
    const tree = [
        item('inbox'),
        item('billing', { requiredPermission: 'billing:manage' }),
    ]
    const out = filterNavigation(tree, sinNada)
    assert.deepEqual(
        out.map((n) => n.key),
        ['inbox'],
    )
})

test('modulo + permiso: hacen falta los dos', () => {
    const tree = [
        item('telegramPrices', {
            requiredModule: 'telegram',
            requiredPermission: 'pricing:manage',
        }),
    ]
    assert.deepEqual(
        filterNavigation(tree, { installedModules: [], role: 'admin' }),
        [],
    )
    assert.deepEqual(
        filterNavigation(tree, {
            installedModules: ['telegram'],
            role: 'operator',
        }),
        [],
    )
    assert.equal(
        filterNavigation(tree, {
            installedModules: ['telegram'],
            role: 'admin',
        }).length,
        1,
    )
})

test('un grupo que se queda sin hijos por permiso tambien desaparece', () => {
    const tree = [
        item('admin', {}, [
            item('members', { requiredPermission: 'members:manage' }),
        ]),
    ]
    assert.deepEqual(
        filterNavigation(tree, { installedModules: [], role: 'operator' }),
        [],
    )
    assert.equal(
        filterNavigation(tree, { installedModules: [], role: 'owner' }).length,
        1,
    )
})
