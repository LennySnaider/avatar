-- Fanvue publishing integration (AGENCY multi-creator mode).
--
-- SEPARATE from the Upload-Post social_* tables. One agency OAuth connection
-- per app user, a cache of that agency's managed creators, and a history of
-- posts published to Fanvue on behalf of those creators.
--
-- Every column is written/read exclusively through server actions using the
-- Supabase service-role key (see src/services/FanvueService.ts and
-- src/lib/fanvue/tokenStore.ts), exactly like social_profiles / social_posts.
-- RLS is enabled with NO policies so anon/authenticated direct access is
-- blocked; the service-role key bypasses RLS.

-- One agency connection per app user. Holds the OAuth tokens (server-only).
create table if not exists fanvue_connections (
    id uuid primary key default gen_random_uuid(),
    user_id text not null,
    access_token text,
    refresh_token text,
    token_expires_at timestamptz,
    scopes text[],
    fanvue_account_uuid text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id)
);

-- Cache of the creators managed by a connection (refreshed via GET /creators).
create table if not exists fanvue_creators (
    id uuid primary key default gen_random_uuid(),
    connection_id uuid not null references fanvue_connections(id) on delete cascade,
    creator_user_uuid text not null,
    display_name text,
    handle text,
    avatar_url text,
    updated_at timestamptz not null default now(),
    unique (connection_id, creator_user_uuid)
);

-- History of posts published to Fanvue for a managed creator.
create table if not exists fanvue_posts (
    id uuid primary key default gen_random_uuid(),
    user_id text,
    creator_user_uuid text,
    generation_id uuid,
    caption text,
    audience text,
    price integer,
    media_uuids text[],
    fanvue_post_uuid text,
    status text,
    scheduled_at timestamptz,
    published_at timestamptz,
    error_message text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_fanvue_creators_connection on fanvue_creators(connection_id);
create index if not exists idx_fanvue_posts_user on fanvue_posts(user_id);
create index if not exists idx_fanvue_posts_creator on fanvue_posts(creator_user_uuid);
create index if not exists idx_fanvue_posts_status on fanvue_posts(status);

-- Service-role-only access: enable RLS, add no policies (see header comment).
alter table fanvue_connections enable row level security;
alter table fanvue_creators enable row level security;
alter table fanvue_posts enable row level security;

comment on table fanvue_connections is 'Fanvue agency OAuth connection (one per app user). Accessed only via the service-role key in server actions; RLS on with no policies. Tokens are server-only.';
comment on table fanvue_creators is 'Cache of Fanvue creators managed by a connection. Accessed only via the service-role key in server actions; RLS on with no policies.';
comment on table fanvue_posts is 'History of posts published to Fanvue per creator. Accessed only via the service-role key in server actions; RLS on with no policies.';
