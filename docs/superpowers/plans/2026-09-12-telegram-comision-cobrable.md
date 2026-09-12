# Telegram: el camino mínimo a una comisión cobrable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una venta real de contenido en Telegram produzca un asiento real de comisión en el libro mayor, y que la cuota mensual por bot deje de devolver cero.

**Architecture:** El sistema de módulos y su facturación ya existe y está verificado: hay catálogo, instalación por organización, función de comisión, cuota prorrateada y monedero que cuadra. Lo que falta es el canal que le dé eventos. Este plan construye la parte del canal de Telegram que mueve dinero, y sólo esa: conectar un bot por avatar, recibir mensajes para que existan conversaciones, publicar contenido con precio en Stars, recibir el evento de compra y llamar a la función de comisión que ya está escrita. La conversación con IA, el modo secretaría, los guiones y los envíos masivos quedan para el plan siguiente.

**Tech Stack:** Next.js 15 App Router, TypeScript estricto, Supabase con service-role y filtro manual de `organization_id`, Bot API de Telegram por `fetch` sin dependencias, componentes ECME, tests con `node:test` vía tsx.

**Spec:** `docs/superpowers/specs/2026-09-11-telegram-telestars-module-design.md` (sub-proyecto A, la parte de dinero)

## Context

El sub-proyecto B dejó montada la caja registradora y nada enchufado a ella. Hoy `settleStarsCommission` tiene cero llamadores y `registerUnitActivity` tampoco tiene quien informe, así que **ni la comisión ni la cuota cobran nada**: el cron devuelve saltado en cada pasada. La parte difícil, que es que el dinero cuadre y no se cobre dos veces, ya está hecha y verificada contra la base real.

**Una consecuencia que hay que entender antes de aprobar este plan.** El catálogo cobra dos comisiones distintas: 20% cuando la venta la cierra la IA y 7% cuando la cierra una persona. Este plan **sólo habilita la manual**, porque el agente de IA no puede responder en Telegram hasta que se generalice el canal en el pipeline, que es trabajo del plan siguiente. Dicho claro: al terminar este plan se cobrará el 7%, no el 20%. Lo que se gana es que el dinero fluya de punta a punta y quede demostrado; subir del 7% al 20% es enchufar el agente, no rehacer nada.

Hechos de la API verificados en la documentación oficial y que condicionan el diseño:

- `purchased_paid_media` entrega **sólo** `{from, paid_media_payload}`. No dice a qué conversación pertenece la compra. Por eso la fila de venta se crea en el momento de la **oferta** y el `payload` es su identificador.
- `sendPaidMedia` acepta `star_count` entre 1 y 25.000, hasta 10 elementos, `payload` de 128 bytes y `caption` de 1024 caracteres.
- Las Stars se acreditan al **balance del bot** salvo que el destino sea un canal. El creador retira por Fragment con 21 días de retención. Nosotros no custodiamos nada.
- Subida por multipart: 10 MB para fotos, 50 MB para el resto. Por `file_id` no hay límite, pero el identificador es por bot y no se transfiere.

## Global Constraints

- Migraciones SIEMPRE vía MCP `apply_migration`. **NUNCA** `supabase db push`: el historial remoto está desalineado y un push intentaría aplicar todos los ficheros locales de golpe.
- Proyecto Supabase ref `wiocwfoydyknqmhixpyt`.
- **NUNCA** `npm run build`: el servidor de desarrollo comparte `.next` y la interfaz desaparece sin error. Validar con `npx tsc --noEmit`, `npm run lint`, `npm run check:tenant` y `npm test`.
- En ficheros `'use server'`, TODOS los exports deben ser `async`. Sólo revienta en el build, así que se verifica con `grep`.
- Sólo componentes ECME de `@/components/ui/*` y `@/components/shared/*`. Prohibidos Shadcn, Radix y los diálogos nativos del navegador.
- Toda tabla con `organization_id` va a `TENANT_TABLES` en `src/lib/org/orgTable.ts` y se accede con `orgTable`/`orgInsert`/`orgUpsert`.
- `eslint.config.mjs` tiene **cuatro** bloques con cuatro identificadores de regla distintos a propósito. Dos bloques con el mismo identificador no se fusionan y el último gana, anulando el anterior en silencio. El de `orgSupabase` es el de `no-restricted-syntax`; las exenciones nuevas van a su lista existente.
- **El token del bot NUNCA sale en un DTO.** Ni al cliente, ni en un log, ni en un mensaje de error.
- Mensajes de commit en español, sin mención alguna a Claude, Anthropic ni `Co-Authored-By`.
- Todas las acciones de servidor del módulo llaman a `requireModule(ctx, 'telegram')`. El filtro del menú NO autoriza nada.

