# Módulos instalables + cobro por módulo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una organización pueda instalar/desinstalar módulos de pago (el primero: Telegram), que la navegación y las rutas del módulo se oculten si no está instalado, y que las comisiones por venta y la cuota mensual por bot queden asentadas en el ledger de tokens existente sin bloquear a nadie.

**Architecture:** Dos tablas nuevas (`module_catalog` global con precios editables, `org_modules` tenant con el estado por organización) y un tipo de asiento nuevo en el ledger (`kind='charge'`) con su función SQL `wallet_charge`, calcada de `wallet_hold` pero sin reserva: el hecho ya ocurrió, se debita y se asienta en una sola fila. Sobre eso, un helper de entitlement (`hasModule`/`requireModule`) que usan las server actions, un filtro del árbol de navegación en servidor, y dos caminos de cobro: comisión por venta (la llama el canal Telegram cuando alguien compra) y cuota mensual por bot (un cron idempotente por mes).

**Tech Stack:** Next.js 15 App Router (Server Components + server actions `'use server'`), TypeScript estricto, Supabase con service-role y filtro manual de `organization_id` (RLS sin políticas), PL/pgSQL para las funciones de wallet, componentes ECME (`@/components/ui`), tests con `node:test` vía tsx (`npm test`).

**Spec:** `docs/superpowers/specs/2026-09-11-telegram-telestars-module-design.md` (sub-proyecto B, fases 1-5 del orden global)

## Global Constraints

- Migraciones SIEMPRE vía MCP de Supabase `apply_migration`. **NUNCA** `supabase db push` (el historial remoto está vacío y desalineado). El archivo `.sql` se guarda igualmente en `supabase/migrations/` como documentación.
- Proyecto Supabase: ref `wiocwfoydyknqmhixpyt`. El ref viejo devuelve `[]` mintiendo.
- **NUNCA** `npm run build` con el `dev` encendido (comparten `.next`, la UI desaparece sin error). Validar con `npx tsc --noEmit` + `npm run lint` + `npm run check:tenant`.
- En archivos `'use server'` **TODOS** los exports deben ser `async`. Ni tsc ni eslint lo detectan, sólo el build.
- Sólo componentes ECME de `@/components/ui/*` y `@/components/shared/*`. Prohibido `window.confirm` / `window.alert` / Shadcn / Radix.
- Toda tabla tenant nueva se añade a `TENANT_TABLES` en `src/lib/org/orgTable.ts` y se accede con `orgTable`/`orgInsert`/`orgUpsert`. `module_catalog` es global y NO va ahí.
- Mensajes de commit sin firma de Claude ni de Anthropic.
- La autorización real es `getOrgContext()` + filtro `organization_id`. El RBAC del middleware está comentado a propósito: no tocarlo.
- `enforcementEnabled()` (`ENFORCE_LIMITS`) sigue apagado. Ningún cobro de este plan bloquea nada: se mide.

---

## File Structure

**Se crea:**

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20260911120000_org_modules.sql` | `module_catalog`, `org_modules`, `kind='charge'`, `wallet_charge`, índice de ledger por sku |
| `src/lib/modules/catalog.ts` | Lectura del catálogo global de módulos (precios y comisiones) |
| `src/lib/modules/entitlements.ts` | `hasModule` / `requireModule` / `listOrgModules` / `hasModuleForOrg` / `listInstalledSlugsForOrg` |
| `src/lib/modules/navigation.ts` | `filterNavigationByModules` — función pura sobre el árbol de navegación |
| `src/lib/modules/navigation.test.ts` | Tests del filtro |
| `src/lib/billing/moduleCharges.ts` | `settleStarsCommission` — comisión por venta |
| `src/lib/billing/moduleFees.ts` | `chargeModuleFees` — cuota mensual por unidad |
| `src/lib/billing/moduleSummary.ts` | `getModuleBillingSummary` — lo que ve el usuario |
| `src/app/api/cron/module-fees/route.ts` | Cáscara HTTP del cron de cuotas |
| `src/services/ModulesService.ts` | Server actions: listar, instalar, desinstalar, overview |
| `src/components/shared/ModuleCheck.tsx` | Gate declarativo de UI por módulo |
| `src/app/(protected-pages)/concepts/account/modules/page.tsx` | Página marketplace (server) |
| `src/app/(protected-pages)/concepts/account/modules/_components/ModulesClient.tsx` | Grid de módulos con instalar/desinstalar |
| `src/app/(protected-pages)/concepts/account/modules/_components/ModuleNotInstalled.tsx` | Pantalla "instala el módulo" para entradas por URL |
| `src/app/(protected-pages)/concepts/account/modules/_components/ModuleBillingSummary.tsx` | Cuota estimada + comisiones + saldo |

**Se modifica:**

| Archivo | Cambio |
|---|---|
| `src/lib/org/orgTable.ts` | `'org_modules'` en `TENANT_TABLES` |
| `src/lib/billing/catalog.ts` | `STAR_USD`, `starsToUsd`, `usdToTokens`, `MODULE_SKU` |
| `src/lib/billing/catalog.test.ts` | Tests de los helpers nuevos (crear si no existe) |
| `src/lib/billing/wallet.ts` | `chargeTokens` |
| `src/@types/navigation.ts` | `meta.requiredModule?: string` |
| `src/server/actions/navigation/getNavigation.ts` | Filtra el árbol por módulos instalados |
| `src/components/template/Navigation/NavigationContext.tsx` | Expone `installedModules` |
| `src/configs/routes.config/conceptsRoute.ts` | Ruta `/concepts/account/modules` |
| `src/components/template/UserProfileDropdown.tsx` | Entrada "Modules" |
| `scripts/check-tenant-access.mjs` | Exenciones de los ficheros sin sesión |
| `eslint.config.mjs` | Exenciones de los ficheros sin sesión |
| `vercel.json` | Cron `module-fees` |

**NO se toca:** `src/middleware.ts`, `src/lib/tenant/getOrgContext.ts`, `wallet_hold` / `wallet_settle` / `wallet_refund` (sólo se añade `wallet_charge`), nada del módulo Agent.

---

### Task 1: Migración — catálogo, instalaciones y el asiento `charge`

**Files:**
- Create: `supabase/migrations/20260911120000_org_modules.sql`
- Modify: `src/lib/org/orgTable.ts` (`TENANT_TABLES`)
- Modify: `src/@types/database.generated.ts` (regenerado, no a mano)

**Interfaces:**
- Consumes: nada (primera tarea).
- Produces: tablas `module_catalog` (`slug`, `name`, `description`, `price_usd_month_per_unit`, `unit`, `commission_ai_pct`, `commission_manual_pct`, `is_public`, `sort_order`) y `org_modules` (`organization_id`, `module_slug`, `status`, `installed_at`, `uninstalled_at`, `installed_by`, `settings`); función `wallet_charge(p_org uuid, p_user text, p_tokens bigint, p_sku text, p_ref_type text, p_ref_id text, p_idempotency_key text, p_cost_usd numeric, p_metadata jsonb, p_enforce boolean) returns jsonb` con forma `{ok:true, ledger_id, tokens, from_included, from_purchased}` | `{ok:true, replayed:true, ledger_id, tokens}` | `{ok:false, reason:'insufficient_tokens', available, required}`.

- [ ] **Step 1: Escribir el archivo de migración**

Crear `supabase/migrations/20260911120000_org_modules.sql`:

```sql
-- Módulos instalables por organización + asiento de cargo instantáneo.
--
-- POR QUÉ UN `kind` NUEVO Y NO `settle`/`adjust`: una fila `settle` significa
-- "delta devuelto de un hold" (la escribe wallet_settle con hold_id); un settle
-- negativo sin hold rompe toda lectura que sume settles como devoluciones.
-- `adjust` es para correcciones manuales de soporte y sólo toca purchased.
-- Un cargo de facturación no reserva nada (el hecho ya ocurrió: la venta se
-- cobró en Telegram, el mes ya pasó), así que hold+settle serían dos filas y
-- ruido en held_balance para nada.

create table if not exists module_catalog (
    slug text primary key,
    name text not null,
    description text,
    -- Cuota mensual por UNIDAD instalada (bot conectado, avatar, o la org).
    price_usd_month_per_unit numeric(10, 2) not null default 0,
    unit text not null default 'org' check (unit in ('bot', 'avatar', 'org')),
    -- % sobre cada venta atribuida al módulo, según quién la cerró.
    commission_ai_pct numeric(5, 2) not null default 0,
    commission_manual_pct numeric(5, 2) not null default 0,
    is_public boolean not null default true,
    sort_order int not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
alter table module_catalog enable row level security;

-- Precios semilla = tier Starter de Telestars. Editables por SQL/MCP; no hay
-- UI de plataforma en v1. Un solo precio por módulo: los tiers futuros serán
-- filas nuevas, no una columna.
insert into module_catalog
    (slug, name, description, price_usd_month_per_unit, unit,
     commission_ai_pct, commission_manual_pct, sort_order)
values
    ('telegram', 'Telegram',
     'Conecta tu bot de Telegram y vende contenido con Telegram Stars.',
     29.90, 'bot', 15.00, 5.00, 1)
on conflict (slug) do nothing;

create table if not exists org_modules (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    module_slug text not null references module_catalog(slug),
    status text not null default 'installed'
        check (status in ('installed', 'suspended', 'uninstalled')),
    installed_at timestamptz not null default now(),
    uninstalled_at timestamptz,
    -- id de NextAuth (text). Auditoría de quién instaló, NO frontera de tenant.
    installed_by text,
    settings jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, module_slug)
);
create index if not exists org_modules_org_status_idx
    on org_modules (organization_id, status);
alter table org_modules enable row level security;

-- Desinstalar NO borra la fila (historial); reinstalar es un upsert que
-- devuelve status a 'installed'.

alter table token_ledger drop constraint if exists token_ledger_kind_check;
alter table token_ledger add constraint token_ledger_kind_check
    check (kind in ('grant','purchase','hold','settle','refund','adjust','charge'));

-- Lectura "consumo por módulo en el periodo" (Settings/Billing, página del módulo).
create index if not exists token_ledger_org_sku_created_idx
    on token_ledger (organization_id, sku, created_at desc);

-- wallet_charge — cargo INSTANTÁNEO. Calcado de wallet_hold salvo por: no
-- toca held_balance y asienta kind='charge'. p_enforce lo pasan en false los
-- callers de módulos (la venta ya ocurrió; negarse a asentarla sólo perdería
-- la deuda) y el sobregiro queda anotado en metadata para poder verlo.
create or replace function wallet_charge(
    p_org uuid,
    p_user text,
    p_tokens bigint,
    p_sku text,
    p_ref_type text default null,
    p_ref_id text default null,
    p_idempotency_key text default null,
    p_cost_usd numeric default null,
    p_metadata jsonb default '{}'::jsonb,
    p_enforce boolean default false
) returns jsonb language plpgsql as $$
declare
    v_wallet org_wallets;
    v_existing token_ledger;
    v_from_included bigint;
    v_from_purchased bigint;
    v_available bigint;
    v_id uuid;
