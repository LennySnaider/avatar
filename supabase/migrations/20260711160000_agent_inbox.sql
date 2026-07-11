-- FASE 2 del Agente IA: inbox de Fanvue con borradores + memoria por fan.
-- El webhook se firma con FANVUE_WEBHOOK_SECRET (env; el secret vive en el
-- Developer Area de Fanvue — no hay API de suscripciones, se registra en su UI).
do $$ begin
    create type agent_chat_mode as enum ('off','draft','auto');
exception when duplicate_object then null; end $$;
do $$ begin
    create type agent_msg_direction as enum ('in','out');
exception when duplicate_object then null; end $$;
do $$ begin
    create type agent_msg_status as enum ('received','draft','approved','sent','failed','discarded');
exception when duplicate_object then null; end $$;

create table if not exists agent_chats (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    avatar_id uuid not null references avatars(id) on delete cascade,
    platform text not null default 'fanvue',
    external_chat_id text not null,            -- Fanvue: userUuid del FAN
    fan_display_name text,
    fan_handle text,
    fan_avatar_url text,
    mode agent_chat_mode not null default 'draft',
    last_message_at timestamptz,
    last_fan_message_at timestamptz,
    unread_count int not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (avatar_id, platform, external_chat_id)
);
create index if not exists idx_agent_chats_org_last
    on agent_chats(organization_id, last_message_at desc);

create table if not exists agent_messages (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    chat_id uuid not null references agent_chats(id) on delete cascade,
    direction agent_msg_direction not null,
    external_message_id text,
    text text,
    media jsonb not null default '[]'::jsonb,
    status agent_msg_status not null,
    generated_by jsonb,                         -- {provider, model}
    approved_by text,
    error_message text,
    external_created_at timestamptz,
    sent_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
-- Dedupe webhook + polling + nuestros propios envíos (eco de message.sent).
create unique index if not exists uq_agent_messages_external
    on agent_messages(chat_id, external_message_id);
create index if not exists idx_agent_messages_chat on agent_messages(chat_id, created_at);
create index if not exists idx_agent_messages_status on agent_messages(status);

create table if not exists avatar_fan_memories (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    avatar_id uuid not null references avatars(id) on delete cascade,
    platform text not null default 'fanvue',
    external_fan_id text not null,
    display_name text,
    facts jsonb not null default '{}'::jsonb,
    summary text,
    spend_total numeric,
    last_seen_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (avatar_id, platform, external_fan_id)
);

-- Mapeo avatar ↔ creator de Fanvue (webhook `recipientUuid` → avatar).
-- NULL = cuenta self de la conexión. Lo reusa F6 (earnings por avatar).
alter table avatars add column if not exists fanvue_creator_uuid text;

alter table agent_chats enable row level security;
alter table agent_messages enable row level security;
alter table avatar_fan_memories enable row level security;
