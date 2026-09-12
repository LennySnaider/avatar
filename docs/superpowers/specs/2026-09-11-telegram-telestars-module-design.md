# Módulo Telegram "Telestars" instalable en Prime Avatar

> Estado: APROBADO por Lenny el 2026-09-11 (plan mode). Dos sub-proyectos (B: módulos instalables + cobro; A: canal Telegram) con contrato explícito entre ambos y orden global de 16 fases al final.

## Contexto

Lenny quiere replicar literalmente https://telestars.io/ dentro de Prime Avatar como un **módulo instalable** por organización, con precio (cuota mensual y/o comisión) aún por definir.

Telestars = "The sales platform for Telegram": el creador conecta su bot, vende fotos/videos en **Telegram Stars**, un chatbot IA con su persona vende 24/7, inbox unificado, welcome DM, scripts/automations, broadcasts, estadísticas, equipo. Cobra **$/bot/mes** (Free $0 / Starter $29.90 / Pro $59.90) + **comisión** sobre cada venta (IA 20/15/10 %, manual 7/5/2.5 %) descontada de un wallet prepagado. Punto clave: usa **"Secretary Mode"** = Telegram Business: el fan escribe al PERFIL personal del creador, el bot conectado lee y responde en su nombre.

### Estado real del repo (verificado)
- **No existe ningún código de Telegram** (0 refs en repo, ramas, git log, agentsoft). Existe un plan vigente del 16-ago (`~/.claude/plans/que-te-parece-hacer-transient-kay.md`) para Telegram como **segundo canal del Agente IA** (bot directo por avatar, webhook, `channelDelivery.ts`). Sigue válido y es la base; no cubre Business mode, Stars, scripts, broadcasts ni cobro.
- Pipeline del agente (persona + RAG + classifier + autopilot + inbox con drafts) completo pero **cableado a Fanvue en duro**: `src/lib/agent/sendMessage.ts:46-67`, `inboxSync.ts` (literal `'fanvue'`), `draftPipeline.ts`, `AgentInboxService.ts:261`. `agent_chats` y `avatar_fan_memories` **ya tienen columna `platform`** en sus unique.
- Billing: `org_wallets` + `token_ledger` (hold/settle/refund/credit, idempotency_key) + `plan_configurations` en DB; **measure-only** (`ENFORCE_LIMITS` apagado), **sin pasarela** (Stripe = ruta 1 decidida en `docs/SUPER-PLAN.md §5.6`). `plan_configurations` no se lee desde código.
- **No existe concepto de módulo/entitlement por org.** `authority` sólo oculta menú (RBAC del middleware comentado). Autorización real = `getOrgContext()` + filtro `organization_id`.

### Decisiones tomadas con el usuario (11-sep)
1. **Bot por creador/avatar** (token de BotFather). Las Stars caen en el bot del creador; nunca custodiamos dinero.
2. **Alcance v1 completo**: Secretary Mode (Telegram Business) + venta de media en Stars (PPV) + Welcome DM y scripts/automations + Broadcasts y estadísticas.
3. **Cobro**: catálogo configurable (cuota/bot/mes + comisión IA % + comisión manual %), asientos en `token_ledger`, **medir sin bloquear** hasta que existan `ENFORCE_LIMITS` y Stripe.
4. **Instalación por organización, cobro por bot conectado** (`org_modules`); nav/rutas/server actions gateadas por módulo.

### Hechos de la API de Telegram verificados en doc oficial
- Business: el usuario conecta el bot en Ajustes → Telegram Business → Chatbots (el bot necesita Business Mode en BotFather). No requiere Premium. **Un solo bot por cuenta.**
- Updates: `business_connection` (BusinessConnection {id, user, user_chat_id, date, is_enabled, rights}), `business_message`, `edited_business_message`, `deleted_business_messages`. El bot **recibe también los mensajes salientes del dueño** (`from.id === connection.user.id`) → permite pausar la IA cuando el humano responde.
- `BusinessBotRights.can_reply`: sólo chats con mensajes entrantes en las últimas 24 h.
- `sendPaidMedia`: `business_connection_id?`, `star_count` 1–25.000, hasta 10 media, `payload` 0–128 bytes invisible, caption ≤1024. Stars → balance del **bot** (salvo canal).
- `purchased_paid_media` (PaidMediaPurchased {from, paid_media_payload}) = evento de venta, sólo con payload no vacío y en chats no-canal. Va en `allowed_updates`.
- Stars: XTR, `provider_token` vacío, `pre_checkout_query` en 10 s, `refundStarPayment`, `getStarTransactions`. Retiro por Fragment con **21 días** de hold, lo hace el creador.
- Riesgo de negocio: Prime Avatar genera NSFW; los ToS de Stars que leímos no explicitan contenido adulto; Telestars lo vende abiertamente a creadores OF. Registrado, no bloqueante.

## Diseño

Dos sub-proyectos con un contrato entre ellos. Se implementan en este orden: **B (módulos + cobro) primero** porque es pequeño, no depende de Telegram y deja el gate listo; luego **A (canal Telegram)** por fases.

---

## Sub-proyecto B — Módulos instalables + cobro