begin
    if p_tokens <= 0 then
        raise exception 'wallet_charge: p_tokens debe ser > 0 (recibido %)', p_tokens;
    end if;

    -- Idempotencia ANTES de tocar el wallet: la reentrega de un webhook o un
    -- segundo pase del cron devuelven el asiento que ya existe.
    if p_idempotency_key is not null then
        select * into v_existing from token_ledger
        where organization_id = p_org and idempotency_key = p_idempotency_key;
        if found then
            return jsonb_build_object('ok', true, 'replayed', true,
                'ledger_id', v_existing.id, 'tokens', abs(v_existing.tokens));
        end if;
    end if;

    insert into org_wallets (organization_id) values (p_org)
    on conflict (organization_id) do nothing;

    select * into v_wallet from org_wallets
    where organization_id = p_org for update;

    v_available := v_wallet.included_balance + v_wallet.purchased_balance;

    if p_enforce and v_available < p_tokens then
        return jsonb_build_object('ok', false, 'reason', 'insufficient_tokens',
            'available', v_available, 'required', p_tokens);
    end if;

    v_from_included := least(greatest(v_wallet.included_balance, 0), p_tokens);
    v_from_purchased := p_tokens - v_from_included;

    update org_wallets set
        included_balance = included_balance - v_from_included,
        purchased_balance = purchased_balance - v_from_purchased,
        updated_at = now()
    where organization_id = p_org;

    insert into token_ledger (
        organization_id, user_id, kind, sku, tokens, cost_usd,
        from_included, from_purchased, ref_type, ref_id, idempotency_key, metadata
    ) values (
        p_org, p_user, 'charge', p_sku, -p_tokens, p_cost_usd,
        v_from_included, v_from_purchased, p_ref_type, p_ref_id, p_idempotency_key,
        coalesce(p_metadata, '{}'::jsonb)
            || case when not p_enforce and v_available < p_tokens
               then jsonb_build_object('measure_only_shortfall', p_tokens - v_available)
               else '{}'::jsonb end
    ) returning id into v_id;

    return jsonb_build_object('ok', true, 'ledger_id', v_id, 'tokens', p_tokens,
        'from_included', v_from_included, 'from_purchased', v_from_purchased);
end $$;
```

- [ ] **Step 2: Aplicar la migración con el MCP de Supabase**

Usar la herramienta `mcp__supabase__apply_migration` con `name: "org_modules"` y el contenido del archivo anterior. **No** ejecutar `supabase db push`.

- [ ] **Step 3: Verificar el catálogo y las tablas**

Con `mcp__supabase__execute_sql`:

```sql
select slug, price_usd_month_per_unit, unit, commission_ai_pct, commission_manual_pct
from module_catalog;
```
Esperado: una fila `telegram | 29.90 | bot | 15.00 | 5.00`.

```sql
select conname, pg_get_constraintdef(oid)
from pg_constraint where conname = 'token_ledger_kind_check';
```
Esperado: la definición incluye `'charge'`.

- [ ] **Step 4: Verificar `wallet_charge` (ida, replay y limpieza)**

Con `mcp__supabase__execute_sql`, usando la org semilla `00000000-0000-0000-0000-000000000001`:

```sql
select wallet_charge('00000000-0000-0000-0000-000000000001', null, 10,
                     'test:charge', 'test', '1', 'test:charge:1');
```
Esperado: `{"ok": true, "ledger_id": "...", "tokens": 10, ...}`.

Repetir la MISMA llamada. Esperado: `{"ok": true, "replayed": true, ...}` con el mismo `ledger_id`.

```sql
select kind, sku, tokens, from_included, from_purchased
from token_ledger where idempotency_key = 'test:charge:1';
```
Esperado: una sola fila, `kind='charge'`, `tokens = -10`.

- [ ] **Step 5: Limpiar la prueba**

```sql
-- Devuelve los tokens a la MISMA bolsa de la que salieron, leyendo el reparto
-- del propio asiento antes de borrarlo. Sumar a ciegas a `purchased_balance`
-- descuadraría el wallet si el cargo hubiera salido de `included_balance`.
with asiento as (
    select organization_id, from_included, from_purchased
    from token_ledger where idempotency_key = 'test:charge:1'
)
update org_wallets w
set included_balance  = w.included_balance  + a.from_included,
    purchased_balance = w.purchased_balance + a.from_purchased,
    updated_at = now()
from asiento a
where w.organization_id = a.organization_id;

delete from token_ledger where idempotency_key = 'test:charge:1';
```

Comprobar después que el wallet quedó como estaba:

```sql
select included_balance, purchased_balance, held_balance
from org_wallets where organization_id = '00000000-0000-0000-0000-000000000001';
```

- [ ] **Step 6: Registrar `org_modules` como tabla tenant**

En `src/lib/org/orgTable.ts`, añadir a `TENANT_TABLES` después de `'agent_usage_counters'`:

```ts
    'agent_usage_counters',
    'org_modules',
] as const
```

`module_catalog` NO se añade: es un catálogo global sin `organization_id`.

- [ ] **Step 7: Regenerar los tipos de la base de datos**

Run: `npm run db:types`

Si la CLI de Supabase no está logueada, usar `mcp__supabase__generate_typescript_types` y volcar el resultado en `src/@types/database.generated.ts`.

Revisar el diff antes de seguir: `database.generated.ts` estaba desalineado, así que puede arrastrar tablas creadas fuera de migraciones. Es esperado; lo que no se acepta es que desaparezca una tabla que el código usa.

- [ ] **Step 8: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260911120000_org_modules.sql src/lib/org/orgTable.ts src/@types/database.generated.ts
git commit -m "feat(modulos): catalogo de modulos, instalacion por org y asiento de cargo

module_catalog guarda precio por unidad y comisiones editables; org_modules
el estado por organizacion. El ledger gana kind='charge' con wallet_charge:
un cargo de facturacion no reserva nada, asi que hold+settle serian dos filas
y ruido en held_balance."
```

---

### Task 2: Helpers de precio de Stars (TDD)

**Files:**
- Modify: `src/lib/billing/catalog.ts`
- Create: `src/lib/billing/catalog.test.ts`

**Interfaces:**
- Consumes: `TOKEN_USD` y `COST_MARGIN` de `src/lib/billing/catalog.ts`.
- Produces: `STAR_USD: number`, `starsToUsd(stars: number): number`, `usdToTokens(usd: number): number`, `MODULE_SKU: { fee(slug: string): string; commission(slug: string): string }`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/billing/catalog.test.ts`:

```ts
// src/lib/billing/catalog.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STAR_USD, starsToUsd, usdToTokens, MODULE_SKU, TOKEN_USD } from './catalog.ts'

test('una Star vale lo que Telegram paga al desarrollador', () => {
    assert.equal(STAR_USD, 0.013)
    assert.equal(starsToUsd(100), 1.3)
    assert.equal(starsToUsd(0), 0)
})

test('usdToTokens NO aplica margen: una comision ya es precio, no costo', () => {
    // tokensForCostUsd multiplica por COST_MARGIN porque convierte COSTO de
    // proveedor en precio de venta. Una comision del 15% ya es nuestro ingreso:
    // aplicarle margen la triplicaria.
    assert.equal(usdToTokens(1), 1 / TOKEN_USD)
    assert.equal(usdToTokens(0.195), 195)
})

test('usdToTokens redondea hacia arriba para no regalar fracciones', () => {
    assert.equal(usdToTokens(0.0001), 1)
    assert.equal(usdToTokens(0.0195), 20)
})

test('usdToTokens devuelve 0 con importes nulos o negativos', () => {
    assert.equal(usdToTokens(0), 0)
    assert.equal(usdToTokens(-1), 0)
})

test('los sku de modulo son estables y distinguen cuota de comision', () => {
    assert.equal(MODULE_SKU.fee('telegram'), 'module_fee:telegram')
    assert.equal(MODULE_SKU.commission('telegram'), 'commission:telegram')
})
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npm test 2>&1 | grep -A5 catalog.test`
Expected: FAIL — no exporta `STAR_USD` / `starsToUsd` / `usdToTokens` / `MODULE_SKU`.

- [ ] **Step 3: Implementar los helpers**

En `src/lib/billing/catalog.ts`, justo después de `tokensForCostUsd` (línea ~33):

```ts
/**
 * Lo que Telegram ACREDITA al desarrollador por cada Star (doc de Telegram
 * Stars / Fragment). No es lo que paga el fan: en tienda una Star le cuesta
 * ~$0.02 porque Apple y Google cobran lo suyo por encima.
 *
 * Se guarda ademas en cada asiento (`metadata.star_usd`) para poder revalorar
 * ventas antiguas si la tasa cambia, sin perder la verdad de lo que se cobro.
 */
export const STAR_USD = 0.013

/** Telegram Stars → USD acreditados al creador. */
export function starsToUsd(stars: number): number {
    return stars * STAR_USD
}

/**
 * USD de INGRESO → tokens. A diferencia de `tokensForCostUsd`, no aplica
 * `COST_MARGIN`: aquel convierte el costo de un proveedor en precio de venta,
 * y una comision o una cuota YA es precio.
 */
export function usdToTokens(usd: number): number {
    if (!(usd > 0)) return 0
    return Math.ceil(usd / TOKEN_USD)
}

/**
 * Sku de los asientos de modulo. Son la clave de lectura de "cuanto me ha
 * costado este modulo", asi que tienen que ser estables.
 */
export const MODULE_SKU = {
    fee: (slug: string) => `module_fee:${slug}`,
    commission: (slug: string) => `commission:${slug}`,
}
```

- [ ] **Step 4: Ejecutar el test para verificar que pasa**

Run: `npm test 2>&1 | grep -A5 catalog.test`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/catalog.ts src/lib/billing/catalog.test.ts
git commit -m "feat(billing): tasa de Stars y conversion de ingreso a tokens

usdToTokens no aplica COST_MARGIN a proposito: ese margen convierte costo de
proveedor en precio, y una comision ya es precio. STAR_USD queda documentada
como el payout al desarrollador, no como lo que paga el fan."
```

---

### Task 3: `chargeTokens` en el wallet

**Files:**
- Modify: `src/lib/billing/wallet.ts`

**Interfaces:**
- Consumes: `wallet_charge` (Task 1), `billingDb()` y `enforcementEnabled()` ya existentes en el fichero.
- Produces: `chargeTokens(args: { organizationId: string; userId?: string | null; tokens: number; sku: string; refType: string; refId: string; idempotencyKey: string; costUsd?: number | null; metadata?: Record<string, unknown> }): Promise<{ ok: true; ledgerId: string; replayed: boolean } | { ok: false; reason: string }>`.

