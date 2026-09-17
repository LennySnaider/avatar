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
     'Conecta tu bot de Telegram y vende contenido con Telegram Stars. Las Stars se acreditan a tu bot; la plataforma cobra una comisión por venta.',
     9.00, 'bot', 20.00, 7.00, 1)
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
