# El agente contesta en Telegram, con interruptor por canal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un fan que escriba al bot de Telegram reciba respuesta de la IA en personaje, con envío automático o borrador según lo que el creador elija, con un interruptor propio de Telegram independiente del de Fanvue, y que la IA pueda ofrecer contenido de pago, que es lo que activa la comisión del 20%.

**Architecture:** El pipeline del agente (persona, memoria del fan, clasificador de riesgo, autopilot con retardo humano) ya existe y funciona para Fanvue. Está cableado a Fanvue en tres sitios concretos: el envío (`sendMessage.ts` carga la conexión de Fanvue y llama a su cliente), la memoria del fan (`draftPipeline.ts` consulta `platform = 'fanvue'` en tres lugares) y el prompt (`promptBuilder.ts` sólo conoce `'playground' | 'fanvue'`). Este plan desacopla esos tres puntos por plataforma sin cambiar un byte del comportamiento de Fanvue, hace que el webhook de Telegram dispare el mismo pipeline tras ingerir un mensaje, y añade un motor de oferta que decide cuándo adjuntar contenido de pago a un borrador. El gate de Telegram es un ajuste propio del bot, no el interruptor global de la persona (decisión A3-bis del spec).

**Tech Stack:** Next.js 15 App Router (`after()` de `next/server` para trabajo tras responder), TypeScript estricto, Supabase service-role con filtro manual de `organization_id`, Bot API de Telegram por `fetch`, SDK `ai` con `generateText`, componentes ECME, tests con `node:test` vía tsx.

**Spec:** `docs/superpowers/specs/2026-09-11-telegram-telestars-module-design.md` (sub-proyecto A: A3 `message`/`afterInbound`, **A3-bis interruptor por canal**, A4 pipeline y oferta IA). Fuera de este plan: modo secretaría (`telegram_business`), guiones, envíos masivos, `sendChatAction`, `human_takeover_until`, `telegram_blocked`.

## Context

Hoy el webhook de Telegram registra la conversación y para. Lo dice su propio código, en `src/app/api/webhooks/telegram/[avatarId]/route.ts:223-225`:

```ts
    // Nada de borradores aquí: el agente respondiendo en Telegram es del plan
    // siguiente. Esto sólo deja que exista una conversación a la que ofrecer
    // contenido de pago.
```

Este es ese plan siguiente. Hechos verificados en el código que condicionan el diseño:

- `generateDraftReply(chatId)` **no comprueba** `persona.enabled` por dentro ("Assumes the persona is enabled … callers gate that", `draftPipeline.ts:27-31`). El gate es siempre del llamador. Por eso Telegram puede tener un interruptor propio sin tocar el de Fanvue.
- `upsertChat` fija el modo **sólo al crear** el chat (`mode: input.isCreator ? 'off' : 'draft'`, `inboxSync.ts:202`) y "NEVER override a mode the user set" (`:178`). Un ajuste "modo por defecto de chats nuevos" encaja ahí sin romper nada.
- `maybeAutopilotSend` ya es agnóstico de plataforma: mira `chat.mode`, el autopilot de la persona, el clasificador, horario y límite diario, y deja el mensaje `approved` con `send_after` (`autopilot.ts:72-149`). El envío real lo hace `flushDueAutopilotMessages` → `sendAgentMessage` (`:158-177`).
- Ese flush corre dentro del cron `agent-inbox-poll` **cada 5 minutos** (`vercel.json`). Para Fanvue vale; para un bot de Telegram una respuesta que tarda cinco minutos más el retardo humano parece rota. Se añade un cron de flush cada minuto (Tarea 6).
- El webhook de Telegram hace todo el trabajo **en línea** antes de responder (no usa `after()`). Generar un borrador con el LLM tarda 10-20 s; Telegram reintenta si no recibe 200 a tiempo. El borrador se genera dentro de `after()` (Tarea 5).
- `agent_messages.media` es `Json` (`db.ts:171`): ahí viaja la oferta adjunta a un borrador. `AgentMessageDTO` **no** expone `media` hoy (`AgentInboxService.ts:66-76`).
- `deliverPaidMedia` deriva `soldBy` de `source` y **rechaza recibirlo como parámetro** (`paidMedia.ts:212-217`): `source: 'agent'` es lo único que produce una venta `ai` y por tanto el 20%.
- `platform` en `agent_chats` es `string` a secas, sin unión de literales ni `check` en SQL. Este plan usa `'telegram'` y `'fanvue'` y no introduce la unión: el reparto por plataforma se hace en una función pura con `startsWith('telegram')`, preparada para `telegram_business` sin cambios.
- `sendChatAction` no existe en `client.ts` y no se añade: era para el modo secretaría.

## Global Constraints

- Migraciones SIEMPRE vía MCP `apply_migration`. **NUNCA** `supabase db push`: el historial remoto está desalineado. Proyecto Supabase ref `wiocwfoydyknqmhixpyt`.
- **NUNCA** `npm run build`: el servidor de desarrollo comparte `.next` y la interfaz desaparece sin error. Validar con `npx tsc --noEmit`, `npm run lint`, `npm run check:tenant` y `npm test`. Línea base al arrancar: **156 tests, 0 fallos**.
- En ficheros `'use server'`, TODOS los exports deben ser `async`. Sólo revienta en el build: verificar con `grep -n "^export" <fichero>` que ningún export sea `const`, `function` síncrona, ni `interface`/`type` fuera de `export type`/`export interface` (esos sí están permitidos).
- Sólo componentes ECME de `@/components/ui/*` y `@/components/shared/*`. Prohibidos Shadcn, Radix, `window.confirm` y `window.alert`.
- Acceso directo con `orgSupabase()`/`agentSupabase()` fuera de `orgTable` sólo en cron, webhooks y las libs que el spec exime (F4.2 Tarea 4), y SIEMPRE filtrando por `organization_id` de la fila ya resuelta. Cada acceso nuevo va justificado en `scripts/check-tenant-access.mjs` como los 73 existentes; `npm run check:tenant` debe seguir diciendo "todos justificados".
- **El token del bot NUNCA sale en un DTO, log ni mensaje de error.** Se obtiene con `loadTelegramBotToken(avatarId)` (devuelve el string a secas) y se usa y se suelta en la misma función.
- **El comportamiento de Fanvue no cambia.** Todo lo que hoy corre con `platform = 'fanvue'` debe producir exactamente las mismas consultas y llamadas. La Tarea 3 lleva una verificación manual de regresión en producción que sólo el usuario puede hacer.
- Toda lógica de decisión nueva vive en ficheros **puros, sin imports**, con test: `src/lib/telegram/aiGate.ts`, `src/lib/agent/channelRouting.ts`, `src/lib/agent/fanMemoryPlatform.ts`, `src/lib/telegram/offerGate.ts`. Es lo que permite que `npm test` corra sin `.env` (lección de `src/lib/billing/period.ts`).
- Tests con `import { test } from 'node:test'`, `import assert from 'node:assert/strict'`, imports relativos con extensión `.ts` (molde: `src/lib/telegram/client.test.ts`).
- Mensajes de commit en español, sin mención alguna a Claude, Anthropic ni `Co-Authored-By`. Un commit por tarea.
- Todas las acciones de servidor nuevas del módulo llaman a `requireModule(ctx, 'telegram')` y a `assertOwnedAvatar(ctx, avatarId)` (ambas ya existen en `AgentTelegramService.ts`).
- Un fallo nunca se traga: cada `catch` nuevo escribe `console.error` con prefijo (`[telegram webhook]`, `[agent]`, `[telegram offer]`) — lección de hoy, cuatro veces.

---

## File Structure