- [ ] **Step 1: Implementar `chargeTokens`**

Al final de `src/lib/billing/wallet.ts`:

```ts
/**
 * Cargo instantáneo contra el wallet: cuota de módulo o comisión de venta.
 *
 * NO recibe `ctx`: sus dos llamadores (el webhook de compras y el cron de
 * cuotas) corren SIN sesión y traen la org ya resuelta de la fila. Pedir un
 * OrgContext aquí obligaría a inventarlo desde el owner, que es justo el bug
 * que documenta `resolveTargetAvatar`.
 *
 * Nunca fuerza: `p_enforce` va en false. El hecho ya ocurrió (la venta se
 * cobró en Telegram, el mes ya pasó); negarse a asentarlo sólo perdería la
 * deuda. El sobregiro queda anotado en `metadata.measure_only_shortfall`.
 */
export async function chargeTokens(args: {
    organizationId: string
    userId?: string | null
    tokens: number
    sku: string
    refType: string
    refId: string
    idempotencyKey: string
    costUsd?: number | null
    metadata?: Record<string, unknown>
}): Promise<{ ok: true; ledgerId: string; replayed: boolean } | { ok: false; reason: string }> {
    if (!(args.tokens > 0)) return { ok: false, reason: 'non_positive_tokens' }

    const { data, error } = await billingDb().rpc('wallet_charge', {
        p_org: args.organizationId,
        p_user: args.userId ?? null,
        p_tokens: args.tokens,
        p_sku: args.sku,
        p_ref_type: args.refType,
        p_ref_id: args.refId,
        p_idempotency_key: args.idempotencyKey,
        p_cost_usd: args.costUsd ?? null,
        p_metadata: args.metadata ?? {},
        p_enforce: false,
    })
    if (error) return { ok: false, reason: error.message }

    const res = data as {
        ok?: boolean
        reason?: string
        ledger_id?: string
        replayed?: boolean
    } | null
    if (!res?.ok || !res.ledger_id) {
        return { ok: false, reason: res?.reason ?? 'wallet_charge returned no id' }
    }
    return { ok: true, ledgerId: res.ledger_id, replayed: Boolean(res.replayed) }
}
```

- [ ] **Step 2: Verificar que compila y pasa el lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/billing/wallet.ts
git commit -m "feat(billing): chargeTokens, el cargo instantaneo del wallet

Sin ctx a proposito: lo llaman webhook y cron, que traen la org resuelta de la
fila. Nunca fuerza saldo porque el hecho ya ocurrio; el sobregiro se anota."
```

---

### Task 4: Entitlements y catálogo de módulos

**Files:**
- Create: `src/lib/modules/catalog.ts`
- Create: `src/lib/modules/entitlements.ts`
- Modify: `scripts/check-tenant-access.mjs`
- Modify: `eslint.config.mjs`

**Interfaces:**
- Consumes: `orgTable` / `orgSupabase` de `src/lib/org/orgTable.ts`, `OrgContext` de `src/lib/tenant/getOrgContext.ts`.
- Produces:
  - `src/lib/modules/catalog.ts`: `ModuleCatalogRow = { slug, name, description, priceUsdMonthPerUnit, unit, commissionAiPct, commissionManualPct, isPublic, sortOrder }`, `getModuleCatalog(): Promise<ModuleCatalogRow[]>`, `getModuleDefinition(slug: string): Promise<ModuleCatalogRow | null>`.
  - `src/lib/modules/entitlements.ts`: `ModuleSlug = 'telegram'`, `OrgModuleRow = { moduleSlug, status, installedAt, uninstalledAt, settings }`, `ModuleNotInstalledError`, `listOrgModules(ctx)`, `hasModule(ctx, slug)`, `requireModule(ctx, slug)`, `hasModuleForOrg(orgId, slug)`, `listInstalledSlugsForOrg(orgId)`.

- [ ] **Step 1: Escribir el catálogo**

Crear `src/lib/modules/catalog.ts`:

```ts
/**
 * Catálogo GLOBAL de módulos: precios y comisiones. No es una tabla tenant
 * (no lleva organization_id), así que no pasa por `orgTable` — es el mismo
 * caso que `ai_providers`.
 *
 * Se lee siempre de la base de datos y no se hardcodea: el precio y las
 * comisiones son editables por SQL sin desplegar.
 */
import { orgSupabase } from '@/lib/org/orgTable'

export type ModuleUnit = 'bot' | 'avatar' | 'org'

export interface ModuleCatalogRow {
    slug: string
    name: string
    description: string | null
    priceUsdMonthPerUnit: number
    unit: ModuleUnit
    commissionAiPct: number
    commissionManualPct: number
    isPublic: boolean
    sortOrder: number
}

interface RawModuleCatalogRow {
    slug: string
    name: string
    description: string | null
    price_usd_month_per_unit: number | string
    unit: string
    commission_ai_pct: number | string
    commission_manual_pct: number | string
    is_public: boolean
    sort_order: number
}

/** numeric de Postgres llega como string en supabase-js según el driver. */
function num(value: number | string | null): number {
    return typeof value === 'number' ? value : Number(value ?? 0)
}

function toRow(raw: RawModuleCatalogRow): ModuleCatalogRow {
    return {
        slug: raw.slug,
        name: raw.name,
        description: raw.description,
        priceUsdMonthPerUnit: num(raw.price_usd_month_per_unit),
        unit: raw.unit as ModuleUnit,
        commissionAiPct: num(raw.commission_ai_pct),
        commissionManualPct: num(raw.commission_manual_pct),
        isPublic: raw.is_public,
        sortOrder: raw.sort_order,
    }
}

/** Módulos ofrecibles, ordenados para la página de marketplace. */
export async function getModuleCatalog(): Promise<ModuleCatalogRow[]> {
    const { data, error } = await orgSupabase()
        .from('module_catalog')
        .select('*')
        .eq('is_public', true)
        .order('sort_order', { ascending: true })
    if (error) throw new Error(error.message)
    return ((data ?? []) as unknown as RawModuleCatalogRow[]).map(toRow)
}

/** Un módulo por slug, público o no (el cobro lee módulos ya instalados). */
export async function getModuleDefinition(slug: string): Promise<ModuleCatalogRow | null> {
    const { data, error } = await orgSupabase()
        .from('module_catalog')
        .select('*')
        .eq('slug', slug)
        .maybeSingle()
    if (error) throw new Error(error.message)
    return data ? toRow(data as unknown as RawModuleCatalogRow) : null
}
```

- [ ] **Step 2: Escribir los entitlements**

Crear `src/lib/modules/entitlements.ts`:

```ts
/**
 * "¿Tiene esta organización el módulo X?" — la única respuesta autorizada.
 *
 * Dos familias a propósito:
 *  - `hasModule` / `requireModule` / `listOrgModules` piden `ctx`: son las que
 *    usan las server actions, donde hay sesión.
 *  - `hasModuleForOrg` / `listInstalledSlugsForOrg` reciben la org ya resuelta:
 *    son para cron y webhooks. NO usan `getOrgContextForUser`, que devuelve la
 *    PRIMERA membresía del usuario y no la org de la fila — el mismo bug que
 *    documenta `resolveTargetAvatar` en el inbox del agente.
 */
import { cache } from 'react'
import { orgSupabase, orgTable } from '@/lib/org/orgTable'
import type { OrgContext } from '@/lib/tenant/getOrgContext'

export type ModuleSlug = 'telegram'

export type OrgModuleStatus = 'installed' | 'suspended' | 'uninstalled'

export interface OrgModuleRow {
    moduleSlug: string
    status: OrgModuleStatus
    installedAt: string
    uninstalledAt: string | null
    settings: Record<string, unknown>
}

interface RawOrgModuleRow {
    module_slug: string
    status: string
    installed_at: string
    uninstalled_at: string | null
    settings: Record<string, unknown> | null
}

function toRow(raw: RawOrgModuleRow): OrgModuleRow {
    return {
        moduleSlug: raw.module_slug,
        status: raw.status as OrgModuleStatus,
        installedAt: raw.installed_at,
        uninstalledAt: raw.uninstalled_at,
        settings: raw.settings ?? {},
    }
}

/** Error con mensaje presentable: las server actions lo devuelven tal cual. */
export class ModuleNotInstalledError extends Error {
    readonly code = 'MODULE_NOT_INSTALLED'
    constructor(readonly slug: string) {
        super(
            `El módulo "${slug}" no está instalado en tu organización. Instálalo desde Cuenta → Módulos.`,
        )
        this.name = 'ModuleNotInstalledError'
    }
}

/** Todas las filas de módulo de la org, instaladas o no (para el marketplace). */
export async function listOrgModules(ctx: OrgContext): Promise<OrgModuleRow[]> {
    const { data, error } = await orgTable(ctx, 'org_modules').select(
        'module_slug, status, installed_at, uninstalled_at, settings',
    )
    if (error) throw new Error(error.message)
    return ((data ?? []) as RawOrgModuleRow[]).map(toRow)
}

export async function hasModule(ctx: OrgContext, slug: ModuleSlug | string): Promise<boolean> {
    const slugs = await listInstalledSlugsForOrg(ctx.organizationId)
    return slugs.includes(slug)
}

/** Lanza si el módulo no está instalado. El punto de entrada de cada action. */
export async function requireModule(ctx: OrgContext, slug: ModuleSlug | string): Promise<void> {
    if (!(await hasModule(ctx, slug))) throw new ModuleNotInstalledError(slug)
}

/**
 * Slugs instalados de una org. Cacheado por request con `React.cache`: en un
 * render lo consultan el layout raíz (para el menú), el layout del módulo (para
 * el gate) y la propia página — con la caché es una sola consulta.
 */
export const listInstalledSlugsForOrg = cache(
    async (organizationId: string): Promise<string[]> => {
        const { data, error } = await orgSupabase()
            .from('org_modules')
            .select('module_slug')
            .eq('organization_id', organizationId)
            .eq('status', 'installed')
        if (error) throw new Error(error.message)
        return ((data ?? []) as { module_slug: string }[]).map((r) => r.module_slug)
    },
)

/** Variante sin sesión para cron/webhooks: la org llega ya resuelta. */
export async function hasModuleForOrg(
    organizationId: string,
    slug: ModuleSlug | string,
): Promise<boolean> {
    const slugs = await listInstalledSlugsForOrg(organizationId)
    return slugs.includes(slug)
}
```

- [ ] **Step 3: Ejecutar el verificador de tenant para ver qué se queja**

Run: `npm run check:tenant`
Expected: infractores en `src/lib/modules/entitlements.ts` y `src/lib/modules/catalog.ts` (usan `orgSupabase()` crudo).

- [ ] **Step 4: Añadir las exenciones documentadas**

En `scripts/check-tenant-access.mjs`, dentro de `EXENTOS`, después de las entradas del núcleo del agente:

```js
    [
        'src/lib/modules/entitlements.ts',
        'Entitlement de módulos: sus variantes sin sesión (hasModuleForOrg/listInstalledSlugsForOrg) las llaman cron y webhooks con la org YA resuelta de la fila, que se pasa por parámetro y se filtra explícitamente.',
    ],
    [
        'src/lib/modules/catalog.ts',
        'module_catalog es un catálogo GLOBAL sin organization_id (precios y comisiones de la plataforma): no hay org por la que filtrar.',
    ],
