-- Real identity table (P0 F4.0.3): NextAuth credentials validated against the
-- MOCK (src/mock/data/authData) and sign-up was a stub. This table becomes the
-- source of truth for both Credentials and OAuth sign-ins.
--
-- id is TEXT (not uuid) to stay a safe superset of NextAuth token.sub values
-- and to match organization_members.user_id / avatars.user_id, which already
-- store token.sub as text.

create table if not exists users (
    id text primary key,
    email text not null unique,
    name text,
    image text,
    -- scrypt$N$r$p$salt$hash (src/lib/auth/password.ts). NULL for OAuth users.
    password_hash text,
    provider text not null default 'credentials',
    provider_account_id text,
    authority text[] not null default '{user}',
    is_platform_admin boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- OAuth identity lookup (github/google): one row per provider account.
create unique index if not exists users_provider_account_uq
    on users (provider, provider_account_id)
    where provider_account_id is not null;

-- Case-insensitive email lookups (sign-in normalizes to lowercase).
create unique index if not exists users_email_lower_uq on users (lower(email));

-- Repo pattern: RLS ON with NO policies — only the service-role key reaches
-- this table; the browser anon key is locked out entirely.
alter table users enable row level security;

-- Seed the existing admin so the current login keeps working after the mock
-- is removed. Same id the mock used (it is the token.sub existing avatars /
-- organization_members rows are keyed by) and the same password ("123Qwe" —
-- CHANGE IT after deploying).
insert into users (id, email, name, image, password_hash, authority)
values (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'admin-01@ecme.com',
    'Angelina Gotelli',
    '/img/avatars/thumb-1.jpg',
    'scrypt$16384$8$1$YoEqrRnfGlCwFQKnL7Y4pQ==$RoAB2ZUPvVGz2OzpwtUrmVAdaeHFm+Uoq5G7SRtIoAuwm/MWbxLUwVqNrumLd47oY67pzjkA4OvZhXbLGOf/ew==',
    '{admin,user}'
)
on conflict (id) do nothing;

-- Make sure the seeded admin has an org membership (the organizations
-- migration seeded members from distinct avatars.user_id; this covers the
-- case where that seed ran before the admin had any avatar).
insert into organization_members (organization_id, user_id, role)
select '00000000-0000-0000-0000-000000000001', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'owner'
where exists (select 1 from organizations where id = '00000000-0000-0000-0000-000000000001')
on conflict (organization_id, user_id) do nothing;
