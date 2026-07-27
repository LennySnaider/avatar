/**
 * CURACIÓN del bucket `avatars` (12-ago, cuando el proyecto viejo reviva):
 * caras, ángulos, hojas del Body Lab (SFW y NSFW) y samples de voz — 193
 * objetos, ~205 MB. Se copian del proyecto VIEJO al bucket `avatars` del
 * NUEVO con los MISMOS paths: las filas de avatar_references (ya
 * restauradas) apuntan ahí, así que todo revive sin tocar una sola fila.
 *
 * El bucket es PRIVADO (la app usa signed URLs), así que la bajada va por el
 * storage API autenticado del proyecto viejo — el service key viejo vuelve a
 * funcionar cuando el gateway reviva.
 *
 * Requiere en .env: OLD_SUPABASE_URL + OLD_SUPABASE_SERVICE_ROLE_KEY (el
 * proyecto bloqueado) y NEW_SUPABASE_URL + NEW_SUPABASE_SERVICE_ROLE_KEY.
 * Idempotente: upsert y salta lo ya copiado.
 */
import { readFileSync } from 'node:fs'

const env = readFileSync(new URL('../../.env', import.meta.url), 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1].trim().replace(/^["']|["']$/g, '')
const OLD_URL = get('OLD_SUPABASE_URL')
const OLD_KEY = get('OLD_SUPABASE_SERVICE_ROLE_KEY')
const NEW_URL = get('NEW_SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL')
const NEW_KEY = get('NEW_SUPABASE_SERVICE_ROLE_KEY') || get('SUPABASE_SERVICE_ROLE_KEY')
if (!OLD_URL || !OLD_KEY || !NEW_URL || !NEW_KEY) throw new Error('faltan OLD_/NEW_ vars')

const inventory = JSON.parse(
    readFileSync(new URL('../../.backup-supabase/data/_storage_objects.json', import.meta.url), 'utf8'),
).filter((o) => o.bucket_id === 'avatars')
console.log(`${inventory.length} objetos en el inventario del bucket avatars`)

let copied = 0, skipped = 0, failed = 0
for (const obj of inventory) {
    try {
        // ¿ya está en el nuevo? HEAD autenticado
        const head = await fetch(`${NEW_URL}/storage/v1/object/avatars/${obj.name}`, {
            method: 'HEAD',
            headers: { Authorization: `Bearer ${NEW_KEY}` },
        })
        if (head.ok) { skipped++; continue }

        const src = await fetch(`${OLD_URL}/storage/v1/object/avatars/${obj.name}`, {
            headers: { Authorization: `Bearer ${OLD_KEY}` },
        })
        if (!src.ok) throw new Error(`origen ${src.status}`)
        const buf = Buffer.from(await src.arrayBuffer())

        const up = await fetch(`${NEW_URL}/storage/v1/object/avatars/${obj.name}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${NEW_KEY}`,
                'Content-Type': obj.mime || 'application/octet-stream',
                'x-upsert': 'true',
            },
            body: new Uint8Array(buf),
        })
        if (!up.ok) throw new Error(`destino ${up.status}: ${(await up.text()).slice(0, 100)}`)
        copied++
        if (copied % 25 === 0) console.log(`  … ${copied} copiados`)
    } catch (e) {
        failed++
        console.warn(`  ❌ ${obj.name}: ${e.message}`)
    }
}
console.log(`\nTOTAL: ${copied} copiados · ${skipped} ya estaban · ${failed} fallidos`)
