// Inventario del proyecto bloqueado vía Management API: tablas + filas +
// esquemas de interés (public, auth, storage).
import { readFileSync } from 'node:fs'
const env = readFileSync('/Users/lenny/Documents/prime-avatar/.env', 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1].trim().replace(/^["']|["']$/g, '')
const ref = get('NEXT_PUBLIC_SUPABASE_URL').match(/https:\/\/([a-z0-9]+)\./)[1]
const token = get('SUPABASE_ACCESS_TOKEN')

export async function sql(query) {
    const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
    })
    if (!r.ok) throw new Error(`mgmt ${r.status}: ${(await r.text()).slice(0, 300)}`)
    return r.json()
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const tables = await sql(`
        select schemaname, relname, n_live_tup
        from pg_stat_user_tables
        where schemaname in ('public','auth','storage')
        order by schemaname, relname`)
    for (const t of tables) console.log(`${t.schemaname}.${t.relname}`.padEnd(42), t.n_live_tup)
    const ext = await sql(`select extname from pg_extension order by 1`)
    console.log('\nextensiones:', ext.map((e) => e.extname).join(', '))
    const size = await sql(`select pg_size_pretty(pg_database_size(current_database())) as s`)
    console.log('tamaño BD:', size[0].s)
}
