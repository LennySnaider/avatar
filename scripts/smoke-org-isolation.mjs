#!/usr/bin/env node
/**
 * F4.2.g — Smoke de aislamiento multitenant contra la BD real.
 * 1) org B efímera no ve datos de la org A (default)
 * 2) insert SIN organization_id FALLA (puente retirado)
 * 3) el cliente ANON no lee tablas tenant (RLS-on-sin-políticas)
 * Limpia todo al final. Uso: node scripts/smoke-org-isolation.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'

for (const f of ['.env.local', '.env']) {
  if (!existsSync(f)) continue
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=["']?([^"'\n]*)["']?$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!URL_ || !SERVICE || !ANON) { console.error('Faltan env vars de Supabase'); process.exit(2) }

const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } })
const anon = createClient(URL_, ANON, { auth: { persistSession: false } })
const ORG_A = '00000000-0000-0000-0000-000000000001'
let orgB = null
let failures = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`)
  if (!ok) failures++
}

try {
  // Seed org B efímera
  const { data: org, error: orgErr } = await svc
    .from('organizations')
    .insert({ name: 'SMOKE Org B', slug: `smoke-org-b-${Date.now()}` })
    .select('id')
    .single()
  if (orgErr) throw new Error('seed org B: ' + orgErr.message)
  orgB = org.id

  // 1) org B no ve avatares/generaciones de A
  const { count: bAvatars } = await svc
    .from('avatars').select('id', { count: 'exact', head: true })
    .eq('organization_id', orgB)
  check('org B ve 0 avatares', (bAvatars ?? 0) === 0, `count=${bAvatars}`)
  const { count: bGens } = await svc
    .from('generations').select('id', { count: 'exact', head: true })
    .eq('organization_id', orgB)
  check('org B ve 0 generations', (bGens ?? 0) === 0, `count=${bGens}`)

  // Insert scoped a B funciona y NO aparece en A
  const { count: aBefore } = await svc
    .from('avatars').select('id', { count: 'exact', head: true })
    .eq('organization_id', ORG_A)
  const { data: bAvatar, error: insErr } = await svc
    .from('avatars')
    .insert({ organization_id: orgB, name: 'SMOKE Avatar B' })
    .select('id')
    .single()
  check('insert avatar en org B', !insErr, insErr?.message)
  const { count: aAfter } = await svc
    .from('avatars').select('id', { count: 'exact', head: true })
    .eq('organization_id', ORG_A)
  check('org A no cambió', aBefore === aAfter, `${aBefore} → ${aAfter}`)
  if (bAvatar) await svc.from('avatars').delete().eq('id', bAvatar.id)

  // 2) insert SIN organization_id debe FALLAR (puente muerto)
  const { error: bridgeErr } = await svc
    .from('avatars')
    .insert({ name: 'SMOKE sin org' })
    .select('id')
    .single()
  check('insert sin org_id FALLA (puente retirado)', !!bridgeErr,
    bridgeErr ? bridgeErr.message.slice(0, 60) : 'insertó — ¡PUENTE VIVO!')

  // 3) anon no lee tablas tenant
  for (const t of ['avatars', 'generations', 'social_posts', 'fanvue_connections', 'ai_providers']) {
    const { data, error } = await anon.from(t).select('*').limit(1)
    check(`anon bloqueado en ${t}`, !!error || (data ?? []).length === 0,
      error ? 'denegado' : `filas=${(data ?? []).length}`)
  }
} catch (e) {
  console.error('💥 smoke abortó:', e.message)
  failures++
} finally {
  // Si el puente siguiera VIVO, el insert "sin org" habría caído en la org A
  // por el DEFAULT: se limpia por nombre para no dejar basura en tu cuenta.
  await svc.from('avatars').delete().eq('name', 'SMOKE sin org')
  if (orgB) {
    await svc.from('avatars').delete().eq('organization_id', orgB)
    await svc.from('organizations').delete().eq('id', orgB)
  }
}
console.log(failures === 0 ? '\n🎉 AISLAMIENTO OK' : `\n💔 ${failures} fallo(s)`)
process.exit(failures === 0 ? 0 : 1)