### B1. Schema (migración `supabase/migrations/20260911120000_org_modules.sql`, aplicar vía MCP `apply_migration`)
- **`module_catalog`** (global, no tenant): `slug pk, name, description, price_usd_month_per_unit numeric, unit check('bot','avatar','org'), commission_ai_pct, commission_manual_pct, is_public, sort_order`. Seed `telegram` = **$29.90/bot/mes, 15 % IA, 5 % manual** (tier Starter de Telestars; un solo precio configurable, sin columna `tier` — los tiers futuros serán filas nuevas). Editable sólo por SQL/MCP en v1.
- **`org_modules`** (tenant → añadir a `TENANT_TABLES` en `src/lib/org/orgTable.ts`): `organization_id, module_slug fk, status check('installed','suspended','uninstalled'), installed_at, uninstalled_at, installed_by text, settings jsonb, unique(organization_id, module_slug)`. Nunca se borra la fila (historial); reinstalar = upsert.
- **`token_ledger.kind` gana `'charge'`** + función `wallet_charge(p_org, p_user, p_tokens, p_sku, p_ref_type, p_ref_id, p_idempotency_key, p_cost_usd, p_metadata, p_enforce default false)`: débito instantáneo en una sola fila (tokens negativo), orden included→purchased igual que `wallet_hold`, sin tocar `held_balance`, replay idempotente por `(org, idempotency_key)`, y si no alcanza el saldo en measure-only asienta igual y anota `measure_only_shortfall` en metadata. Descartados: `settle` sin hold (rompe la semántica de devolución), `adjust` (mezcla soporte con facturación), hold+settle (2 filas y ruido en `held_balance`).
- Índice `token_ledger (organization_id, sku, created_at desc)`.
- Convención de asientos: comisión → `sku 'commission:telegram'`, `ref_type 'stars_sale'`, `ref_id saleId`, `idempotency_key 'stars_sale:<saleId>'`, metadata `{stars, sold_by, pct, star_usd, gross_usd, avatar_id}`. Cuota → `sku 'module_fee:telegram'`, `ref_id 'telegram:YYYY-MM'`, `idempotency_key 'module_fee:telegram:YYYY-MM'`, metadata `{period, unit, units, price_per_unit}`. `cost_usd` null (no hay proveedor).

### B2. Entitlements — `src/lib/modules/entitlements.ts` (lib, no 'use server')
`listOrgModules(ctx)`, `hasModule(ctx, slug)` (status === 'installed'), `requireModule(ctx, slug)` (lanza `ModuleNotInstalledError` con mensaje legible), y sin sesión para cron/webhooks `hasModuleForOrg(orgId, slug)` / `listInstalledSlugsForOrg(orgId)` (con `React.cache`). Nunca `getOrgContextForUser` (resuelve la primera membresía, no la org de la fila). `src/lib/modules/catalog.ts`: `getModuleCatalog()`, `getModuleDefinition(slug)` leyendo BD. Exenciones ESLint / `scripts/check-tenant-access.mjs` con motivo.

### B3. Gate de UI
- `meta.requiredModule` en `src/@types/navigation.ts` y `src/@types/routes.tsx`.
- `src/server/actions/navigation/getNavigation.ts`: `tryGetOrgContext()` → `listInstalledSlugsForOrg` → `filterNavigationByModules(tree, installed)` (puro, en `src/lib/modules/navigation.ts`; elimina COLLAPSE vacíos). Devuelve `{tree, installedModules}`; `NavigationContext` expone `installedModules` → hook `useInstalledModules()` + `src/components/shared/ModuleCheck.tsx` (análogo a `AuthorityCheck`).
- Entrada por URL sin módulo: `src/app/(protected-pages)/concepts/avatar-forge/telegram/layout.tsx` (server) → `hasModule` o pinta `ModuleNotInstalled` (card del catálogo + botón a Módulos; si `suspended`, aviso de saldo). Sin 404. El RBAC del middleware sigue comentado; no se toca.
- Tras instalar/desinstalar: `revalidatePath('/', 'layout')` + `router.refresh()`.

### B4. Página Módulos — `/concepts/account/modules`
`page.tsx` server (catálogo + instalados + `getWalletBalance`) → `ModulesClient.tsx`: `Card` por módulo (precio/unidad, comisiones, `Tag` de estado, botón Instalar/Desinstalar deshabilitado si no es owner/admin, `ConfirmDialog` danger al desinstalar, `toast` ECME). `Alert` superior: "sin pasarela: instalar activa el módulo y registra cuotas/comisiones en tu wallet como medición". `src/services/ModulesService.ts` ('use server'): `listModules`, `installModule(slug)`, `uninstallModule(slug)`, `getBillingOverview()`; ownership `ctx.role in ('owner','admin')`, `orgUpsert` sobre `(organization_id, module_slug)`. Instalar NO asienta nada (la cuota la asienta el cron sólo con bots activos). Ruta en `conceptsRoute.ts`, entrada en `UserProfileDropdown` (icono `PiPuzzlePieceDuotone`).

