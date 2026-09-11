-- F4.2.g — Retira el puente de migración: organization_id deja de tener
-- DEFAULT org-default. Desde aquí, TODO insert debe traer org explícita
-- (orgInsert/orgUpsert). Las tablas del agente nunca tuvieron default.
--
-- Solo metadatos: no lee ni reescribe ninguna fila existente (todas llevan
-- su organization_id materializado y NOT NULL desde F4.1). Reversible con
-- ALTER COLUMN ... SET DEFAULT '00000000-0000-0000-0000-000000000001'.
alter table public.avatars            alter column organization_id drop default;
alter table public.avatar_references  alter column organization_id drop default;
alter table public.generations        alter column organization_id drop default;
alter table public.prompts            alter column organization_id drop default;
alter table public.cloned_voices      alter column organization_id drop default;
alter table public.audio_scripts      alter column organization_id drop default;
alter table public.video_flows        alter column organization_id drop default;
alter table public.social_profiles    alter column organization_id drop default;
alter table public.social_posts       alter column organization_id drop default;
alter table public.fanvue_connections alter column organization_id drop default;
alter table public.fanvue_creators    alter column organization_id drop default;
alter table public.fanvue_posts       alter column organization_id drop default;
