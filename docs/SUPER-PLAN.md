# SUPER PLAN — Prime Avatar (AvatarLab): Agente IA por Avatar + Plataforma Multi-tenant de Agencias

> **Última revisión: 2026-07-15.** Fases 0-3 HECHAS y verificadas en código. Fanvue
> RECONECTADO en prod (2026-07-15) y los 3 P0s de seguridad heredados CERRADOS (abajo).
> Siguiente: validar producto (F2/F3 en prod) → Fase 4 (multitenant).
> Este doc es la fuente de verdad portable del plan (las notas de sesión de Claude son locales
> por máquina; esto viaja con el repo).

---

## 📍 ESTADO ACTUAL (2026-07-22)

| Fase | Entregable | Estado |
|---|---|---|
| 0 | Orgs tenant-ready (`organizations` + `getOrgContext`) | ✅ HECHA |
| 1 | Persona + RAG pgvector + Playground por avatar | ✅ HECHA |
| 2 | Inbox Fanvue con borradores aprobables + memoria por fan | ✅ HECHA |
| 3 | Autopilot + voice notes + PPV + métricas | ✅ HECHA (mass messages diferido) |
| 4 | Multitenant core | 🔄 EN CURSO — 4.0/4.1 ✅ en prod; 4.2 en curso (a/b/d ✅, c 🟡, e/f/g 🔴) |
| 5 | Billing + límites | ⬜ |
| 5.5 | Meta Direct Publishing | ⬜ |
| 6 | Agencia (dashboard earnings, white-label, plantillas) | ⬜ |

**Evidencia F0-F3 en código:** migraciones `20260711090000_organizations` /
`...100000_agent_persona_rag` / `...160000_agent_inbox` / `...180000_agent_autopilot`;
`src/lib/tenant/getOrgContext.ts`; `src/lib/agent/` (embeddings, retrieval, promptBuilder,
chatProvider, classifier fail-closed, autopilot, draftPipeline, inboxSync, sendMessage);
`AgentService` / `AgentInboxService` (incl. `approveAndSendVoiceNote`, `suggestPpvOffer`/
`sendPpvOffer`, `getAgentMetrics`); `/api/agent/chat`; UI `concepts/avatar-forge/agent/[slug]`
+ `concepts/avatar-forge/inbox`; cron `agent-inbox-poll` cada 5 min en `vercel.json`.
Webhook Fanvue migrado a eventos `creator.*` (metadata-only, firma `X-Fanvue-Signature`).

---

## ✅ BLOQUEO OPERATIVO CERRADO — Fanvue reconectado en prod (2026-07-15)

Las keys del app habían cambiado → `refresh_token` atado al client viejo → `invalid_grant`.
Resuelto: scopes + redirect URIs configurados en el app "PrimeAvatar" (client id
`435aac03-3c64-48c1-ab30-7e1ab7521992`), env vars `FANVUE_CLIENT_ID` /
`FANVUE_CLIENT_SECRET` / `FANVUE_REDIRECT_URI` en Vercel, redeploy y "Reconnect agency"
desde el deploy. F2/F3 quedan operativos en prod → empieza la validación de producto.

Verificar pendientes de entorno (Vercel) si algo falla: `FANVUE_WEBHOOK_SECRET`,
`CRON_SECRET`, `OPENROUTER_API_KEY`, `APIFY_TOKEN`.

---

## ✅ P0s DE SEGURIDAD CERRADOS (2026-07-15, commit f8adfb5)

Los 3 P0s heredados que el plan tenía para F4.0/4.2/4.5 se adelantaron y están CERRADOS:

- **(a) Cliente anon del browser**: los 8 componentes ya no tocan Supabase con la anon key.
  Storage reads → signed URLs server-side (`getSignedUrl`, ownership por prefijo
  `{userId}/`); `FlowToolbar` → `VideoFlowService` server-side (su Save/Load estaba
  además roto en silencio: `supabase.auth.getUser()` siempre null con NextAuth). Los
  flujos `uploadToSignedUrl` anti-413 quedaron intactos.
