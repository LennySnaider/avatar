// src/lib/modules/navigation.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterNavigationByModules } from './navigation.ts'
import type { NavigationTree } from '@/@types/navigation'

const item = (key: string, requiredModule?: string, subMenu: NavigationTree[] = []): NavigationTree => ({
    key,
    path: `/${key}`,
    title: key,
    translateKey: `nav.${key}`,
    icon: '',
    type: subMenu.length > 0 ? 'collapse' : 'item',
    authority: [],
    subMenu,
    ...(requiredModule ? { meta: { requiredModule } } : {}),
})

test('un item sin requiredModule pasa siempre', () => {
    const out = filterNavigationByModules([item('inbox')], [])
    assert.equal(out.length, 1)
    assert.equal(out[0].key, 'inbox')
})

test('un item con modulo no instalado desaparece', () => {
    const out = filterNavigationByModules([item('telegram', 'telegram')], [])
    assert.deepEqual(out, [])
})

test('el mismo item aparece cuando el modulo esta instalado', () => {
    const out = filterNavigationByModules([item('telegram', 'telegram')], ['telegram'])
    assert.equal(out.length, 1)
})

test('el filtro entra en los submenus', () => {
    const tree = [item('avatarForge', undefined, [item('inbox'), item('telegram', 'telegram')])]
    const out = filterNavigationByModules(tree, [])
    assert.equal(out[0].subMenu.length, 1)
    assert.equal(out[0].subMenu[0].key, 'inbox')
})

test('un collapse que se queda sin hijos desaparece, para no dejar un menu vacio', () => {
    const tree = [item('telegramGroup', undefined, [item('stats', 'telegram')])]
    const out = filterNavigationByModules(tree, [])
    assert.deepEqual(out, [])
})

test('un item hoja sin hijos NO se confunde con un collapse vacio', () => {
    const leaf: NavigationTree = { ...item('dashboard'), type: 'item', subMenu: [] }
    const out = filterNavigationByModules([leaf], [])
    assert.equal(out.length, 1)
})

test('no muta el arbol de entrada', () => {
    const tree = [item('avatarForge', undefined, [item('telegram', 'telegram')])]
    filterNavigationByModules(tree, [])
    assert.equal(tree[0].subMenu.length, 1)
})
