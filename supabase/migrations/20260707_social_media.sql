-- Social Media module (single-user port of AgentSoft's Upload-Post module)
create table if not exists social_profiles (
    id uuid primary key default gen_random_uuid(),
    upload_post_username text unique not null,
    status text not null default 'active',
    connected_platforms jsonb not null default '[]',
    upload_post_metadata jsonb,
    last_synced_at timestamptz,
    created_at timestamptz not null default now()
);

create table if not exists social_posts (
    id uuid primary key default gen_random_uuid(),
    social_profile_id uuid references social_profiles(id) on delete set null,
    generation_id uuid references generations(id) on delete set null,
    user_id uuid,
    caption text not null default '',
    hashtags text[] not null default '{}',
    content_type text not null,
    media_urls text[] not null default '{}',
    platforms jsonb not null default '[]',
    status text not null default 'draft',
    scheduled_at timestamptz,
    published_at timestamptz,
    upload_post_request_id text,
    upload_post_job_id text,
    upload_post_response jsonb,
    error_message text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_social_posts_status on social_posts(status);
create index if not exists idx_social_posts_request on social_posts(upload_post_request_id);

-- All access goes through server actions using the service-role client;
-- enable RLS with no public policies so anon/authenticated direct access is blocked.
alter table social_profiles enable row level security;
alter table social_posts enable row level security;