### B5. Cobro
- `src/lib/billing/catalog.ts`: `STAR_USD = 0.013` (payout a desarrollador por Star; fuente doc Stars/Fragment; se guarda por asiento para revalorar), `starsToUsd`, `usdToTokens` (ceil, **sin** `COST_MARGIN`: una comisión ya es precio), `MODULE_SKU`.
- `src/lib/billing/wallet.ts`: `chargeTokens({organizationId, userId?, tokens, sku, refType, refId, idempotencyKey, metadata})` → rpc `wallet_charge`.
- `src/lib/billing/moduleCharges.ts`: `settleStarsCommission({organizationId, saleId, avatarId, stars, soldBy, userId?})` → pct según `sold_by` del catálogo → USD → tokens → `chargeTokens` (0 tokens = no asienta). **Nunca lanza**; loguea y devuelve `ledgerId:null`.
- `src/lib/billing/moduleFees.ts`: `chargeModuleFees(period)` → por `org_modules installed` × catálogo → `units = UNIT_COUNTERS[unit][slug](orgId)` (`bot.telegram = countActiveTelegramBots`, del sub-proyecto A) → `chargeTokens` idempotente por `(módulo, YYYY-MM UTC)`. Cron `src/app/api/cron/module-fees/route.ts` (calco de `billing-holds-sweep`, `CRON_SECRET`), `vercel.json` `23 3 * * *` diario (idempotencia = cobra una vez al mes; sin prorrateo: un bot conectado a mitad de mes paga el mes siguiente).
- Stripe futuro no cambia nada: sólo añade recargas (`wallet_credit`/`wallet_start_period`) y un cron `billing-lifecycle` que pone `org_modules.status='suspended'` con saldo negativo y `ENFORCE_LIMITS`.

### B6. Visibilidad
`src/lib/billing/moduleSummary.ts` `getModuleBillingSummary(ctx, slug, period?)` → `{activeUnits, pricePerUnit, estimatedFeeUsd, feeChargedTokens, commissionsTokens, commissionsUsd, salesCount, entries}`. Componente server `ModuleBillingSummary.tsx` (3 Cards + Table de asientos) embebido en la página del módulo Telegram y en `SettingsBilling.tsx` (mantener el Alert, añadir saldo + bloque por módulo vía `getBillingOverview`).

### B7. Tipos
Tras la migración: `npm run db:types` (o MCP `generate_typescript_types`) → `org_modules`/`module_catalog`/`wallet_charge` tipados. Quitar los casts de `wallet.ts` = fase opcional aparte.

### Contrato A↔B (firmado por ambos agentes)
```ts
// A implementa en src/lib/telegram/sales.ts
recordStarsSale({ organizationId, avatarId, chatId, stars, soldBy:'ai'|'manual', payload, telegramUserId, telegramPaymentChargeId, soldByUserId? })
  → insert telegram_stars_sales (unique telegram_payment_charge_id → si existe, return sin comisionar)
  → settleStarsCommission({...})   // B
  → update sale: commission_pct, commission_usd, commission_tokens, star_usd, commission_ledger_id, commission_settled_at
// A implementa countActiveTelegramBots(orgId) en src/lib/telegram/bots.ts (status='active')
```

### Riesgos B
- Seed $29.90 llevará el wallet a negativo en measure-only: intencional, avisado en la UI (alternativa: sembrar Free $0/20 %/7 % y subir por SQL cuando exista Stripe).
- `STAR_USD` = payout (~0.013), no lo que paga el fan (~0.02). Se guarda por asiento.
- No auto-instalar `telegram` en la org default por migración (instalar desde UI deja auditoría real).
- `database.generated.ts` está desalineado: revisar el diff de la regeneración.

---

## Sub-proyecto A — Canal Telegram (Telestars)

Extiende el plan del 16-ago sin reescribirlo. **Se mantiene tal cual**: `avatar_telegram_settings` (token nunca en `avatar_personas` ni en DTOs), `src/lib/telegram/client.ts` fetch puro, `src/lib/agent/channelDelivery.ts` + refactor de `sendMessage.ts:46-67`, generalización de `platform` en `inboxSync.ts` / `draftPipeline.ts` / `promptBuilder.ts`, webhook con `X-Telegram-Bot-Api-Secret-Token`, `AgentTelegramService.ts`, `TelegramChatCard.tsx`. **No se tocan**: `classifier.ts`, `retrieval.ts`, `chatProvider.ts`, `approveAndSend`.

Hechos adicionales verificados: `purchased_paid_media` trae SOLO `{from, paid_media_payload}` (sin chat_id) → la fila de venta se crea en la OFERTA y `payload = sale.id`. `file_id` es por bot y no transferible. 429 devuelve `retry_after`. Next 15.5 tiene `after()` estable. Vercel: `agent-inbox-poll` ya corre `*/5` → el proyecto ya está en plan que permite crons frecuentes.

