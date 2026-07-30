-- F5 — Tokens + suscripción (diseño en docs/SUPER-PLAN.md § FASE 5).
--
-- MODELO: suscripción mensual que incluye una bolsa de tokens + packs
-- comprables cuando se acaba la del plan. UNA sola unidad para todo el
-- consumo (imagen, video, voz, mensajes del agente), no límites por tipo.
--
-- POR QUÉ UN LEDGER Y NO UN CONTADOR: `agent_usage_counters` (F3) es un
-- contador incremental — sirve para "cuántos mensajes van este mes", pero no
-- puede responder "por qué el saldo es este" ni deshacer un cobro. Aquí hace
-- falta lo segundo: las tareas de KIE/MuleRouter son submit→poll conducido por
-- el NAVEGADOR, así que una generación puede cobrarse y luego no existir (el
-- usuario cierra la pestaña). Con un contador eso es plata perdida sin rastro;
-- con un ledger append-only + holds es un refund reconciliable.
--
-- UNIDAD: 1 token = $0.001 de PRECIO al cliente, y el costo real del proveedor
-- se guarda aparte en `cost_usd`. El token está DESACOPLADO a propósito: cambiar
-- de proveedor (o que KIE mueva un precio) no debe mover el precio público.

-- ─────────────────────────────────────────────────────────────────────────────
-- Planes
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists plan_configurations (
    slug text primary key,
    name text not null,
    -- Bolsa que se REGALA cada ciclo. No acumula (ver wallet_start_period).
    tokens_included bigint not null default 0,
    price_usd_month numeric(10, 2) not null default 0,
    -- NULL = ilimitado. Gauges, no consumo: se comprueban al crear, no al gastar.
    max_avatars int,
    max_seats int,
    -- storage_gb NO existe a propósito: F4.2.c está a medias (los bytes no
    -- tienen scope de org) → no es medible por tenant, así que no se promete.
    is_public boolean not null default true,
    sort_order int not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Packs de un pago (lo que se compra cuando se agota la bolsa del plan).
create table if not exists token_packs (
    slug text primary key,
    name text not null,
    tokens bigint not null,
    price_usd numeric(10, 2) not null,
    is_public boolean not null default true,
    sort_order int not null default 0,
    created_at timestamptz not null default now()
);

-- Suscripción de la org. `payment_*` sin FK ni enum de proveedor: el diseño es
-- agnóstico (interfaz PaymentProvider) porque Stripe puede cerrarnos la cuenta
-- y la salida a cripto/high-risk no debe ser una migración de schema.
alter table organizations
    add column if not exists plan_slug text references plan_configurations(slug),
    add column if not exists subscription_status text not null default 'trialing',
    add column if not exists trial_ends_at timestamptz,
    add column if not exists current_period_start timestamptz,
    add column if not exists current_period_end timestamptz,
    add column if not exists payment_provider text,
    add column if not exists payment_customer_id text,
    add column if not exists payment_subscription_id text;

-- ─────────────────────────────────────────────────────────────────────────────
-- Wallet — balance MATERIALIZADO (la verdad reconstruible es el ledger)
-- ─────────────────────────────────────────────────────────────────────────────
-- Dos bolsas separadas porque tienen reglas distintas: `included` se resetea
-- cada ciclo, `purchased` no expira. El orden de débito (included primero) es
-- lo que hace que un pack comprado solo se toque cuando de verdad se agotó el
-- plan — si se mezclaran en un número, el pack se consumiría antes de tiempo y
-- el cliente sentiría que le robamos.
create table if not exists org_wallets (
    organization_id uuid primary key references organizations(id) on delete cascade,
    included_balance bigint not null default 0,
    purchased_balance bigint not null default 0,
    -- Reservado por tareas EN VUELO (holds sin liquidar). No es saldo gastado
    -- ni disponible: es la diferencia entre "cobrado" y "confirmado".
    held_balance bigint not null default 0,
    period_start timestamptz,
    updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Ledger append-only
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists token_ledger (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    -- Quién gastó, para auditoría por miembro. NO es frontera de tenant.
    user_id text,
    kind text not null check (
        kind in ('grant', 'purchase', 'hold', 'settle', 'refund', 'adjust')
    ),
    -- 'image:kie-seedream-5-lite', 'video:mulerouter-wan26-i2v', 'tts:minimax'…
    sku text,
    -- Firmado: negativo sale del wallet, positivo entra.
    tokens bigint not null,
    -- Costo REAL del proveedor. La verdad de márgenes vive aquí, separada del
    -- precio en tokens, para poder responder "¿este plan pierde plata?".
    cost_usd numeric(12, 6),
    -- De qué bolsa salió (ambos positivos). Un refund tiene que devolver a la
    -- MISMA bolsa de la que salió: si un hold de included se devolviera a
    -- purchased, el reset del ciclo le borraría al cliente tokens comprados.
    from_included bigint not null default 0,
    from_purchased bigint not null default 0,
    -- El hold que esta fila liquida o reembolsa (NULL en grant/purchase/hold).
    hold_id uuid references token_ledger(id),
    ref_type text,
    ref_id text,
    -- Anti-doble-cobro. El polling reintenta y el navegador re-envía: sin esto
    -- la misma tarea se cobraría varias veces.
    idempotency_key text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create unique index if not exists token_ledger_idem_key
    on token_ledger (organization_id, idempotency_key)
    where idempotency_key is not null;

-- "El consumo de esta org en este periodo", que es toda la lectura de
-- /settings/billing y del measure-only.
create index if not exists token_ledger_org_created_idx
    on token_ledger (organization_id, created_at desc);

-- Barrido de holds huérfanos (el cron de reconciliación). Parcial: solo indexa
-- lo que puede estar colgado.
create index if not exists token_ledger_open_holds_idx
    on token_ledger (organization_id, created_at)
    where kind = 'hold';

-- Patrón del repo: RLS on SIN políticas (backstop anti-anon; la autorización
-- real es el filtro manual organization_id con service-role). Crítico aquí: un
-- wallet es el objetivo más apetecible de la app.
alter table plan_configurations enable row level security;
alter table token_packs enable row level security;
alter table org_wallets enable row level security;
alter table token_ledger enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- wallet_hold — RESERVA tokens antes de llamar al proveedor
-- ─────────────────────────────────────────────────────────────────────────────
-- Cobra YA (débito de las bolsas) y mueve el importe a held_balance. Se liquida
-- con wallet_settle al persistir el resultado, o se devuelve con wallet_refund
-- si la tarea muere. Cobrar al final en vez de al principio permitiría lanzar
-- N generaciones concurrentes con saldo para una.
--
-- p_enforce=false es el modo MEASURE-ONLY del rollout: registra y deja pasar
-- aunque no haya saldo (el balance se va a negativo a propósito — los datos
-- honestos de cuánto se habría excedido son el insumo para fijar precios).
create or replace function wallet_hold(
    p_org uuid,
    p_user text,
    p_tokens bigint,
    p_sku text,
    p_cost_usd numeric default null,
    p_ref_type text default null,
    p_ref_id text default null,
    p_idempotency_key text default null,
    p_enforce boolean default false
) returns jsonb language plpgsql as $$
declare
    v_wallet org_wallets;
    v_existing token_ledger;
    v_from_included bigint;
    v_from_purchased bigint;
    v_available bigint;
    v_hold_id uuid;
begin
    if p_tokens <= 0 then
        raise exception 'wallet_hold: p_tokens debe ser > 0 (recibido %)', p_tokens;
    end if;

    -- Idempotencia ANTES de tocar el wallet: un reintento devuelve el hold que
    -- ya existe en vez de cobrar otra vez.
    if p_idempotency_key is not null then
        select * into v_existing from token_ledger
        where organization_id = p_org and idempotency_key = p_idempotency_key;
        if found then
            return jsonb_build_object(
                'ok', true, 'replayed', true, 'hold_id', v_existing.id,
                'tokens', abs(v_existing.tokens)
            );
        end if;
    end if;

    -- El wallet nace al primer uso: así ninguna org queda sin fila por haberse
    -- creado antes de esta migración o fuera del flujo de alta.
    insert into org_wallets (organization_id) values (p_org)
    on conflict (organization_id) do nothing;

    -- FOR UPDATE: dos generaciones en paralelo leerían el mismo saldo y las dos
    -- pasarían. El lock de fila es lo que hace el débito atómico.
    select * into v_wallet from org_wallets
    where organization_id = p_org for update;

    v_available := v_wallet.included_balance + v_wallet.purchased_balance;

    if p_enforce and v_available < p_tokens then
        return jsonb_build_object(
            'ok', false, 'reason', 'insufficient_tokens',
            'available', v_available, 'required', p_tokens
        );
    end if;

    -- Included primero; el resto (incluido el sobregiro en measure-only) sale
    -- de purchased, que es la bolsa que puede quedar negativa.
    v_from_included := least(greatest(v_wallet.included_balance, 0), p_tokens);
    v_from_purchased := p_tokens - v_from_included;

    update org_wallets set
        included_balance = included_balance - v_from_included,
        purchased_balance = purchased_balance - v_from_purchased,
        held_balance = held_balance + p_tokens,
        updated_at = now()
    where organization_id = p_org;

    insert into token_ledger (
        organization_id, user_id, kind, sku, tokens, cost_usd,
        from_included, from_purchased, ref_type, ref_id, idempotency_key,
        metadata
    ) values (
        p_org, p_user, 'hold', p_sku, -p_tokens, p_cost_usd,
        v_from_included, v_from_purchased, p_ref_type, p_ref_id,
        p_idempotency_key,
        case when not p_enforce and v_available < p_tokens
             then jsonb_build_object('measure_only_shortfall', p_tokens - v_available)
             else '{}'::jsonb end
    ) returning id into v_hold_id;

    return jsonb_build_object(
        'ok', true, 'hold_id', v_hold_id, 'tokens', p_tokens,
        'from_included', v_from_included, 'from_purchased', v_from_purchased
    );
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- wallet_settle — confirma un hold (la generación existe y se guardó)
-- ─────────────────────────────────────────────────────────────────────────────
-- Si el costo final resultó MENOR que la reserva (p.ej. un video salió más
-- corto de lo pedido), la diferencia vuelve a las bolsas en la misma proporción
-- en que se tomó. Al alza no se re-cobra: el precio se le prometió al usuario
-- antes de generar, y cobrarle más a posteriori es peor que comerse el delta.
create or replace function wallet_settle(
    p_org uuid,
    p_hold_id uuid,
    p_tokens_final bigint default null,
    p_cost_usd numeric default null
) returns jsonb language plpgsql as $$
declare
    v_hold token_ledger;
    v_held bigint;
    v_final bigint;
    v_back bigint;
    v_back_included bigint;
    v_back_purchased bigint;
begin
    select * into v_hold from token_ledger
    where id = p_hold_id and organization_id = p_org and kind = 'hold';
    if not found then
        return jsonb_build_object('ok', false, 'reason', 'hold_not_found');
    end if;

    -- Ya liquidado o reembolsado: salir sin tocar nada (el poll puede llamar
    -- dos veces al mismo resultado).
    if exists (
        select 1 from token_ledger
        where hold_id = p_hold_id and kind in ('settle', 'refund')
    ) then
        return jsonb_build_object('ok', true, 'replayed', true);
    end if;

    v_held := abs(v_hold.tokens);
    v_final := least(coalesce(p_tokens_final, v_held), v_held);
    v_back := v_held - v_final;

    -- Devolver en la MISMA proporción en que se tomó, para no convertir tokens
    -- comprados en tokens de plan (que el reset del ciclo borraría).
    v_back_included := case when v_held = 0 then 0
        else (v_back * v_hold.from_included) / v_held end;
    v_back_purchased := v_back - v_back_included;

    update org_wallets set
        included_balance = included_balance + v_back_included,
        purchased_balance = purchased_balance + v_back_purchased,
        held_balance = held_balance - v_held,
        updated_at = now()
    where organization_id = p_org;

    insert into token_ledger (
        organization_id, user_id, kind, sku, tokens, cost_usd,
        from_included, from_purchased, hold_id, ref_type, ref_id
    ) values (
        p_org, v_hold.user_id, 'settle', v_hold.sku, v_back,
        coalesce(p_cost_usd, v_hold.cost_usd),
        v_back_included, v_back_purchased, p_hold_id,
        v_hold.ref_type, v_hold.ref_id
    );

    return jsonb_build_object('ok', true, 'charged', v_final, 'returned', v_back);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- wallet_refund — devuelve un hold entero (la tarea murió)
-- ─────────────────────────────────────────────────────────────────────────────
-- Lo llama la reconciliación de `pending_generations`: una tarea cuyo resultado
-- nadie guardó no se le cobra al cliente. Sin esto, cerrar la pestaña a media
-- generación le cuesta tokens por nada — el reclamo de soporte más caro que
-- existe, porque no tiene evidencia.
create or replace function wallet_refund(
    p_org uuid,
    p_hold_id uuid,
    p_reason text default null
) returns jsonb language plpgsql as $$
declare
    v_hold token_ledger;
begin
    select * into v_hold from token_ledger
    where id = p_hold_id and organization_id = p_org and kind = 'hold';
    if not found then
        return jsonb_build_object('ok', false, 'reason', 'hold_not_found');
    end if;

    if exists (
        select 1 from token_ledger
        where hold_id = p_hold_id and kind in ('settle', 'refund')
    ) then
        return jsonb_build_object('ok', true, 'replayed', true);
    end if;

    update org_wallets set
        included_balance = included_balance + v_hold.from_included,
        purchased_balance = purchased_balance + v_hold.from_purchased,
        held_balance = held_balance - abs(v_hold.tokens),
        updated_at = now()
    where organization_id = p_org;

    insert into token_ledger (
        organization_id, user_id, kind, sku, tokens, from_included,
        from_purchased, hold_id, ref_type, ref_id, metadata
    ) values (
        p_org, v_hold.user_id, 'refund', v_hold.sku, abs(v_hold.tokens),
        v_hold.from_included, v_hold.from_purchased, p_hold_id,
        v_hold.ref_type, v_hold.ref_id,
        jsonb_build_object('reason', coalesce(p_reason, 'unspecified'))
    );

    return jsonb_build_object('ok', true, 'refunded', abs(v_hold.tokens));
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- wallet_credit — packs comprados y ajustes manuales
-- ─────────────────────────────────────────────────────────────────────────────
-- Entra a `purchased` (no expira). El plan mensual NO usa esto: usa
-- wallet_start_period, porque su bolsa se reemplaza, no se suma.
create or replace function wallet_credit(
    p_org uuid,
    p_tokens bigint,
    p_kind text default 'purchase',
    p_ref_type text default null,
    p_ref_id text default null,
    p_idempotency_key text default null,
    p_cost_usd numeric default null
) returns jsonb language plpgsql as $$
declare
    v_existing_id uuid;
begin
    if p_kind not in ('purchase', 'adjust') then
        raise exception 'wallet_credit: kind inválido %', p_kind;
    end if;

    -- Los webhooks de pago se reentregan: sin idempotencia, un pack se acredita
    -- dos veces.
    if p_idempotency_key is not null then
        select id into v_existing_id from token_ledger
        where organization_id = p_org and idempotency_key = p_idempotency_key;
        if found then
            return jsonb_build_object('ok', true, 'replayed', true,
                                      'ledger_id', v_existing_id);
        end if;
    end if;

    insert into org_wallets (organization_id) values (p_org)
    on conflict (organization_id) do nothing;

    update org_wallets set
        purchased_balance = purchased_balance + p_tokens,
        updated_at = now()
    where organization_id = p_org;

    insert into token_ledger (
        organization_id, kind, tokens, cost_usd, ref_type, ref_id,
        idempotency_key
    ) values (
        p_org, p_kind, p_tokens, p_cost_usd, p_ref_type, p_ref_id,
        p_idempotency_key
    );

    return jsonb_build_object('ok', true, 'credited', p_tokens);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- wallet_start_period — renovación del ciclo
-- ─────────────────────────────────────────────────────────────────────────────
-- REEMPLAZA included_balance (no suma): la bolsa del plan no acumula. Deja
-- purchased_balance intacto — eso es lo que el cliente pagó aparte.
create or replace function wallet_start_period(
    p_org uuid,
    p_tokens_included bigint,
    p_period_start timestamptz default now()
) returns jsonb language plpgsql as $$
declare
    v_previous bigint;
begin
    insert into org_wallets (organization_id) values (p_org)
    on conflict (organization_id) do nothing;

    select included_balance into v_previous from org_wallets
    where organization_id = p_org for update;

    update org_wallets set
        included_balance = p_tokens_included,
        period_start = p_period_start,
        updated_at = now()
    where organization_id = p_org;

    -- El grant registra el DELTA para que la suma del ledger siga cuadrando
    -- con el balance materializado (si no, el reset lo desincroniza y ya no se
    -- puede auditar el wallet contra su historia).
    insert into token_ledger (
        organization_id, kind, tokens, ref_type, metadata
    ) values (
        p_org, 'grant', p_tokens_included - coalesce(v_previous, 0),
        'period', jsonb_build_object(
            'expired_included', coalesce(v_previous, 0),
            'granted', p_tokens_included
        )
    );

    return jsonb_build_object('ok', true, 'included', p_tokens_included,
                              'expired', coalesce(v_previous, 0));
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed
-- ─────────────────────────────────────────────────────────────────────────────
-- Precios de partida, NO definitivos: se revalidan con los datos reales del
-- measure-only (F5.5) antes de abrir el checkout. Costo nuestro por token =
-- $0.000333 (1 token = $0.001 al cliente, margen 3×), así que la bolsa de
-- Creator nos cuesta ~$10 y se vende a $29.
insert into plan_configurations
    (slug, name, tokens_included, price_usd_month, max_avatars, max_seats, sort_order)
values
    ('creator',  'Creator',   30000,  29.00,    3,    1, 1),
    ('pro',      'Pro',      100000,  79.00,   10,    3, 2),
    ('business', 'Business', 300000, 199.00,   30,   10, 3),
    ('agency',   'Agency',   900000, 499.00, null, null, 4)
on conflict (slug) do nothing;

insert into token_packs (slug, name, tokens, price_usd, sort_order)
values
    ('pack-10k',  '10.000 tokens',  10000,  15.00, 1),
    ('pack-50k',  '50.000 tokens',  50000,  59.00, 2),
    ('pack-200k', '200.000 tokens', 200000, 199.00, 3)
on conflict (slug) do nothing;

-- Wallet para las orgs que ya existen (incluida la default). Saldo 0: el grant
-- del ciclo lo pone el alta de suscripción o el cron de lifecycle, no esta
-- migración — sembrar tokens aquí sería regalar saldo sin evento que lo
-- justifique en el ledger.
insert into org_wallets (organization_id)
select id from organizations
on conflict (organization_id) do nothing;