---

## File Structure

**Se crea:**

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20260912130000_telegram_canal.sql` | `avatar_telegram_settings`, `telegram_paid_media_items`, `telegram_stars_sales`, `telegram_webhook_events` |
| `src/lib/telegram/client.ts` | Bot API por `fetch`, sin dependencias, transporte JSON y multipart |
| `src/lib/telegram/settings.ts` | Carga de ajustes por avatar, con y sin sesión. Nunca expone el token |
| `src/lib/telegram/paidMedia.ts` | `deliverPaidMedia`: crea la venta, envía el contenido, cachea el identificador de fichero |
| `src/lib/telegram/sales.ts` | `recordStarsSale`: transición atómica de la venta y llamada a la comisión |
| `src/lib/telegram/bots.ts` | `telegramUnitActivity`: informe de unidades que desbloquea la cuota |
| `src/app/api/webhooks/telegram/[avatarId]/route.ts` | Recepción de mensajes y de compras |
| `src/services/AgentTelegramService.ts` | Acciones de servidor: conectar, desconectar, galería, enviar contenido de pago |
| `src/app/(protected-pages)/concepts/avatar-forge/telegram/**` | Índice, página por avatar, conexión, galería, ventas |

**Se modifica:** `src/lib/org/orgTable.ts`, `eslint.config.mjs`, `scripts/check-tenant-access.mjs`, `src/configs/navigation.config/concepts.navigation.config.ts`, `src/configs/navigation-icon.config.tsx`, `src/configs/routes.config/conceptsRoute.ts`, `messages/{en,es,ar,zh}.json`, `src/lib/agent/inboxSync.ts` (sólo para parametrizar `platform`).

**NO se toca:** `src/middleware.ts`, el pipeline del agente (`draftPipeline`, `autopilot`, `classifier`, `promptBuilder`), `src/lib/billing/*` salvo para consumirlo.

---

### Task 1: Esquema del canal

**Files:**
- Create: `supabase/migrations/20260912130000_telegram_canal.sql`
- Modify: `src/lib/org/orgTable.ts`
- Modify: `src/@types/database.generated.ts` (regenerado)

**Interfaces:**
- Consumes: `organizations`, `avatars`, `agent_chats`, `token_ledger` (ya existen).
- Produces: las cuatro tablas y sus tipos.

- [ ] **Step 1: Escribir la migración**

```sql
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
-- Tabla técnica: sin organization_id, no va en TENANT_TABLES, se poda sola.
create table if not exists telegram_webhook_events (
    avatar_id uuid not null references avatars(id) on delete cascade,
    update_id bigint not null,
    received_at timestamptz not null default now(),
    primary key (avatar_id, update_id)
);
alter table telegram_webhook_events enable row level security;
```

- [ ] **Step 2: Aplicar con MCP**

Usar `mcp__supabase__apply_migration` con `name: "telegram_canal"`. **No** `supabase db push`.

- [ ] **Step 3: Verificar**

Con `mcp__supabase__execute_sql`:

```sql
select table_name from information_schema.tables
where table_schema = 'public' and table_name like 'telegram%' or table_name = 'avatar_telegram_settings'
order by table_name;
```
Esperado: las cuatro tablas.

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'telegram_stars_sales'::regclass and contype = 'u';
```
Esperado: la restricción de unicidad sobre `payload`.

- [ ] **Step 4: Registrar las tablas tenant**

En `src/lib/org/orgTable.ts`, añadir a `TENANT_TABLES` después de `'org_modules'`:

```ts
    'org_modules',
    'avatar_telegram_settings',
    'telegram_paid_media_items',
    'telegram_stars_sales',
] as const
```

`telegram_webhook_events` **NO** se añade: no tiene `organization_id`.

- [ ] **Step 5: Regenerar tipos y verificar**

Run: `npm run db:types` (o la herramienta MCP equivalente si la CLI no está autenticada), luego `npx tsc --noEmit`.
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260912130000_telegram_canal.sql src/lib/org/orgTable.ts src/@types/database.generated.ts
git commit -m "feat(telegram): esquema del canal — bot por avatar, galeria y ventas

La fila de venta nace en la OFERTA y no en la compra: el evento de Telegram
solo trae quien compro y un payload, sin decir a que conversacion pertenece.
El payload es el identificador de la fila, que es lo unico que permite
reconstruir la venta al recibir el pago."
```

---

### Task 2: Cliente del Bot API

**Files:**
- Create: `src/lib/telegram/client.ts`
- Create: `src/lib/telegram/settings.ts`

**Interfaces:**
- Produces: `TelegramApiError`, `getMe`, `setWebhook`, `deleteWebhook`, `getWebhookInfo`, `sendMessage`, `sendPaidMedia`, `getMyStarBalance`, y los tipos `TelegramUpdate`, `TgMessage`, `PaidMediaPurchased`. Y `loadTelegramSettings(avatarId)` / `loadTelegramSettingsForOrg(ctx, avatarId)`.

- [ ] **Step 1: Escribir el cliente**

Crear `src/lib/telegram/client.ts`. Sin dependencias: `fetch`, `FormData` y `Blob` son nativos en el runtime.

Puntos que no son opcionales:

- Base `https://api.telegram.org/bot${token}/${method}`.
- `TelegramApiError` con `method`, `code`, `description` y `retryAfter` (de `parameters.retry_after`, que llega en los 429).
- **El token nunca aparece en el mensaje de error.** Si construyes la URL para un log, recórtala.
- Dos transportes: JSON para lo normal, y multipart con `FormData` para subir bytes.
- `sendPaidMedia(token, {chat_id, star_count, media, files?, payload?, caption?, protect_content?})`, donde `media` es el array de `InputPaidMedia` y `files` el mapa de nombres que referencian los `attach://`.
- `setWebhook` con `allowed_updates: ['message', 'purchased_paid_media']`. Este plan no necesita más; el plan siguiente los ampliará.

- [ ] **Step 2: Escribir la carga de ajustes**

Crear `src/lib/telegram/settings.ts` con dos funciones: una sin sesión para el webhook y los crones (recibe `avatarId`, usa el cliente service-role y filtra por avatar), y otra con `ctx` vía `orgTable`. **Ninguna de las dos devuelve un tipo que incluya `bot_token` hacia el cliente**: el token sólo se usa dentro del servidor.

- [ ] **Step 3: Añadir las exenciones**

`settings.ts` usa el cliente crudo sin sesión. Ejecuta `npm run check:tenant` para ver el mensaje real y añade la exención a `scripts/check-tenant-access.mjs` y a la lista `ignores` del bloque de `no-restricted-syntax` en `eslint.config.mjs`, con su motivo escrito.

- [ ] **Step 4: Probar el cliente contra la API real**

Con un token de prueba de BotFather, desde un script en el directorio temporal:

```bash
npx tsx -e 'import {getMe} from "./src/lib/telegram/client.ts"; getMe(process.argv[1]).then(console.log)' <TOKEN>
```
Expected: el identificador y el nombre de usuario del bot. Pégalo en el informe.

- [ ] **Step 5: Verificar candados y commitear**

Run: `npx tsc --noEmit && npm run lint && npm run check:tenant`

```bash
git add src/lib/telegram/client.ts src/lib/telegram/settings.ts eslint.config.mjs scripts/check-tenant-access.mjs
git commit -m "feat(telegram): cliente del Bot API sin dependencias

El token no aparece en ningun mensaje de error: la URL lleva el token dentro,
asi que un log ingenuo lo publica en claro."
```

---

### Task 3: Conectar y desconectar el bot

**Files:**
- Create: `src/services/AgentTelegramService.ts`
- Modify: `src/configs/navigation.config/concepts.navigation.config.ts`, `src/configs/navigation-icon.config.tsx`, `src/configs/routes.config/conceptsRoute.ts`, `messages/{en,es,ar,zh}.json`

**Interfaces:**
- Consumes: el cliente (Task 2), `requireModule` (`src/lib/modules/entitlements.ts`), `getOrgContext`, `orgTable`/`orgUpsert`.
- Produces: `connectTelegramBot(avatarId, botToken)`, `disconnectTelegramBot(avatarId)`, `getTelegramStatus(avatarId)`, `getTelegramWebhookInfo(avatarId)`.

- [ ] **Step 1: Escribir el servicio**

`'use server'`, todos los exports `async`. Cada uno abre con `getOrgContext()` y `requireModule(ctx, 'telegram')`.

`connectTelegramBot`: comprueba que el avatar pertenece a la organización, llama a `getMe` para validar el token y obtener identificador y nombre, genera un secreto con `crypto.randomBytes`, llama a `setWebhook` apuntando a `${NEXT_PUBLIC_APP_URL}/api/webhooks/telegram/${avatarId}` con ese secreto, y hace `orgUpsert` sobre `(avatar_id)`. Si el avatar ya tenía bot, `connected_at` se conserva y `disconnected_at` se limpia: esa fecha es la que factura.

`getTelegramStatus`: devuelve `{connected, botUsername, enabled, connectedAt}`. **Nunca el token.**

- [ ] **Step 2: Verificar que todos los exports son async**

Run: `grep -n "^export" src/services/AgentTelegramService.ts`
Expected: cada línea es `export async function` o `export interface`.

- [ ] **Step 3: Registrar navegación y ruta**

Ítem `avatarForge.telegram` con `meta: { requiredModule: 'telegram' }` (el gate del sub-proyecto B lo oculta si no está instalado), icono nuevo, claves en los cuatro ficheros de traducción, y las rutas `/concepts/avatar-forge/telegram` y su `[slug]` en `conceptsRoute.ts` copiando la forma de sus vecinas.

- [ ] **Step 4: Verificar y commitear**

Run: `npx tsc --noEmit && npm run lint && npm run check:tenant`

```bash
git add src/services/AgentTelegramService.ts src/configs/ messages/
git commit -m "feat(telegram): conectar y desconectar el bot de un avatar

connected_at se conserva al reconectar: esa fecha es la que factura la cuota
prorrateada, y reiniciarla regalaria los dias ya consumidos."
```

---

### Task 4: Webhook — mensajes y compras

**Files:**
- Create: `src/app/api/webhooks/telegram/[avatarId]/route.ts`
- Create: `src/lib/telegram/sales.ts`
- Modify: `src/lib/agent/inboxSync.ts`

**Interfaces:**
- Consumes: `loadTelegramSettings`, `upsertChat`/`ingestMessage` de `inboxSync`, `settleStarsCommission` (`src/lib/billing/moduleCharges.ts`).
- Produces: `recordStarsSale(event)`.

- [ ] **Step 1: Parametrizar la plataforma en la ingesta**

En `src/lib/agent/inboxSync.ts`, dar a `upsertChat` y `touchFanMemory` un parámetro `platform` con valor por defecto `'fanvue'`, de modo que ningún llamador actual cambie de comportamiento. Añadir `resolveAvatarTargetById(avatarId)`, porque el webhook de Telegram conoce el avatar por la URL y no necesita resolverlo por destinatario.

**No se toca nada más del pipeline del agente.** Generalizar el envío y los borradores es del plan siguiente.

- [ ] **Step 2: Escribir el registro de ventas**

Crear `src/lib/telegram/sales.ts`:

```ts
export interface StarsSaleEvent {
    saleId: string
    organizationId: string
    avatarId: string
    chatId: string
    itemId: string | null
    stars: number
    soldBy: 'ai' | 'manual'
    source: 'inbox' | 'agent' | 'script' | 'broadcast'
    telegramUserId: number
    purchasedAt: string
}

/** Se llama UNA vez por venta, después de que la transición a 'purchased'
 *  haya cambiado exactamente una fila. Nunca lanza: la compra ya ocurrió. */
