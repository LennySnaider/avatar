-- Módulo "Avatar en vivo" (`live_avatar`, Fase 1): un avatar conversacional
-- en tiempo real — cara en video (proveedor intercambiable: LiveAvatar de
-- HeyGen por defecto, o Anam), voz clonada (MiniMax) y la persona del agente —
-- con el que un visitante habla por micrófono.
--
-- NO TOCA NADA de la generación de avatares: ni `avatars` (todo va en una
-- side-table 1:1, patrón `avatar_telegram_settings`), ni `generations`, ni
-- `cloned_voices`. Las conversaciones caen en `agent_chats`/`agent_messages`
-- con `platform = 'live'`, igual que Telegram o los comentarios sociales.

-- ---------------------------------------------------------------------------
-- Catálogo de módulos
-- ---------------------------------------------------------------------------
-- Unidad = avatar con el modo en vivo activado (`avatar_live_settings.enabled`),
-- prorrateada por días con `enabled_at`/`disabled_at` (informe en
-- `src/lib/live/unitActivity.ts`). Precio POR DEFINIR: se siembra en 0 y
-- `is_public = false` para que no aparezca en el marketplace hasta que se
-- fije; editable por SQL/MCP como el resto del catálogo. Sin comisión: aquí
-- no hay venta que comisionar.
insert into module_catalog
    (slug, name, description, price_usd_month_per_unit, unit,
     commission_ai_pct, commission_manual_pct, is_public, sort_order)
values
    ('live_avatar', 'Avatar en vivo',
     'Avatar conversacional en tiempo real: cara en video, voz clonada y la persona del agente contestando por micrófono desde un link público o un widget. La cuota es por avatar activado; los minutos de conversación se cobran aparte.',
     0.00, 'avatar', 0.00, 0.00, false, 3)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Ajustes del modo en vivo (1:1 con el avatar)
-- ---------------------------------------------------------------------------
create table if not exists avatar_live_settings (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    avatar_id uuid not null references avatars(id) on delete cascade,

    -- Interruptor del modo en vivo para este avatar (unidad facturable).
    enabled boolean not null default false,
    -- Cuándo se activó por PRIMERA vez con éxito y cuándo se apagó: abren y
    -- cierran el periodo prorrateado de la cuota. NULL en enabled_at = nunca
    -- activado = nunca facturable (mismo criterio que connected_at en Telegram).
    enabled_at timestamptz,
    disabled_at timestamptz,

    -- Cara en el proveedor de tiempo real. El face id se pega a mano (creado
    -- en la consola del proveedor) o lo crea la plataforma desde la
    -- referencia `face` del avatar (Fase 3). `face_provider` existe para
    -- poder cambiar de proveedor sin migrar: el adaptador vive en
    -- src/lib/live/face/.
    face_provider text not null default 'liveavatar'
        check (face_provider in ('liveavatar', 'anam')),
    face_id text,
    face_status text not null default 'none'
        check (face_status in ('none', 'pending', 'ready', 'failed')),
    face_error text,

    -- Lo primero que dice el avatar al conectar. NULL = lo redacta el modelo.
    greeting text,
    -- Proveedor de speech-to-text. NULL = el default del entorno
    -- (LIVE_STT_PROVIDER, hoy minimax).
    stt_provider text check (stt_provider in ('minimax', 'gemini')),

    -- Link público (Fase 2). El token es el secreto del link: quien lo tenga
    -- puede abrir sesiones contra este avatar, por eso se puede rotar.
    public_enabled boolean not null default false,
    public_token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
    -- Topes de exposición de coste por avatar.
    max_session_seconds int not null default 600,
    max_concurrent_sessions int not null default 3,
    daily_minutes_cap int not null default 120,
    -- Orígenes desde los que se puede embeber el widget. Vacío = cualquiera.
    allowed_origins text[] not null default '{}',

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique (avatar_id)
);
create index if not exists idx_avatar_live_settings_org
    on avatar_live_settings(organization_id);
alter table avatar_live_settings enable row level security;

comment on table avatar_live_settings is
    'Ajustes del módulo live_avatar por avatar (1:1). Service-role only, RLS sin políticas: la autorización real es el filtro por organization_id de orgTable.';
comment on column avatar_live_settings.enabled_at is
    'Primera activación con éxito. NULL = nunca activado y nunca facturable. Lo lee el informe de unidades del cron module-fees.';
comment on column avatar_live_settings.public_token is
    'Secreto del link público /live/<token>. Rotarlo invalida el link anterior.';

-- ---------------------------------------------------------------------------
-- Sesiones en vivo
-- ---------------------------------------------------------------------------
-- Una fila por llamada. El secreto de la sesión (hasheado) es lo que
-- autentica cada turno/heartbeat/end: las rutas /api/live/* corren SIN
-- sesión de NextAuth (el visitante es anónimo), así que la org se resuelve
-- desde ESTA fila, igual que el webhook de Telegram la resuelve desde su
-- fila de ajustes.
create table if not exists live_sessions (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    avatar_id uuid not null references avatars(id) on delete cascade,
    -- Conversación en agent_chats (platform='live'). set null: borrar el chat
    -- desde el inbox no debe borrar el registro de la sesión (se factura).
    chat_id uuid references agent_chats(id) on delete set null,

    -- 'internal' = prueba desde la app (con sesión); 'public' = link/widget.
    source text not null check (source in ('internal', 'public')),
    -- Identidad estable del visitante (localStorage en el público,
    -- 'internal:<userId>' en la prueba). Es el external_chat_id del chat y
    -- el external_fan_id de la memoria.
    visitor_id text not null,
    -- sha256(secreto). El secreto sólo viaja al navegador al crear la sesión.
    secret_hash text not null,

    status text not null default 'active'
        check (status in ('active', 'ended', 'expired')),
    started_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    ended_at timestamptz,
    end_reason text,

    -- Contadores para calibrar el coste real por minuto (Fase 3).
    turns int not null default 0,
    spoken_chars int not null default 0,
    billed_seconds int not null default 0,
    last_billed_minute int not null default 0,

    stt_provider text,
    ip_hash text,
    user_agent text,
    created_at timestamptz not null default now()
);
create index if not exists idx_live_sessions_avatar_status
    on live_sessions(avatar_id, status);
create index if not exists idx_live_sessions_sweep
    on live_sessions(status, last_seen_at);
create index if not exists idx_live_sessions_org_started
    on live_sessions(organization_id, started_at desc);
alter table live_sessions enable row level security;

comment on table live_sessions is
    'Sesiones de conversación en vivo del módulo live_avatar. El secreto hasheado autentica los turnos sin sesión de NextAuth. Service-role only, RLS sin políticas.';
comment on column live_sessions.visitor_id is
    'Identidad estable del visitante: external_chat_id en agent_chats y external_fan_id en avatar_fan_memories (platform live).';
