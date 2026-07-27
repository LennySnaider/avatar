// Reconstruye el DDL del esquema public (+ policies de storage) desde el
// catálogo. pg_dump no puede correr por el Management API, pero el catálogo
// tiene funciones que emiten DDL literal (pg_get_constraintdef, indexdef,
// pg_get_functiondef, pg_get_triggerdef) — se ensambla de ahí.
import { writeFileSync } from 'node:fs'
import { sql } from './inventory.mjs'
const OUT = '/Users/lenny/Documents/prime-avatar/.backup-supabase'
const parts = ['-- Esquema reconstruido del proyecto huszemcrgiuhbknbsysf (2026-07-28)\n']

// extensiones (las de infraestructura ya existen en todo proyecto Supabase)
parts.push(`create extension if not exists "uuid-ossp";\ncreate extension if not exists pgcrypto;\ncreate extension if not exists vector;\n`)

// TIPOS propios (enums) — van ANTES de las tablas que los usan. Sin esto la
// restauración muere en la primera columna tipada con un enum.
const enums = await sql(`
    select t.typname, array_agg(e.enumlabel order by e.enumsortorder) as labels
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
    group by t.typname order by t.typname`)
for (const en of enums) {
    const labels = (Array.isArray(en.labels) ? en.labels : String(en.labels).replace(/[{}]/g, '').split(','))
        .map((l) => `'${l}'`).join(', ')
    parts.push(`create type public.${en.typname} as enum (${labels});`)
}

// secuencias propias (si las hay)
const seqs = await sql(`select sequencename from pg_sequences where schemaname='public'`)
for (const s of seqs) parts.push(`create sequence if not exists public."${s.sequencename}";`)

// tablas: columnas + defaults + not null
const tables = (await sql(`select relname from pg_stat_user_tables where schemaname='public' order by relname`)).map((t) => t.relname)
for (const t of tables) {
    const cols = await sql(`
        select column_name, data_type, udt_name, is_nullable, column_default,
               character_maximum_length
        from information_schema.columns
        where table_schema='public' and table_name='${t}'
        order by ordinal_position`)
    const colDefs = cols.map((c) => {
        let type = c.data_type === 'USER-DEFINED' ? c.udt_name
            : c.data_type === 'ARRAY' ? `${c.udt_name.replace(/^_/, '')}[]`
            : c.data_type
        if (c.character_maximum_length) type += `(${c.character_maximum_length})`
        let def = `    "${c.column_name}" ${type}`
        if (c.column_default) def += ` default ${c.column_default}`
        if (c.is_nullable === 'NO') def += ' not null'
        return def
    })
    parts.push(`\ncreate table public."${t}" (\n${colDefs.join(',\n')}\n);`)
}

// constraints: PK/UNIQUE/CHECK primero, FKs al FINAL (dependen del orden)
const cons = await sql(`
    select conrelid::regclass::text as tbl, conname, contype,
           pg_get_constraintdef(oid) as def
    from pg_constraint
    where connamespace = 'public'::regnamespace
    order by contype != 'f', conrelid::regclass::text`)
parts.push('\n-- constraints (FKs al final)')
for (const c of cons) {
    parts.push(`alter table ${c.tbl} add constraint "${c.conname}" ${c.def};`)
}

// índices no ligados a constraints
const idx = await sql(`
    select indexdef from pg_indexes
    where schemaname='public'
      and indexname not in (select conname from pg_constraint where connamespace='public'::regnamespace)`)
parts.push('\n-- índices')
for (const i of idx) parts.push(i.indexdef + ';')

// funciones propias
const fns = await sql(`
    select pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'  -- las extensiones (vector) meten AGREGADOS en public
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')`)
parts.push('\n-- funciones')
for (const f of fns) parts.push(f.def + ';')

// triggers
const trg = await sql(`
    select pg_get_triggerdef(t.oid) as def
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='public' and not t.tgisinternal`)
parts.push('\n-- triggers')
for (const t of trg) parts.push(t.def + ';')

// RLS + policies (public y storage)
const rls = await sql(`
    select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relrowsecurity`)
parts.push('\n-- RLS')
for (const r of rls) parts.push(`alter table public."${r.relname}" enable row level security;`)
const pols = await sql(`
    select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    from pg_policies where schemaname in ('public','storage') order by schemaname, tablename, policyname`)
for (const p of pols) {
    const roles = (Array.isArray(p.roles) ? p.roles : String(p.roles).replace(/[{}]/g, '').split(',')).join(', ')
    let stmt = `create policy "${p.policyname}" on ${p.schemaname}."${p.tablename}" as ${p.permissive} for ${p.cmd} to ${roles}`
    if (p.qual) stmt += ` using (${p.qual})`
    if (p.with_check) stmt += ` with check (${p.with_check})`
    parts.push(stmt + ';')
}

writeFileSync(`${OUT}/schema.sql`, parts.join('\n'))
console.log(`schema.sql: ${parts.length} sentencias · tablas ${tables.length} · constraints ${cons.length} · índices ${idx.length} · funciones ${fns.length} · triggers ${trg.length} · policies ${pols.length}`)