export async function recordStarsSale(event: StarsSaleEvent): Promise<void>
```

Cuerpo: incrementa los contadores del ítem y los de uso del agente, llama a `settleStarsCommission({organizationId, saleId, avatarId, stars, soldBy})` y escribe el resultado en las columnas de comisión de la venta. Envuelve todo en `try/catch` y registra con `console.error`: si la comisión falla, la venta sigue siendo válida.

- [ ] **Step 3: Escribir el webhook**

`export const dynamic = 'force-dynamic'` y `export const maxDuration = 60`. El middleware ya exime `/api/webhooks/`.

Orden obligatorio:

1. Cargar ajustes por `avatarId`. Sin fila o `!enabled`, responder 200 en silencio. **Nunca 404**: un 404 hace que Telegram acumule reintentos.
2. Comparar la cabecera `x-telegram-bot-api-secret-token` con el secreto guardado usando `crypto.timingSafeEqual`. Si no cuadra, 401.
3. JSON mal formado, 200.
4. Idempotencia: insertar en `telegram_webhook_events`. Si viola la clave primaria, 200 inmediato.
5. Procesar. `try/catch` global que registra y devuelve 200.

`message`: ignorar si el chat no es privado o el emisor es un bot. `upsertChat({platform: 'telegram', fanUuid: String(chat.id), ...})` y `ingestMessage` con dirección entrante. Esto es lo que hace que exista una conversación a la que ofrecer contenido. **No se genera ningún borrador**: el agente llega en el plan siguiente.

`purchased_paid_media`: buscar la venta por `paid_media_payload` con una transición **atómica**:

```sql
update telegram_stars_sales
set status = 'purchased', purchased_at = now(), telegram_user_id = $2, updated_at = now()
where payload = $1 and status = 'offered'
returning *
```

Si devuelve cero filas, no llamar a `recordStarsSale`: o es un reintento, o el payload es desconocido. Si devuelve una, llamarla. **Esta transición es la única barrera contra comisionar dos veces la misma compra**, junto con la clave de idempotencia del libro mayor.

- [ ] **Step 4: Verificar la seguridad del webhook**

Con el servidor de desarrollo encendido:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3030/api/webhooks/telegram/<avatarId> \
  -H 'content-type: application/json' -d '{"update_id":1}'
```
Expected: `401`, porque falta la cabecera del secreto.