```

En `eslint.config.mjs`, añadir los mismos dos ficheros a la lista `ignores` del bloque que restringe `agentSupabase`/`@/lib/supabase`, junto a `src/app/api/webhooks/**` y `src/app/api/cron/**`.

- [ ] **Step 5: Verificar que los tres candados pasan**

Run: `npx tsc --noEmit && npm run lint && npm run check:tenant`
Expected: sin errores ni infractores.

- [ ] **Step 6: Commit**

```bash
git add src/lib/modules/ scripts/check-tenant-access.mjs eslint.config.mjs
git commit -m "feat(modulos): entitlement por organizacion y lectura del catalogo

hasModuleForOrg recibe la org por parametro en vez de derivarla del usuario:
getOrgContextForUser devuelve la PRIMERA membresia, que no tiene por que ser
la org de la fila. Cacheado por request para que layout, gate y pagina no
consulten tres veces."
```

---

### Task 5: Filtro del árbol de navegación (TDD)

**Files:**
- Modify: `src/@types/navigation.ts`
- Create: `src/lib/modules/navigation.ts`
- Create: `src/lib/modules/navigation.test.ts`

**Interfaces:**
- Consumes: `NavigationTree` de `src/@types/navigation.ts`.
- Produces: `filterNavigationByModules(tree: NavigationTree[], installedSlugs: string[]): NavigationTree[]`.

- [ ] **Step 1: Añadir `requiredModule` al tipo**

En `src/@types/navigation.ts`, dentro de `meta` de `NavigationTree`:

```ts
    meta?: {
        horizontalMenu?: HorizontalMenuMeta
        description?: {
            translateKey: string
            label: string
        }
        /**
         * Slug de `module_catalog` que la organización debe tener instalado
         * para ver este ítem. El filtro se aplica en servidor
         * (`filterNavigationByModules`); el gate real de acceso vive en el
         * layout de la ruta y en cada server action.
         */
        requiredModule?: string
    }
```

- [ ] **Step 2: Escribir el test que falla**

Crear `src/lib/modules/navigation.test.ts`:

```ts
// src/lib/modules/navigation.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterNavigationByModules } from './navigation.ts'
import type { NavigationTree } from '@/@types/navigation'

const item = (key: string, requiredModule?: string, subMenu: NavigationTree[] = []): NavigationTree => ({
    key,
    path: `/${key}`,
    title: key,
    translateKey: `nav.${key}`,
    icon: '',
    type: subMenu.length > 0 ? 'collapse' : 'item',
    authority: [],
    subMenu,
    ...(requiredModule ? { meta: { requiredModule } } : {}),
})

test('un item sin requiredModule pasa siempre', () => {
    const out = filterNavigationByModules([item('inbox')], [])
    assert.equal(out.length, 1)
    assert.equal(out[0].key, 'inbox')
})

test('un item con modulo no instalado desaparece', () => {
    const out = filterNavigationByModules([item('telegram', 'telegram')], [])
    assert.deepEqual(out, [])
})

test('el mismo item aparece cuando el modulo esta instalado', () => {
    const out = filterNavigationByModules([item('telegram', 'telegram')], ['telegram'])
    assert.equal(out.length, 1)
})

test('el filtro entra en los submenus', () => {
    const tree = [item('avatarForge', undefined, [item('inbox'), item('telegram', 'telegram')])]
    const out = filterNavigationByModules(tree, [])
    assert.equal(out[0].subMenu.length, 1)
    assert.equal(out[0].subMenu[0].key, 'inbox')
})

test('un collapse que se queda sin hijos desaparece, para no dejar un menu vacio', () => {
    const tree = [item('telegramGroup', undefined, [item('stats', 'telegram')])]
    const out = filterNavigationByModules(tree, [])
    assert.deepEqual(out, [])
})

test('un item hoja sin hijos NO se confunde con un collapse vacio', () => {
    const leaf: NavigationTree = { ...item('dashboard'), type: 'item', subMenu: [] }
    const out = filterNavigationByModules([leaf], [])
    assert.equal(out.length, 1)
})

test('no muta el arbol de entrada', () => {
    const tree = [item('avatarForge', undefined, [item('telegram', 'telegram')])]
    filterNavigationByModules(tree, [])
    assert.equal(tree[0].subMenu.length, 1)
})
```

- [ ] **Step 3: Ejecutar el test para verificar que falla**

Run: `npm test 2>&1 | grep -A5 "navigation.test"`
Expected: FAIL — `filterNavigationByModules` no existe.

- [ ] **Step 4: Implementar el filtro**

Crear `src/lib/modules/navigation.ts`:

```ts
/**
 * Poda del árbol de navegación por módulos instalados. Función PURA: la
 * decisión de qué está instalado la toma `getNavigation` en servidor y aquí
 * sólo se aplica, que es lo que la hace testeable sin base de datos.
 *
 * Esto sólo OCULTA. El gate real de acceso está en el layout de la ruta y en
 * cada server action (`requireModule`): un menú escondido no autoriza nada.
 */
import type { NavigationTree } from '@/@types/navigation'

export function filterNavigationByModules(
    tree: NavigationTree[],
    installedSlugs: string[],
): NavigationTree[] {
    const installed = new Set(installedSlugs)

    const walk = (nodes: NavigationTree[]): NavigationTree[] => {
        const out: NavigationTree[] = []
        for (const node of nodes) {
            const required = node.meta?.requiredModule
            if (required && !installed.has(required)) continue

            const subMenu = node.subMenu?.length ? walk(node.subMenu) : []

            // Un grupo que se queda sin hijos deja un desplegable vacío que no
            // lleva a ninguna parte; un ítem hoja nunca tuvo hijos y se queda.
            if (node.subMenu?.length && subMenu.length === 0) continue

            out.push({ ...node, subMenu })
        }
        return out
    }

    return walk(tree)
}
```

- [ ] **Step 5: Ejecutar el test para verificar que pasa**

Run: `npm test 2>&1 | grep -A5 "navigation.test"`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/@types/navigation.ts src/lib/modules/navigation.ts src/lib/modules/navigation.test.ts
git commit -m "feat(modulos): poda del menu por modulos instalados

Funcion pura para poder probarla sin base de datos. Un collapse que se queda
sin hijos se elimina: un desplegable vacio es peor que no estar."
```

---

### Task 6: Server actions de instalación

**Files:**
- Create: `src/services/ModulesService.ts`

**Interfaces:**
- Consumes: `getOrgContext` (`src/lib/tenant/getOrgContext.ts`), `orgTable`/`orgUpsert` (`src/lib/org/orgTable.ts`), `getModuleCatalog`/`getModuleDefinition` (Task 4), `listOrgModules` (Task 4), `getWalletBalance` (`src/lib/billing/wallet.ts`).
- Produces: `ModulesResult<T> = { success: boolean; data?: T; error?: string }`, `listModules(): Promise<ModulesResult<{ catalog: ModuleCatalogRow[]; installed: OrgModuleRow[]; canManage: boolean }>>`, `installModule(slug: string): Promise<ModulesResult<OrgModuleRow>>`, `uninstallModule(slug: string): Promise<ModulesResult<OrgModuleRow>>`.

- [ ] **Step 1: Escribir el servicio**

Crear `src/services/ModulesService.ts`:

```ts
'use server'

/**
 * Instalar y desinstalar módulos de la organización.
 *
 * Instalar NO asienta nada en el ledger: un módulo instalado sin bots
 * conectados no cuesta. La cuota la cobra el cron mensual contando unidades
 * reales, y la comisión se asienta al vender.
 *
 * Todos los exports son async porque el fichero es `'use server'`: un export
 * síncrono aquí sólo revienta en el build, ni tsc ni eslint lo ven.
 */
import { revalidatePath } from 'next/cache'
import { getOrgContext, type OrgContext } from '@/lib/tenant/getOrgContext'
import { orgTable, orgUpsert } from '@/lib/org/orgTable'
import { getModuleCatalog, getModuleDefinition, type ModuleCatalogRow } from '@/lib/modules/catalog'
import { listOrgModules, type OrgModuleRow } from '@/lib/modules/entitlements'

export interface ModulesResult<T> {
    success: boolean
    data?: T
    error?: string
}

/** Sólo quien manda en la org toca la facturación. */
function canManage(ctx: OrgContext): boolean {
    return ctx.role === 'owner' || ctx.role === 'admin'
}

function fail(message: string): ModulesResult<never> {
    return { success: false, error: message }
}

export async function listModules(): Promise<
    ModulesResult<{ catalog: ModuleCatalogRow[]; installed: OrgModuleRow[]; canManage: boolean }>
> {
    try {
        const ctx = await getOrgContext()
        const [catalog, installed] = await Promise.all([getModuleCatalog(), listOrgModules(ctx)])
        return { success: true, data: { catalog, installed, canManage: canManage(ctx) } }
    } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
    }
}

async function setModuleStatus(
    slug: string,
    status: 'installed' | 'uninstalled',
): Promise<ModulesResult<OrgModuleRow>> {
    try {
        const ctx = await getOrgContext()
        if (!canManage(ctx)) {
            return fail('Sólo el propietario o un administrador pueden gestionar los módulos.')
        }

        const def = await getModuleDefinition(slug)
        if (!def || !def.isPublic) return fail(`El módulo "${slug}" no existe.`)

        const now = new Date().toISOString()
        const { error } = await orgUpsert(
            ctx,
            'org_modules',
            {
                module_slug: slug,
                status,
                installed_by: ctx.userId,
                // Reinstalar reabre la MISMA fila: el historial de cuándo se
                // instaló y se desinstaló no se pierde al borrar y recrear.
                ...(status === 'installed'
                    ? { installed_at: now, uninstalled_at: null }
                    : { uninstalled_at: now }),
                updated_at: now,
            },
            { onConflict: 'organization_id,module_slug' },
        )
        if (error) return fail(error.message)

        const { data, error: readError } = await orgTable(ctx, 'org_modules')
            .select('module_slug, status, installed_at, uninstalled_at, settings')
            .eq('module_slug', slug)
            .maybeSingle()
        if (readError) return fail(readError.message)

        // El árbol de navegación se calcula en el layout raíz: sin esto el menú
        // sigue mostrando (u ocultando) el módulo hasta la siguiente recarga dura.
        revalidatePath('/', 'layout')
        revalidatePath('/concepts/account/modules')

        const row = data as {
            module_slug: string
            status: string
            installed_at: string
            uninstalled_at: string | null
            settings: Record<string, unknown> | null
        } | null
        if (!row) return fail('El módulo se guardó pero no se pudo releer.')

        return {
            success: true,
            data: {
                moduleSlug: row.module_slug,
                status: row.status as OrgModuleRow['status'],
                installedAt: row.installed_at,
                uninstalledAt: row.uninstalled_at,
                settings: row.settings ?? {},
            },
        }
    } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
    }
}

export async function installModule(slug: string): Promise<ModulesResult<OrgModuleRow>> {
    return setModuleStatus(slug, 'installed')
}

export async function uninstallModule(slug: string): Promise<ModulesResult<OrgModuleRow>> {
    return setModuleStatus(slug, 'uninstalled')
}
```