**Se crea:**

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20260914120000_telegram_ia_por_canal.sql` | Tres columnas en `avatar_telegram_settings`: `ai_replies_enabled`, `ai_default_chat_mode`, `ai_offers_enabled` |
| `src/lib/telegram/aiGate.ts` (+ test) | Decisión pura: ¿este mensaje entrante merece borrador? |
| `src/lib/agent/channelRouting.ts` (+ test) | Decisión pura: ¿por qué canal se entrega un chat según su `platform`? |
| `src/lib/agent/channelDelivery.ts` | `deliverAgentText`: envío de texto por Telegram o por Fanvue |
| `src/lib/agent/fanMemoryPlatform.ts` (+ test) | Decisión pura: en qué `platform` de `avatar_fan_memories` vive la memoria de un chat |
| `src/app/api/cron/agent-autopilot-flush/route.ts` | Cron cada minuto: sólo `flushDueAutopilotMessages()` |
| `src/lib/telegram/offerGate.ts` (+ test) | Decisión pura: candidatos de oferta y enfriamiento |
| `src/lib/telegram/offerEngine.ts` | `maybeAttachPaidMediaOffer`: pregunta al modelo si ofrecer y adjunta la oferta al borrador |

**Se modifica:** `src/lib/telegram/settings.ts`, `src/services/AgentTelegramService.ts`, `src/lib/agent/sendMessage.ts`, `src/lib/agent/draftPipeline.ts`, `src/lib/agent/promptBuilder.ts`, `src/lib/agent/inboxSync.ts` (sólo `defaultMode`), `src/lib/agent/autopilot.ts` (sólo el gate de oferta y tres campos de config), `src/app/api/webhooks/telegram/[avatarId]/route.ts`, `vercel.json`, `scripts/check-tenant-access.mjs`, `src/app/(protected-pages)/concepts/avatar-forge/telegram/[slug]/_components/TelegramConnectionPanel.tsx`, `src/services/AgentInboxService.ts` (DTOs + `removeDraftOffer`), `src/app/(protected-pages)/concepts/avatar-forge/inbox/_components/ThreadPane.tsx`, `src/app/(protected-pages)/concepts/avatar-forge/agent/[slug]/_components/AutopilotCard.tsx`, `docs/superpowers/VERIFICACION-MANUAL-telegram.md`.

**NO se toca:** `classifier.ts`, `retrieval.ts`, `chatProvider.ts`, `src/lib/billing/*`, `src/lib/telegram/paidMedia.ts` (se consume tal cual), `src/lib/telegram/sales.ts`, el webhook de Fanvue, `src/middleware.ts`.

---

### Task 1: Tres ajustes de IA en el bot, y la acción que los guarda

**Files:**
- Create: `supabase/migrations/20260914120000_telegram_ia_por_canal.sql`
- Modify: `src/lib/telegram/settings.ts` (interfaz `TelegramSettings` en 65-83 y `toSettings`)
- Modify: `src/services/AgentTelegramService.ts` (`TelegramBotStatus` 120-133, `toStatus` 254-265, nueva acción)

**Interfaces:**
- Consumes: `avatar_telegram_settings` (existe).
- Produces: `TelegramSettings.aiRepliesEnabled: boolean`, `TelegramSettings.aiDefaultChatMode: 'auto' | 'draft'`, `TelegramSettings.aiOffersEnabled: boolean`; los mismos tres en `TelegramBotStatus`; `updateTelegramAiSettings(avatarId, patch): Promise<TelegramResult<TelegramBotStatus>>`.

- [ ] **Step 1: Escribir la migración**

```sql
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
```

- [ ] **Step 2: Aplicar la migración vía MCP `apply_migration`** con nombre `telegram_ia_por_canal` y ese SQL. Verificar con `execute_sql`:

```sql
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'avatar_telegram_settings' and column_name like 'ai_%'
order by column_name;
```

Esperado: tres filas, defaults `false`, `'auto'::text`, `false`.

- [ ] **Step 3: Extender `TelegramSettings` y `toSettings`**

En `src/lib/telegram/settings.ts`, dentro de la interfaz `TelegramSettings` (líneas 65-83), después de `enabled: boolean`:

```ts
    /** Gate de la IA en ESTE canal. Independiente de `avatar_personas.enabled`,
     *  que gata Fanvue (spec A3-bis). */
    aiRepliesEnabled: boolean
    /** Modo con que nacen los chats nuevos de Telegram. `upsertChat` lo fija
     *  sólo al crear y nunca lo pisa. */
    aiDefaultChatMode: 'auto' | 'draft'
    /** Si el motor de oferta puede adjuntar contenido de pago a un borrador. */
    aiOffersEnabled: boolean
```

En `toSettings` (la función que mapea la fila a la interfaz; localízala con `grep -n "function toSettings" src/lib/telegram/settings.ts`), añade las tres líneas junto a `enabled`:

```ts
        aiRepliesEnabled: Boolean(row.ai_replies_enabled),
        aiDefaultChatMode: row.ai_default_chat_mode === 'draft' ? 'draft' : 'auto',
        aiOffersEnabled: Boolean(row.ai_offers_enabled),
```

Si el tipo de `row` viene del schema generado y no conoce las columnas nuevas, regenera tipos con MCP `generate_typescript_types` → `src/@types/database.generated.ts`, y revisa el diff (ese fichero tiene historial de desalineación).

- [ ] **Step 4: Extender `TelegramBotStatus` y `toStatus`**

En `src/services/AgentTelegramService.ts`, interfaz `TelegramBotStatus` (120-133), después de `enabled: boolean`:

```ts
    aiRepliesEnabled: boolean
    aiDefaultChatMode: 'auto' | 'draft'
    aiOffersEnabled: boolean
```

`toStatus` (254-265) pasa a:

```ts
function toStatus(settings: TelegramSettings | null): TelegramBotStatus {
    if (!settings) {
        return {
            connected: false,
            botUsername: null,
            enabled: false,
            connectedAt: null,
            aiRepliesEnabled: false,
            aiDefaultChatMode: 'auto',
            aiOffersEnabled: false,
        }
    }
    return {
        connected: settings.enabled,
        botUsername: settings.botUsername,
        enabled: settings.enabled,
        connectedAt: settings.connectedAt,
        aiRepliesEnabled: settings.aiRepliesEnabled,
        aiDefaultChatMode: settings.aiDefaultChatMode,
        aiOffersEnabled: settings.aiOffersEnabled,
    }
}
```

- [ ] **Step 5: La acción que guarda los tres ajustes**

Al final de `src/services/AgentTelegramService.ts`:

```ts
export interface TelegramAiSettingsPatch {
    aiRepliesEnabled?: boolean
    aiDefaultChatMode?: 'auto' | 'draft'
    aiOffersEnabled?: boolean
}

/**
 * Guarda los ajustes de IA del canal (spec A3-bis). Sólo esas tres columnas:
 * ni el token, ni `enabled`, ni `connected_at` (CANDADO 1) se tocan desde
 * aquí. Exige bot conectado: sin fila no hay nada que encender.
 */
export async function updateTelegramAiSettings(
    avatarId: string,
    patch: TelegramAiSettingsPatch,
): Promise<TelegramResult<TelegramBotStatus>> {
    try {
        const ctx = await getOrgContext()
        await requireModule(ctx, 'telegram')
        if (!avatarId) return { success: false, error: 'Falta el avatar.' }
        await assertOwnedAvatar(ctx, avatarId)

        const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (patch.aiRepliesEnabled !== undefined) update.ai_replies_enabled = patch.aiRepliesEnabled
        if (patch.aiDefaultChatMode !== undefined) {
            if (patch.aiDefaultChatMode !== 'auto' && patch.aiDefaultChatMode !== 'draft') {
                return { success: false, error: 'Modo no válido.' }
            }
            update.ai_default_chat_mode = patch.aiDefaultChatMode
        }
        if (patch.aiOffersEnabled !== undefined) update.ai_offers_enabled = patch.aiOffersEnabled

        const { data, error } = await orgTable(ctx, 'avatar_telegram_settings')
            .update(update)
            .eq('avatar_id', avatarId)
            .select('id')
            .maybeSingle()
        if (error) throw new Error(error.message)
        if (!data) return { success: false, error: 'Este avatar no tiene un bot conectado.' }

        const settings = await loadTelegramSettingsForOrg(ctx, avatarId)
        return { success: true, data: toStatus(settings) }
    } catch (e) {
        return fail('updateTelegramAiSettings', e)
    }
}
```

`export interface` está permitido en un fichero `'use server'`; la función es `async`. Verifica con `grep -n "^export" src/services/AgentTelegramService.ts` que no quede ningún `export const`/`export function` síncrono.

- [ ] **Step 6: Candados y commit**

Run: `npx tsc --noEmit && npm run lint && npm run check:tenant && npm test`
Expected: limpio, limpio, "todos justificados", 156 pasando.

```bash
git add supabase/migrations/20260914120000_telegram_ia_por_canal.sql src/lib/telegram/settings.ts src/services/AgentTelegramService.ts src/@types/database.generated.ts
git commit -m "feat(telegram): tres ajustes de IA por canal en el bot y la accion que los guarda"
```

---

### Task 2: La decisión pura de "¿merece borrador?"

**Files:**
- Create: `src/lib/telegram/aiGate.ts`
- Create: `src/lib/telegram/aiGate.test.ts`

**Interfaces:**
- Produces: `shouldDraftTelegramReply(input: TelegramDraftGateInput): boolean`.

- [ ] **Step 1: Escribir los tests (fallan porque el módulo no existe)**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldDraftTelegramReply } from './aiGate.ts'

const base = { aiRepliesEnabled: true, chatMode: 'auto', isCreator: false, text: 'hola', inserted: true }

test('con todo a favor, sí', () => {
    assert.equal(shouldDraftTelegramReply(base), true)
})

test('con la IA del canal apagada, no — aunque la persona esté encendida en Fanvue', () => {
    assert.equal(shouldDraftTelegramReply({ ...base, aiRepliesEnabled: false }), false)
})

test('chat en off, no', () => {
    assert.equal(shouldDraftTelegramReply({ ...base, chatMode: 'off' }), false)
})

test('chat en draft, sí (el borrador se deja para aprobar; aquí sólo se decide si se genera)', () => {
    assert.equal(shouldDraftTelegramReply({ ...base, chatMode: 'draft' }), true)
})

test('el interlocutor es un creador/bot, no', () => {
    assert.equal(shouldDraftTelegramReply({ ...base, isCreator: true }), false)
})

test('sin texto (sticker, foto sin caption), no: se ingiere pero no se draftea', () => {
    assert.equal(shouldDraftTelegramReply({ ...base, text: null }), false)
    assert.equal(shouldDraftTelegramReply({ ...base, text: '   ' }), false)
})

test('mensaje ya visto (no insertado), no: evita drafts dobles en reintentos', () => {
    assert.equal(shouldDraftTelegramReply({ ...base, inserted: false }), false)
})

test('/start cuenta como texto: es el fan abriendo la conversación', () => {
    assert.equal(shouldDraftTelegramReply({ ...base, text: '/start' }), true)
})
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx --yes tsx --test src/lib/telegram/aiGate.test.ts`
Expected: FAIL, "Cannot find module './aiGate.ts'".