- **(b) AvatarForgeService IDOR**: identidad SOLO de sesión vía `requireUserId()`
  (`src/lib/session.ts`, compartido con Social/Fanvue); ownership check en toda
  operación por id; `user_id` del cliente ignorado en inserts; firmas sin `userId`.
- **(c) Auth real**: migración `20260715090000_users` (aplicada en prod 2026-07-15) —
  tabla `users` (id TEXT = token.sub), RLS on sin políticas, admin sembrado con el
  mismo id/hash. `validateCredential` contra DB (scrypt de node:crypto, cero deps),
  sign-up real (user + org propia + membership owner), OAuth provisioning sin
  auto-linking cross-provider. Split edge-safe: `auth.config.ts` (middleware) /
  `auth.ts` (node). El mock `authData` quedó sin uso.
  ⚠️ El password del admin sigue siendo el del template — cambiarlo (no hay UI aún;
  UPDATE del hash vía SQL editor).

Con esto, de F4.0 ya está hecho el punto 3 (identidad real). Quedan 4.0.1 (baseline
schema) y 4.0.2 (tipos generados) — `users` y `video_flows` siguen fuera de los tipos
`Database` (casts locales marcados con comentario).

---

## 🎨 TRABAJO PARALELO RECIENTE — Avatar Studio (no estaba en el plan; monetizado por F1-F3)

Estado 2026-07-13 (todo verificado en vivo contra la API de KIE, commits en main):

- **Modelos permisivos + cara** (lo más importante para fashion/sensual que Gemini/OpenAI
  bloquean): **Seedream 4.5 / 5.0 Lite / 5.0 Pro** usan la CARA del avatar vía i2i real
  (`seedream/4.5-edit`, `seedream/5-lite-image-to-image`, `seedream/5-pro-image-to-image`;
  mismo precio que t2i; respetan aspect_ratio; ancla de cara en el prompt para que el texto
  no arrastre la identidad). **FLUX.2** i2i manda cara + Body Ref. **Qwen** i2i cara.
- **Medidas físicas = fuente de verdad**: preámbulo de cuerpo estilo Gemini
  (`buildDiffusionBodyPreamble`) antepuesto en MiniMax + KIE genéricos. Verificado que
  Seedream respeta curvy/98-60-80.
- **Grok Imagine**: i2i-only; NO es permisivo (filtro propio de xAI, verificado 2×); IGNORA
  aspect_ratio → se recorta la ref al ratio pedido con sharp (`cropBase64ToAspect`).
- **Z-Image QUITADO** del selector (sin i2i en KIE → nunca puede usar la cara).
- **MiniMax**: cap 1500 chars presupuestado (preámbulo + escena garantizados; [FACE:] solo si
  sobra — la cara viaja en subject_reference). Fix de proporción cabeza/cuerpo.
- **Editar imagen**: solo modelos que consumen la foto (Gemini, Flux Kontext, GPT Image 2,
  Nano Banana Pro, FLUX.2, Qwen, Seedream, Grok); los solo-texto se re-rutean a FLUX.2 i2i.
- **Costos por imagen en el selector** (medidos: créditos × $0.005): z-image $0.004 (fuera),
  grok $0.02, seedream 5-lite $0.028, 4.5 $0.033, 5-pro/flux-2 $0.035, nano-banana-2 $0.06,
  nano-banana-pro ~$0.09, gemini-3-pro ~$0.13. Detalle en `docs/cost-routing.md`.
- **Galería**: favoritas ⭐ + archivadas 🗄 (bucket) persistidas en `generations.metadata`;
  carga instantánea (URLs públicas, sin firmar por fila; img lazy; video preload=metadata);
  search/filtros en el store (sobreviven remounts). Selector de avatares también instantáneo.
- **Retries KIE**: "internal error" transitorio → re-submit 1×; "text length" → recorte a
  ~900 + re-submit (KIE aplica límites más estrictos que sus docs, varían por modelo).