- [ ] **Step 2: Verificar que todos los exports son async**

Run: `grep -n "^export" src/services/ModulesService.ts`
Expected: cada línea `export` es `export async function` o `export interface`. Un `export const` con valor no-promesa rompería el build.

- [ ] **Step 3: Verificar compilación y candados**

Run: `npx tsc --noEmit && npm run lint && npm run check:tenant`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/services/ModulesService.ts
git commit -m "feat(modulos): instalar y desinstalar desde la organizacion

Instalar no asienta nada: un modulo sin unidades conectadas no cuesta. La fila
se reabre en vez de recrearse para conservar el historial."
```

---

### Task 7: Página de módulos

**Files:**
- Create: `src/app/(protected-pages)/concepts/account/modules/page.tsx`
- Create: `src/app/(protected-pages)/concepts/account/modules/_components/ModulesClient.tsx`
- Modify: `src/configs/routes.config/conceptsRoute.ts`

**Interfaces:**
- Consumes: `listModules` / `installModule` / `uninstallModule` (Task 6), `getWalletBalance` (`src/lib/billing/wallet.ts`).
- Produces: la ruta `/concepts/account/modules`.

- [ ] **Step 1: Leer el molde de una página existente y de ConfirmDialog**

Run:
```bash
sed -n '1,40p' "src/app/(protected-pages)/concepts/account/pricing/page.tsx"
sed -n '1,40p' src/components/shared/ConfirmDialog.tsx
grep -rn "toast.push" --include=*.tsx src/app/\(protected-pages\)/concepts/avatar-forge | head -3
```
Expected: ver cómo se componen `page.tsx` server + `_components` cliente, la firma de `ConfirmDialog` (props `isOpen`, `type`, `title`, `onClose`, `onConfirm`) y el patrón exacto de `toast.push(<Notification .../>)`. Ajustar el código de los pasos siguientes a esas firmas reales si difieren.

- [ ] **Step 2: Escribir la página servidor**

Crear `src/app/(protected-pages)/concepts/account/modules/page.tsx`:

```tsx
import { listModules } from '@/services/ModulesService'
import ModulesClient from './_components/ModulesClient'

export default async function ModulesPage() {
    const res = await listModules()
    if (!res.success || !res.data) {
        return <div className="p-6 text-red-500">{res.error ?? 'No se pudo cargar el catálogo.'}</div>
    }
    return (
        <ModulesClient
            catalog={res.data.catalog}
            installed={res.data.installed}
            canManage={res.data.canManage}
        />
    )
}
```

- [ ] **Step 3: Escribir el cliente**

Crear `src/app/(protected-pages)/concepts/account/modules/_components/ModulesClient.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Alert from '@/components/ui/Alert'
import Tag from '@/components/ui/Tag'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { installModule, uninstallModule } from '@/services/ModulesService'
import type { ModuleCatalogRow } from '@/lib/modules/catalog'
import type { OrgModuleRow } from '@/lib/modules/entitlements'

const UNIT_LABEL: Record<string, string> = {
    bot: 'bot',
    avatar: 'avatar',
    org: 'organización',
}

interface Props {
    catalog: ModuleCatalogRow[]
    installed: OrgModuleRow[]
    canManage: boolean
}

export default function ModulesClient({ catalog, installed, canManage }: Props) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [confirmSlug, setConfirmSlug] = useState<string | null>(null)

    const statusOf = (slug: string) =>
        installed.find((m) => m.moduleSlug === slug)?.status ?? 'uninstalled'

    const notify = (type: 'success' | 'danger', message: string) => {
        toast.push(<Notification type={type}>{message}</Notification>)
    }

    const run = (action: () => Promise<{ success: boolean; error?: string }>, okMessage: string) => {
        startTransition(async () => {
            const res = await action()
            if (res.success) {
                notify('success', okMessage)
                router.refresh()
            } else {
                notify('danger', res.error ?? 'No se pudo completar la acción.')
            }
        })
    }

    const confirmModule = catalog.find((m) => m.slug === confirmSlug)

    return (
        <div className="flex flex-col gap-4">
            <h3>Módulos</h3>
            <Alert type="info" showIcon>
                Todavía no hay pasarela de pagos conectada. Instalar un módulo lo activa y registra
                sus cuotas y comisiones en tu saldo a modo de medición; el cobro real se activará
                cuando exista la facturación.
            </Alert>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {catalog.map((mod) => {
                    const status = statusOf(mod.slug)
                    const isInstalled = status === 'installed'
                    return (
                        <Card key={mod.slug}>
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h5>{mod.name}</h5>
                                        {isInstalled && <Tag className="bg-emerald-100 text-emerald-700">Instalado</Tag>}
                                        {status === 'suspended' && (
                                            <Tag className="bg-amber-100 text-amber-700">Suspendido</Tag>
                                        )}
                                    </div>
                                    <p className="mt-1">{mod.description}</p>
                                </div>
                            </div>

                            <div className="mt-4 flex flex-col gap-1">
                                <span>
                                    ${mod.priceUsdMonthPerUnit.toFixed(2)} / {UNIT_LABEL[mod.unit] ?? mod.unit} / mes
                                </span>
                                <span>
                                    Comisión: {mod.commissionAiPct}% en ventas de la IA ·{' '}
                                    {mod.commissionManualPct}% en ventas manuales
                                </span>
                            </div>

                            <div className="mt-4">
                                {isInstalled ? (
                                    <Button
                                        variant="plain"
                                        disabled={!canManage || pending}
                                        onClick={() => setConfirmSlug(mod.slug)}
                                    >
                                        Desinstalar
                                    </Button>
                                ) : (
                                    <Button
                                        variant="solid"
                                        disabled={!canManage || pending}
                                        onClick={() =>
                                            run(() => installModule(mod.slug), `${mod.name} instalado.`)
                                        }
                                    >
                                        Instalar
                                    </Button>
                                )}
                                {!canManage && (
                                    <p className="mt-2">
                                        Sólo el propietario o un administrador pueden gestionar módulos.
                                    </p>
                                )}
                            </div>
                        </Card>
                    )
                })}
            </div>

            <ConfirmDialog
                isOpen={Boolean(confirmSlug)}
                type="danger"
                title={`Desinstalar ${confirmModule?.name ?? ''}`}
                confirmButtonProps={{ loading: pending }}
                onClose={() => setConfirmSlug(null)}
                onRequestClose={() => setConfirmSlug(null)}
                onCancel={() => setConfirmSlug(null)}
                onConfirm={() => {
                    const slug = confirmSlug
                    setConfirmSlug(null)
                    if (slug) {
                        run(() => uninstallModule(slug), 'Módulo desinstalado.')
                    }
                }}
            >
                <p>
                    Las funciones del módulo dejarán de estar disponibles y sus automatismos se
                    detendrán. No se borra ningún dato: puedes volver a instalarlo cuando quieras.
                </p>
            </ConfirmDialog>
        </div>
    )
}
```

- [ ] **Step 4: Registrar la ruta**

En `src/configs/routes.config/conceptsRoute.ts`, junto a las demás rutas de `/concepts/account/`:

```ts
    '/concepts/account/modules': {
        key: 'concepts.account.modules',
        authority: [ADMIN, USER],
    },
```

Copiar la forma exacta (incluido `meta`, si las rutas vecinas lo llevan) de la entrada `/concepts/account/pricing` del mismo fichero.

- [ ] **Step 5: Verificar en el navegador**

Con el dev ya corriendo (`npm run dev`, puerto 3030), abrir `http://localhost:3030/concepts/account/modules`.

Comprobar:
1. Se ve la tarjeta de Telegram con `$29.90 / bot / mes` y `15% / 5%`.
2. Pulsar Instalar muestra el toast y la tarjeta pasa a "Instalado".
3. Pulsar Desinstalar abre el diálogo de confirmación de ECME (no un `confirm` del navegador) y al aceptar vuelve a "no instalado".
4. Volver a instalar funciona.

Verificar la fila con `mcp__supabase__execute_sql`:
```sql
select organization_id, module_slug, status, installed_by, installed_at, uninstalled_at
from org_modules;
```
Expected: UNA sola fila para `(org, telegram)` que cambió de estado, no tres.

- [ ] **Step 6: Verificar compilación y candados**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(protected-pages)/concepts/account/modules" src/configs/routes.config/conceptsRoute.ts
git commit -m "feat(modulos): pagina de modulos con instalar y desinstalar

Avisa de que no hay pasarela y de que las cuotas se registran como medicion,
para que nadie interprete el saldo negativo como un cobro real."
```

---

### Task 8: Gate de navegación y de ruta

**Files:**
- Modify: `src/server/actions/navigation/getNavigation.ts`
- Modify: `src/components/template/Navigation/NavigationContext.tsx`
- Create: `src/components/shared/ModuleCheck.tsx`
- Create: `src/app/(protected-pages)/concepts/account/modules/_components/ModuleNotInstalled.tsx`

**Interfaces:**
- Consumes: `filterNavigationByModules` (Task 5), `listInstalledSlugsForOrg` (Task 4), `tryGetOrgContext` (`src/lib/tenant/getOrgContext.ts`).
- Produces: `getNavigation()` devuelve el árbol ya podado; `useInstalledModules(): string[]`; `<ModuleCheck module="telegram">…</ModuleCheck>`; `<ModuleNotInstalled slug="telegram" />`.

- [ ] **Step 1: Leer los consumidores de getNavigation antes de cambiar su forma**

Run: `grep -rn "getNavigation" --include=*.tsx --include=*.ts src/ | grep -v "actions/navigation"`
Expected: la lista de layouts que lo llaman. Si alguno desestructura el resultado como array, hay que actualizarlo en este mismo paso; por eso el retorno se mantiene como array y los slugs se pasan aparte.

- [ ] **Step 2: Podar el árbol en servidor**

Reemplazar el contenido de `src/server/actions/navigation/getNavigation.ts`:

```ts
/**
 * Árbol de navegación ya podado por los módulos que la organización tiene
 * instalados.
 *
 * `tryGetOrgContext` y no `getOrgContext` porque el layout raíz también
 * renderiza páginas sin sesión: sin contexto no hay módulos y se cae al árbol
 * base, que es lo correcto (los ítems de módulo llevan `requiredModule` y
 * desaparecen solos).
 *
 * Esto sólo decide qué se PINTA. Autorizar es cosa del layout de cada módulo y
 * de `requireModule` en las server actions.
 */
