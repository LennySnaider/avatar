-- Multi-account: one independent Upload-Post account (own API key) per avatar.
-- The api_key column lives in an RLS-enabled table with no public policies —
-- only the service-role server actions can read it; it never reaches the client.
alter table social_profiles
    add column if not exists avatar_id uuid references avatars(id) on delete set null,
    add column if not exists api_key text;

-- One account per avatar; multiple NULLs allowed (orphaned/legacy profiles).
create unique index if not exists uq_social_profiles_avatar_id
    on social_profiles(avatar_id);

-- Backfill: the legacy 'prime-avatar' profile (Instagram fit_mia2003 + X "Mia
-- Ortiz") belongs to the MiaUltra avatar. Its api_key stays NULL — the runtime
-- falls back to env UPLOAD_POST_API_KEY for that row only (the real key must
-- never be committed here).
update social_profiles
set avatar_id = '3d2bfe4e-2b94-4041-a93d-03912d629214'
where id = '1075ae97-dd5e-419c-8ad6-ef503626551d'
  and avatar_id is null;
