-- Upload-Post pasa a CUENTA AGENCIA (SUPER-PLAN §4.0b, decisión 2026-07-11,
-- implementada 2026-09-17): una sola API key de la plataforma (env
-- UPLOAD_POST_API_KEY, plan Professional = 25 perfiles). `social_profiles`
-- deja de ser "una cuenta Upload-Post con su key por avatar" y pasa a ser el
-- CATÁLOGO de perfiles (sub-users) de esa cuenta agencia, asignables a un
-- avatar: `avatar_id` NULL = perfil libre. Un avatar ↔ un perfil (el índice
-- único `uq_social_profiles_avatar_id` ya existía). `upload_post_username`
-- sigue siendo único global: hay UN solo pool.
alter table social_profiles drop column if exists api_key;

-- Los perfiles que había hasta hoy viven en cuentas Upload-Post viejas (la
-- FREE de cada avatar, o la cuenta antigua de `prime-avatar`), NO en la
-- agencia: quedan desconectados hasta que se cree perfil nuevo desde la UI
-- ("Create profile" reutiliza la fila, así que el historial de posts y los
-- ajustes `ai_comment_*` sobreviven).
update social_profiles
   set status = 'disconnected',
       connected_platforms = '[]'::jsonb,
       upload_post_metadata = null,
       last_synced_at = null
 where status = 'active';

comment on column social_profiles.avatar_id is
  'Avatar asignado a este perfil de la cuenta agencia de Upload-Post (NULL = perfil libre; único entre los no nulos).';
comment on column social_profiles.upload_post_username is
  'Nombre del sub-user en la cuenta agencia de Upload-Post (único global: un solo pool de plataforma).';