- **Branding AvatarLab**: logo/icono/favicon + APP_NAME + title.
- **Cuerpos ya no salen flacos** (2026-07-14/15, commits e540c6e + dae7de1): buckets de
  plenitud rebalanceados (piso 90cm para "full"), ancla anti-flaca condicional
  (busto/cadera ≥90 o body type curvy+) en las 3 rutas de prompt, selector **Leg Type**
  (slim/toned/athletic/long/curvy/thick, campo `legType` en measurements, sin migración),
  y ancla BIDIRECCIONAL en Seedream i2i (cara de la imagen, cuerpo SOLO del texto — 5.0
  Pro copiaba el cuerpo delgado de la foto de cara; cap seedream 1800→2400).
- **Pendiente de probar por el usuario**: FLUX.2 con Body Ref; Seedream 5.0 Pro con las
  medidas tras el ancla bidireccional; login en prod contra la tabla `users`.

---

## Contexto

Prime Avatar ya produce el "cuerpo" del influencer virtual (imagen/video por avatar, voz
clonada MiniMax, publicación por avatar a Upload-Post y Fanvue). La "mente" (F1-F3) ya está:
**un agente conversacional por avatar** (persona + RAG) que chatea como el avatar con fans de
Fanvue, con proveedor IA seleccionable. El destino de negocio: **SaaS multi-tenant donde cada
tenant es una agencia de avatares digitales** (equipo con roles, el "chatter" humano aprueba
borradores del agente).

**Decisiones del usuario (2026-07-10):**
- Orden: **agente primero (tenant-ready by design), multitenant completo después** de validar
  el producto.
- Proveedores chat: **Gemini + OpenRouter** (OpenRouter para modelos permisivos NSFW). KIE
  como tercero opcional (Grok vía `api.kie.ai/grok/v1/responses`, adapter custom).
- Human-in-the-loop primero (Inbox con borradores), autopilot con reglas después. ✅ Así se hizo.

**Hechos verificados que condicionan lo que sigue:**
- AgentSoft: patrones portables (`organizations`+`users(org,role)`, `getOrgContext`,
  `plan_configurations`, `usage_counters`, org_override cookie + `SuperadminSwitchers`,
  `superadmin_audit_log`). OJO: agentsoft usa Supabase Auth; prime-avatar usa **NextAuth** →
  adaptar (nada de `auth.uid()`).
- **P0s de seguridad abiertos** (se cierran en F4.0/4.2/4.5): (a) 8 componentes cliente
  leen/escriben tablas con el cliente anon del browser (`AvatarSelector`, `AvatarStudioMain`,
  `AvatarStudioProvider`, `AvatarCard`, `AvatarPickerField`, `VideoToPromptDialog`,
  `KlingMotionControlEditor`, `FlowToolbar`) — tablas base sin RLS efectivo; NO tocar el flujo
  `uploadToSignedUrl` (anti-413, es correcto); (b) `AvatarForgeService` recibe `userId` del
  cliente sin validar ownership; (c) credenciales NextAuth validan contra MOCK
  (`src/mock/data/authData`) y sign-up es stub — sin tabla `users` real.
- `requireSession()` duplicado inline (SocialService, FanvueService). `src/@types/supabase.ts`
  a mano con drift. Spec viejo `docs/superpowers/specs/2026-04-07-...` → marcar superseded en F4.
- Patrón repo: server actions `'use server'` + `{success, data?, error?}`, service-role,
  RLS-sin-políticas, migraciones vía `mcp apply_migration`, tipos DB extendidos localmente,
  cron con `CRON_SECRET` Bearer, middleware exime `/api/webhooks/*` y `/api/cron/*`, ECME UI.
- **Regla anti-413**: binarios (imagen/video/audio) NUNCA por server actions — browser→Supabase
  Storage con signed URLs; server actions solo JSON/paths.

---

## FASE 4 — Multitenant core (SIGUIENTE)