- [ ] **Step 3: Implementar**

```ts
/**
 * ¿Un mensaje entrante de Telegram merece que la IA genere un borrador?
 *
 * Fichero PURO, sin imports, para que el test corra sin entorno. La regla
 * vive aquí y sólo aquí; el webhook la llama con los datos ya cargados.
 *
 * Es el gate del canal (spec A3-bis): NO mira `avatar_personas.enabled`,
 * que es el interruptor de Fanvue. Lo que enciende la IA en Telegram es
 * `avatar_telegram_settings.ai_replies_enabled`.
 */
export interface TelegramDraftGateInput {
    /** `avatar_telegram_settings.ai_replies_enabled`. */
    aiRepliesEnabled: boolean
    /** `agent_chats.mode`: 'off' | 'draft' | 'auto'. */
    chatMode: string
    /** `agent_chats.is_creator`: el interlocutor es otro creador o un bot. */
    isCreator: boolean
    /** Texto del mensaje (o caption). Sin texto se ingiere pero no se
     *  draftea: la IA no tiene a qué responder. `/start` SÍ es texto: es el
     *  fan abriendo la conversación, y el prompt sabe saludar. */
    text: string | null
    /** `ingestMessage(...).inserted`: false = ya lo habíamos visto (reintento
     *  de Telegram o duplicado). No se genera un segundo borrador. */
    inserted: boolean
}

export function shouldDraftTelegramReply(input: TelegramDraftGateInput): boolean {
    if (!input.aiRepliesEnabled) return false
    if (!input.inserted) return false
    if (input.isCreator) return false
    if (input.chatMode === 'off') return false
    if (!input.text || input.text.trim() === '') return false
    return true
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx --yes tsx --test src/lib/telegram/aiGate.test.ts`
Expected: 8 pasando.

- [ ] **Step 5: Commit**

```bash
git add src/lib/telegram/aiGate.ts src/lib/telegram/aiGate.test.ts
git commit -m "feat(telegram): la decision de si un mensaje merece borrador, pura y con test"
```

---

### Task 3: El envío deja de estar cableado a Fanvue

**Files:**
- Create: `src/lib/agent/channelRouting.ts` (+ `channelRouting.test.ts`)
- Create: `src/lib/agent/channelDelivery.ts`
- Modify: `src/lib/agent/sendMessage.ts` (líneas 12-15 imports y 47-64 bloque Fanvue)
- Modify: `scripts/check-tenant-access.mjs` (justificar `channelDelivery.ts`)

**Interfaces:**
- Consumes: `loadTelegramBotToken(avatarId): Promise<string | null>` (`settings.ts`), `sendMessage(token, {chat_id, text})` (`client.ts:380-389`), `loadConnection`, `makeFanvueClient` (los que hoy usa `sendMessage.ts`).
- Produces: `resolveDeliveryChannel(platform: string): 'telegram' | 'fanvue'`; `deliverAgentText(chat, text): Promise<{ externalMessageId: string }>`.

- [ ] **Step 1: Test del reparto (falla)**

`src/lib/agent/channelRouting.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveDeliveryChannel } from './channelRouting.ts'

test('fanvue va por fanvue', () => {
    assert.equal(resolveDeliveryChannel('fanvue'), 'fanvue')
})

test('telegram va por telegram', () => {
    assert.equal(resolveDeliveryChannel('telegram'), 'telegram')
})

test('telegram_business también va por telegram (mismo Bot API; llegará en otro plan)', () => {
    assert.equal(resolveDeliveryChannel('telegram_business'), 'telegram')
})

test('cualquier otra cosa, incluido vacío, cae en fanvue: es el comportamiento histórico', () => {
    assert.equal(resolveDeliveryChannel(''), 'fanvue')
    assert.equal(resolveDeliveryChannel('instagram'), 'fanvue')
})
```

- [ ] **Step 2: Implementar el reparto**

`src/lib/agent/channelRouting.ts`:

```ts
/**
 * Por qué canal se entrega un chat, según `agent_chats.platform`.
 *
 * Puro y sin imports. `platform` es `string` a secas en la tabla (sin
 * unión ni check), así que la decisión se toma por prefijo: todo lo que
 * empiece por `telegram` sale por el Bot API, y todo lo demás por Fanvue,
 * que es exactamente lo que pasaba antes de existir este fichero.
 */
export type DeliveryChannel = 'telegram' | 'fanvue'

export function resolveDeliveryChannel(platform: string): DeliveryChannel {
    return platform.startsWith('telegram') ? 'telegram' : 'fanvue'
}
```

Run: `npx --yes tsx --test src/lib/agent/channelRouting.test.ts` → 4 pasando.

- [ ] **Step 3: Escribir `channelDelivery.ts`**

```ts
/**
 * Entrega de un TEXTO ya aprobado por el canal del chat.
 *
 * Antes esto vivía dentro de `sendAgentMessage` cableado a Fanvue. Ahora
 * `sendAgentMessage` decide estado, contadores y memoria, y ESTE fichero
 * decide por dónde sale el mensaje. La rama de Fanvue es el bloque original
 * movido tal cual: mismo cliente, mismas llamadas, mismo resultado.
 *
 * F4.2 Tarea 4 — EXENTO de `orgTable` por el mismo motivo que
 * `sendMessage.ts`: lo llama el flush de autopilot desde el cron, sin
 * sesión. `chat` llega ya resuelto y acotado por `organization_id` desde
 * `sendAgentMessage`; aquí no se navega por ids sueltos.
 *
 * El token del bot se pide con `loadTelegramBotToken` y se suelta en la
 * misma función: no se guarda, no se loguea, no se devuelve (CANDADO 2 de
 * AgentTelegramService.ts).
 */
import { agentSupabase } from './db'
import { makeFanvueClient } from './inboxSync'
import { resolveDeliveryChannel } from './channelRouting'
import { loadConnection } from '@/lib/fanvue/tokenStore'
import { loadTelegramBotToken } from '@/lib/telegram/settings'
import { sendMessage as telegramSendMessage } from '@/lib/telegram/client'

export interface DeliverableChat {
    id: string
    organization_id: string
    avatar_id: string
    platform: string
    external_chat_id: string
}

export interface DeliveryResult {
    externalMessageId: string
}

export async function deliverAgentText(chat: DeliverableChat, text: string): Promise<DeliveryResult> {
    const channel = resolveDeliveryChannel(chat.platform)
    if (channel === 'telegram') return deliverViaTelegram(chat, text)
    return deliverViaFanvue(chat, text)
}

async function deliverViaTelegram(chat: DeliverableChat, text: string): Promise<DeliveryResult> {
    const token = await loadTelegramBotToken(chat.avatar_id)
    if (!token) throw new Error('Telegram bot not connected')
    const sent = await telegramSendMessage(token, {
        chat_id: chat.external_chat_id,
        text,
    })
    return { externalMessageId: String(sent.message_id) }
}

/** Bloque ORIGINAL de `sendAgentMessage` (líneas 47-64 antes de este cambio), sin tocar. */
async function deliverViaFanvue(chat: DeliverableChat, text: string): Promise<DeliveryResult> {
    const supabase = agentSupabase()
    const { data: avatar } = await supabase
        .from('avatars')
        .select('user_id, fanvue_creator_uuid')
        .eq('organization_id', chat.organization_id)
        .eq('id', chat.avatar_id)
        .single()
    if (!avatar?.user_id) throw new Error('Avatar has no owner')
    const connection = await loadConnection(avatar.user_id)
    if (!connection) throw new Error('Fanvue not connected')

    const client = makeFanvueClient(avatar.user_id)
    const res = await client.sendChatMessage(avatar.fanvue_creator_uuid ?? null, chat.external_chat_id, {
        text,
    })
    return { externalMessageId: res.messageUuid }
}
```

Comprueba que `TgMessage` (el retorno de `sendMessage` en `client.ts`) tiene `message_id: number`; si el campo se llama distinto, usa el real.

- [ ] **Step 4: `sendAgentMessage` usa la entrega**

En `src/lib/agent/sendMessage.ts`:

Imports (líneas 12-15): sustituye
```ts
import { makeFanvueClient } from './inboxSync'
import { updateFanMemoryFromChat } from './draftPipeline'
import { loadConnection } from '@/lib/fanvue/tokenStore'
```
por
```ts
import { updateFanMemoryFromChat } from './draftPipeline'
import { deliverAgentText } from './channelDelivery'
```

Bloque de las líneas 47-64 (desde `const { data: avatar } = await supabase` hasta `const res = await client.sendChatMessage(... { text, })` inclusive): sustitúyelo por

