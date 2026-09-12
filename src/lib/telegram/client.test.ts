import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTelegramWebhookUrl } from './client.ts'

/**
 * `buildTelegramWebhookUrl` es la ÚNICA fórmula que arma esta dirección: la
 * usan tanto `connectTelegramBot` (AgentTelegramService.ts, al registrar el
 * webhook) como la pantalla del canal (al comparar contra lo que Telegram
 * dice tener registrado, para avisar de un bot apuntando a un sitio muerto).
 * Este test fija el formato para que una regresión aquí no pase desapercibida
 * en ninguno de los dos consumidores — antes de este arreglo, nada la cubría.
 *
 * Manipula `NEXT_PUBLIC_APP_URL` en dos de los tres casos — SIEMPRE
 * restaurada en un `finally` a su valor original (incluido "no estaba
 * definida"), nunca borrada sin más: la suite tiene que poder correr igual
 * con o sin esa variable puesta en el entorno real.
 */

const ENV_KEY = 'NEXT_PUBLIC_APP_URL'

test('termina en la ruta del webhook con el id del avatar', () => {
    const original = process.env[ENV_KEY]
    try {
        delete process.env[ENV_KEY]
        const url = buildTelegramWebhookUrl('avatar-123')
        assert.match(url, /\/api\/webhooks\/telegram\/avatar-123$/)
    } finally {
        if (original === undefined) delete process.env[ENV_KEY]
        else process.env[ENV_KEY] = original
    }
})

test('sin NEXT_PUBLIC_APP_URL cae al respaldo local', () => {
    const original = process.env[ENV_KEY]
    try {
        delete process.env[ENV_KEY]
        assert.equal(buildTelegramWebhookUrl('avatar-789'), 'http://localhost:3030/api/webhooks/telegram/avatar-789')
    } finally {
        if (original === undefined) delete process.env[ENV_KEY]
        else process.env[ENV_KEY] = original
    }
})

test('con NEXT_PUBLIC_APP_URL definida, la usa como base en vez del respaldo', () => {
    const original = process.env[ENV_KEY]
    try {
        process.env[ENV_KEY] = 'https://app.example.com'
        assert.equal(
            buildTelegramWebhookUrl('avatar-456'),
            'https://app.example.com/api/webhooks/telegram/avatar-456',
        )
    } finally {
        if (original === undefined) delete process.env[ENV_KEY]
        else process.env[ENV_KEY] = original
    }
})