import navigationConfig from '@/configs/navigation.config'
import { filterNavigationByModules } from '@/lib/modules/navigation'
import { listInstalledSlugsForOrg } from '@/lib/modules/entitlements'
import { tryGetOrgContext } from '@/lib/tenant/getOrgContext'
import type { NavigationTree } from '@/@types/navigation'

export async function getInstalledModules(): Promise<string[]> {
    const ctx = await tryGetOrgContext()
    if (!ctx) return []
    try {
        return await listInstalledSlugsForOrg(ctx.organizationId)
    } catch {
        // Un fallo leyendo módulos no puede dejar al usuario sin menú.
        return []
    }
}

export async function getNavigation(): Promise<NavigationTree[]> {
    const installed = await getInstalledModules()
    return filterNavigationByModules(navigationConfig, installed)
}
```

- [ ] **Step 3: Exponer los módulos instalados al cliente**

En `src/components/template/Navigation/NavigationContext.tsx`, añadir `installedModules: string[]` al tipo del contexto y al provider (por defecto `[]`), y exportar el hook:

```tsx
export function useInstalledModules(): string[] {
    return useContext(NavigationContext)?.installedModules ?? []
}
```

En el layout que monta `NavigationProvider`, pasar `installedModules={await getInstalledModules()}`. Localizarlo con:

Run: `grep -rn "NavigationProvider" --include=*.tsx src/ | head`

- [ ] **Step 4: Crear el gate declarativo de UI**

Crear `src/components/shared/ModuleCheck.tsx`:

```tsx
'use client'

/**
 * Oculta su contenido si la organización no tiene el módulo instalado.
 * Análogo a `AuthorityCheck`, y con el mismo alcance: es cosmético. Lo que
 * autoriza de verdad es `requireModule` dentro de la server action.
 */
import type { ReactNode } from 'react'
import { useInstalledModules } from '@/components/template/Navigation/NavigationContext'

interface ModuleCheckProps {
    module: string
    children: ReactNode
    fallback?: ReactNode
}

export default function ModuleCheck({ module, children, fallback = null }: ModuleCheckProps) {
    const installed = useInstalledModules()
    return <>{installed.includes(module) ? children : fallback}</>
}
```

- [ ] **Step 5: Crear la pantalla de módulo no instalado**

Crear `src/app/(protected-pages)/concepts/account/modules/_components/ModuleNotInstalled.tsx`:

```tsx
/**
 * Lo que ve quien entra por URL a un módulo que su organización no tiene.
 * No es un 404 a propósito: la ruta existe y la respuesta útil es cómo
 * activarla, no negar que exista.
 */
import Link from 'next/link'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { getModuleDefinition } from '@/lib/modules/catalog'

export default async function ModuleNotInstalled({
    slug,
    suspended = false,
}: {
    slug: string
    suspended?: boolean
}) {
    const def = await getModuleDefinition(slug)
    return (
        <div className="flex justify-center p-6">
            <Card className="max-w-xl">
                <h4>{def?.name ?? slug}</h4>
                <p className="mt-2">
                    {suspended
                        ? 'Este módulo está suspendido. Revisa tu saldo para reactivarlo.'
                        : 'Este módulo no está instalado en tu organización.'}
                </p>
                {def && (
                    <p className="mt-2">
                        ${def.priceUsdMonthPerUnit.toFixed(2)} por {def.unit} al mes · comisión{' '}
                        {def.commissionAiPct}% (IA) / {def.commissionManualPct}% (manual)
                    </p>
                )}
                <div className="mt-4">
                    <Link href={suspended ? '/concepts/account/settings?tab=billing' : '/concepts/account/modules'}>
                        <Button variant="solid">{suspended ? 'Ver saldo' : 'Ir a Módulos'}</Button>
                    </Link>
                </div>
            </Card>
        </div>
    )
}
```

- [ ] **Step 6: Verificar el gate a mano**

Con el módulo Telegram DESINSTALADO desde la página de módulos, recargar la aplicación y comprobar que nada cambió en el menú (todavía no hay ítems con `requiredModule`: los añade el plan de Telegram).

Para probar el filtro de verdad, marcar temporalmente un ítem existente del menú con `meta: { requiredModule: 'telegram' }` en `src/configs/navigation.config/concepts.navigation.config.ts`, recargar, comprobar que desaparece, instalar el módulo, recargar y comprobar que vuelve. **Revertir la marca temporal antes de commitear.**

- [ ] **Step 7: Verificar compilación y candados**

Run: `npx tsc --noEmit && npm run lint && npm run check:tenant`
Expected: sin errores.

Run: `git diff --stat src/configs/navigation.config/`
Expected: vacío (la marca temporal del paso 6 está revertida).

- [ ] **Step 8: Commit**

```bash
git add src/server/actions/navigation/getNavigation.ts src/components/template/Navigation/NavigationContext.tsx src/components/shared/ModuleCheck.tsx "src/app/(protected-pages)/concepts/account/modules/_components/ModuleNotInstalled.tsx"
git commit -m "feat(modulos): ocultar del menu lo que la org no tiene instalado

El filtro es cosmetico y se dice en el codigo: quien autoriza es requireModule
dentro de la accion. Entrar por URL a un modulo ausente explica como activarlo
en vez de devolver un 404."
```

---

### Task 9: Comisión por venta y cuota mensual

**Files:**
- Create: `src/lib/billing/moduleCharges.ts`
- Create: `src/lib/billing/moduleFees.ts`
- Create: `src/app/api/cron/module-fees/route.ts`
- Modify: `vercel.json`
- Modify: `scripts/check-tenant-access.mjs`, `eslint.config.mjs` (exenciones)

**Interfaces:**
- Consumes: `chargeTokens` (Task 3), `starsToUsd`/`usdToTokens`/`MODULE_SKU`/`STAR_USD` (Task 2), `getModuleDefinition` (Task 4), `orgSupabase`.
- Produces:
  - `settleStarsCommission(input: { organizationId: string; saleId: string; avatarId: string; stars: number; soldBy: 'ai' | 'manual'; moduleSlug?: string; userId?: string | null }): Promise<{ ledgerId: string | null; commissionPct: number; commissionUsd: number; commissionTokens: number; starUsd: number; replayed: boolean }>` — **nunca lanza**.
  - `registerUnitCounter(slug: string, fn: (organizationId: string) => Promise<number>): void` y `chargeModuleFees(period?: string): Promise<{ period: string; charged: number; replayed: number; skipped: number; failed: number; tokens: number }>`.

- [ ] **Step 1: Escribir la comisión por venta**

Crear `src/lib/billing/moduleCharges.ts`:

```ts
/**
 * Comisión de la plataforma sobre una venta hecha a través de un módulo.
 *
 * NUNCA LANZA. La llama el webhook de compras después de registrar una venta
 * que YA ocurrió: si el ledger falla, lo que hay que hacer es dejar rastro en
 * los logs y devolver la venta como no comisionada, no reventar el webhook y
 * provocar reintentos de Telegram sobre una compra ya procesada.
 */
import { chargeTokens } from './wallet'
import { MODULE_SKU, STAR_USD, starsToUsd, usdToTokens } from './catalog'
import { getModuleDefinition } from '@/lib/modules/catalog'

export interface StarsCommissionInput {
    organizationId: string
    saleId: string
    avatarId: string
    stars: number
    soldBy: 'ai' | 'manual'
    /** Por si otro canal vende en Stars algún día. */
    moduleSlug?: string
    userId?: string | null
}

export interface StarsCommissionResult {
    ledgerId: string | null
    commissionPct: number
    commissionUsd: number
    commissionTokens: number
    starUsd: number
    replayed: boolean
}

const EMPTY: StarsCommissionResult = {
    ledgerId: null,
    commissionPct: 0,
    commissionUsd: 0,
    commissionTokens: 0,
    starUsd: STAR_USD,
    replayed: false,
}

export async function settleStarsCommission(
    input: StarsCommissionInput,
): Promise<StarsCommissionResult> {
    const slug = input.moduleSlug ?? 'telegram'
    try {
        const def = await getModuleDefinition(slug)
        if (!def) {
            console.error(`[billing] comisión ${slug}: el módulo no está en el catálogo`)
            return EMPTY
        }

        const pct = input.soldBy === 'ai' ? def.commissionAiPct : def.commissionManualPct
        const grossUsd = starsToUsd(input.stars)
        const commissionUsd = (grossUsd * pct) / 100
        const tokens = usdToTokens(commissionUsd)

        // Una venta de 1 Star al 5% son $0.00065: menos de un token. Asentar 0
        // ensucia el ledger sin cobrar nada.
        if (tokens <= 0) {
            return { ...EMPTY, commissionPct: pct, commissionUsd }
        }

        const res = await chargeTokens({
            organizationId: input.organizationId,
            userId: input.userId ?? null,
            tokens,
            sku: MODULE_SKU.commission(slug),
            refType: 'stars_sale',
            refId: input.saleId,
            idempotencyKey: `stars_sale:${input.saleId}`,
            metadata: {
                stars: input.stars,
                sold_by: input.soldBy,
                pct,
                star_usd: STAR_USD,
                gross_usd: grossUsd,
                avatar_id: input.avatarId,
            },
        })

        if (!res.ok) {
            console.error(`[billing] comisión ${slug} venta ${input.saleId}:`, res.reason)
            return { ...EMPTY, commissionPct: pct, commissionUsd, commissionTokens: tokens }
        }

        return {
            ledgerId: res.ledgerId,
            commissionPct: pct,
            commissionUsd,
            commissionTokens: tokens,
            starUsd: STAR_USD,
            replayed: res.replayed,
        }
    } catch (e) {
        console.error(`[billing] comisión ${slug} venta ${input.saleId}:`, e)
        return EMPTY
    }
}
```

- [ ] **Step 2: Escribir la cuota mensual**

Crear `src/lib/billing/moduleFees.ts`:

```ts
/**
 * Cuota mensual de cada módulo instalado, cobrada por unidades reales.
 *
 * Idempotente por (organización, módulo, mes): el cron corre a diario y sólo
 * el primer pase del mes con unidades activas cobra. Correr a diario es
 * tolerancia a fallos del día 1, no prorrateo — un bot conectado a mitad de
 * mes empieza a pagar el mes siguiente.
 *
 * Recorre TODAS las organizaciones a propósito (es un cron sin sesión) y
 * resuelve la org fila a fila.
 */