```ts
    try {
        const res = await deliverAgentText(chat, text)
```

y en el `update` de éxito cambia `external_message_id: res.messageUuid` por `external_message_id: res.externalMessageId`, y el `return { success: true, externalMessageId: res.messageUuid }` por `return { success: true, externalMessageId: res.externalMessageId }`. **Ojo:** antes, los fallos "Avatar has no owner" / "Fanvue not connected" devolvían `{ success: false }` SIN marcar el mensaje `failed`; ahora lanzan dentro del `try` y el `catch` existente lo marca `failed` con el motivo. Es un cambio deliberado y mejor: antes el mensaje se quedaba `approved` para siempre, invisible. Déjalo documentado en un comentario de dos líneas encima del `try`.

Actualiza el docblock de cabecera del fichero: ya no es "send … to Fanvue", es "send … por el canal del chat (Fanvue o Telegram)".

- [ ] **Step 5: Justificar el acceso directo en `check:tenant`**

Abre `scripts/check-tenant-access.mjs`, localiza cómo están justificados `src/lib/agent/sendMessage.ts` y `src/lib/agent/autopilot.ts`, y añade `src/lib/agent/channelDelivery.ts` con el mismo formato y este motivo: "F4.2 Tarea 4 — lo llama el flush de autopilot desde el cron, sin sesión; el chat llega resuelto por organization_id desde sendAgentMessage".

- [ ] **Step 6: Candados**

Run: `npx tsc --noEmit && npm run lint && npm run check:tenant && npm test`
Expected: limpio; check:tenant "todos justificados" con un acceso más; tests 156 + 8 + 4 = 168.

- [ ] **Step 7: Commit**

```bash
git add src/lib/agent/channelRouting.ts src/lib/agent/channelRouting.test.ts src/lib/agent/channelDelivery.ts src/lib/agent/sendMessage.ts scripts/check-tenant-access.mjs
git commit -m "refactor(agente): el envio elige canal por la plataforma del chat; Fanvue queda byte a byte igual"
```

- [ ] **Step 8: VERIFICACIÓN MANUAL DE REGRESIÓN (la hace el usuario, en producción, tras desplegar)**

Abrir el Agent Inbox, elegir un chat real de Fanvue con borrador, aprobar y enviar. Esperado: el mensaje pasa a `sent` y aparece en Fanvue. Si falla, el `error_message` del mensaje dice por qué (antes se quedaba en `approved` sin explicación). **No se pasa a la Tarea 5 sin esta comprobación.**

---

### Task 4: Memoria del fan y prompt por plataforma

**Files:**
- Create: `src/lib/agent/fanMemoryPlatform.ts` (+ test)
- Modify: `src/lib/agent/draftPipeline.ts` (líneas 91, 105, 216, 227, y carga del catálogo)
- Modify: `src/lib/agent/promptBuilder.ts` (8-14 y 84-90)

**Interfaces:**
- Produces: `fanMemoryPlatform(chatPlatform: string): string`; `BuildSystemPromptInput.channel: 'playground' | 'fanvue' | 'telegram'`; `BuildSystemPromptInput.paidCatalog?: { title: string; stars: number }[]`.

- [ ] **Step 1: Test (falla)**

`src/lib/agent/fanMemoryPlatform.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fanMemoryPlatform } from './fanMemoryPlatform.ts'

test('fanvue guarda memoria bajo fanvue', () => {
    assert.equal(fanMemoryPlatform('fanvue'), 'fanvue')
})

test('telegram guarda memoria bajo telegram', () => {
    assert.equal(fanMemoryPlatform('telegram'), 'telegram')
})

test('telegram_business comparte memoria con telegram: es la misma persona hablando con el mismo fan', () => {
    assert.equal(fanMemoryPlatform('telegram_business'), 'telegram')
})

test('lo desconocido cae en fanvue, como siempre', () => {
    assert.equal(fanMemoryPlatform(''), 'fanvue')
})
```

- [ ] **Step 2: Implementar**

```ts
/**
 * En qué `platform` de `avatar_fan_memories` vive la memoria de un chat.
 *
 * Puro, sin imports. Coincide con lo que ya escribe el webhook de Telegram
 * en `touchFanMemory(..., 'telegram')`: si aquí se leyera otra clave, la
 * IA no recordaría nada de lo que ese webhook guarda.
 */
export function fanMemoryPlatform(chatPlatform: string): string {
    return chatPlatform.startsWith('telegram') ? 'telegram' : 'fanvue'
}
```

- [ ] **Step 3: `draftPipeline.ts` deja de decir `'fanvue'` en duro**

Añade `import { fanMemoryPlatform } from './fanMemoryPlatform'`.

- Línea 91: `.eq('platform', 'fanvue')` → `.eq('platform', fanMemoryPlatform(chat.platform))`
- Línea 216: igual.
- Línea 227: `platform: 'fanvue',` → `platform: fanMemoryPlatform(chat.platform),`
- Línea 105: `channel: 'fanvue',` → `channel: chat.platform.startsWith('telegram') ? 'telegram' : 'fanvue',`

Y **antes** del `buildSystemPrompt` (línea ~95), carga el catálogo si el chat es de Telegram:

```ts
    // Catálogo de contenido de pago, SÓLO para Telegram: el prompt le dice a
    // la persona que tiene contenido exclusivo y qué es, para que provoque
    // interés sin inventar precios. Fanvue no cambia (su PPV va por otro
    // camino). Filtrado por organización de la fila ya resuelta.
    let paidCatalog: { title: string; stars: number }[] | undefined
    if (chat.platform.startsWith('telegram')) {
        const { data: items } = await supabase
            .from('telegram_paid_media_items')
            .select('title, star_price')
            .eq('organization_id', chat.organization_id)
            .eq('avatar_id', chat.avatar_id)
            .eq('enabled', true)
            .order('sort_order', { ascending: true })
            .limit(20)
        paidCatalog = (items ?? []).map((i) => ({ title: i.title, stars: i.star_price }))
    }
```

y pásalo: `paidCatalog,` dentro del objeto de `buildSystemPrompt`. Si `telegram_paid_media_items` no está en el tipo `AgentDatabase` de `db.ts`, añádelo (sólo `Row` con esas tres columnas) siguiendo el patrón de `AgentChatsTable`.

- [ ] **Step 4: `promptBuilder.ts` conoce Telegram**

Interfaz (8-14):

```ts
export interface BuildSystemPromptInput {
    persona: PersonaDTO
    avatarName: string
    ragChunks?: RetrievedChunk[]
    fanMemory?: { summary: string | null; facts: Record<string, string> } | null
    channel: 'playground' | 'fanvue' | 'telegram'
    /** Contenido de pago disponible (sólo Telegram). Título y precio en Stars. */
    paidCatalog?: { title: string; stars: number }[]
}
```

Línea 84: `if (channel === 'fanvue' && fanMemory) {` → `if ((channel === 'fanvue' || channel === 'telegram') && fanMemory) {`

Y después de ese bloque de memoria, antes de `## OUTPUT RULES`:

```ts
    if (channel === 'telegram') {
        sections.push(
            '## CHANNEL: TELEGRAM\n' +
                'You are chatting on Telegram, in a private chat with a fan. Messaging style: short, ' +
                'one to three sentences, like texting. If the last fan message is "/start", they just ' +
                'opened the chat for the first time: greet them warmly, introduce yourself in one line ' +
                'and ask their name or what brought them here. Never mention bots, commands or that ' +
                'this is Telegram.',
        )
        if (paidCatalog && paidCatalog.length > 0) {
            const list = paidCatalog.map((i) => `- ${i.title} (${i.stars} Stars)`).join('\n')
            sections.push(
                '## YOUR EXCLUSIVE PAID CONTENT (unlockable with Telegram Stars)\n' +
                    list +
                    '\nYou have this content. Tease it naturally when the conversation warms up — ' +
                    'never dump the list, never invent titles or prices, never pressure. The actual ' +
                    'offer is attached by the system; you only build desire in words.',
            )
        }
    }
```

Desestructura `paidCatalog` junto a los demás campos al principio de la función.

- [ ] **Step 5: Candados**

Run: `npx tsc --noEmit && npm run lint && npm run check:tenant && npm test`
Expected: limpio; tests 168 + 4 = 172. `tsc` debe aceptar el `channel` en el playground (que pasa `'playground'`) sin cambios.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/fanMemoryPlatform.ts src/lib/agent/fanMemoryPlatform.test.ts src/lib/agent/draftPipeline.ts src/lib/agent/promptBuilder.ts src/lib/agent/db.ts
git commit -m "feat(agente): memoria del fan y prompt por plataforma; Telegram conoce su catalogo de pago"
```

---

### Task 5: El webhook de Telegram genera el borrador (y lo manda si toca)

**Files:**
- Modify: `src/lib/agent/inboxSync.ts` (`upsertChat` 143-159 y línea 202)
- Modify: `src/app/api/webhooks/telegram/[avatarId]/route.ts` (imports 77-84 y `handleMessage` 191-226)

**Interfaces:**
- Consumes: `shouldDraftTelegramReply` (T2), `generateDraftReply(chatId)`, `maybeAutopilotSend(chatId, draftMessageId)`, `after` de `next/server`.
- Produces: `upsertChat(input.defaultMode?: AgentChatMode)`.

- [ ] **Step 1: `upsertChat` acepta el modo de nacimiento**

En la firma (143-159), después de `platform?: string`:

```ts
    /** Modo con que nace un chat NUEVO. Sólo se aplica al crear: un modo ya
     *  elegido por el usuario nunca se pisa (ver más abajo). Default 'draft'
     *  = comportamiento histórico de Fanvue, que no pasa este campo. */
    defaultMode?: AgentChatMode