### 4.0 Higiene (bloqueante — cierra los P0s)
1. **Baseline schema**: volcar el schema real del proyecto Supabase a migración baseline
   (avatars, generations, prompts, cloned_voices, audio_scripts, ai_providers, video_flows,
   buckets).
2. **Tipos generados**: `supabase gen types` (script `db:types`) reemplaza el archivo a mano.
3. **Identidad real**: tabla `users` (id, email unique, name, image, password_hash?, provider,
   provider_account_id, `is_platform_admin bool`) + `validateCredential` contra DB + sign-up
   real + callback `signIn` upsert OAuth. Sin esto no hay invitaciones.

### 4.0b Pooling Upload-Post (decisión 2026-07-11)
Cuentas Upload-Post DE LA PLATAFORMA en planes pagos (Professional €28 = 25 perfiles;
Business €302 = 225) y **1 PERFIL por avatar**. Costo ≈ €1.1-1.4/avatar/mes absorbido en el
plan del tenant. Tabla **`upload_post_pools`** (api_key server-only, plan, capacity,
profiles_used) + asignación automática de perfil-en-pool al habilitar social;
`social_profiles.pool_id` FK opcional (BYOK sigue como opción avanzada). Webhook: una
registración por pool. Los tenants NUNCA ven las keys del pool.

### 4.1 Migraciones org_id — ✅ APLICADA EN PROD (2026-07-18, vía MCP `apply_migration`; sin archivos locales en `supabase/migrations/`)
> **Estado real (verificado 2026-07-22):** `org_id` en TODAS las tablas tenant; **PUENTE ACTIVO** = `DEFAULT '…0001'` en las 12 tablas legacy (avatars, avatar_references, generations, prompts, cloned_voices, audio_scripts, video_flows, social_profiles, social_posts, fanvue_connections, fanvue_creators, fanvue_posts) → **se quita en 4.2.g**. RLS ON en todas; 6 legacy conservan políticas viejas `auth.uid()` (avatars/prompts/avatar_references/generations/video_flows/ai_providers → reemplazar en 4.2.g), resto RLS-on-0-políticas (backstop anti-anon). ⚠️ `orgStoragePath()` **aún NO existe** — es entregable de **4.2.c**, no de 4.1.

TODA tabla tenant lleva `organization_id` directo, NOT NULL tras backfill a la org default;
`user_id` se conserva como "creado por": `avatars`, `avatar_references`, `generations`,
`prompts`, `cloned_voices`, `audio_scripts`, `video_flows`, `social_profiles`, `social_posts`,
`fanvue_connections` (**unique(user_id) → unique(organization_id)**), `fanvue_creators`,
`fanvue_posts`, y las del agente (ya traen org_id). **`ai_providers` BYOK**: +org_id nullable
+api_key text (NULL = plantilla global). Storage: nuevos uploads `org/{orgId}/...` vía helper
`orgStoragePath()`.

### 4.2 Refactor scoping (cada paso deja main verde) — 🔄 EN CURSO
Patrón: `const ctx = await getOrgContext()` + wrapper **`orgTable(ctx, 'tabla')`** en
`src/lib/org/` (`orgTable`/`orgInsert`/`orgUpsert`/`orgSupabase`; `TENANT_TABLES`=18). Anti-regresión
3 capas: ESLint `no-restricted-imports`, script CI grep, smoke test de aislamiento (2 orgs seed).

