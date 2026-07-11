-- FASE 3 del Agente IA: autopilot con reglas + métricas.
-- autopilot config vive en la persona; needs_attention marca chats escalados;
-- send_after es la cola mínima de envíos diferidos (sin pgmq).
alter table avatar_personas
    add column if not exists autopilot jsonb not null default '{}'::jsonb;
    -- shape: {enabled, activeHours:{start:'09:00', end:'23:00', timezone},
    --         delaySecondsMin, delaySecondsMax, dailyMessageLimit,
    --         escalate:{payment, complaint, sensitive, minors}}

alter table agent_chats
    add column if not exists needs_attention boolean not null default false,
    add column if not exists attention_reason text;

alter table agent_messages
    add column if not exists send_after timestamptz;

-- Per-avatar monthly counters (agent messages sent, drafts, auto-sends).
create table if not exists agent_usage_counters (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    avatar_id uuid not null references avatars(id) on delete cascade,
    period text not null,       -- 'YYYY-MM'
    counter text not null,      -- 'messages_sent' | 'drafts_generated' | 'auto_sent'
    value bigint not null default 0,
    unique (avatar_id, period, counter)
);

create or replace function increment_agent_counter(
    p_org uuid, p_avatar uuid, p_period text, p_counter text, p_delta bigint default 1
) returns void language sql as $$
    insert into agent_usage_counters (organization_id, avatar_id, period, counter, value)
    values (p_org, p_avatar, p_period, p_counter, p_delta)
    on conflict (avatar_id, period, counter)
        do update set value = agent_usage_counters.value + p_delta;
$$;

create index if not exists idx_agent_messages_send_after
    on agent_messages(status, send_after) where send_after is not null;

alter table agent_usage_counters enable row level security;
