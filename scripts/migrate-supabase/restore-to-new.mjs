/**
 * RESTAURACIÓN al proyecto Supabase NUEVO (trasplante 2026-07-28).
 *
 * Orden a prueba de la FK CIRCULAR (avatars.default_voice_id → cloned_voices
 * → avatars): primero tipos+tablas, luego DATOS, y solo al final constraints,
 * índices, funciones, triggers y policies. Por eso el schema.sql del dump
 * separa los ALTER de los CREATE TABLE.
 *
 * Requiere en .env:
 *   SUPABASE_ACCESS_TOKEN   (token de cuenta — vale para el proyecto nuevo)
 *   NEW_SUPABASE_URL        https://<ref-nuevo>.supabase.co
 *   NEW_SUPABASE_SERVICE_ROLE_KEY
 *
 * Idempotente razonable: los CREATE fallan con "already exists" y se listan
 * como saltados; los datos van con upsert por PK.
 */
import { readFileSync, readdirSync } from 'node:fs'

const env = readFileSync(new URL('../../.env', import.meta.url), 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1].trim().replace(/^["']|["']$/g, '')
const token = get('SUPABASE_ACCESS_TOKEN')
const NEW_URL = get('NEW_SUPABASE_URL')
const NEW_KEY = get('NEW_SUPABASE_SERVICE_ROLE_KEY')
if (!token || !NEW_URL || !NEW_KEY) throw new Error('faltan SUPABASE_ACCESS_TOKEN / NEW_SUPABASE_URL / NEW_SUPABASE_SERVICE_ROLE_KEY')
const newRef = NEW_URL.match(/https:\/\/([a-z0-9]+)\./)[1]
const BACKUP = new URL('../../.backup-supabase/', import.meta.url).pathname

async function sqlNew(query) {
    const r = await fetch(`https://api.supabase.com/v1/projects/${newRef}/database/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
    })
    const text = await r.text()
    if (!r.ok) throw new Error(text.slice(0, 300))
    return text ? JSON.parse(text) : []
}

// ── 1. ESQUEMA en dos mitades ──
const schema = readFileSync(`${BACKUP}schema.sql`, 'utf8')
// separador natural: los constraints empiezan en el comentario
const cut = schema.indexOf('-- constraints')
const pre = schema.slice(0, cut)     // tipos + secuencias + tablas
const post = schema.slice(cut)       // constraints + índices + funciones + triggers + RLS + policies

async function runStatements(sqlText, label) {
    // split por ';' al final de línea — las funciones llevan $$ y no se pueden
    // partir a ciegas, así que se agrupan por bloques $$
    const stmts = []
    let buf = ''
    let inDollar = false
    for (const line of sqlText.split('\n')) {
        if (line.trim().startsWith('--')) continue
        buf += line + '\n'
        const dollars = (line.match(/\$[a-zA-Z_]*\$/g) ?? []).length
        if (dollars % 2 === 1) inDollar = !inDollar
        if (!inDollar && line.trimEnd().endsWith(';')) {
            if (buf.trim()) stmts.push(buf.trim())
            buf = ''
        }
    }
    let ok = 0, skipped = 0, failedList = []
    for (const st of stmts) {
        try { await sqlNew(st); ok++ }
        catch (e) {
            if (/already exists|42710|42P07|42P16/.test(e.message)) { skipped++ }
            else failedList.push({ st: st.slice(0, 90), err: e.message.slice(0, 140) })
        }
    }
    console.log(`${label}: ${ok} ok · ${skipped} ya existían · ${failedList.length} fallidas`)
    for (const f of failedList) console.log(`   ❌ ${f.st}… → ${f.err}`)
    return failedList.length
}

console.log('— Fase 1: tipos + tablas —')
await runStatements(pre, 'esquema (pre-datos)')

// ── 2. DATOS (por REST del proyecto nuevo: maneja JSON/vector sin escapes) ──
// Orden por dependencias; el resto de FKs aún no existen así que no estorban.
const ORDER = [
    'organizations', 'users', 'organization_members', 'avatars',
    'cloned_voices', 'avatar_references', 'avatar_personas', 'avatar_knowledge',
    'avatar_fan_memories', 'audio_scripts', 'prompts', 'generations',
    'pending_generations', 'ai_providers', 'social_profiles', 'social_posts',
    'trending_sounds', 'video_flows', 'fanvue_connections', 'fanvue_creators',
    'fanvue_posts', 'agent_chats', 'agent_messages', 'agent_usage_counters',
]
const files = readdirSync(`${BACKUP}data`).filter((f) => f.endsWith('.json') && !f.startsWith('_'))
const missing = files.map((f) => f.replace('.json', '')).filter((t) => !ORDER.includes(t))
if (missing.length) throw new Error(`tablas sin orden asignado: ${missing.join(', ')}`)

console.log('\n— Fase 2: datos —')
for (const table of ORDER) {
    const rows = JSON.parse(readFileSync(`${BACKUP}data/${table}.json`, 'utf8'))
    if (!rows.length) { console.log(`  ${table.padEnd(26)} 0`); continue }
    let inserted = 0
    for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200)
        const r = await fetch(`${NEW_URL}/rest/v1/${table}`, {
            method: 'POST',
            headers: {
                apikey: NEW_KEY,
                Authorization: `Bearer ${NEW_KEY}`,
                'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates',
            },
            body: JSON.stringify(chunk),
        })
        if (!r.ok) throw new Error(`${table}: ${(await r.text()).slice(0, 300)}`)
        inserted += chunk.length
    }
    console.log(`  ${table.padEnd(26)} ${inserted}`)
}

// ── 3. constraints + índices + funciones + triggers + RLS + policies ──
console.log('\n— Fase 3: constraints y resto —')
await runStatements(post, 'esquema (post-datos)')

// ── 4. buckets de storage ──
console.log('\n— Fase 4: buckets —')
const buckets = JSON.parse(readFileSync(`${BACKUP}data/_storage_buckets.json`, 'utf8'))
for (const b of buckets) {
    const r = await fetch(`${NEW_URL}/storage/v1/bucket`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${NEW_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: b.id, name: b.name, public: b.public }),
    })
    console.log(`  bucket ${b.id}: ${r.ok ? 'creado' : (await r.text()).slice(0, 80)}`)
}

// ── 5. verificación de conteos ──
console.log('\n— Verificación —')
for (const table of ORDER) {
    const want = JSON.parse(readFileSync(`${BACKUP}data/${table}.json`, 'utf8')).length
    const got = (await sqlNew(`select count(*)::int as n from public."${table}"`))[0].n
    console.log(`  ${table.padEnd(26)} ${got}/${want} ${got === want ? '✅' : '❌'}`)
}
console.log('\nListo. Siguiente: flip del .env al proyecto nuevo + R2_ENABLED=true.')