Repetir con la cabecera correcta y un cuerpo vacío. Expected: `200`. Pega las dos salidas.

- [ ] **Step 5: Verificar candados y commitear**

Run: `npx tsc --noEmit && npm run lint && npm run check:tenant && npm test`

```bash
git add src/app/api/webhooks/telegram src/lib/telegram/sales.ts src/lib/agent/inboxSync.ts
git commit -m "feat(telegram): webhook de mensajes y de compras

La transicion de la venta a comprada es atomica y condicionada al estado
anterior: si devuelve cero filas es un reintento de Telegram, y comisionar ahi
seria cobrar dos veces la misma compra."
```

---

### Task 5: Galería y envío de contenido de pago

**Files:**
- Create: `src/lib/telegram/paidMedia.ts`
- Modify: `src/services/AgentTelegramService.ts`

**Interfaces:**
- Consumes: `getMediaObject` (`src/lib/mediaStore.ts:205`, devuelve `Promise<ArrayBuffer>`), el cliente (Task 2), `agent_messages`.
- Produces: `deliverPaidMedia({chat, itemId, stars?, caption?, soldBy, source, approvedBy})`, y en el servicio `listPaidMediaItems`, `upsertPaidMediaItem`, `deletePaidMediaItem`, `sendPaidMediaFromInbox`.

