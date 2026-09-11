#!/usr/bin/env node
/**
 * F4.2.g — Pre-flight de la Tarea 7: prueba de NO-PÉRDIDA de datos de la org
 * por defecto (la cuenta original) alrededor de las migraciones.
 *
 *   node scripts/preflight-org-counts.mjs snapshot   ← ANTES de migrar
 *   node scripts/preflight-org-counts.mjs verify     ← DESPUÉS de migrar+smoke
 *
 * `verify` FALLA (exit 1) si alguna tabla tiene MENOS filas de la org que en
 * el snapshot — perder filas es lo único que este guardián no perdona. Un
 * AUMENTO solo avisa: la app puede estar viva y generando durante la ventana.
 * Con --strict también falla el aumento (ventana de mantenimiento real).
 *
 * Las tablas salen de TENANT_TABLES (src/lib/org/orgTable.ts) parseadas del
 * fuente para que la lista no se desincronice, + las org-scoped posteriores a
 * esa lista (pending_generations, org_wallets, token_ledger) + la propia fila
 * de organizations.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SNAPSHOT = join(ROOT, 'scripts', '.preflight-org-counts.snapshot.json')
const ORG_A = '00000000-0000-0000-0000-000000000001'

for (const f of [join(ROOT, '.env.local'), join(ROOT, '.env')]) {
  if (!existsSync(f)) continue
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=["']?([^"'\n]*)["']?$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !SERVICE) { console.error('Faltan env vars de Supabase'); process.exit(2) }
const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } })

// TENANT_TABLES desde el fuente: si el parse falla, mejor reventar que
// vigilar una lista incompleta.
const orgTableSrc = readFileSync(join(ROOT, 'src/lib/org/orgTable.ts'), 'utf8')
const listMatch = orgTableSrc.match(/TENANT_TABLES\s*=\s*\[([\s\S]*?)\]\s*as const/)
if (!listMatch) { console.error('No pude parsear TENANT_TABLES de orgTable.ts'); process.exit(2) }
const tenantTables = [...listMatch[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
if (tenantTables.length < 18) {
  console.error(`TENANT_TABLES parseó solo ${tenantTables.length} tablas (<18): sospechoso, abortando`)
  process.exit(2)
}
const EXTRAS = ['pending_generations', 'org_wallets', 'token_ledger']
const TABLES = [...tenantTables, ...EXTRAS]

async function countRows() {
  const counts = {}
  for (const t of TABLES) {
    const { count: total, error: e1 } = await svc
      .from(t).select('*', { count: 'exact', head: true })
    if (e1) { console.error(`count total ${t}: ${e1.message}`); process.exit(2) }
    const { count: orgA, error: e2 } = await svc
      .from(t).select('*', { count: 'exact', head: true })
      .eq('organization_id', ORG_A)
    if (e2) { console.error(`count orgA ${t}: ${e2.message}`); process.exit(2) }
    counts[t] = { total: total ?? 0, orgA: orgA ?? 0 }
  }
  // La fila de la org misma: tiene que seguir existiendo, siempre.
  const { count: orgRow, error: e3 } = await svc
    .from('organizations').select('*', { count: 'exact', head: true })
    .eq('id', ORG_A)
  if (e3) { console.error(`organizations: ${e3.message}`); process.exit(2) }
  counts.__org_row__ = { total: orgRow ?? 0, orgA: orgRow ?? 0 }
  return counts
}

const mode = process.argv[2]
const strict = process.argv.includes('--strict')

if (mode === 'snapshot') {
  const counts = await countRows()
  writeFileSync(SNAPSHOT, JSON.stringify({ takenAt: new Date().toISOString(), ORG_A, counts }, null, 2))
  for (const [t, c] of Object.entries(counts)) console.log(`${t.padEnd(24)} total=${c.total}  orgA=${c.orgA}`)
  console.log(`\n📸 Snapshot guardado en ${SNAPSHOT}`)
} else if (mode === 'verify') {
  if (!existsSync(SNAPSHOT)) { console.error('No hay snapshot: corré primero `snapshot`'); process.exit(2) }
  const before = JSON.parse(readFileSync(SNAPSHOT, 'utf8'))
  const after = await countRows()
  let failures = 0
  for (const [t, b] of Object.entries(before.counts)) {
    const a = after[t]
    if (!a) { console.log(`❌ ${t}: desapareció del conteo`); failures++; continue }
    for (const k of ['orgA', 'total']) {
      if (a[k] < b[k]) { console.log(`❌ ${t}.${k}: ${b[k]} → ${a[k]} (PERDIÓ ${b[k] - a[k]} filas)`); failures++ }
      else if (a[k] > b[k]) {
        const msg = `${t}.${k}: ${b[k]} → ${a[k]} (+${a[k] - b[k]}, actividad durante la ventana)`
        if (strict) { console.log(`❌ ${msg} [--strict]`); failures++ } else console.log(`⚠️  ${msg}`)
      } else console.log(`✅ ${t}.${k}: ${a[k]}`)
    }
  }
  console.log(failures === 0 ? '\n🎉 CERO pérdida de datos' : `\n💔 ${failures} problema(s) — NO seguir sin investigar`)
  process.exit(failures === 0 ? 0 : 1)
} else {
  console.error('Uso: node scripts/preflight-org-counts.mjs snapshot|verify [--strict]')
  process.exit(2)
}
