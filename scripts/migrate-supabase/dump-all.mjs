// DUMP completo del proyecto bloqueado vía Management API → disco local.
// Datos (JSON por tabla, paginado) + inventario de storage + DDL del esquema.
import { writeFileSync, mkdirSync } from 'node:fs'
import { sql } from './inventory.mjs'

const OUT = '/Users/lenny/Documents/prime-avatar/.backup-supabase'
mkdirSync(`${OUT}/data`, { recursive: true })

// ── 1. DATOS de public.* + inventario de storage ──
const tables = (await sql(`
    select relname from pg_stat_user_tables
    where schemaname = 'public' order by relname`)).map((t) => t.relname)

let totalRows = 0
for (const t of tables) {
    const rows = []
    for (let off = 0; ; off += 500) {
        const page = await sql(`select * from public."${t}" order by 1 limit 500 offset ${off}`)
        rows.push(...page)
        if (page.length < 500) break
    }
    writeFileSync(`${OUT}/data/${t}.json`, JSON.stringify(rows))
    totalRows += rows.length
    console.log(`  ${t.padEnd(28)} ${rows.length} filas`)
}

// storage: buckets + objetos (solo metadata — los bytes están bloqueados,
// pero el INVENTARIO es lo que permite curar y verificar el 12-ago)
const buckets = await sql(`select * from storage.buckets order by 1`)
writeFileSync(`${OUT}/data/_storage_buckets.json`, JSON.stringify(buckets))
const objs = []
for (let off = 0; ; off += 2000) {
    const page = await sql(`select bucket_id, name, metadata->>'size' as size, metadata->>'mimetype' as mime from storage.objects order by bucket_id, name limit 2000 offset ${off}`)
    objs.push(...page)
    if (page.length < 2000) break
}
writeFileSync(`${OUT}/data/_storage_objects.json`, JSON.stringify(objs))
console.log(`  storage: ${buckets.length} buckets · ${objs.length} objetos inventariados`)
console.log(`\nDATOS: ${totalRows} filas en ${tables.length} tablas`)
