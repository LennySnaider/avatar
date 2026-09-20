-- F4.4 — CONCESIONES DE SOPORTE Y BITÁCORA DEL ADMIN DE PLATAFORMA.
--
-- Modelo: leer un tenant es libre y queda auditado; OPERAR como owner exige
-- una concesión. Dos orígenes para esa concesión, y se distinguen a propósito:
--   'tenant'      — el owner la encendió desde su pantalla de cuenta.
--   'break_glass' — el admin la forzó con motivo, porque el tenant no podía
--                   entrar para concederla. La fricción (motivo obligatorio,
--                   caducidad corta, aviso) es lo que la hace defendible.
--
-- Ninguna de las dos tablas entra en TENANT_TABLES, por el mismo motivo que
-- `organization_members`: `support_grants` es quien DECIDE la elevación, y
-- leerla a través de un builder que exige un ctx ya resuelto sería circular.
-- Se filtran a mano por organización, como `membersDb.ts`.

create table if not exists support_grants (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    kind text not null check (kind in ('tenant','break_glass')),
    -- Quién la creó: el owner del tenant, o el admin de plataforma si forzó.
    granted_by text not null references users(id) on delete cascade,
    -- Obligatorio al romper el cristal: entrar sin que nadie te abra exige
    -- dejar dicho por qué. Es la mitad de lo que hace auditable el atajo.
    reason text,
    expires_at timestamptz not null,
    revoked_at timestamptz,
    revoked_by text references users(id) on delete set null,
    created_at timestamptz not null default now(),
    constraint support_grants_break_glass_needs_reason
        check (kind <> 'break_glass' or (reason is not null and length(btrim(reason)) > 0))
);

-- La pregunta que se hace en CADA petición con override: «¿hay concesión viva
-- para esta organización?». Va por organización y por fecha descendente porque
-- siempre se quiere la más reciente.
create index if not exists idx_support_grants_org_recientes
    on support_grants(organization_id, created_at desc);

create table if not exists superadmin_audit_log (
    id uuid primary key default gen_random_uuid(),
    -- Quién de verdad, nunca el tenant suplantado. Sin esto la bitácora
    -- mentiría exactamente donde importa.
    actor_user_id text not null references users(id) on delete cascade,
    -- NULL en acciones de plataforma que no cuelgan de una organización
    -- concreta (editar un plan, publicar un módulo).
    organization_id uuid references organizations(id) on delete set null,
    action text not null,
    -- ¿La acción se hizo pudiendo escribir? Es lo que separa «entré a mirar»
    -- de «entré y toqué», y lo que el tenant querrá ver primero.
    elevated boolean not null default false,
    grant_kind text check (grant_kind is null or grant_kind in ('tenant','break_glass')),
    reason text,
    detail jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

-- Dos lecturas distintas y las dos frecuentes: la del tenant («¿quién ha
-- entrado en mi cuenta?») y la de plataforma («¿qué ha hecho este admin?»).
create index if not exists idx_superadmin_audit_org
    on superadmin_audit_log(organization_id, created_at desc);
create index if not exists idx_superadmin_audit_actor
    on superadmin_audit_log(actor_user_id, created_at desc);

-- Mismo criterio que el resto del repo: RLS ON sin políticas = backstop
-- anti-anon. La autorización real es el filtro manual con service-role.
alter table support_grants enable row level security;
alter table superadmin_audit_log enable row level security;
