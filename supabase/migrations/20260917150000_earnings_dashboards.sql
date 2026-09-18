-- Dashboards de ingresos (inicio + por avatar). Ver
-- docs/superpowers/specs/2026-09-17-earnings-dashboards-design.md.
--
-- Dos fuentes, dos unidades que NUNCA se mezclan:
--   - Fanvue: centavos de USD, traídos de la API (GET /v1/agencies/earnings)
--     por el cron `earnings-sync` a esta tabla, POR CREATOR y por día UTC.
--   - Telegram Stars: ya están en `telegram_stars_sales` y se agregan EN VIVO
--     en las funciones de abajo; no se copian a ninguna tabla.
--
-- Se guarda `creator_uuid` y no `avatar_id` a propósito: el cruce con
-- `avatars.fanvue_creator_uuid` se hace al LEER, así remapear un avatar a
-- otro creator no obliga a resincronizar nada y las filas de creators sin
-- avatar se conservan (sin contarse) hasta que alguien los asigne.

create table if not exists fanvue_daily_earnings (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    creator_uuid text not null,
    -- Día UTC tal como lo reporta Fanvue ('YYYY-MM-DD').
    day date not null,
    -- Centavos de USD tal cual llegan. Sin check >= 0: un ajuste negativo de
    -- Fanvue no debe romper el upsert del cron.
    gross_cents bigint not null default 0,
    net_cents bigint not null default 0,
    currency text not null default 'USD',
    synced_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    unique (organization_id, creator_uuid, day)
);
create index if not exists idx_fanvue_daily_earnings_org_day
    on fanvue_daily_earnings(organization_id, day);
alter table fanvue_daily_earnings enable row level security;
comment on table fanvue_daily_earnings is
    'Rollup diario (UTC) de ingresos Fanvue por creator, escrito por el cron earnings-sync desde GET /v1/agencies/earnings. Se lee cruzando avatars.fanvue_creator_uuid. Service-role only, RLS sin políticas.';

-- El índice existente de ventas (idx_tg_venta_avatar) es por avatar; el
-- dashboard de inicio agrega por ORGANIZACIÓN.
create index if not exists idx_tg_venta_org
    on telegram_stars_sales(organization_id, status, purchased_at desc);

-- Serie diaria por fuente. Devuelve como mucho (días × 2) filas: lejos del
-- techo de 1000 de PostgREST para rangos de hasta 366 días.
create or replace function earnings_series(
    p_org uuid,
    p_from date,
    p_to date,
    p_avatar uuid default null
) returns table (
    day date,
    source text,
    usd_gross_cents bigint,
    usd_net_cents bigint,
    stars bigint,
    sales_count integer
) language sql stable as $$
    -- Fanvue. `exists` y no join a propósito: si dos avatares apuntaran al
    -- mismo creator (fanvue_creator_uuid no tiene unique), un join sumaría el
    -- importe dos veces.
    select f.day,
           'fanvue'::text,
           sum(f.gross_cents)::bigint,
           sum(f.net_cents)::bigint,
           0::bigint,
           0::integer
    from fanvue_daily_earnings f
    where f.organization_id = p_org
      and f.currency = 'USD'
      and f.day between p_from and p_to
      and exists (
          select 1 from avatars a
          where a.organization_id = p_org
            and a.fanvue_creator_uuid = f.creator_uuid
            and (p_avatar is null or a.id = p_avatar))
    group by f.day
    union all
    -- Telegram, en vivo. El día es la fecha UTC de purchased_at (el webhook la
    -- estampa en ISO UTC); los límites se construyen en UTC explícito para no
    -- depender del timezone de sesión. Sólo 'purchased': una fila 'refunded'
    -- deja de contar y 'offered' nunca contó.
    select (s.purchased_at at time zone 'UTC')::date,
           'telegram'::text,
           0::bigint,
           0::bigint,
           sum(s.stars)::bigint,
           count(*)::integer
    from telegram_stars_sales s
    where s.organization_id = p_org
      and s.status = 'purchased'
      and s.purchased_at is not null
      and s.purchased_at >= (p_from::timestamp at time zone 'UTC')
      and s.purchased_at <  ((p_to + 1)::timestamp at time zone 'UTC')
      and (p_avatar is null or s.avatar_id = p_avatar)
    group by 1
    order by 1, 2;
$$;

-- Ranking por avatar y fuente: una fila por avatar y fuente CON datos. Los
-- avatares a cero los completa el servicio con la lista de `avatars`.
create or replace function earnings_by_avatar(
    p_org uuid,
    p_from date,
    p_to date
) returns table (
    avatar_id uuid,
    source text,
    usd_gross_cents bigint,
    usd_net_cents bigint,
    stars bigint,
    sales_count integer
) language sql stable as $$
    select a.id,
           'fanvue'::text,
           sum(f.gross_cents)::bigint,
           sum(f.net_cents)::bigint,
           0::bigint,
           0::integer
    from avatars a
    join fanvue_daily_earnings f
      on f.organization_id = a.organization_id
     and f.creator_uuid = a.fanvue_creator_uuid
    where a.organization_id = p_org
      and f.organization_id = p_org
      and a.fanvue_creator_uuid is not null
      and f.currency = 'USD'
      and f.day between p_from and p_to
    group by a.id
    union all
    select s.avatar_id,
           'telegram'::text,
           0::bigint,
           0::bigint,
           sum(s.stars)::bigint,
           count(*)::integer
    from telegram_stars_sales s
    where s.organization_id = p_org
      and s.status = 'purchased'
      and s.purchased_at is not null
      and s.purchased_at >= (p_from::timestamp at time zone 'UTC')
      and s.purchased_at <  ((p_to + 1)::timestamp at time zone 'UTC')
    group by s.avatar_id;
$$;

-- Invoker (SIN security definer): sólo las llama el service-role, que ya
-- salta RLS. Grants con el mismo patrón que consume_auth_rate_limit.
revoke all on function earnings_series(uuid, date, date, uuid) from public;
revoke all on function earnings_series(uuid, date, date, uuid) from anon, authenticated;
grant execute on function earnings_series(uuid, date, date, uuid) to service_role;
revoke all on function earnings_by_avatar(uuid, date, date) from public;
revoke all on function earnings_by_avatar(uuid, date, date) from anon, authenticated;
grant execute on function earnings_by_avatar(uuid, date, date) to service_role;

-- Aviso del linter de Supabase (function_search_path_mutable): search_path
-- fijo para que la resolución de tablas no dependa del rol que invoque.
-- (Aplicado en vivo como migración aparte "earnings_functions_search_path",
-- el mismo 2026-09-17, justo después de la principal.)
alter function earnings_series(uuid, date, date, uuid) set search_path = public;
alter function earnings_by_avatar(uuid, date, date) set search_path = public;