### A1. Schema (4 migraciones, una por fase; todas con `organization_id` + RLS sin policies + alta en `TENANT_TABLES`; tipos a mano en `src/lib/agent/db.ts` como `AgentChatsTable`)
- **`avatar_telegram_settings`** (plan previo +): `bot_id bigint unique`, `direct_enabled`, `business_connection_id`, `business_user_id`, `business_user_chat_id`, `business_rights jsonb`, `business_is_enabled`, `business_connected_at/disconnected_at`, `welcome_enabled`, `welcome_message`, `takeover_pause_minutes default 30`, `ai_offers_enabled`, `thanks_after_purchase_enabled default true`, `thanks_message text` (null = lo genera la IA en personaje), `last_update_at`, `last_error`. `countActiveTelegramBots(orgId)` (contrato B) = `count(*) where organization_id=? and enabled=true`.
- **`agent_chats`** +`telegram_business_connection_id text`, `human_takeover_until timestamptz`, `telegram_blocked boolean default false`; índice `(avatar_id, platform)`. **`platform` gana `'telegram'` (bot directo) y `'telegram_business'`** (Secretary): el mismo fan puede escribir a @bot y al perfil, y `chat.id == user.id` en ambos → dos valores evitan colisionar el unique `(avatar_id, platform, external_chat_id)` sin tocarlo. `human_takeover_until` en vez de `mode='off'` porque `upsertChat` promete no pisar el modo elegido. Chats Business arrancan en **`draft`** (decisión).
- **`avatar_fan_memories`** se guarda con `platform='telegram'` para ambos (misma persona): helper `fanMemoryPlatform()` en `inboxSync.ts` usado por `touchFanMemory`, `draftPipeline.ts` y `AgentInboxService.ts:261`.
- **`telegram_webhook_events (avatar_id, update_id) pk`** — idempotencia de updates sin `external_message_id` (compras, conexiones, callbacks). Tabla técnica, sin `organization_id`, no va en `TENANT_TABLES`; el cron la poda a 7 días.
- **`telegram_paid_media_items`**: `avatar_id, generation_id?, storage_path, storage_provider, media_kind check(photo,video), title, caption, star_price check 1..25000, tags[], enabled, sort_order, telegram_file_id, telegram_file_id_bot_id, offers_count, sales_count, stars_total`; unique parcial `(avatar_id, generation_id)`.
- **`telegram_stars_sales`**: `avatar_id, chat_id fk agent_chats, item_id?, agent_message_id?, payload text unique (= id), telegram_user_id bigint, telegram_message_id, stars, sold_by check(ai,manual), source check(inbox,agent,script,broadcast), status check(offered,purchased,refunded), offered_at, purchased_at, refunded_at, reconciled_at, transaction_id, business_connection_id` **+ columnas de comisión (contrato B)**: `commission_pct, commission_usd, commission_tokens, star_usd, commission_ledger_id fk token_ledger, commission_settled_at`. Idempotencia de compra = transición atómica `update … set status='purchased' where id=? and status='offered'` (0 filas → no comisionar). (Se elimina del contrato el `telegram_payment_charge_id unique` que B había supuesto: la compra de paid media no trae charge id; el ledger ya es idempotente por `stars_sale:<saleId>`.)
- **`telegram_scripts`** (`trigger check(start,first_message,keyword,manual)`, `keyword`, `channel check(direct,business,both)`, `enabled`, `stop_on_reply`, `once_per_chat`, `steps jsonb[]` = `{kind:'text'|'paid_media', delay_seconds, text?, item_id?, caption?, star_price?, buttons?[{label, action:'next'|'item:<uuid>'|'url:<https>'}]}`) + **`telegram_script_runs`** (`script_id, chat_id, status check(running,paused,done,cancelled,failed), current_step, next_run_at, paused_reason, last_error`; unique `(script_id, chat_id)`; índice parcial por `next_run_at` en running).
- **`telegram_broadcasts`** (`channel, audience jsonb {segment:'all'|'buyers'|'non_buyers'|'active_7d'}, content jsonb {kind:'text',text}|{kind:'paid_media',item_id,caption?,star_price?}, status check(draft,scheduled,running,done,cancelled,failed), scheduled_at, total/sent/failed/skipped`) + **`telegram_broadcast_deliveries`** (`broadcast_id, chat_id, status check(pending,sent,failed,skipped), attempts, next_attempt_at, error, skip_reason, telegram_message_id, sale_id?`; unique `(broadcast_id, chat_id)`).
- `avatar_personas.autopilot` jsonb (sin migración) gana `allowPaidMediaOffers?` (default false → escala), `maxOfferStars?`, `offerCooldownHours?` (default 6) en `AutopilotConfig` de `src/lib/agent/autopilot.ts:16-23` y `AutopilotCard.tsx`.

### A2. Cliente — `src/lib/telegram/client.ts`
`TelegramApiError {method, code, description, retryAfter?}`; transportes JSON y multipart (`FormData` + `Blob`); opción `test` → `/test/METHOD`. Métodos: `getMe`, `setWebhook` (con `allowed_updates: ['message','edited_message','callback_query','business_connection','business_message','edited_business_message','deleted_business_messages','purchased_paid_media']`), `deleteWebhook`, `getWebhookInfo`, `sendMessage`, `sendChatAction`, `sendPhoto`, `sendVideo`, `sendPaidMedia` (`media[]` con `file_id` | `attach://name` + `files`), `answerCallbackQuery`, `editMessageReplyMarkup`, `getBusinessConnection`, `readBusinessMessage`, `getMyStarBalance`, `getStarTransactions`, `refundStarPayment`, `answerPreCheckoutQuery` (reservado). Todos aceptan `business_connection_id`. `src/lib/telegram/settings.ts`: `loadTelegramSettings(avatarId)` (service-role, para webhook/cron/delivery) y `loadTelegramSettingsForOrg(ctx, avatarId)`; ninguno expone el token en DTOs.