- [ ] **Step 1: Escribir la entrega**

`deliverPaidMedia` hace, en este orden:

1. Cargar el ítem y los ajustes; validar que está habilitado y que el precio está entre 1 y 25.000.
2. **Insertar la venta en estado ofrecido**, con `payload` igual a su propio identificador. Esto va antes del envío: si el envío falla, queda una oferta huérfana, que es recuperable; si fuera al revés, una compra llegaría sin fila que la explique.
3. Resolver el contenido: si hay `telegram_file_id` y su `telegram_file_id_bot_id` coincide con el bot actual, usarlo. Si no, leer los bytes con `getMediaObject({path, provider})` y enviarlos por multipart con `attach://`.
4. `sendPaidMedia` con `payload`, `caption` y `protect_content: true`.
5. Guardar el identificador de fichero que devuelve Telegram, registrar un `agent_messages` saliente y actualizar la venta con el identificador de mensaje.

**Por qué multipart y no URL**: por URL el límite es 5 MB en fotos y 20 MB en el resto, y los vídeos generados lo superan con frecuencia; además obligaría a que el objeto fuese público, o sea que el contenido de pago quedaría descubrible. Por multipart son 10 MB y 50 MB, y con el identificador cacheado los reenvíos son instantáneos.

- [ ] **Step 2: Validar el tamaño al dar de alta un ítem**

