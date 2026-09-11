// src/app/(protected-pages)/concepts/avatar-forge/_utils/pollProviderTask.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    pollProviderTask,
    type ProviderTaskStatus,
} from './pollProviderTask.ts'

/** Encadena respuestas: cada tick devuelve (o lanza) la siguiente. */
const scripted = (steps: Array<ProviderTaskStatus | Error>) => {
    let i = 0
    return async (): Promise<ProviderTaskStatus> => {
        const step = steps[Math.min(i++, steps.length - 1)]
        if (step instanceof Error) throw step
        return step
    }
}

const fetchFail = () => new TypeError('Failed to fetch')

test('la consulta que se cae NO es una tarea fallida: se reintenta y entrega', async () => {
    // Este es EL caso del reporte: la server action del poll se rechaza con
    // "Failed to fetch" mientras KIE termina la imagen sin problema.
    const r = await pollProviderTask({
        check: scripted([
            { status: 'running' },
            fetchFail(),
            fetchFail(),
            { status: 'done', url: 'https://kie/img.jpg' },
        ]),
        budgetMs: 10_000,
        interval: 1,
    })
    assert.deepEqual(r, { outcome: 'done', url: 'https://kie/img.jpg' })
})

test('un fallo dicho por el proveedor SÍ es terminal (para poder reembolsar)', async () => {
    const r = await pollProviderTask({
        check: scripted([{ status: 'failed', error: 'content policy' }]),
        budgetMs: 10_000,
        interval: 1,
    })
    assert.deepEqual(r, { outcome: 'failed', error: 'content policy' })
})

test('red caída sin fin → timeout transitorio, NUNCA failed', async () => {
    // La diferencia importa en dinero: 'failed' da de baja el rastro y borra la
    // única forma de reclamar una generación que el proveedor sí entregó.
    const r = await pollProviderTask({
        check: scripted([fetchFail()]),
        budgetMs: 10_000,
        interval: 1,
        maxConsecutiveErrors: 3,
    })
    assert.equal(r.outcome, 'timeout')
    assert.equal(r.outcome === 'timeout' && r.transient, true)
})

test('el contador de fallos se reinicia con cada respuesta buena', async () => {
    // Un bache de red intermitente no debe acumular contra una tarea sana.
    const r = await pollProviderTask({
        check: scripted([
            fetchFail(),
            { status: 'running' },
            fetchFail(),
            { status: 'running' },
            fetchFail(),
            { status: 'done', url: 'ok' },
        ]),
        budgetMs: 10_000,
        interval: 1,
        maxConsecutiveErrors: 2,
    })
    assert.deepEqual(r, { outcome: 'done', url: 'ok' })
})

test("'processing' de MuleRouter y 'running' de KIE son el mismo estado", async () => {
    const r = await pollProviderTask({
        check: scripted([
            { status: 'processing' },
            { status: 'done', url: 'mr' },
        ]),
        budgetMs: 10_000,
        interval: 1,
    })
    assert.deepEqual(r, { outcome: 'done', url: 'mr' })
})

test('agotar el plazo no es transitorio: la tarea simplemente no terminó', async () => {
    const r = await pollProviderTask({
        check: scripted([{ status: 'running' }]),
        budgetMs: 30,
        interval: 5,
    })
    assert.equal(r.outcome, 'timeout')
    assert.equal(r.outcome === 'timeout' && r.transient, false)
})
