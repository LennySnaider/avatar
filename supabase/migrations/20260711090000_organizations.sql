-- FASE 0 (tenant-ready): minimal organizations + members.
-- Every NEW table (agent module onward) is born with organization_id; existing
-- tables are migrated later (multitenant phase). user_id is TEXT — a safe
-- superset of NextAuth ids (token.sub).
do $$ begin
    create type org_member_role as enum ('owner','admin','operator');
exception when duplicate_object then null; end $$;

create table if not exists organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    slug text not null unique,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists organization_members (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    user_id text not null,
    role org_member_role not null default 'owner',
    created_at timestamptz not null default now(),
    unique (organization_id, user_id)
);
create index if not exists idx_org_members_user on organization_members(user_id);

-- RLS on, no policies (repo pattern): only service-role server actions reach these.
alter table organizations enable row level security;
alter table organization_members enable row level security;

-- Seed: default org owning everything that exists today.
insert into organizations (id, name, slug)
values ('00000000-0000-0000-0000-000000000001', 'Default', 'default')
on conflict (slug) do nothing;

insert into organization_members (organization_id, user_id, role)
select '00000000-0000-0000-0000-000000000001', u.uid, 'owner'::org_member_role
from (select distinct user_id::text as uid from avatars where user_id is not null) u
on conflict (organization_id, user_id) do nothing;