### A3. Webhook — `src/app/api/webhooks/telegram/[avatarId]/route.ts` (`force-dynamic`, `maxDuration 60`; middleware ya exime `/api/webhooks/`)
1. Settings por `avatarId`; sin fila o `!enabled` → 200 silencioso. 2. Secret header con `timingSafeEqual` → 401. 3. JSON malformado → 200. 4. Idempotencia: insert en `telegram_webhook_events`, duplicado → 200. 5. Trabajo dentro de `after()` de `next/server` (responder <1 s; el draft LLM tarda 10-20 s); fallback en línea como Fanvue si diera problemas. 6. try/catch → log + `settings.last_error`.

Handlers en `src/lib/telegram/webhookHandlers.ts`:
- `message`: ignorar si no `private`, `from.is_bot` o `!direct_enabled`. `upsertChat(platform:'telegram', fanUuid=String(chat.id))` → `ingestMessage('in')` (sin texto: `text=null` + `media:[{type}]`, se ingiere pero no se draftea) → `afterInbound`. `/start` → welcome + scripts `trigger='start'` + respuesta inmediata en personaje (`approved_by:'system'`).
- `business_connection`: upsert campos Business en settings (o `disconnected_at` si `!is_enabled`); DM de confirmación al creador por `user_chat_id` con sus derechos.
- `business_message`: rechazar si el `business_connection_id` no es el vigente o `!business_is_enabled`. **`from.id === business_user_id`** → si ya existe `agent_messages.external_message_id` para ese `message_id` es el ECO de nuestro envío (nada); si no, **takeover humano**: `ingestMessage('out', approved_by:'human_telegram')`, `human_takeover_until = now()+takeover_pause_minutes`, borrar draft pendiente, pausar runs (`human_takeover`). Carrera eco-antes-de-guardar: guardar `external_message_id` justo tras `sendX` y tolerancia 5 s. Si no es el dueño: `upsertChat(platform:'telegram_business')` + set `telegram_business_connection_id` + `ingestMessage('in')` + `afterInbound`; chat nuevo → welcome + scripts `first_message`.
- `edited_*` → actualizar texto best-effort; `deleted_business_messages` → `status='discarded'`.
- `purchased_paid_media` → transición atómica `offered→purchased` por `payload` → `recordStarsSale(event)` (§A6) → contadores del ítem, `avatar_fan_memories.spend_total += stars` → **gracias automático** (decisión): `thanks_message` fijo si existe, si no draft en personaje auto-aprobado (`approved_by:'system'`) vía `deliverAgentText`. Payload desconocido → log + 200.
- `callback_query`: `data = 's:<runId>:<stepIdx>:<action>'` (≤64 bytes); verificar `from.id` = fan del chat; `next` avanza el run; `item:<uuid>` → `deliverPaidMedia(source:'script')`; siempre `answerCallbackQuery`.

`afterInbound(chat, text, settings)`: `touchFanMemory` → pausar runs con `stop_on_reply` (`fan_replied`) → keyword match → gate IA `inserted && text && mode!=='off' && personaEnabled && !(human_takeover_until>now) && !is_creator` → `generateDraftReply` → `maybeAttachPaidMediaOffer` → si `auto` → `maybeAutopilotSend`. Business en `auto`: `sendChatAction('typing')` antes.

