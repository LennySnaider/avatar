-- Interruptor por canal (spec A3-bis, decisión del 14-sep-2026).
--
-- El gate de la IA en Telegram es INDEPENDIENTE de avatar_personas.enabled
-- ("Agent enabled"), que gata el inbox de Fanvue. generateDraftReply no
-- comprueba ese flag por dentro: el gate es siempre del llamador, y el
-- llamador de Telegram es su webhook, que lee ESTAS columnas.
--
-- ai_replies_enabled: false por defecto a propósito. Conectar un bot no
-- enciende la IA; se enciende desde la pantalla del canal, a sabiendas.
--
-- ai_default_chat_mode: el modo con que NACEN los chats nuevos de Telegram.
-- upsertChat fija el modo solo al crear el chat y nunca lo pisa, asi que
-- este valor decide si un fan nuevo recibe respuesta sola ('auto') o deja
-- un borrador para aprobar ('draft'). Los chats existentes conservan el
-- suyo y se cambian uno a uno desde el inbox, como en Fanvue.
--
-- ai_offers_enabled: si la IA puede adjuntar contenido de pago a un
-- borrador (motor de oferta). false por defecto: ofrecer es vender, y eso
-- se activa a proposito.
alter table avatar_telegram_settings
    add column if not exists ai_replies_enabled boolean not null default false,
    add column if not exists ai_default_chat_mode text not null default 'auto'
        constraint avatar_telegram_settings_ai_default_chat_mode_check
        check (ai_default_chat_mode in ('auto', 'draft')),
    add column if not exists ai_offers_enabled boolean not null default false;

comment on column avatar_telegram_settings.ai_replies_enabled is
    'Gate de la IA en Telegram, independiente de avatar_personas.enabled (que gata Fanvue). false = el bot solo registra conversaciones y vende a mano.';
comment on column avatar_telegram_settings.ai_default_chat_mode is
    'Modo con que nacen los chats nuevos de Telegram (auto = responde sola tras el clasificador de riesgo; draft = deja borrador). No afecta a chats existentes.';
comment on column avatar_telegram_settings.ai_offers_enabled is
    'Si el motor de oferta puede adjuntar contenido de pago a un borrador. Es lo que hace posible una venta sold_by = ai (comision del 20%).';
