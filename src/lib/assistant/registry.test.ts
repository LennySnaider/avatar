// src/lib/assistant/registry.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { selectTools, toAiTools } from './registry.ts'
import type { AssistantToolDef, ToolEnv } from './types.ts'

const env: ToolEnv = {
    ctx: { userId: 'u1', organizationId: 'org1', role: 'owner' },
}

function def(
    name: string,
    over: Partial<AssistantToolDef> = {},
): AssistantToolDef {
    return {
        name,
        description: `descripción de ${name}`,
        inputSchema: z.object({}),
        permission: 'content:read',
        screens: 'all',
        mutating: false,
        async execute() {
            return { name }
        },
        ...over,
    } as AssistantToolDef
}

test('selectTools: sin el permiso, la herramienta NO existe para ese rol', () => {
    const defs = [
        def('leer'),
        def('facturar', { permission: 'billing:manage' }),
        def('miembros', { permission: 'members:manage' }),
    ]
    assert.deepEqual(
        selectTools(defs, { role: 'operator', screen: 'other' }).map(
            (d) => d.name,
        ),
        ['leer'],
    )
    assert.deepEqual(
        selectTools(defs, { role: 'admin', screen: 'other' }).map(
            (d) => d.name,
        ),
        ['leer', 'facturar'],
    )
    assert.deepEqual(
        selectTools(defs, { role: 'owner', screen: 'other' }).map(
            (d) => d.name,
        ),
        ['leer', 'facturar', 'miembros'],
    )
})

test('selectTools: la pantalla recorta el catálogo', () => {
    const defs = [
        def('soloInbox', { screens: ['inbox'] }),
        def('soloRedes', { screens: ['social-accounts', 'social-posts'] }),
    ]
    assert.deepEqual(
        selectTools(defs, { role: 'owner', screen: 'inbox' }).map(
            (d) => d.name,
        ),
        ['soloInbox'],
    )
    assert.deepEqual(
        selectTools(defs, { role: 'owner', screen: 'social-posts' }).map(
            (d) => d.name,
        ),
        ['soloRedes'],
    )
    assert.deepEqual(
        selectTools(defs, { role: 'owner', screen: 'studio' }).map(
            (d) => d.name,
        ),
        [],
    )
})

test("selectTools: 'all' aparece en TODAS las pantallas", () => {
    const defs = [def('siempre', { screens: 'all' })]
    for (const screen of [
        'inbox',
        'social-accounts',
        'social-posts',
        'studio',
        'modules',
        'other',
    ] as const) {
        assert.deepEqual(
            selectTools(defs, { role: 'owner', screen }).map((d) => d.name),
            ['siempre'],
            `falla en ${screen}`,
        )
    }
})

test('selectTools: una lista de pantallas VACÍA no expone nada (no es "all")', () => {
    const defs = [def('muda', { screens: [] })]
    assert.deepEqual(selectTools(defs, { role: 'owner', screen: 'inbox' }), [])
})

test('selectTools: rol desconocido no ve nada (falla cerrado)', () => {
    const defs = [def('leer')]
    assert.deepEqual(
        // @ts-expect-error — entrada inválida a propósito: es lo que llegaría
        // de una sesión con un rol que la base añadió y el código no conoce.
        selectTools(defs, { role: 'fantasma', screen: 'other' }),
        [],
    )
})

test('selectTools: no muta la lista de entrada ni pierde el orden', () => {
    const defs = [def('a'), def('b'), def('c')]
    const copia = [...defs]
    selectTools(defs, { role: 'owner', screen: 'other' })
    assert.deepEqual(defs, copia)
})

test('toAiTools: nombra las herramientas por su `name` y pasa el env al execute', async () => {
    const vistos: ToolEnv[] = []
    const defs: AssistantToolDef[] = [
        def('eco', {
            inputSchema: z.object({ texto: z.string() }),
            async execute(input, e) {
                vistos.push(e)
                return { eco: (input as { texto: string }).texto }
            },
        }),
    ]
    const tools = toAiTools(defs, env)
    assert.deepEqual(Object.keys(tools), ['eco'])
    const ejecutar = tools.eco.execute
    assert.ok(ejecutar, 'la herramienta debe traer execute')
    const salida = await ejecutar(
        { texto: 'hola' },
        { toolCallId: 't1', messages: [] },
    )
    assert.deepEqual(salida, { eco: 'hola' })
    assert.deepEqual(vistos, [env])
})

test('toAiTools: conserva description e inputSchema del def', () => {
    const schema = z.object({ avatarId: z.string() })
    const tools = toAiTools([def('x', { inputSchema: schema })], env)
    assert.equal(tools.x.description, 'descripción de x')
    assert.equal(tools.x.inputSchema, schema)
})

test('toAiTools: dos herramientas con el MISMO nombre revientan en vez de pisarse', () => {
    assert.throws(() => toAiTools([def('dup'), def('dup')], env), /dup/)
})
