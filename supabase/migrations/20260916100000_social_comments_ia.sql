-- Fundacion de datos para "el Agente responde comentarios en redes sociales".
--
-- social_post_targets: un post publicado GUARDA UN REGISTRO POR PLATAFORMA con
-- su platform_post_id real (el id que Instagram/TikTok/etc. le dan a esa
-- publicacion concreta). La fuente es el historial de Upload-Post, y SOLO
-- entradas con success=true entran aqui: social_posts.status='published'
-- puede ser verdad para una plataforma y falso para otra (Upload-Post publica
-- por plataforma, no en bloque), asi que social_posts NO alcanza para saber
-- en que post real hay que leer/responder comentarios.
create table if not exists social_post_targets (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    social_post_id uuid not null references social_posts(id) on delete cascade,
    platform text not null,
    platform_post_id text not null,
    post_url text,
    published_at timestamptz,
    last_comments_poll_at timestamptz,
    created_at timestamptz not null default now(),
    unique (social_post_id, platform)
);
create index if not exists idx_social_post_targets_org on social_post_targets(organization_id);
create index if not exists idx_social_post_targets_published_at on social_post_targets(published_at);

comment on table social_post_targets is
    'Un post por plataforma con su platform_post_id real, tomado del historial de Upload-Post (solo entradas success=true). social_posts.status=''published'' puede ser verdad para una plataforma y falso para otra, por eso esta tabla existe aparte.';

-- Mismo patron que social_posts / social_profiles: todo el acceso va por
-- server actions con el cliente service-role. RLS on, sin policies.
alter table social_post_targets enable row level security;

-- Hilo de comentarios: agent_chats ya sirve para Fanvue y Telegram; para
-- comentarios de redes el "chat" es el hilo de un comentario puntual, y
-- context guarda a que post/comentario pertenece para que el composer y el
-- publicador (responder en Upload-Post) no tengan que re-consultarlo.
alter table agent_chats
    add column if not exists context jsonb;

comment on column agent_chats.context is
    'Contexto del hilo. Para comentarios de redes: {socialPostTargetId, platformPostId, postUrl, caption}. NULL en los chats de Fanvue/Telegram, que no lo necesitan.';

-- Ajustes de IA para comentarios, por avatar (social_profiles es 1:1 con
-- avatar_id desde 20260710090000_social_profiles_per_avatar.sql).
alter table social_profiles
    add column if not exists ai_comment_replies_enabled boolean not null default false,
    add column if not exists ai_comment_default_chat_mode text not null default 'draft'
        constraint social_profiles_ai_comment_default_chat_mode_check
        check (ai_comment_default_chat_mode in ('auto', 'draft')),
    add column if not exists ai_comment_dm_enabled boolean not null default false,
    add column if not exists ai_comment_dm_text text,
    add column if not exists ai_comment_dm_buttons jsonb not null default '[]';

comment on column social_profiles.ai_comment_replies_enabled is
    'Gate de la IA en comentarios de redes, independiente de avatar_personas.enabled (que gata el inbox de Fanvue). false = los comentarios se leen pero nadie los contesta solo.';
comment on column social_profiles.ai_comment_default_chat_mode is
    'Modo con que nacen los chats de comentarios (siempre ''draft'': un comentario publico se contesta con revision antes de publicar, nunca en automatico puro). No afecta hilos existentes.';
comment on column social_profiles.ai_comment_dm_enabled is
    'Si al responder un comentario en publico tambien se manda un DM privado al comentarista (hoy solo Instagram lo soporta via Upload-Post).';
comment on column social_profiles.ai_comment_dm_text is
    'Texto del DM privado que se manda al comentarista tras responder en publico. NULL = no hay plantilla, no se manda nada aunque ai_comment_dm_enabled este en true.';
comment on column social_profiles.ai_comment_dm_buttons is
    'Botones del DM privado: array de {title, url}, maximo 3 y title de hasta 20 caracteres segun la documentacion de Upload-Post.';

-- DMs privados enviados a comentaristas (historial + control de duplicados).
create table if not exists social_comment_dms (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    avatar_id uuid not null references avatars(id) on delete cascade,
    platform text not null,
    platform_post_id text not null,
    comment_id text not null unique,
    commenter_id text,
    status text not null check (status in ('sent', 'failed')),
    error text,
    sent_at timestamptz,
    created_at timestamptz not null default now()
);
create index if not exists idx_social_comment_dms_avatar_post on social_comment_dms(avatar_id, platform_post_id);

comment on table social_comment_dms is
    'Historial de DMs privados mandados a comentaristas tras responder su comentario en publico. comment_id es unico: evita mandar el mismo DM dos veces si el poller vuelve a ver el comentario.';

alter table social_comment_dms enable row level security;
