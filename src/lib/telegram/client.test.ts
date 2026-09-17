import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTelegramWebhookUrl, pickFileId, validateSendMedia, type TgMessage } from './client.ts'

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

/**
 * `pickFileId` — Tarea 2 (fotos gratis). Mensaje base sin `photo`/`video`
 * para no repetir los campos obligatorios de `TgMessage` en cada caso.
 */
const BASE_MESSAGE: TgMessage = {
    message_id: 1,
    date: 0,
    chat: { id: 1, type: 'private' },
}

test('pickFileId: con varios tamaños de foto, devuelve el file_id del último (mayor resolución)', () => {
    const message: TgMessage = {
        ...BASE_MESSAGE,
        photo: [
            { file_id: 'small', file_unique_id: 'u1', width: 100, height: 100 },
            { file_id: 'large', file_unique_id: 'u2', width: 800, height: 800 },
        ],
    }
    assert.equal(pickFileId(message), 'large')
})

test('pickFileId: sin foto, cae al file_id del vídeo', () => {
    const message: TgMessage = {
        ...BASE_MESSAGE,
        video: { file_id: 'vid-1', file_unique_id: 'u3', width: 640, height: 480, duration: 12 },
    }
    assert.equal(pickFileId(message), 'vid-1')
})

test('pickFileId: sin foto ni vídeo, devuelve null', () => {
    assert.equal(pickFileId(BASE_MESSAGE), null)
})

/**
 * `validateSendMedia` — Tarea 2. Pura, sin red, mismo criterio que los tests
 * ya existentes para `validateSendPaidMedia` en este mismo fichero (no
 * exportada aún — aquí sólo se cubre la nueva).
 */
test('validateSendMedia: acepta un file_id sin files', () => {
    assert.doesNotThrow(() => validateSendMedia({ chat_id: 1, media: 'file-id-123' }))
})

test('validateSendMedia: acepta attach://<nombre> cuando está en files', () => {
    assert.doesNotThrow(() =>
        validateSendMedia({
            chat_id: 1,
            media: 'attach://file',
            files: { file: new Blob(['x'], { type: 'image/jpeg' }) },
        }),
    )
})

test('validateSendMedia: rechaza caption de más de 1024 caracteres', () => {
    assert.throws(
        () => validateSendMedia({ chat_id: 1, media: 'file-id-123', caption: 'a'.repeat(1025) }),
        RangeError,
    )
})

test('validateSendMedia: rechaza attach://<nombre> que no está en files', () => {
    assert.throws(() => validateSendMedia({ chat_id: 1, media: 'attach://file' }), RangeError)
})

test('validateSendMedia: rechaza media vacío', () => {
    assert.throws(() => validateSendMedia({ chat_id: 1, media: '' }), RangeError)
})