import { orgSupabase } from '@/lib/org/orgTable'
import { chargeTokens } from './wallet'
import { MODULE_SKU, usdToTokens } from './catalog'

/**
 * Quién sabe contar las unidades de cada módulo. El contador de Telegram lo
 * registra el propio módulo de Telegram al cargarse; mientras no exista,
 * el cron simplemente no cobra ese módulo en vez de fallar.
 */
const UNIT_COUNTERS = new Map<string, (organizationId: string) => Promise<number>>()

export function registerUnitCounter(
    slug: string,
    fn: (organizationId: string) => Promise<number>,
): void {
    UNIT_COUNTERS.set(slug, fn)
}

/** 'YYYY-MM' en UTC. */
export function currentPeriodUtc(): string {
    return new Date().toISOString().slice(0, 7)
}

export interface ModuleFeesResult {
    period: string
    charged: number
    replayed: number
    skipped: number
    failed: number
    tokens: number
}

interface InstalledModuleRow {
    organization_id: string
    module_slug: string
    module_catalog: {
        price_usd_month_per_unit: number | string
        unit: string
    } | null
}

export async function chargeModuleFees(period = currentPeriodUtc()): Promise<ModuleFeesResult> {
    const result: ModuleFeesResult = {
        period,
        charged: 0,
        replayed: 0,
        skipped: 0,
        failed: 0,
        tokens: 0,
    }

    const { data, error } = await orgSupabase()
        .from('org_modules')
        .select('organization_id, module_slug, module_catalog(price_usd_month_per_unit, unit)')
        .eq('status', 'installed')
    if (error) throw new Error(error.message)

    for (const raw of (data ?? []) as unknown as InstalledModuleRow[]) {
        const def = raw.module_catalog
        if (!def) {
            result.skipped++
            continue
        }
        const price = Number(def.price_usd_month_per_unit ?? 0)
        const counter = UNIT_COUNTERS.get(raw.module_slug)
        if (price <= 0 || !counter) {
            result.skipped++
            continue
        }

        try {
            const units = await counter(raw.organization_id)
            if (units <= 0) {
                result.skipped++
                continue
            }
            const tokens = usdToTokens(price * units)
            if (tokens <= 0) {
                result.skipped++
                continue
            }

            const refId = `${raw.module_slug}:${period}`
            const res = await chargeTokens({
                organizationId: raw.organization_id,
                tokens,
                sku: MODULE_SKU.fee(raw.module_slug),
                refType: 'module_fee',
                refId,
                idempotencyKey: `module_fee:${refId}`,
                metadata: {
                    period,
                    unit: def.unit,
                    units,
                    price_per_unit: price,
                },
            })

            if (!res.ok) {
                result.failed++
                console.error(`[module-fees] ${raw.module_slug} org ${raw.organization_id}:`, res.reason)
                continue
            }
            if (res.replayed) {
                result.replayed++
            } else {
                result.charged++
                result.tokens += tokens
            }
        } catch (e) {
            // Una org que falla no puede impedir que se cobren las demás.
            result.failed++
            console.error(`[module-fees] ${raw.module_slug} org ${raw.organization_id}:`, e)
        }
    }

    return result
}
```

- [ ] **Step 3: Escribir la cáscara del cron**

Crear `src/app/api/cron/module-fees/route.ts`:

```ts
/**
 * GET /api/cron/module-fees
 *
 * Cobra la cuota mensual de cada módulo instalado (ver vercel.json). Corre a
 * diario, pero el asiento es idempotente por mes: sólo el primer pase del mes
 * con unidades activas cobra. Los días restantes son tolerancia a fallos.
 *
 * Protegido por CRON_SECRET (Bearer), igual que los otros crons.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { chargeModuleFees } from '@/lib/billing/moduleFees'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
    const secret = process.env.CRON_SECRET
    const authHeader = request.headers.get('authorization')
    if (secret && authHeader !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    try {
        const result = await chargeModuleFees()
        if (result.charged > 0 || result.failed > 0) {
            console.log(
                `[module-fees] ${result.period}: ${result.charged} cobradas · ${result.tokens} tokens · ${result.replayed} repetidas · ${result.failed} fallidas`,
            )
        }
        return NextResponse.json(result)
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        console.error('[module-fees] abortado:', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
```

- [ ] **Step 4: Registrar el cron**

En `vercel.json`, añadir al array `crons`:

```json
        {
            "path": "/api/cron/module-fees",
            "schedule": "23 3 * * *"
        }
```

- [ ] **Step 5: Añadir las exenciones de los dos ficheros de billing**

En `scripts/check-tenant-access.mjs`, dentro de `EXENTOS`:

```js
    [
        'src/lib/billing/moduleFees.ts',
        'Cron de cuotas: barre TODAS las orgs a propósito y resuelve la org fila a fila (org_modules.organization_id), igual que el resto de crons.',
    ],
```

En `eslint.config.mjs`, añadir `src/lib/billing/moduleFees.ts` y `src/lib/billing/moduleCharges.ts` a los `ignores` del bloque que restringe el cliente de datos, junto a `src/lib/billing/wallet.ts` si ya estuviera (comprobar con `grep -n "billing" eslint.config.mjs`).

- [ ] **Step 6: Probar el cron sin contador registrado**

Con el dev corriendo:

```bash
curl -s -H "Authorization: Bearer $(grep '^CRON_SECRET=' .env.local | cut -d= -f2-)" \
  http://localhost:3030/api/cron/module-fees
```
Expected: `{"period":"2026-09","charged":0,"replayed":0,"skipped":1,"failed":0,"tokens":0}` — `skipped:1` porque el módulo Telegram está instalado pero aún no hay contador de bots registrado. Esto es lo correcto: el cron no revienta por un módulo cuyo canal todavía no existe.

- [ ] **Step 7: Probar el cobro con un contador de prueba**

Añadir temporalmente al final de `src/lib/billing/moduleFees.ts`:

```ts
// TEMPORAL — borrar tras verificar
registerUnitCounter('telegram', async () => 2)
```

Llamar al cron dos veces con el mismo `curl` del paso anterior.

Expected primera vez: `{"charged":1,"tokens":59800,...}` (29.90 × 2 unidades ÷ 0.001 USD por token).
Expected segunda vez: `{"charged":0,"replayed":1,...}`.

Verificar el asiento:
```sql
select kind, sku, ref_type, ref_id, tokens, metadata
from token_ledger where sku = 'module_fee:telegram';
```
Expected: una fila `kind='charge'`, `tokens=-59800`, `metadata` con `units: 2` y `price_per_unit: 29.9`.

Limpiar:

```sql
-- Devuelve los tokens a la MISMA bolsa de la que salieron, leyendo el reparto
-- del propio asiento antes de borrarlo. Sumar a ciegas a `purchased_balance`
-- descuadraría el wallet si el cargo hubiera salido de `included_balance`.
with asiento as (
    select organization_id, from_included, from_purchased
    from token_ledger where sku = 'module_fee:telegram'
)
update org_wallets w
set included_balance  = w.included_balance  + a.from_included,
    purchased_balance = w.purchased_balance + a.from_purchased,
    updated_at = now()
from asiento a
where w.organization_id = a.organization_id;

delete from token_ledger where sku = 'module_fee:telegram';
```

**Borrar la línea temporal `registerUnitCounter` antes de commitear.**

- [ ] **Step 8: Probar la comisión**

Crear `/tmp/commission-smoke.ts` con:

```ts
import { settleStarsCommission } from '@/lib/billing/moduleCharges'

const out = await settleStarsCommission({
    organizationId: process.argv[2],
    saleId: 'smoke-test-1',
    avatarId: 'smoke',
    stars: 100,
    soldBy: 'ai',
})
console.log(out)
```

Ejecutarlo con `npx tsx /tmp/commission-smoke.ts <organizationId>` (si los alias `@/` no resuelven fuera de Next, hacer la prueba desde una server action temporal o directamente comprobar la aritmética contra el SQL del paso siguiente).

Expected: `commissionPct: 15`, `commissionUsd: 0.195`, `commissionTokens: 195`, `ledgerId` no nulo. Repetir → `replayed: true`.

```sql
select tokens, metadata from token_ledger where idempotency_key = 'stars_sale:smoke-test-1';
```
Expected: `tokens = -195`, metadata con `stars: 100`, `pct: 15`, `star_usd: 0.013`.

Limpiar:

```sql
-- Devuelve los tokens a la MISMA bolsa de la que salieron, leyendo el reparto
-- del propio asiento antes de borrarlo. Sumar a ciegas a `purchased_balance`
-- descuadraría el wallet si el cargo hubiera salido de `included_balance`.
with asiento as (
    select organization_id, from_included, from_purchased
    from token_ledger where idempotency_key = 'stars_sale:smoke-test-1'
)
update org_wallets w
set included_balance  = w.included_balance  + a.from_included,
    purchased_balance = w.purchased_balance + a.from_purchased,
    updated_at = now()
from asiento a
where w.organization_id = a.organization_id;

delete from token_ledger where idempotency_key = 'stars_sale:smoke-test-1';
```

- [ ] **Step 9: Verificar compilación y candados**

Run: `npx tsc --noEmit && npm run lint && npm run check:tenant`
Expected: sin errores.

Run: `grep -n "TEMPORAL" src/lib/billing/moduleFees.ts`
Expected: sin resultados.

- [ ] **Step 10: Commit**

```bash
git add src/lib/billing/moduleCharges.ts src/lib/billing/moduleFees.ts src/app/api/cron/module-fees/route.ts vercel.json scripts/check-tenant-access.mjs eslint.config.mjs
git commit -m "feat(billing): comision por venta y cuota mensual por unidad

La comision nunca lanza: la llama un webhook sobre una venta que ya ocurrio, y
reventar ahi solo provocaria reintentos sobre una compra ya procesada. La cuota
es idempotente por mes, asi que el cron puede correr a diario como red."
```

---

### Task 10: Lo que ve el usuario de su gasto

**Files:**
- Create: `src/lib/billing/moduleSummary.ts`
- Create: `src/app/(protected-pages)/concepts/account/modules/_components/ModuleBillingSummary.tsx`
- Modify: `src/app/(protected-pages)/concepts/account/modules/page.tsx`
- Modify: `src/app/(protected-pages)/concepts/account/settings/_components/SettingsBilling.tsx`

**Interfaces:**
- Consumes: `getWalletBalance` (`src/lib/billing/wallet.ts`), `MODULE_SKU` (Task 2), `getModuleDefinition` (Task 4), `currentPeriodUtc` (Task 9).
- Produces: `getModuleBillingSummary(organizationId: string, slug: string, period?: string): Promise<ModuleBillingSummary>` con `{ slug, period, pricePerUnit, unit, feeChargedTokens, commissionTokens, commissionUsd, salesCount, entries: LedgerEntry[] }`, y el componente `<ModuleBillingSummary organizationId slug />`.

- [ ] **Step 1: Escribir el resumen**

Crear `src/lib/billing/moduleSummary.ts`:

```ts
/**
 * "¿Cuánto me ha costado este módulo este mes?" — se responde leyendo el
 * ledger por sku, que es la única fuente de verdad del cobro. Nada se
 * recalcula a partir de las ventas: si un asiento falló, aquí tiene que
 * verse que falló.
 */