### A4. Pipeline (cambios mínimos)
- `channelDelivery.ts` `deliverAgentText(chat, text)`: `'telegram'` → `sendMessage`; `'telegram_business'` → exige `business_is_enabled` + connection id, y si `last_fan_message_at < now()-24h` lanza `'Outside the 24h Business reply window'` (queda `failed` legible); 403 blocked → `telegram_blocked=true` + rethrow; default → bloque Fanvue actual sin cambios.
- `sendMessage.ts`: L54-68 → `deliverAgentText`; después, si `msg.media` tiene `{type:'paid_media_offer', itemId, stars, caption}` y `platform.startsWith('telegram')` → `deliverPaidMedia(soldBy:'ai', source:'agent')`. Así inbox y flush de autopilot mandan texto + media pagada sin código nuevo.
- `inboxSync.ts`: `upsertChat`/`touchFanMemory` con `platform?` (default `'fanvue'`), `resolveAvatarTargetById(avatarId)`, `fanMemoryPlatform()`, `ingestMessage` con `media?` y `approvedBy?`.
- `draftPipeline.ts`: `.eq('platform', fanMemoryPlatform(chat.platform))` (L91, L216, L226), `channel: chat.platform` (L105). `promptBuilder.ts`: `channel` union `'playground'|'fanvue'|'telegram'|'telegram_business'`; cláusulas: Telegram = mensajería corta y `/start` cálido; Business = "contestas desde la cuenta personal del creador, no menciones bots"; catálogo = "tienes contenido exclusivo de pago; provoca interés, no inventes precios" con input `paidCatalog?: {title, stars}[]`.
- **Oferta IA** — `src/lib/telegram/offerEngine.ts` `maybeAttachPaidMediaOffer(chat, draft, lastFanText)`: gates (`ai_offers_enabled`, catálogo con ítems, cooldown `offerCooldownHours`, no re-ofrecer comprado) → Gemini utility con `responseSchema {shouldOffer, index, caption}` sobre el catálogo (molde `suggestPpvOffer` en `AgentInboxService.ts:655-775`); precio SIEMPRE del catálogo (`maxOfferStars` filtra) → `agent_messages.media = [{type:'paid_media_offer', …}]`. **Única modificación a `autopilot.ts`**: en `maybeAutopilotSend`, draft con oferta y `!allowPaidMediaOffers` → `escalate('Paid media offer needs approval')`.
- **Entrega** — `src/lib/telegram/paidMedia.ts` `deliverPaidMedia({chat, itemId, stars?, caption?, soldBy, source, approvedBy})`: insert venta `offered` (`payload=id`) → media por `file_id` cacheado (si `telegram_file_id_bot_id === bot_id`) o **multipart** con `getMediaObject` de `src/lib/mediaStore.ts:205` (`attach://file0`) y cachear `file_id` de la respuesta → `sendPaidMedia` con `business_connection_id` si aplica, `protect_content=true` → `agent_messages out sent` con `media:[{type:'paid_media', itemId, stars, saleId}]` → `offers_count++`. **Multipart y no URL**: límites verificados URL 5/20 MB vs multipart 10/50 MB (vídeos Kling/Veo superan 20 MB), y por URL el objeto tendría que ser público. Al añadir a la galería se valida tamaño (>10 MB foto / >50 MB vídeo → rechazo con mensaje).
- `src/lib/telegram/salesHook.ts` — **contrato A↔B definitivo** (sustituye la firma preliminar):
  ```ts
  export interface StarsSaleEvent { saleId; organizationId; avatarId; chatId; itemId: string|null; stars; soldBy:'ai'|'manual'; source:'inbox'|'agent'|'script'|'broadcast'; telegramUserId: number; payload; purchasedAt; businessConnectionId: string|null }
  export async function recordStarsSale(e: StarsSaleEvent): Promise<void>
  // 1) increment_agent_counter 'stars_sold' (delta=stars) y 'stars_sales'; contadores del ítem; spend_total
  // 2) settleStarsCommission({organizationId, saleId, avatarId, stars, soldBy}) (B) → update venta con commission_* y commission_ledger_id
  ```
  Regla `sold_by`: `source in ('agent','script') → 'ai'`; `'inbox' | 'broadcast' → 'manual'`.
- `AgentInboxService.ts`: `AgentChatListItem` + `platform`, `humanTakeoverUntil`; `AgentMessageDTO` + `media`; guards Fanvue-only en `approveAndSendVoiceNote`, `suggestPpvOffer`, `sendPpvOffer`, `syncFanvueInbox`.

### A5. Welcome + scripts + broadcasts — cron `src/app/api/cron/telegram-runner/route.ts` (`* * * * *`, `CRON_SECRET`, `maxDuration 120`)
No se reusa el flush de autopilot: los pasos con media pagada, botones, `stop_on_reply` y takeover no caben en `agent_messages` sin contaminar la semántica de "draft aprobado" y el contador `auto_sent`. Un runner con `next_run_at` es la misma cola en otra tabla y sirve también para broadcasts y poda de `telegram_webhook_events`.
- Welcome: síncrono en el webhook (`/start` directo, o primer `business_message`) con `approved_by:'welcome'`; luego `startScriptRun` de scripts `start`/`first_message` del canal.
- `src/lib/telegram/scriptRunner.ts`: `startScriptRun` (respeta `once_per_chat`), `runDueScriptSteps(limit 100)` (recarga chat/settings; takeover → pausa; blocked → cancela; `text` → `deliverAgentText` + `reply_markup`, `approved_by:'script:<id>'`; `paid_media` → `deliverPaidMedia(source:'script')`; 429 → `next_run_at=now()+retry_after`; otros → `failed`), `pauseRunsForChat(chatId, reason)`, `resumeScriptRun` manual.
- `src/lib/telegram/broadcastRunner.ts`: encolado (audiencia por `platform` según `channel`, `!is_creator`, `!telegram_blocked`, `mode!='off'`, segmento; Business sólo `last_fan_message_at >= now()-24h`, el resto insertado ya como `skipped/outside_24h`) → ejecución por chunks de ≤400 con token bucket **20 msg/s por bot** (verificado ~30/s global, 1/s por chat) y corte a ~90 s; 429 → `retry_after` y parar el chunk de ese bot; 403/400 chat not found → `skipped/blocked` + `telegram_blocked`; 3 intentos → `failed`; sin pendientes → `done`. Cancelar → pendientes `skipped/cancelled`.

### A6. Estadísticas — `getTelegramStats(avatarId, range)` en `AgentTelegramService.ts`
Desde `telegram_stars_sales` + ítems: Stars vendidas, nº ventas, ticket medio, serie diaria, conversión `purchased/offered` (global, por `source`, por ítem), IA vs manual, top ítems, top fans, broadcasts (sent/failed/skipped + Stars por `sale_id`), contadores `agent_usage_counters` (`messages_sent`, `auto_sent`, `stars_sold`, `stars_sales`). **Payout informativo**: `getMyStarBalance` + texto fijo ("las Stars caen en el balance de tu bot; se retiran en Fragment con la cuenta dueña del bot; Telegram retiene 21 días; Prime Avatar no custodia fondos"), sólo en Stars, sin tipo de cambio inventado. Fuera de v1 (decisión): reembolso desde UI y conciliación con `getStarTransactions` (el schema ya deja `reconciled_at`/`transaction_id`/`refunded`).

