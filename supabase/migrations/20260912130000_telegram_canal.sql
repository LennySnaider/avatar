-- Ajustes del bot por avatar. El token vive aquí y SÓLO aquí: no va en
-- avatar_personas, que viaja al cliente en un DTO.
create table if not exists avatar_telegram_settings (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    avatar_id uuid not null references avatars(id) on delete cascade,
    bot_token text not null,
    bot_id bigint not null,
    bot_username text,
    webhook_secret text not null,
    enabled boolean not null default true,
    -- Cuándo empezó a ser facturable. Es lo que lee el informe de unidades
    -- para que la cuota se prorratee por días.
    connected_at timestamptz not null default now(),
    disconnected_at timestamptz,
    last_update_at timestamptz,
    last_error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (avatar_id),
    -- Un bot pertenece a un solo avatar: el identificador de fichero que
    -- cachea la galería es por bot y no se puede compartir.
    unique (bot_id)
);
alter table avatar_telegram_settings enable row level security;

-- Catálogo de contenido vendible, por avatar.
create table if not exists telegram_paid_media_items (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    avatar_id uuid not null references avatars(id) on delete cascade,
    generation_id uuid references generations(id) on delete set null,
    storage_path text not null,
    storage_provider text,
    media_kind text not null check (media_kind in ('photo', 'video')),
    title text not null,
    caption text,
    star_price int not null check (star_price between 1 and 25000),
    enabled boolean not null default true,
    sort_order int not null default 0,
    -- Telegram devuelve un identificador reutilizable tras el primer envío.
    -- Es POR BOT: si cambia el bot, el caché se invalida.
    telegram_file_id text,
    telegram_file_id_bot_id bigint,
    offers_count int not null default 0,
    sales_count int not null default 0,
    stars_total bigint not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create unique index if not exists uq_tg_item_generacion
    on telegram_paid_media_items(avatar_id, generation_id) where generation_id is not null;
create index if not exists idx_tg_item_avatar
    on telegram_paid_media_items(avatar_id, enabled, sort_order);
alter table telegram_paid_media_items enable row level security;

-- Ventas. La fila nace en la OFERTA, no en la compra: el evento
-- `purchased_paid_media` sólo trae quién compró y el payload, no dice a qué
-- conversación pertenece. Por eso `payload` es el identificador de esta fila.
create table if not exists telegram_stars_sales (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    avatar_id uuid not null references avatars(id) on delete cascade,
    chat_id uuid not null references agent_chats(id) on delete cascade,
    item_id uuid references telegram_paid_media_items(id) on delete set null,
    payload text not null unique,
    telegram_user_id bigint not null,
    telegram_message_id bigint,
    stars int not null check (stars between 1 and 25000),
    sold_by text not null check (sold_by in ('ai', 'manual')),
    source text not null check (source in ('inbox', 'agent', 'script', 'broadcast')),
    status text not null default 'offered' check (status in ('offered', 'purchased', 'refunded')),
    offered_at timestamptz not null default now(),
    purchased_at timestamptz,
    refunded_at timestamptz,
    -- Rellenados por settleStarsCommission tras asentar.
    commission_pct numeric(5, 2),
    commission_usd numeric(12, 6),
    commission_tokens bigint,
    star_usd numeric(8, 5),
    commission_ledger_id uuid references token_ledger(id),
    commission_settled_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists idx_tg_venta_avatar
    on telegram_stars_sales(avatar_id, status, purchased_at desc);
alter table telegram_stars_sales enable row level security;

-- Telegram reintenta el mismo update hasta recibir un 200. Los mensajes se
-- deduplican por su identificador externo, pero una compra no tiene ninguno.
-- Tabla técnica: sin organization_id, no va en TENANT_TABLES. NADIE LA PODA:
-- crece una fila por cada actualización recibida, para siempre. El diseño
-- original (docs/superpowers/specs/2026-09-11-telegram-telestars-module-
-- design.md) preveía podarla a 7 días desde el futuro runner de broadcasts
-- (`next_run_at`), pero ese runner es un plan que todavía no se ha escrito.
-- Hasta que exista, la poda queda pendiente — de él o de un cron aparte.
create table if not exists telegram_webhook_events (
    avatar_id uuid not null references avatars(id) on delete cascade,
    update_id bigint not null,
    received_at timestamptz not null default now(),
    primary key (avatar_id, update_id)
);
alter table telegram_webhook_events enable row level security;