En `upsertPaidMediaItem`, antes de guardar, comprobar el tamaño del objeto y rechazar con un mensaje claro si supera 10 MB en foto o 50 MB en vídeo. Un ítem que no se puede enviar no debe poder crearse.

- [ ] **Step 3: Verificar candados y commitear**

Run: `npx tsc --noEmit && npm run lint && npm run check:tenant`

```bash
git add src/lib/telegram/paidMedia.ts src/services/AgentTelegramService.ts
git commit -m "feat(telegram): galeria con precio en Stars y envio de contenido de pago

La venta se inserta ANTES de enviar: si el envio falla queda una oferta
huerfana, que se limpia; al reves, una compra llegaria sin fila que la explique
y el payload no tendria a que apuntar."
```

---

### Task 6: Desbloquear la cuota mensual

**Files:**
- Create: `src/lib/telegram/bots.ts`
- Modify: `src/app/api/cron/module-fees/route.ts`

**Interfaces:**
- Consumes: `registerUnitActivity` y el tipo `UnitActivity` (`src/lib/billing/period.ts`).
- Produces: `telegramUnitActivity(organizationId): Promise<UnitActivity[]>` y su registro.

- [ ] **Step 1: Escribir el informe de unidades**

```ts
/**
 * Cuándo estuvo facturable cada bot de la organización. La cuota se prorratea
 * por días, así que no basta con contar: hace falta desde cuándo y hasta
 * cuándo. `disconnected_at` nulo significa que sigue activo.
 */
export async function telegramUnitActivity(organizationId: string): Promise<UnitActivity[]>
```

Lee `avatar_telegram_settings` filtrando por `organization_id` y mapea cada fila a `{activeFrom: connected_at, activeUntil: disconnected_at}`. Las filas con `enabled = false` y sin `disconnected_at` se tratan como desconectadas en el momento de deshabilitarse: usa `updated_at` en ese caso, y **dilo en un comentario**, porque es una aproximación.

- [ ] **Step 2: Registrarlo donde el cron lo vea**

El registro es un efecto lateral de importación. La ruta del cron debe importar el módulo para que el mapa esté lleno cuando se ejecute: añade `import '@/lib/telegram/bots'` en `src/app/api/cron/module-fees/route.ts`, con un comentario explicando que el import existe por su efecto lateral y que borrarlo deja la cuota en cero **sin ningún error**.