### A7. UI (sólo `@/components/ui`; `ConfirmDialog`/`Dialog`/`toast` ECME)
- Nav: `avatarForge.telegram` → `/concepts/avatar-forge/telegram` con `meta.requiredModule:'telegram'` (gate B), icono en `navigation-icon.config.tsx`, claves `nav.avatarForge.telegram*` en `messages/{en,es,ar,zh}.json`. Rutas en `conceptsRoute.ts`: índice + `[slug]` (`dynamicRoute: true`, molde `avatar-studio/[slug]`). `telegram/layout.tsx` = gate de módulo (B3).
- `telegram/page.tsx`: índice de avatares con estado (bot / Business / Stars 30d). `telegram/[slug]/_components/TelegramView.tsx` con `Tabs`: **Conexión** (`ConnectBotCard`: token password → conectar; `@username`, `getWebhookInfo`, toggles, welcome, takeover minutos, gracias-tras-compra; `BusinessSetupGuide`: BotFather → Bot Settings → Business Mode → Enable; Telegram → Ajustes → Telegram Business → Chatbots → @bot → "Reply to messages" (+ "Read messages"); "no requiere Premium; un bot por cuenta"; polling 5 s a `getTelegramStatus` hasta `businessConnected`, derechos como `Tag`s, aviso si falta `can_reply`; desconectar con `ConfirmDialog`), **Galería** (`PaidMediaGallery`: grid con thumb vía `getRowMediaUrl`, título, Stars, ventas; "Añadir desde generaciones" en `Dialog` con selector estilo `KnowledgeManager` + precio + título + caption; aviso de tamaño), **Scripts** (`ScriptsManager`: lista + editor en `Drawer`; runs recientes), **Broadcasts** (`BroadcastsManager`: crear con preview de audiencia "N chats; M excluidos por ventana 24h", lanzar con `ConfirmDialog`, progreso por polling), **Estadísticas** (`TelegramStatsPanel`: KPIs, top ítems, ventas recientes, tarjeta payout + balance del bot, `ModuleBillingSummary` de B6).
- Modificados: `AgentView.tsx:49-59` (+`TelegramChatCard` bajo `FanvueChatCard`), `AutopilotCard.tsx` (ofertas en autopilot, `maxOfferStars`, cooldown), `InboxView.tsx:150-170` (`Tag` Telegram / TG Business / Fanvue; badge "Humano al mando"), `ThreadPane.tsx` (en chats Telegram: ocultar voice-note y Suggest PPV; "⭐ Enviar media pagada" → `Dialog` galería + Stars + caption → `sendPaidMediaFromInbox`; "✨ Sugerir oferta" → `suggestTelegramOffer`; "Lanzar script"; chip de oferta adjunta en el draft con quitar; burbujas `paid_media` con candado + Stars + estado; etiqueta "Creador (Telegram)" en `human_telegram`; aviso amarillo de takeover con "Reanudar IA").
- `AgentTelegramService.ts` ('use server', todos async, `getOrgContext` + `orgTable`, ownership como `setAvatarFanvueCreator`:460-490): `connectTelegramBot`, `disconnectTelegramBot`, `getTelegramStatus`, `updateTelegramSettings`, `getTelegramWebhookInfo`, `listPaidMediaItems`, `upsertPaidMediaItem`, `deletePaidMediaItem`, `sendPaidMediaFromInbox`, `suggestTelegramOffer`, `removeDraftOffer`, `clearHumanTakeover`, `listScripts`, `upsertScript`, `deleteScript`, `startScriptManually`, `listScriptRuns`, `pauseScriptRun`, `resumeScriptRun`, `listBroadcasts`, `createBroadcast`, `launchBroadcast`, `cancelBroadcast`, `previewBroadcastAudience`, `getTelegramStats`, `getBotStarBalance`. Todas llaman `requireModule(ctx,'telegram')` (B2).

### Riesgos A
1. **Contenido adulto**: ToS de Stars no lo explicitan; Telestars lo vende a creadores OF. Mitigación: `protect_content`, nada en canales/grupos, respetar `nsfw_level`. Riesgo de negocio registrado.
2. **`purchased_paid_media` en chats Business**: la doc es coherente ("non-channel chat" → bot balance) pero se **verifica en F6** con compra real de 1 Star; fallback: conciliación por `getStarTransactions` (payload).
3. Un solo bot Business por cuenta de Telegram → un creador con varios avatares sólo da Secretary Mode a uno. Documentar en la guía.
4. Ventana 24 h de `can_reply` en Business: scripts/broadcasts fuera de ventana quedan `skipped` con motivo visible.
5. Sin sandbox de Stars: e2e de compra en prod con ítems de 1 Star y `refundStarPayment` manual.
6. Multipart ≤50 MB pasa por memoria de la función (igual que `uploadGenerationMedia` de Fanvue). Fotos PNG se recomprimen como `photo` (no existe `document` en `InputPaidMedia`).
7. 429 global por bot: un broadcast grande puede hacer fallar envíos del autopilot en ese minuto (quedan `failed`, comportamiento actual). Aceptable en v1.
8. Suscripciones en Stars quedan fuera: encajarían con `createInvoiceLink({currency:'XTR', subscription_period: 2592000})` + `successful_payment` + `pre_checkout_query` <10 s, y `recordStarsSale` ganaría `kind`.