**Avance verificado (código + BD remota, 2026-07-22):**
- ✅ **a** — lib/org + ESLint `no-restricted-imports` en **WARN** (solo prohíbe `@/lib/supabase`).
- ✅ **b** — `AvatarForgeService` (ownership por org; fila `generations` scoped) + 8 componentes cliente limpios (0 `.from()` crudo en `.tsx`).
- 🟡 **c** pipeline generación — **PARCIAL**: la *fila* `generations` va org-scoped; **falta** `orgStoragePath()` (no existe) + los *bytes* en Storage siguen sin scope (Kie/Gateway/MiniMax suben a folders genéricos; `apiCreateGenerationUploadUrl` usa `{userId}/`, no `org/`). Requiere helper + **dual-read** (viejo `{userId}/` + nuevo `org/{orgId}/`; los archivos viejos NO se mueven).
- ✅ **d** — `api/voice/*` (9) + `api/script/*` (2) org-scoped (aún con `.from()` crudo guardado por `.eq(org)` → migrar a orgTable en **g** por estilo/CI).
- 🔴 **e** Social — `SocialService.ts` con **19** `.from()` crudos (14 `social_profiles` + 5 `social_posts`), 0 org-scoped. Webhook/cron exentos (correlación por `request_id`, legítimo).
- 🔴 **f** Fanvue — `FanvueService` + `tokenStore` por `user_id`/`connection_id`; `upsertConnection` con `onConflict:'user_id'` (contradice el `unique(org)` de 4.1 → arreglar aquí).
- 🔴 **g** cierre — lint→**error** + cerrar loophole `@/lib/agent/db` (`agentSupabase()`); script CI grep (`TENANT_TABLES`); migrar las 8 rutas voice/script a orgTable; **DROP del puente** `…0001`; reemplazar las 6 políticas RLS legacy; smoke 2 orgs. **Toca BD prod → checkpoint con OK explícito.**

**🆕 Huecos fuera del desglose original (verificados 2026-07-22; cerrar dentro de 4.2 antes de g):**
- **`src/server/actions/getAvatarStudioData.ts`** — lee 5 tablas tenant SIN filtro de org y alimenta las páginas principales de Avatar Studio (`avatar-studio/page.tsx` + `[slug]`). Hueco de lectura más grande. (+ `getAvatars.ts`, `getAvatarAgentData.ts`.)
- **`concepts/avatar-forge/agent/page.tsx`** + **`api/agent/chat/route.ts`** — leen `avatars`/`avatar_personas` vía `agentSupabase()` (`@/lib/agent/db`); el candado ESLint no lo cubre (loophole → cerrar en g).

### 4.3 Roles, equipo, invitaciones, asignación
Roles org: `owner|admin|operator|viewer`; superadmin = flag `users.is_platform_admin`.
Guards en `src/lib/org/guards.ts`. **Invitaciones completas**: `organization_invitations` +
actions + email (Resend) + página pública `/invite/[token]` + sign-up con inviteToken.
**`avatar_assignments`** + `getAccessibleAvatarIds(ctx)` (operator/viewer=asignados) aplicado
en avatares, studio, inbox, composers, galería. Pantalla `/settings/team`.

### 4.4 Superadmin + switcher + /platform
Portar adaptado a NextAuth: org_override cookie → org efectiva + `isImpersonating`;
`SuperadminSwitchers` + `ViewingAsBanner`. Área `(platform)/platform` (orgs, uso, "ver como",
suspensión). `superadmin_audit_log` escribiendo en override.

### 4.5 RLS — decisión
**Service-role + `.eq(org_id)` manual como única autorización; RLS on SIN políticas en el
100% de tablas tenant como backstop anti-anon.** NO portar políticas de agentsoft (dependen
de `auth.uid()`). La migración que activa RLS ROMPE los componentes anon → va tras 4.2.2
(forcing function). Doc `docs/security/data-access.md`.

### 4.6 NextAuth claims
`jwt`/`session` callbacks: `organizationId`, `role`, `isPlatformAdmin` como hints de UI;
`getOrgContext()` SIEMPRE re-consulta membership en DB. `org_override` solo cookie.

**Entregable F4**: 2 orgs demo sin fugas (smoke verde), invitación E2E, operador ve solo sus
avatares, superadmin con banner + audit.

---

## FASE 5 — Billing + límites

- **Planes**: port `plan_configurations` + seed Creator/Pro/Business/Agency (revalidar con
  `docs/cost-routing.md`). `organizations` + `plan_slug, status, trial_ends_at,
  payment_provider, payment_customer_id, payment_subscription_id`.