- [ ] **Step 3: Probar el cron de punta a punta**

Conecta un bot de prueba desde la interfaz, luego:

```bash
curl -s -H "Authorization: Bearer $(grep '^CRON_SECRET=' .env | cut -d= -f2-)" \
  http://localhost:3030/api/cron/module-fees
```
Expected: ya no `skipped`. Con un bot conectado durante parte del mes anterior debe devolver `charged: 1` con un número de tokens proporcional a los días. Si el bot se conectó este mes, el mes anterior no tiene actividad y devolverá cero: conéctalo con una fecha pasada mediante SQL para poder probarlo, y **limpia después el asiento devolviendo los tokens a la bolsa de la que salieron**, leyendo el reparto del propio asiento.

- [ ] **Step 4: Verificar el cuadre**

```sql
select (select coalesce(sum(tokens),0) from token_ledger where organization_id = $1) as ledger,
       (select included_balance + purchased_balance from org_wallets where organization_id = $1) as wallet;
```
Los dos números deben coincidir. **Usa SQL, no el cliente REST**: devuelve como mucho mil filas y trunca en silencio, y el libro mayor tiene más de dos mil.

- [ ] **Step 5: Commitear**

```bash
git add src/lib/telegram/bots.ts src/app/api/cron/module-fees/route.ts
git commit -m "feat(telegram): informar de bots activos para que la cuota deje de ser cero

El import del cron existe por su efecto lateral: registra el informador. Sin el,
el cron no falla, simplemente no cobra a nadie y nadie se entera."
```

---

### Task 7: Interfaz mínima

**Files:**
- Create: `src/app/(protected-pages)/concepts/avatar-forge/telegram/layout.tsx`, `page.tsx`, `[slug]/page.tsx` y sus `_components/`

**Interfaces:**
- Consumes: todo el servicio de Task 3 y Task 5, `hasModule` para el gate del layout.

- [ ] **Step 1: El gate del módulo**

`layout.tsx` como componente de servidor: `getOrgContext()`, y si `hasModule(ctx, 'telegram')` es falso, renderizar `ModuleNotInstalled` de `src/components/shared/` (ya existe, del sub-proyecto B). Nunca un 404.

- [ ] **Step 2: Conexión**

Componente con `Input` de tipo contraseña para el token, botón de conectar, y una vez conectado el nombre del bot, el estado del webhook mediante `getTelegramWebhookInfo`, y desconectar con `ConfirmDialog`. **El token no se vuelve a mostrar jamás**, ni siquiera enmascarado: si alguien lo pierde, genera uno nuevo en BotFather.

- [ ] **Step 3: Galería**

Rejilla de ítems con miniatura, título, precio en Stars y ventas. "Añadir desde generaciones" abre un `Dialog` con las `generations` del avatar para elegir una, poner título, precio y texto. Editar y deshabilitar. Aviso del límite de tamaño.

- [ ] **Step 4: Enviar contenido de pago a una conversación**

Lista de conversaciones del avatar en Telegram, con un botón por conversación que abre la galería, permite ajustar el precio y llama a `sendPaidMediaFromInbox` con `soldBy: 'manual'` y `source: 'inbox'`.

- [ ] **Step 5: Ventas**

Tabla de ventas recientes: contenido, estrellas, estado, y la comisión asentada cuando la haya. Más el balance del bot con `getMyStarBalance` y un texto fijo explicando que las Stars se acreditan al bot del creador, que se retiran por Fragment y que Telegram aplica 21 días de retención. **No conviertas Stars a dólares en pantalla**: el tipo de cambio depende de dónde compró el fan.

- [ ] **Step 6: Verificar candados y commitear**

Run: `npx tsc --noEmit && npm run lint && npm test`