---

## Orden global de implementación

| # | Fase | Sub | Verificación |
|---|---|---|---|
| 1 | Migración `org_modules` + `module_catalog` + kind `charge` + `wallet_charge`; `db:types` | B1/B7 | `execute_sql`: seed telegram; `wallet_charge` ok → replay → tokens −10; restaurar. `tsc` limpio |
| 2 | Entitlements + catálogo + exenciones ESLint/`check:tenant` | B2 | `lint`, `check:tenant`, `tsc` |
| 3 | `ModulesService` + página `/concepts/account/modules` + `ModuleNotInstalled` | B4 | instalar como owner → fila; reinstalar; operator bloqueado |
| 4 | Gate nav (`getNavigation` filtro, `ModuleCheck`, `telegram/layout.tsx` + placeholder) | B3 | sin módulo: ítem oculto y URL muestra "Instalar"; con módulo aparece |
| 5 | Cobro: `STAR_USD`, `chargeTokens`, `settleStarsCommission`, `chargeModuleFees`, cron `module-fees` | B5 | `curl` cron → `charged:0`; con bot activo → `charged:1`, replay; 100 Stars IA → 195 tokens, replay |
| 6 | Migración A-1 (settings, `agent_chats` cols, `webhook_events`) + `client.ts` | A1/A2 | `getMe` con token real desde script en scratchpad |
| 7 | `channelDelivery` + refactor `sendMessage` | A4 | **Regresión Fanvue en prod**: aprobar draft real → `sent` |
| 8 | Generalización `inboxSync`/`draftPipeline`/`promptBuilder`/`AgentInboxService` | A4 | webhook Fanvue sigue drafteando; memoria intacta |
| 9 | Webhook (`message`), connect/disconnect/status, `ConnectBotCard`, `TelegramChatCard`, nav/rutas/i18n | A3/A7 | túnel `cloudflared` + `NEXT_PUBLIC_APP_URL`; `getWebhookInfo` sin error; `/start` saluda; draft con badge → aprobar → llega; auto → cron; sticker → 200 |
| 10 | Business: handlers, takeover, `BusinessSetupGuide`, ventana 24 h | A3 | Business Mode en BotFather; conectar en Chatbots; UI muestra derechos; fan escribe al perfil → chat `telegram_business` → aprobar → recibe desde la cuenta del creador; creador escribe → takeover; eco no dispara takeover |
| 11 | Migración A-2 (ítems, ventas + columnas comisión), `paidMedia.ts`, `salesHook.ts`, handler compra + gracias, galería, botón en ThreadPane, `allowed_updates` | A4/A6 + B5 | ítem 1 Star → enviar → comprar con cuenta real → `purchased`, comisión en ledger (`commission:telegram`), gracias en personaje; 2º envío usa `file_id`; repetir por Business + `getMyStarBalance` antes/después; refund manual |
| 12 | `offerEngine`, gate autopilot, cláusulas prompt, chip en draft, `AutopilotCard` | A4 | "quiero ver más" → draft con oferta → texto + paid media; autopilot sin permiso → escalado |
| 13 | Migración A-3 (scripts, runs), `scriptRunner`, cron `telegram-runner`, welcome, `ScriptsManager`, `callback_query` | A5 | script 3 pasos → welcome inmediato, pasos a su minuto; responder → `paused/fan_replied`; botón inline avanza |
| 14 | Migración A-4 (broadcasts), `broadcastRunner`, `BroadcastsManager` | A5 | 3 directos + 1 business fuera de 24 h → 3 sent, 1 skipped; paid media → ventas `broadcast`; bloqueo → `telegram_blocked` |
| 15 | Stats + payout + `ModuleBillingSummary` + `SettingsBilling` | A6/B6 | KPIs cuadran con `select`; cifras de módulo cuadran con `sum(tokens) group by sku` |
| 16 | Pulido: i18n paridad, `tsc` + `eslint` + `check:tenant`, `get_advisors`, re-`setWebhook` en prod | — | todo verde; prod: reconectar bot y `/start` |

Reglas transversales: migraciones por MCP `apply_migration` (nunca `db push`); nunca `npm run build` con dev encendido; commits sin firma de Claude; al arrancar la implementación, copiar este diseño a `docs/superpowers/specs/2026-09-11-telegram-telestars-module-design.md` en el repo (el skill de brainstorming lo pide y en plan mode no se puede escribir en el repo).

## Fuera de v1 (registrado)
Reembolso desde UI, conciliación `getStarTransactions`, suscripciones en Stars, tiers múltiples del módulo, UI de edición de `module_catalog` (`is_platform_admin`), cron `billing-lifecycle` que suspende módulos, team management de Telestars (ya existe `organization_members`).