- **Counters**: port `usage_counters` + increment. Tipos: `generations_image/video`,
  `agent_messages`, `tts_chars`, `voice_clones`, `social_posts`; gauges: `avatars_active`,
  `team_members`, `storage_gb`. Enforcement con chokepoint `startGeneration(ctx,kind)`.
  Rollout: measure-only → flag `ENFORCE_LIMITS`.
- **⚠️ SPIKE procesador (3-5 días, paralelo)**: Stripe prohíbe adult content and services —
  evaluar Stripe vs Paddle/Lemon vs CCBill/Segpay/Epoch (fees 10-15%). **Diseño agnóstico
  obligatorio**: interfaz `PaymentProvider` + `provider_products` + webhook único
  `/api/webhooks/payments/[provider]`. Impl 1: Stripe; CCBill stub tipado.
- Páginas `/pricing`, `/settings/billing`, checkout, `/platform/plans`. Trial 14d + cron
  `billing-lifecycle`.

## FASE 5.5 — Meta Direct Publishing (hito propio; decisión 2026-07-11)

Publicar IG/FB **directo por Graph API** (gratis; 100 posts/día por cuenta IG) detrás de la
interfaz `SocialProvider` — `MetaDirectProvider` con routing POR PLATAFORMA (IG/FB directo;
TikTok/X siguen en Upload-Post). Prerequisitos: app Meta + Business Verification + App Review
de `instagram_content_publish` (⚠️ riesgo adult-adjacent; UN review sirve para publishing +
inbound F6). Incluye OAuth por cuenta IG (`social_accounts_meta` compartida con F6),
contenedores REELS + poll + publish, transcoding H.264/AAC (el mux ya lo produce).

## FASE 6 — Agencia + escala

- **Dashboard**: `avatar_daily_stats` (rollup por cron) con earnings Fanvue por avatar (vía
  `avatars.fanvue_creator_uuid`) + KPIs del agente. El dashboard lee rollups.
- **Auditoría inbox**: `approval_events` (message, actor, action, edited_diff) + export CSV.
- **White-label** escalonado: branding jsonb → subdominio `{slug}.` → dominio custom.
  Riesgo: cookies NextAuth cross-domain.
- **Social inbound (Meta Graph)**: spike App Review PRIMERO. Comments-only → DMs.
  `social_accounts_meta` + `social_inbound_events` → mismo pipeline del inbox.
- **Plantillas**: `avatar_templates` global + wizard "crear desde plantilla".
- **Hardening**: rate limits por org, crons multi-org continue-on-error, spike colas
  (QStash/Inngest), **bucket `generations` → privado + signed URLs** (hoy media adult-adjacent
  pública; nota: la perf actual de galería usa URLs públicas — al privatizar, migrar a signed
  URLs con batch `createSignedUrls` + caché), webhook secrets por org, alertas.

---

## Riesgos y decisiones abiertas
1. Gemini bloquea nsfw explicit → UI documenta "OpenRouter/KIE-Grok para explicit" (chat).
2. Autopilot vs ToS/rate-limits Fanvue: delays + límites diarios; classifier fail-closed;
   `underage_risk` escala SIEMPRE.
3. Refresh token rotativo concurrente (webhook+cron): mutex in-process + gracia 30s.
4. [F5] Procesador adult-adjacent (spike) · límites por tipo vs créditos unificados.
5. [F6] Meta App Review adult-adjacent (comments-only fallback) · NextAuth multi-dominio.
6. P0s heredados → se cierran en F4.0/4.2/4.5.
7. Mass messages del agente (F3) quedó diferido — retomar si la validación lo pide.

## Verificación por fase (gates)
- **F4**: smoke de aislamiento 2 orgs; invitación E2E; operador restringido; superadmin
  banner+audit; `pg_policies` = 0 en tablas tenant con RLS on.
- **F5**: checkout sandbox → org activa; counters cuadran; límite alcanzado → bloqueo con CTA.
- Al cerrar cada fase: actualizar memoria de sesión y marcar specs viejos superseded.