```

Línea 202: `mode: input.isCreator ? 'off' : 'draft',` → `mode: input.isCreator ? 'off' : (input.defaultMode ?? 'draft'),`

Importa `AgentChatMode` desde `./db` si no está ya.

- [ ] **Step 2: El webhook dispara el pipeline dentro de `after()`**

Imports: añade

```ts
import { after } from 'next/server'
import { generateDraftReply } from '@/lib/agent/draftPipeline'
import { maybeAutopilotSend } from '@/lib/agent/autopilot'
import { shouldDraftTelegramReply } from '@/lib/telegram/aiGate'
```

`handleMessage` pasa a:

```ts
/** Sólo chats privados, y nunca si el emisor es un bot (evita eco/spam). */
async function handleMessage(settings: TelegramSettings, message: TgMessage): Promise<void> {
    if (message.chat.type !== 'private') return
    if (message.from?.is_bot) return

    const target = await resolveAvatarTargetById(settings.avatarId)
    if (!target) return

    const fanUuid = String(message.chat.id)
    const fanDisplayName =
        [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ') || null
    const fanHandle = message.from?.username ?? null
    const sentAt = new Date(message.date * 1000).toISOString()
    const text = message.text ?? message.caption ?? null

    const chat = await upsertChat({
        target,
        platform: 'telegram',
        fanUuid,
        fanDisplayName,
        fanHandle,
        lastMessageAt: sentAt,
        lastFanMessageAt: sentAt,
        // Spec A3-bis: los chats nuevos de Telegram nacen en el modo que el
        // creador eligió para el canal. Los existentes conservan el suyo.
        defaultMode: settings.aiDefaultChatMode,
    })
    const { inserted } = await ingestMessage({
        organizationId: target.organizationId,
        chatId: chat.id,
        direction: 'in',
        externalMessageId: String(message.message_id),
        text,
        externalCreatedAt: sentAt,
    })
    await touchFanMemory(target, fanUuid, fanDisplayName, 'telegram')

    // Gate del CANAL (aiGate.ts, spec A3-bis): independiente de
    // avatar_personas.enabled, que es el interruptor de Fanvue.
    const wantsDraft = shouldDraftTelegramReply({
        aiRepliesEnabled: settings.aiRepliesEnabled,
        chatMode: chat.mode,
        isCreator: chat.is_creator,
        text,
        inserted,
    })
    if (!wantsDraft) return

    // El LLM tarda 10-20 s y Telegram reintenta si no ve el 200 a tiempo:
    // el borrador se genera DESPUÉS de responder. `after()` mantiene viva la
    // función en Vercel hasta que esto termine (Next 15.5, estable).
    after(async () => {
        try {
            const draft = await generateDraftReply(chat.id)
            if (draft && chat.mode === 'auto') {
                await maybeAutopilotSend(chat.id, draft.messageId)
            }
        } catch (e) {
            console.error('[telegram webhook] borrador/autopilot', e)
        }
    })
}
```

Verifica que la ruta exporta `maxDuration` ≥ 60 (spec A3); si no, añade `export const maxDuration = 60`.

- [ ] **Step 3: Candados**

Run: `npx tsc --noEmit && npm run lint && npm run check:tenant && npm test`
Expected: limpio; tests 172.

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/inboxSync.ts "src/app/api/webhooks/telegram/[avatarId]/route.ts"
git commit -m "feat(telegram): el webhook genera el borrador tras responder y lo programa si el chat esta en auto"
```

---

### Task 6: Un barrido de envíos cada minuto

**Files:**
- Create: `src/app/api/cron/agent-autopilot-flush/route.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `flushDueAutopilotMessages(): Promise<{ sent: number; failed: number }>` (`autopilot.ts:158`).

- [ ] **Step 1: El cron**

```ts
/**
 * GET /api/cron/agent-autopilot-flush
 *
 * Envía los mensajes de autopilot cuyo retardo humano ya venció. Es el
 * MISMO flush que corre al final de `agent-inbox-poll`, sacado a su propio
 * cron porque aquél pasa cada 5 minutos: para Fanvue vale, pero un fan de
 * Telegram que espera cinco minutos más el retardo cree que el bot está
 * roto. Idempotente: `flushDueAutopilotMessages` sólo toca filas
 * `approved` con `send_after` vencido, y `sendAgentMessage` sólo actúa
 * sobre `approved` — dos crones pisándose no envían dos veces.
 *
 * Gated by CRON_SECRET (Bearer), same as the other crons.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { flushDueAutopilotMessages } from '@/lib/agent/autopilot'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
    const secret = process.env.CRON_SECRET
    const authHeader = request.headers.get('authorization')
    if (secret && authHeader !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const flushed = await flushDueAutopilotMessages()
    return NextResponse.json({ autoSent: flushed.sent, autoFailed: flushed.failed })
}
```

- [ ] **Step 2: `vercel.json`**

Añade dentro de `"crons"`:

```json
        {
            "path": "/api/cron/agent-autopilot-flush",
            "schedule": "* * * * *"
        },
```

- [ ] **Step 3: Confirmar que el middleware exime `/api/cron/`** con `grep -n "api/cron" src/middleware.ts`. Si no lo exime, parar y anotarlo en el informe: el resto de crones funcionan, así que debería.

- [ ] **Step 4: Candados y commit**

Run: `npx tsc --noEmit && npm run lint && npm run check:tenant && npm test`

```bash
git add src/app/api/cron/agent-autopilot-flush/route.ts vercel.json
git commit -m "feat(agente): barrido de envios de autopilot cada minuto, para que Telegram no espere cinco"
```

---

### Task 7: Los tres interruptores en la pantalla del bot

**Files:**
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/telegram/[slug]/_components/TelegramConnectionPanel.tsx`

**Interfaces:**
- Consumes: `updateTelegramAiSettings` (T1), `TelegramBotStatus` con los tres campos (T1), `onStatusChange` (prop existente).

- [ ] **Step 1: Comprobar los componentes ECME disponibles**

`ls src/components/ui/ | grep -i "switcher\|segment\|select"`. Usa `Switcher` para los booleanos y `Segment` (o `Select` si no hay `Segment`) para el modo. Mira cómo `AutopilotCard.tsx` usa `Switcher` y copia la forma.

- [ ] **Step 2: Nueva Card, sólo cuando el bot está conectado**

Después de la Card "Webhook status" y antes del `<ConfirmDialog>`, añade:

```tsx
            {status?.connected && (
                <Card>
                    <p className="text-sm font-semibold mb-1">AI on Telegram</p>
                    <p className="text-xs text-gray-500 mb-4">
                        This switch is independent from &quot;Agent enabled&quot; on the AI Agent page,
                        which only gates the Fanvue inbox. Turn the AI on here and off there to reply
                        on Telegram only.
                    </p>

                    <div className="flex items-center justify-between gap-3 mb-4">
                        <div>
                            <p className="text-sm">AI replies</p>
                            <p className="text-xs text-gray-400">
                                The persona drafts a reply to every fan message that arrives through
                                the bot.
                            </p>
                        </div>
                        <Switcher
                            checked={status.aiRepliesEnabled}
                            isLoading={savingAi === 'aiRepliesEnabled'}
                            onChange={(checked) => saveAi({ aiRepliesEnabled: checked })}
                        />
                    </div>

                    <div className="mb-4">
                        <p className="text-sm mb-1">New chats start in</p>
                        <p className="text-xs text-gray-400 mb-2">
                            Auto sends by itself after the risk check and Autopilot rules (schedule,
                            delays, daily limit). Draft leaves a reply for you to approve. Existing
                            chats keep their own mode — change it from the inbox.
                        </p>
                        <Segment
                            value={status.aiDefaultChatMode}
                            onChange={(val) => saveAi({ aiDefaultChatMode: val as 'auto' | 'draft' })}
                        >
                            <Segment.Item value="auto">Auto</Segment.Item>
                            <Segment.Item value="draft">Draft</Segment.Item>
                        </Segment>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-sm">Let the AI offer paid content</p>
                            <p className="text-xs text-gray-400">
                                When the conversation warms up, the AI may attach an item from your
                                gallery. Sales closed this way count as AI sales.
                            </p>
                        </div>
                        <Switcher
                            checked={status.aiOffersEnabled}
                            isLoading={savingAi === 'aiOffersEnabled'}
                            onChange={(checked) => saveAi({ aiOffersEnabled: checked })}
                        />
                    </div>
                </Card>
            )}
```

Estado y handler, junto a los demás `useState`:

```tsx
    const [savingAi, setSavingAi] = useState<keyof TelegramAiSettingsPatch | null>(null)

    const saveAi = async (patch: TelegramAiSettingsPatch) => {
        const key = Object.keys(patch)[0] as keyof TelegramAiSettingsPatch
        setSavingAi(key)
        try {
            const result = await updateTelegramAiSettings(avatarId, patch)
            if (result.success && result.data) {
                onStatusChange(result.data)
            } else {
                toast.push(
                    <Notification type="danger" title="Could not save AI settings">
                        {result.success ? 'Empty response.' : result.error}
                    </Notification>,
                )
            }
        } finally {
            setSavingAi(null)
        }
    }
```

Importa `Switcher`, `Segment`, `updateTelegramAiSettings` y `type TelegramAiSettingsPatch`. Si la API real de `Segment` difiere (p.ej. `onChange` devuelve array o usa `selectionType`), adapta al componente real, no al snippet.

- [ ] **Step 3: Candados y commit**

Run: `npx tsc --noEmit && npm run lint && npm run check:tenant && npm test`

```bash
git add "src/app/(protected-pages)/concepts/avatar-forge/telegram/[slug]/_components/TelegramConnectionPanel.tsx"
git commit -m "feat(telegram): interruptores de IA por canal en la pantalla del bot"
```

- [ ] **Step 4: VERIFICACIÓN MANUAL (usuario, en producción tras desplegar T1-T7)**

Con "Agent enabled" en OFF en AI Agent y "AI replies" en ON aquí, con modo Auto y Autopilot ON: escribir al bot desde una segunda cuenta. Esperado: en 1-4 minutos (retardo humano + cron), respuesta en personaje. Con modo Draft: aparece un borrador en el inbox y no se envía solo.

---

### Task 8: El motor de oferta decide y adjunta

**Files:**
- Create: `src/lib/telegram/offerGate.ts` (+ test)
- Create: `src/lib/telegram/offerEngine.ts`
- Modify: `src/lib/agent/autopilot.ts` (`AutopilotConfig` 16-23 y `maybeAutopilotSend` tras cargar `cfg`)
- Modify: `src/app/api/webhooks/telegram/[avatarId]/route.ts` (dentro del `after()` de T5)
- Modify: `scripts/check-tenant-access.mjs`

**Interfaces:**
- Produces: `PaidMediaOffer = { type: 'paid_media_offer'; itemId: string; stars: number; caption: string }` (forma del elemento en `agent_messages.media`); `maybeAttachPaidMediaOffer(draftMessageId: string): Promise<'attached' | 'skipped'>`; `AutopilotConfig.allowPaidMediaOffers?: boolean`, `.maxOfferStars?: number`, `.offerCooldownHours?: number`; `filterOfferCandidates`, `isOfferOnCooldown`, `hasPaidMediaOffer` (puras).

- [ ] **Step 1: Tests de las decisiones puras (fallan)**

`src/lib/telegram/offerGate.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterOfferCandidates, hasPaidMediaOffer, isOfferOnCooldown } from './offerGate.ts'

const items = [
    { id: 'a', title: 'A', stars: 50 },
    { id: 'b', title: 'B', stars: 500 },
    { id: 'c', title: 'C', stars: 99 },
]

test('sin tope ni compras, todos son candidatos', () => {
    assert.deepEqual(filterOfferCandidates(items, { maxOfferStars: undefined, purchasedItemIds: [] }).map((i) => i.id), ['a', 'b', 'c'])
})

test('el tope de Stars descarta lo caro', () => {
    assert.deepEqual(filterOfferCandidates(items, { maxOfferStars: 100, purchasedItemIds: [] }).map((i) => i.id), ['a', 'c'])
})

test('lo ya comprado por este fan no se vuelve a ofrecer', () => {
    assert.deepEqual(filterOfferCandidates(items, { maxOfferStars: undefined, purchasedItemIds: ['a'] }).map((i) => i.id), ['b', 'c'])
})

test('sin oferta previa no hay enfriamiento', () => {
    assert.equal(isOfferOnCooldown(null, Date.parse('2026-09-14T12:00:00Z'), 6), false)
})

test('dentro de la ventana, enfriando', () => {
    assert.equal(isOfferOnCooldown('2026-09-14T08:00:00Z', Date.parse('2026-09-14T12:00:00Z'), 6), true)
})

test('pasada la ventana, libre', () => {
    assert.equal(isOfferOnCooldown('2026-09-14T05:00:00Z', Date.parse('2026-09-14T12:00:00Z'), 6), false)
})

test('detecta una oferta dentro de media aunque venga con otras cosas', () => {
    assert.equal(hasPaidMediaOffer([{ type: 'image' }, { type: 'paid_media_offer', itemId: 'x', stars: 1, caption: '' }]), true)
    assert.equal(hasPaidMediaOffer([{ type: 'image' }]), false)
    assert.equal(hasPaidMediaOffer(null), false)
    assert.equal(hasPaidMediaOffer('garbage'), false)
})
```

- [ ] **Step 2: Implementar `offerGate.ts`**

```ts
/**
 * Decisiones puras del motor de oferta. Sin imports, con test.
 *
 * Lo que decide el modelo (¿ofrecer ahora? ¿cuál?) vive en offerEngine.ts;
 * lo que decide la aritmética (qué es candidato, si estamos enfriando, si
 * un borrador ya lleva oferta) vive aquí, donde se puede probar sin red.
 */
export interface OfferCandidate {
    id: string
    title: string
    stars: number
}

export interface PaidMediaOffer {
    type: 'paid_media_offer'
    itemId: string
    stars: number
    caption: string
}

export function filterOfferCandidates(
    items: OfferCandidate[],
    opts: { maxOfferStars: number | undefined; purchasedItemIds: string[] },
): OfferCandidate[] {
    const bought = new Set(opts.purchasedItemIds)
    return items.filter((i) => {
        if (bought.has(i.id)) return false
        if (opts.maxOfferStars !== undefined && opts.maxOfferStars > 0 && i.stars > opts.maxOfferStars) return false
        return true
    })
}

/** `lastOfferAt` ISO o null; `nowMs` epoch ms; `cooldownHours` > 0. */
export function isOfferOnCooldown(lastOfferAt: string | null, nowMs: number, cooldownHours: number): boolean {
    if (!lastOfferAt) return false
    const last = Date.parse(lastOfferAt)
    if (!Number.isFinite(last)) return false
    return nowMs - last < cooldownHours * 3_600_000
}

export function hasPaidMediaOffer(media: unknown): media is PaidMediaOffer[] {
    return Array.isArray(media) && media.some((m) => m && typeof m === 'object' && (m as { type?: string }).type === 'paid_media_offer')
}

export function findPaidMediaOffer(media: unknown): PaidMediaOffer | null {
    if (!Array.isArray(media)) return null
    const hit = media.find((m) => m && typeof m === 'object' && (m as { type?: string }).type === 'paid_media_offer')
    return (hit as PaidMediaOffer | undefined) ?? null
}
```

Run: `npx --yes tsx --test src/lib/telegram/offerGate.test.ts` → 7 pasando.

- [ ] **Step 3: `AutopilotConfig` gana tres campos**

En `autopilot.ts` (16-23), después de `escalate?:`:

```ts
    /** Telegram: si un borrador con oferta de contenido de pago puede salir
     *  solo. false/undefined = escala a humano (ofrecer es vender). */
    allowPaidMediaOffers?: boolean
    /** Telegram: tope de Stars que la IA puede ofrecer por sí sola. */
    maxOfferStars?: number
    /** Telegram: horas mínimas entre dos ofertas al mismo fan. Default 6. */
    offerCooldownHours?: number
```

- [ ] **Step 4: `offerEngine.ts`**

```ts
/**
 * Motor de oferta (spec A4): decide si un borrador recién generado debe
 * llevar adjunto contenido de pago, y cuál. NO envía nada: sólo escribe la
 * oferta en `agent_messages.media`. Quien envía es `sendAgentMessage`, que
 * tras entregar el texto entrega la media pagada con `source: 'agent'` —
 * la única forma de producir una venta `sold_by = ai` (20%).
 *
 * Gates, en orden y todos fallando cerrado:
 *   1. el chat es de Telegram y `ai_offers_enabled` está encendido;
 *   2. hay catálogo habilitado, filtrado por `maxOfferStars` y sin lo que
 *      este fan ya compró;
 *   3. no estamos en enfriamiento (`offerCooldownHours`, default 6);
 *   4. el modelo dice que sí, con un índice válido.
 * Si cualquier cosa falla (JSON roto, índice fuera de rango, error de red)
 * no se ofrece y se loguea: una oferta mal puesta es dinero mal cobrado.
 *
 * F4.2 Tarea 4 — EXENTO de `orgTable`: lo llama el webhook, sin sesión.
 * Todo cuelga de `chat.organization_id` de la fila resuelta.
 */
import { generateText } from 'ai'
import { agentSupabase } from '@/lib/agent/db'
import { getChatModel } from '@/lib/agent/chatProvider'
import { parseAutopilot } from '@/lib/agent/autopilot'
import { loadTelegramSettings } from '@/lib/telegram/settings'
import { filterOfferCandidates, findPaidMediaOffer, isOfferOnCooldown, type PaidMediaOffer } from './offerGate'

const DEFAULT_COOLDOWN_HOURS = 6

export async function maybeAttachPaidMediaOffer(draftMessageId: string): Promise<'attached' | 'skipped'> {
    const supabase = agentSupabase()
    try {
        const { data: draft } = await supabase
            .from('agent_messages')
            .select('id, organization_id, chat_id, text, media')
            .eq('id', draftMessageId)
            .maybeSingle()
        if (!draft || findPaidMediaOffer(draft.media)) return 'skipped'

        const { data: chat } = await supabase
            .from('agent_chats')
            .select('id, organization_id, avatar_id, platform, external_chat_id')
            .eq('organization_id', draft.organization_id)
            .eq('id', draft.chat_id)
            .maybeSingle()
        if (!chat || !chat.platform.startsWith('telegram')) return 'skipped'

        const settings = await loadTelegramSettings(chat.avatar_id)
        if (!settings?.aiOffersEnabled) return 'skipped'

        const { data: persona } = await supabase
            .from('avatar_personas')
            .select('*')
            .eq('organization_id', chat.organization_id)
            .eq('avatar_id', chat.avatar_id)
            .maybeSingle()
        if (!persona) return 'skipped'
        const cfg = parseAutopilot(persona as never)

        // Enfriamiento: última oferta a ESTE chat.
        const { data: recentOut } = await supabase
            .from('agent_messages')
            .select('media, created_at')
            .eq('organization_id', chat.organization_id)
            .eq('chat_id', chat.id)
            .eq('direction', 'out')
            .order('created_at', { ascending: false })
            .limit(20)
        const lastOffer = (recentOut ?? []).find((m) => findPaidMediaOffer(m.media))
        if (isOfferOnCooldown(lastOffer?.created_at ?? null, Date.now(), cfg.offerCooldownHours ?? DEFAULT_COOLDOWN_HOURS)) {
            return 'skipped'
        }

        // Catálogo menos lo ya comprado por este fan.
        const { data: items } = await supabase
            .from('telegram_paid_media_items')
            .select('id, title, star_price')
            .eq('organization_id', chat.organization_id)
            .eq('avatar_id', chat.avatar_id)
            .eq('enabled', true)
            .limit(50)
        const { data: bought } = await supabase
            .from('telegram_stars_sales')
            .select('item_id')
            .eq('organization_id', chat.organization_id)
            .eq('chat_id', chat.id)
            .eq('status', 'purchased')
        const candidates = filterOfferCandidates(
            (items ?? []).map((i) => ({ id: i.id, title: i.title, stars: i.star_price })),
            {
                maxOfferStars: cfg.maxOfferStars,
                purchasedItemIds: (bought ?? []).map((b) => b.item_id).filter((x): x is string => Boolean(x)),
            },
        )
        if (candidates.length === 0) return 'skipped'

        // Últimos mensajes para que el modelo juzgue el momento.
        const { data: recent } = await supabase
            .from('agent_messages')
            .select('direction, text')
            .eq('organization_id', chat.organization_id)
            .eq('chat_id', chat.id)
            .not('text', 'is', null)
            .order('created_at', { ascending: false })
            .limit(8)
        const transcript = (recent ?? [])
            .reverse()
            .map((m) => `${m.direction === 'in' ? 'FAN' : 'ME'}: ${m.text}`)
            .join('\n')
        const catalog = candidates.map((c, i) => `${i}. ${c.title} — ${c.stars} Stars`).join('\n')

        const prompt = `You decide whether NOW is a good moment to offer paid content in a private Telegram chat between a creator and a fan.

CONVERSATION (oldest first):
${transcript}

MY DRAFT REPLY (about to be sent):
${draft.text ?? ''}

CATALOG (index. title — price):
${catalog}

Rules: offer only if the fan shows interest, warmth or asks for more; never on a first hello, a complaint or a sensitive topic. Pick the ONE item that best fits the conversation. The caption is one short teasing sentence in the fan's language, no price (the price is shown by Telegram).

Answer with JSON only: {"shouldOffer": boolean, "index": number, "caption": string}`

        const { text } = await generateText({
            model: getChatModel({ provider: persona.chat_provider, model: persona.chat_model }),
            prompt,
            temperature: 0.2,
        })
        const parsed = JSON.parse(text.trim().replace(/^```json\s*|```$/g, '')) as {
            shouldOffer?: boolean
            index?: number
            caption?: string
        }
        if (!parsed.shouldOffer) return 'skipped'
        const idx = Number(parsed.index)
        if (!Number.isInteger(idx) || idx < 0 || idx >= candidates.length) return 'skipped'
        const pick = candidates[idx]

        const offer: PaidMediaOffer = {
            type: 'paid_media_offer',
            itemId: pick.id,
            stars: pick.stars,
            caption: (parsed.caption ?? '').trim().slice(0, 1024),
        }
        const existing = Array.isArray(draft.media) ? draft.media : []
        await supabase
            .from('agent_messages')
            .update({ media: [...existing, offer] as never, updated_at: new Date().toISOString() })
            .eq('organization_id', draft.organization_id)
            .eq('id', draft.id)
            .eq('status', 'draft')
        return 'attached'
    } catch (e) {
        console.error('[telegram offer] maybeAttachPaidMediaOffer', e)
        return 'skipped'
    }
}
```

Ajusta los nombres reales de columnas de `avatar_personas` (`chat_provider`/`chat_model` o como se llamen: míralo en `draftPipeline.ts`, que ya llama a `getChatModel`) y la forma exacta de `getChatModel` y `parseAutopilot` (ambos existen; cópiales la llamada desde `draftPipeline.ts` y `autopilot.ts`). Si `parseAutopilot` no es export, expórtalo.

- [ ] **Step 5: El webhook llama al motor**

En el `after()` de T5, entre `generateDraftReply` y `maybeAutopilotSend`:

```ts
            const draft = await generateDraftReply(chat.id)
            if (!draft) return
            if (settings.aiOffersEnabled) {
                await maybeAttachPaidMediaOffer(draft.messageId)
            }
            if (chat.mode === 'auto') {
                await maybeAutopilotSend(chat.id, draft.messageId)
            }
```

Importa `maybeAttachPaidMediaOffer` desde `@/lib/telegram/offerEngine`.

- [ ] **Step 6: Autopilot escala si hay oferta y no está permitido**

En `maybeAutopilotSend`, justo después de `if (!cfg.enabled) return 'skipped'`:

```ts
    // Spec A4: un borrador con oferta de contenido de pago sólo sale solo si
    // el creador lo permitió expresamente. Ofrecer es vender.
    const { data: draftRow } = await supabase
        .from('agent_messages')
        .select('media')
        .eq('organization_id', chat.organization_id)
        .eq('id', draftMessageId)
        .maybeSingle()
    if (hasPaidMediaOffer(draftRow?.media) && !cfg.allowPaidMediaOffers) {
        return escalate(chat.organization_id, chatId, 'Paid media offer needs approval')
    }
```

Importa `hasPaidMediaOffer` desde `@/lib/telegram/offerGate`.

- [ ] **Step 7: Justificar `offerEngine.ts` en `check:tenant`** con el mismo formato de T3 y motivo "F4.2 Tarea 4 — lo llama el webhook de Telegram sin sesión; todo cuelga de chat.organization_id".

- [ ] **Step 8: Candados y commit**

Run: `npx tsc --noEmit && npm run lint && npm run check:tenant && npm test`
Expected: tests 172 + 7 = 179.

```bash
git add src/lib/telegram/offerGate.ts src/lib/telegram/offerGate.test.ts src/lib/telegram/offerEngine.ts src/lib/agent/autopilot.ts "src/app/api/webhooks/telegram/[avatarId]/route.ts" scripts/check-tenant-access.mjs
git commit -m "feat(telegram): motor de oferta — la IA adjunta contenido de pago al borrador cuando toca"
```

---

### Task 9: Enviar el texto y, detrás, la media pagada (la venta `ai`)

**Files:**
- Modify: `src/lib/agent/sendMessage.ts` (tras el `update` a `sent`)

**Interfaces:**
- Consumes: `deliverPaidMedia({ chat, itemId, stars, caption, source: 'agent', approvedBy })` (`paidMedia.ts:208`), `findPaidMediaOffer` (T8), `resolveDeliveryChannel` (T3).

- [ ] **Step 1: Entregar la oferta después del texto**

En `sendAgentMessage`, dentro del `try`, después del `update` que pone `status: 'sent'` y antes de los contadores:

```ts
        // Oferta adjunta (offerEngine, Telegram): se entrega DESPUÉS del texto
        // y con `source: 'agent'`, que es lo que `deliverPaidMedia` convierte
        // en `sold_by = 'ai'` (comisión del 20%). Si falla, el texto ya salió
        // y el mensaje ya es `sent`: se loguea y no se marca `failed`, porque
        // el fan sí recibió la respuesta. La venta no se crea (la crea
        // deliverPaidMedia al ofrecer), así que no queda nada descuadrado.
        const offer = findPaidMediaOffer(msg.media)
        if (offer && resolveDeliveryChannel(chat.platform) === 'telegram') {
            try {
                await deliverPaidMedia({
                    chat: {
                        id: chat.id,
                        organizationId: chat.organization_id,
                        avatarId: chat.avatar_id,
                        externalChatId: chat.external_chat_id,
                    },
                    itemId: offer.itemId,
                    stars: offer.stars,
                    caption: offer.caption || undefined,
                    source: 'agent',
                    approvedBy: msg.approved_by ?? null,
                })
            } catch (e) {
                console.error('[agent] oferta adjunta no entregada', { messageId, itemId: offer.itemId }, e)
            }
        }
```

Imports: `import { deliverPaidMedia } from '@/lib/telegram/paidMedia'`, `import { findPaidMediaOffer } from '@/lib/telegram/offerGate'`, `import { resolveDeliveryChannel } from './channelRouting'`.

Comprueba que `deliverPaidMedia` no exige nada más en `DeliverPaidMediaInput` (líneas 75-96) y que `stars` respeta su validación (1-25000: el catálogo ya lo garantiza).

- [ ] **Step 2: Candados y commit**

Run: `npx tsc --noEmit && npm run lint && npm run check:tenant && npm test`

```bash
git add src/lib/agent/sendMessage.ts
git commit -m "feat(telegram): tras el texto, el agente entrega la oferta adjunta como venta de IA"
```

---

### Task 10: Verlo en el inbox, ajustarlo en Autopilot, y la guía de verificación

**Files:**
- Modify: `src/services/AgentInboxService.ts` (`AgentMessageDTO` 66-76, `toMessageDTO`, `AgentChatListItem`, nueva acción `removeDraftOffer`)
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/inbox/_components/ThreadPane.tsx`
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/agent/[slug]/_components/AutopilotCard.tsx`
- Modify: `docs/superpowers/VERIFICACION-MANUAL-telegram.md`

**Interfaces:**
- Produces: `AgentMessageDTO.media: unknown`, `AgentMessageDTO.paidOffer: { itemId: string; stars: number; caption: string } | null`; `AgentChatListItem.platform: string`; `removeDraftOffer(messageId): Promise<InboxResult<AgentMessageDTO>>`.

- [ ] **Step 1: DTOs**

`AgentMessageDTO` gana:

```ts
    /** Oferta de contenido de pago adjunta (Telegram, offerEngine). Null si no hay. */
    paidOffer: { itemId: string; stars: number; caption: string } | null
```

y `toMessageDTO` la rellena con `findPaidMediaOffer(row.media)` (import desde `@/lib/telegram/offerGate`), mapeando a `{ itemId, stars, caption }`. `AgentChatListItem` gana `platform: string` (desde `row.platform`).

- [ ] **Step 2: Quitar la oferta de un borrador**

Nueva acción en `AgentInboxService.ts`, con el mismo patrón que las demás (`getOrgContext`, `orgTable`):

```ts
/** Quita la oferta adjunta a un borrador sin tocar el texto. Sólo borradores. */
export async function removeDraftOffer(messageId: string): Promise<InboxResult<AgentMessageDTO>> {
    try {
        const ctx = await getOrgContext()
        const { data: msg } = await orgTable(ctx, 'agent_messages').select('*').eq('id', messageId).maybeSingle()
        if (!msg) return { success: false, error: 'Message not found' }
        if (msg.status !== 'draft') return { success: false, error: 'Only drafts can be edited' }
        const media = Array.isArray(msg.media) ? msg.media.filter((m: { type?: string }) => m?.type !== 'paid_media_offer') : []
        const { data: updated, error } = await orgTable(ctx, 'agent_messages')
            .update({ media: media as never, updated_at: new Date().toISOString() })
            .eq('id', messageId)
            .select('*')
            .single()
        if (error) throw new Error(error.message)
        return { success: true, data: toMessageDTO(updated as AgentMessageRow) }
    } catch (e) {
        return fail(e)
    }
}
```

(Si `fail` en este fichero sigue sin loguear, dale el mismo tratamiento que hoy en `AgentTelegramService.ts`: `fail('removeDraftOffer', e)` con `console.error`. Si eso obliga a tocar las otras llamadas, hazlo: son mecánicas.)

- [ ] **Step 3: ThreadPane muestra la oferta**

En el render de cada mensaje saliente, si `message.paidOffer`:

```tsx
{message.paidOffer && (
    <div className="mt-1 flex items-center gap-2 text-xs">
        <Tag className="bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-100 border-0">
            ⭐ Paid offer · {message.paidOffer.stars} Stars
        </Tag>
        {message.status === 'draft' && (
            <Button size="xs" variant="plain" onClick={() => handleRemoveOffer(message.id)}>
                Remove offer
            </Button>
        )}
    </div>
)}
```

con `handleRemoveOffer` llamando a `removeDraftOffer` y refrescando el mensaje como hacen las demás acciones del panel (mira cómo actualiza tras `approveAndSend`). En la lista de chats (donde se pinta cada `AgentChatListItem`), un `Tag` pequeño con `Telegram` cuando `platform.startsWith('telegram')`; para Fanvue no se pinta nada (hoy no lo hace y no se cambia).

- [ ] **Step 4: AutopilotCard**

Tres controles nuevos bajo el límite diario, con el mismo estilo que `delaySecondsMin`/`dailyMessageLimit` (líneas 37-53 muestran cómo se leen y guardan): `Switcher` "Allow paid offers on autopilot" → `allowPaidMediaOffers`; `Input type="number"` "Max Stars the AI may offer" → `maxOfferStars`; `Input type="number"` "Hours between offers" → `offerCooldownHours` (placeholder 6). Etiqueta de sección: "Telegram offers". Se guardan por el mismo botón "Save autopilot".

- [ ] **Step 5: Guía de verificación**

Añade a `docs/superpowers/VERIFICACION-MANUAL-telegram.md` una sección "9. El agente contesta y vende" con estos pasos, en este orden: (a) AI Agent → "Agent enabled" OFF; (b) Telegram → bot → "AI replies" ON, modo Auto, "Let the AI offer" ON; (c) Autopilot ON con "Allow paid offers" ON y tope 100; (d) desde la segunda cuenta: `/start` → esperar saludo (≤ 4 min); (e) tres mensajes cálidos ("me encantas", "quiero ver más"…) → esperar respuesta con foto de pago detrás; (f) comprobar en SQL: `select sold_by, source, status from telegram_stars_sales order by offered_at desc limit 1` → `ai`, `agent`, `offered`; (g) comprar → `purchased` y, si la org no está exenta, asiento `commission:telegram` al 20%.

- [ ] **Step 6: Candados y commit**

Run: `npx tsc --noEmit && npm run lint && npm run check:tenant && npm test`
Expected: 179 tests. `grep -n "^export" src/services/AgentInboxService.ts` sin exports síncronos nuevos.

```bash
git add src/services/AgentInboxService.ts "src/app/(protected-pages)/concepts/avatar-forge/inbox/_components/ThreadPane.tsx" "src/app/(protected-pages)/concepts/avatar-forge/agent/[slug]/_components/AutopilotCard.tsx" docs/superpowers/VERIFICACION-MANUAL-telegram.md
git commit -m "feat(agente): la oferta se ve y se quita en el inbox, se ajusta en Autopilot, y la guia cubre la venta por IA"
```

---

## Self-review

**Spec coverage.** A3 `message` → T5 (gate + draft + autopilot; `/start` lo resuelve el prompt de T4, no un texto sintético). A3-bis → T1 + T5 (`defaultMode`) + T7. A4 `channelDelivery` → T3. A4 `sendMessage` con oferta → T9. A4 `inboxSync` → T5 (`defaultMode`; `platform` ya existía). A4 `draftPipeline`/`promptBuilder` → T4 (sin `telegram_business` en la unión: fuera de alcance, y el reparto por prefijo ya lo contempla). A4 oferta IA → T8 con el gate de autopilot; `maxOfferStars`/`offerCooldownHours`/`allowPaidMediaOffers` → T8 + T10. A4 `AgentInboxService` DTOs → T10. Fuera y dicho: Business, guiones, broadcasts, `sendChatAction`, takeover, `telegram_blocked`, gracias automático tras compra (A3, `purchased_paid_media`) — **ese último no está en este plan**; queda anotado para el siguiente.

**Placeholders.** Ninguno: cada paso lleva el código. Los puntos donde el implementador debe mirar el código real están dichos explícitamente (nombres de columnas de `avatar_personas`, API de `Segment`, `TgMessage.message_id`).

**Type consistency.** `PaidMediaOffer` se define en T8 y lo consumen T9 y T10 por la misma importación. `DeliverableChat` (T3) recibe la fila de `agent_chats` que `sendAgentMessage` ya carga con `select('*')`. `TelegramBotStatus` (T1) alimenta T7. `AutopilotConfig` (T8) alimenta T8 y T10. `resolveDeliveryChannel` (T3) lo usa T9. `hasPaidMediaOffer`/`findPaidMediaOffer` (T8) los usan T8, T9 y T10.

**Riesgo principal y su red.** T3 toca el envío de Fanvue en producción. La rama de Fanvue es el bloque original movido sin cambios, y la verificación manual de T3 Step 8 es obligatoria antes de seguir.