import { orgSupabase } from '@/lib/org/orgTable'
import { MODULE_SKU, TOKEN_USD } from './catalog'
import { currentPeriodUtc } from './moduleFees'

export interface LedgerEntry {
    id: string
    createdAt: string
    sku: string
    tokens: number
    metadata: Record<string, unknown>
}

export interface ModuleBillingSummary {
    slug: string
    period: string
    feeChargedTokens: number
    commissionTokens: number
    commissionUsd: number
    salesCount: number
    entries: LedgerEntry[]
}

/** Primer instante del mes 'YYYY-MM' en UTC. */
function periodStart(period: string): string {
    return `${period}-01T00:00:00.000Z`
}

export async function getModuleBillingSummary(
    organizationId: string,
    slug: string,
    period = currentPeriodUtc(),
): Promise<ModuleBillingSummary> {
    const feeSku = MODULE_SKU.fee(slug)
    const commissionSku = MODULE_SKU.commission(slug)

    const { data, error } = await orgSupabase()
        .from('token_ledger')
        .select('id, created_at, sku, tokens, metadata')
        .eq('organization_id', organizationId)
        .in('sku', [feeSku, commissionSku])
        .gte('created_at', periodStart(period))
        .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)

    const rows = (data ?? []) as unknown as {
        id: string
        created_at: string
        sku: string
        tokens: number
        metadata: Record<string, unknown> | null
    }[]

    const entries: LedgerEntry[] = rows.map((r) => ({
        id: r.id,
        createdAt: r.created_at,
        sku: r.sku,
        tokens: r.tokens,
        metadata: r.metadata ?? {},
    }))

    // Los asientos guardan tokens NEGATIVOS (son débitos); aquí se presentan
    // en positivo porque la pregunta es "cuánto he gastado".
    const sum = (sku: string) =>
        entries.filter((e) => e.sku === sku).reduce((acc, e) => acc + Math.abs(e.tokens), 0)

    const commissionTokens = sum(commissionSku)

    return {
        slug,
        period,
        feeChargedTokens: sum(feeSku),
        commissionTokens,
        commissionUsd: commissionTokens * TOKEN_USD,
        salesCount: entries.filter((e) => e.sku === commissionSku).length,
        entries,
    }
}
```

- [ ] **Step 2: Escribir el componente**

Crear `src/app/(protected-pages)/concepts/account/modules/_components/ModuleBillingSummary.tsx`:

```tsx
/**
 * Cuota y comisiones del mes en curso para un módulo, más el saldo. Server
 * component: lee el ledger directamente, sin pasar por una action.
 */
import Card from '@/components/ui/Card'
import { getModuleBillingSummary } from '@/lib/billing/moduleSummary'

export default async function ModuleBillingSummary({
    organizationId,
    slug,
}: {
    organizationId: string
    slug: string
}) {
    const summary = await getModuleBillingSummary(organizationId, slug)

    return (
        <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <span>Cuota del mes</span>
                    <h4>{summary.feeChargedTokens.toLocaleString()} tokens</h4>
                </Card>
                <Card>
                    <span>Comisiones del mes</span>
                    <h4>{summary.commissionTokens.toLocaleString()} tokens</h4>
                    <span>${summary.commissionUsd.toFixed(2)}</span>
                </Card>
                <Card>
                    <span>Ventas comisionadas</span>
                    <h4>{summary.salesCount}</h4>
                </Card>
            </div>

            {summary.entries.length > 0 && (
                <Card>
                    <h6>Movimientos de {summary.period}</h6>
                    <div className="overflow-x-auto mt-2">
                        <table className="w-full">
                            <thead>
                                <tr>
                                    <th className="text-left">Fecha</th>
                                    <th className="text-left">Concepto</th>
                                    <th className="text-right">Tokens</th>
                                </tr>
                            </thead>
                            <tbody>
                                {summary.entries.map((e) => (
                                    <tr key={e.id}>
                                        <td>{new Date(e.createdAt).toLocaleDateString()}</td>
                                        <td>{e.sku.startsWith('module_fee') ? 'Cuota mensual' : 'Comisión de venta'}</td>
                                        <td className="text-right">{Math.abs(e.tokens).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </div>
    )
}
```

- [ ] **Step 3: Mostrarlo en la página de módulos**

En `src/app/(protected-pages)/concepts/account/modules/page.tsx`, para cada módulo instalado renderizar el resumen debajo del grid:

```tsx
import { getOrgContext } from '@/lib/tenant/getOrgContext'
import { listModules } from '@/services/ModulesService'
import ModulesClient from './_components/ModulesClient'
import ModuleBillingSummary from './_components/ModuleBillingSummary'

export default async function ModulesPage() {
    const ctx = await getOrgContext()
    const res = await listModules()
    if (!res.success || !res.data) {
        return <div className="p-6 text-red-500">{res.error ?? 'No se pudo cargar el catálogo.'}</div>
    }

    const installedSlugs = res.data.installed
        .filter((m) => m.status === 'installed')
        .map((m) => m.moduleSlug)

    return (
        <div className="flex flex-col gap-6">
            <ModulesClient
                catalog={res.data.catalog}
                installed={res.data.installed}
                canManage={res.data.canManage}
            />
            {installedSlugs.map((slug) => (
                <ModuleBillingSummary key={slug} organizationId={ctx.organizationId} slug={slug} />
            ))}
        </div>
    )
}
```

- [ ] **Step 4: Añadir el saldo y los módulos a Settings → Billing**

En `src/app/(protected-pages)/concepts/account/settings/_components/SettingsBilling.tsx`, **mantener el Alert de "billing no disponible"** (sigue siendo cierto: no hay pasarela) y añadir debajo el saldo actual y un enlace a la página de módulos.

Leer primero el fichero para respetar si es cliente o servidor:

Run: `head -45 "src/app/(protected-pages)/concepts/account/settings/_components/SettingsBilling.tsx"`

Si es un componente cliente, añadir a `src/services/ModulesService.ts` una action:

```ts
export async function getBillingOverview(): Promise<
    ModulesResult<{ balance: Awaited<ReturnType<typeof getWalletBalance>>; installed: OrgModuleRow[] }>
> {
    try {
        const ctx = await getOrgContext()
        const [balance, installed] = await Promise.all([getWalletBalance(ctx), listOrgModules(ctx)])
        return { success: true, data: { balance, installed } }
    } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
    }
}
```

(importando `getWalletBalance` de `@/lib/billing/wallet`) y consumirla con `useEffect` + `useState` en el componente, mostrando tokens disponibles y la lista de módulos instalados con enlace a `/concepts/account/modules`.

- [ ] **Step 5: Verificar los números contra el SQL**

Instalar el módulo, generar un asiento de prueba de comisión (repetir el paso 8 de la Task 9), abrir `/concepts/account/modules` y comprobar que "Comisiones del mes" coincide con:

```sql
select sku, sum(abs(tokens)) as tokens, count(*) as asientos
from token_ledger
where organization_id = '<org>'
  and sku in ('module_fee:telegram', 'commission:telegram')
  and created_at >= date_trunc('month', now())
group by sku;
```

Borrar el asiento de prueba y devolver los tokens al wallet:

```sql
-- Devuelve los tokens a la MISMA bolsa de la que salieron, leyendo el reparto
-- del propio asiento antes de borrarlo. Sumar a ciegas a `purchased_balance`
-- descuadraría el wallet si el cargo hubiera salido de `included_balance`.
with asiento as (
    select organization_id, from_included, from_purchased
    from token_ledger where idempotency_key = 'stars_sale:smoke-test-1'
)
update org_wallets w
set included_balance  = w.included_balance  + a.from_included,
    purchased_balance = w.purchased_balance + a.from_purchased,
    updated_at = now()
from asiento a
where w.organization_id = a.organization_id;

delete from token_ledger where idempotency_key = 'stars_sale:smoke-test-1';
```

- [ ] **Step 6: Verificar compilación y candados**

Run: `npx tsc --noEmit && npm run lint && npm run check:tenant && npm test`
Expected: todo verde.

- [ ] **Step 7: Commit**

```bash
git add src/lib/billing/moduleSummary.ts "src/app/(protected-pages)/concepts/account/modules" "src/app/(protected-pages)/concepts/account/settings/_components/SettingsBilling.tsx" src/services/ModulesService.ts
git commit -m "feat(billing): cuota y comisiones del mes visibles por modulo

Se lee del ledger y no se recalcula desde las ventas: si un asiento fallo,
tiene que verse que fallo."
```

---

## Verificación final del plan

Antes de dar el plan por terminado:

- [ ] `npx tsc --noEmit` sin errores
- [ ] `npm run lint` sin errores
- [ ] `npm run check:tenant` sin infractores
- [ ] `npm test` en verde (12 tests nuevos: 5 de catalog, 7 de navigation)
- [ ] `mcp__supabase__get_advisors` con `type: "security"` sin hallazgos nuevos sobre `module_catalog` / `org_modules`
- [ ] `git diff --stat main` sin ficheros temporales de prueba (`grep -rn "TEMPORAL\|smoke-test" src/` vacío)
- [ ] `select * from token_ledger where sku like '%test%' or idempotency_key like '%smoke%'` vacío
- [ ] La página `/concepts/account/modules` instala, desinstala y reinstala, y el saldo refleja los asientos

## Qué queda fuera de este plan

El canal de Telegram completo (bot, Business mode, Stars, scripts, broadcasts, estadísticas) va en planes separados, que se escriben al llegar a ellos para que no se queden obsoletos:

- **Plan 2** — Canal Telegram base: cliente, `channelDelivery`, generalización de `platform`, webhook de mensajes, conexión del bot, Secretary Mode (fases 6-10 del spec).
- **Plan 3** — Stars y PPV: galería, `sendPaidMedia`, ventas, comisión enganchada a `settleStarsCommission`, ofertas de la IA (fases 11-12).
- **Plan 4** — Scripts, broadcasts y estadísticas (fases 13-16).

De este plan, lo que el Plan 2 consume: `requireModule(ctx, 'telegram')` en cada server action, `meta.requiredModule: 'telegram'` en los ítems de navegación, `ModuleNotInstalled` en el layout del módulo, y `registerUnitCounter('telegram', countActiveTelegramBots)`. Lo que el Plan 3 consume: `settleStarsCommission`.