```bash
git add "src/app/(protected-pages)/concepts/avatar-forge/telegram"
git commit -m "feat(telegram): pantallas de conexion, galeria y ventas

El token no se reexpone nunca, ni enmascarado: recuperarlo desde la interfaz
seria convertir una pantalla de administracion en una filtracion."
```

---

### Task 8: La prueba que importa, de punta a punta

**Files:** ninguno. Es una verificación.

- [ ] **Step 1: Levantar un túnel**

```bash
cloudflared tunnel --url http://localhost:3030
```
Exporta esa URL como `NEXT_PUBLIC_APP_URL` y reinicia el servidor de desarrollo, para que `setWebhook` apunte a algo que Telegram pueda alcanzar.

- [ ] **Step 2: Conectar un bot real**

Crea un bot en BotFather, conéctalo desde la interfaz y comprueba:

```bash
curl -s "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```
Expected: la URL del túnel, sin `last_error_message`, y `allowed_updates` con `message` y `purchased_paid_media`.

- [ ] **Step 3: Crear una conversación**

Escríbele al bot desde una cuenta de Telegram distinta. Comprueba:

```sql
select platform, external_chat_id, fan_display_name from agent_chats where platform = 'telegram';
```
Expected: una fila.

- [ ] **Step 4: Vender algo de verdad**

Crea un ítem de **1 Star** en la galería, envíalo a esa conversación y cómpralo con la otra cuenta.

**No existe entorno de pruebas para las Stars de contenido de pago.** Esto ocurre con dinero real, por eso se hace con una sola Star.

- [ ] **Step 5: Comprobar que el dinero llegó al libro mayor**

```sql
select s.status, s.stars, s.sold_by, s.commission_pct, s.commission_tokens, s.commission_ledger_id,
       l.sku, l.tokens, l.metadata
from telegram_stars_sales s
left join token_ledger l on l.id = s.commission_ledger_id
order by s.offered_at desc limit 1;
```
Expected: estado comprado, `sold_by` manual, `commission_pct` de 7.00, un identificador de asiento no nulo, y el asiento con `sku` igual a `commission:telegram`.

**Éste es el objetivo entero del plan.** Si esta consulta devuelve lo esperado, la comisión es cobrable.

- [ ] **Step 6: Comprobar que no se cobra dos veces**

Vuelve a enviar a Telegram el mismo evento de compra (o espera a que reintente). Comprueba que el número de asientos con `sku = 'commission:telegram'` no aumenta.

- [ ] **Step 7: Devolver la Star y dejar limpio**

```bash
curl -s "https://api.telegram.org/bot<TOKEN>/refundStarPayment" \
  -d "user_id=<ID>" -d "telegram_payment_charge_id=<CHARGE>"
```

Y comprueba el cuadre final del monedero con SQL, no con el cliente REST.

- [ ] **Step 8: Reconectar apuntando a producción**

Cuando el túnel muera, el webhook apunta a una URL muerta. Reconecta el bot desde la interfaz con `NEXT_PUBLIC_APP_URL` de producción, o desconéctalo.

---

## Verificación final

- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run check:tenant` y `npm test` en verde
- [ ] `grep -rn "bot_token" src/` no aparece en ningún DTO, log ni mensaje de error
- [ ] La consulta del paso 5 de la Task 8 devuelve una comisión asentada
- [ ] El cron de cuotas devuelve algo distinto de `skipped` con un bot conectado
- [ ] El cuadre `sum(token_ledger) == org_wallets` se mantiene, comprobado con SQL
- [ ] `mcp__supabase__get_advisors` de seguridad sin hallazgos nuevos

## Lo que este plan deja fuera, a propósito

- **La comisión del 20%.** Necesita que el agente de IA responda en Telegram, que es generalizar `sendMessage.ts`, `channelDelivery`, `draftPipeline` y `promptBuilder`. Es el plan siguiente y es donde está el negocio.
- **El modo secretaría** de Telegram Business, que hace que el fan escriba al perfil personal del creador en vez de a un bot.
- Guiones automáticos, envíos masivos, estadísticas y el motor de ofertas de la IA.
