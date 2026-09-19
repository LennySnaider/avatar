-- Estratega Fase 1: agente de IA de la organización (tenant agent), distinto
-- del agente por avatar (agent_chats/agent_messages, que es el inbox de
-- Fanvue). Este vive en org_assistant_* y NUNCA escribe en agent_*.
--
-- org_assistant_threads: una conversación del usuario con el Estratega.
-- `screen` es la pantalla desde la que se abrió (botones contextuales del
-- widget flotante), para prellenar el prompt.
create table if not exists org_assistant_threads (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    title text,
    -- id de NextAuth (text), igual que installed_by en org_modules: quién
    -- abrió el hilo. Auditoría, no frontera de tenant.
    created_by text not null,
    screen text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists org_assistant_threads_org_updated_idx
    on org_assistant_threads (organization_id, updated_at desc);
alter table org_assistant_threads enable row level security;

-- org_assistant_messages: los turnos de cada hilo. `content` guarda las
-- parts de UIMessage (AI SDK) tal cual, no texto plano — el widget las
-- renderiza directo. tokens_charged/cost_usd/hold_id son el rastro de
-- facturación por turno (hold antes de streamear, settle con el uso real).
create table if not exists org_assistant_messages (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    thread_id uuid not null references org_assistant_threads(id) on delete cascade,
    role text not null check (role in ('user', 'assistant', 'system')),
    content jsonb not null,
    model text,
    input_tokens int,
    output_tokens int,
    tokens_charged int not null default 0,
    cost_usd numeric(12, 6),
    hold_id uuid,
    created_at timestamptz not null default now()
);
create index if not exists org_assistant_messages_org_thread_created_idx
    on org_assistant_messages (organization_id, thread_id, created_at);
alter table org_assistant_messages enable row level security;

-- org_assistant_actions: herramientas propuestas/ejecutadas por el Estratega
-- en un turno. Fase 1 es de solo lectura (el spec lo deja explícito), pero
-- la tabla ya soporta el ciclo proponer→aprobar→ejecutar de fases futuras.
create table if not exists org_assistant_actions (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    thread_id uuid not null references org_assistant_threads(id) on delete cascade,
    message_id uuid not null references org_assistant_messages(id) on delete cascade,
    tool_name text not null,
    args jsonb,
    status text not null default 'proposed'
        check (status in ('proposed', 'approved', 'rejected', 'executed', 'failed')),
    result jsonb,
    approved_by text,
    executed_at timestamptz,
    error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists org_assistant_actions_org_thread_created_idx
    on org_assistant_actions (organization_id, thread_id, created_at);
alter table org_assistant_actions enable row level security;

comment on table org_assistant_threads is
    'Hilos de conversación con el Estratega (agente de IA de la organización). NO confundir con agent_chats, que es el inbox de Fanvue por avatar.';
comment on column org_assistant_threads.created_by is
    'id de NextAuth (text) de quién abrió el hilo. Auditoría, no frontera de tenant.';
comment on column org_assistant_threads.screen is
    'Pantalla desde la que se abrió el hilo (botón contextual del widget flotante), para prellenar el prompt.';

comment on table org_assistant_messages is
    'Turnos de un hilo del Estratega. content guarda las parts de UIMessage (AI SDK) tal cual, no texto plano.';
comment on column org_assistant_messages.content is
    'Parts de UIMessage (AI SDK) del turno.';
comment on column org_assistant_messages.tokens_charged is
    'Tokens realmente cobrados a la org por este turno (settle con el uso real vía tokensForUsage), no la estimación del hold.';
comment on column org_assistant_messages.hold_id is
    'id del hold en token_ledger que este turno liquida (settle) o libera (refund si el turno falla).';

comment on table org_assistant_actions is
    'Herramientas propuestas/ejecutadas por el Estratega dentro de un turno. Fase 1 es solo lectura: no hay flujo de aprobación en la UI todavía.';
comment on column org_assistant_actions.args is
    'Argumentos con que se invocó (o propuso invocar) la tool.';
comment on column org_assistant_actions.approved_by is
    'id de NextAuth (text) de quién aprobó la acción, cuando aplica.';

-- Módulo del marketplace: privado (is_public=false) porque en Fase 1 no hay
-- UI de alta todavía (la trae Task 6) — se instala a mano/por SQL mientras
-- tanto. Precio provisional 29 usd/mes por org (unit='org', no por bot/avatar,
-- a diferencia de Telegram).
insert into module_catalog
    (slug, name, description, price_usd_month_per_unit, unit,
     commission_ai_pct, commission_manual_pct, is_public, sort_order)
values
    ('strategist', 'Estratega',
     'Asistente de IA para la organización: analiza tus cuentas y anuncios, propone contenido y prepara publicaciones. Cada turno con herramientas consume tokens.',
     29.00, 'org', 0, 0, false, 2)
on conflict (slug) do nothing;
