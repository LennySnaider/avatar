# Super plan: Agente del tenant ("Estratega")

Spec: `docs/superpowers/specs/2026-09-18-agente-del-tenant-design.md`

> **Última revisión: 2026-09-18.** Ninguna fase empezada. Cada fase se ejecuta como plan propio (superpowers: brainstorming corto si hace falta → plan → subagentes con revisión → merge → deploy), con su gate de verificación en vivo antes de abrir la siguiente.

## Estado

| Fase | Entregable | Estado |
|---|---|---|
| 0 | Spike: tool-calling mínimo + MCP de Meta con la cuenta del usuario; decisión del vault OAuth | ⬜ |
| 1 | Cimientos: módulo `strategist`, tablas, cobro por turno, motor de herramientas, ruta streaming, widget flotante, herramientas de LECTURA | ⬜ |
| 2 | Proponer y generar: plan de contenido, prompts desde la librería del Studio, generación a la galería con tope de tokens y aprobación | ⬜ |
| 3 | Programar: publicar/programar vía Upload-Post con aprobación, mejores horas | ⬜ |
| 4 | Ads: Meta MCP escritura con aprobación; campañas en pausa; tope de gasto | ⬜ |
| 5 | Operar agentes de avatar y canales desde el Estratega | ⬜ |
| 6 | Autonomía programada (propuestas semanales solas) y métricas del módulo | ⬜ |

## Contexto (hechos verificados 18-sep-2026)

- Roles `operator | admin | owner` y 17 permisos con dos puntos (`content:read`, `publish:social`, `generation:create`, `ai:autonomy`, `pricing:manage`, `connection:manage`, `module:manage`…) en `src/lib/org/permissions.ts`; guard `requirePermission(ctx, permission)` en `src/lib/org/guards.ts`; orden canónico en acciones: `getOrgContext` → `requirePermission` → `requireModule` → `assertOwnedAvatar`.
- Runtime del agente: `getChatModel({provider, model, apiKey})` (`src/lib/agent/chatProvider.ts`; `gemini` y `openrouter` funcionan, `kie` lanza); único `streamText` en `src/app/api/agent/chat/route.ts` (playground, `toUIMessageStreamResponse`, `useChat`). **No hay `tool()`, `stopWhen` ni `generateObject` en `src/`.**
- Cobro: `AGENT_MESSAGE_COST_USD = 0.004` y `quote({kind:'agent_message'})` existen en `src/lib/billing/catalog.ts` pero **nadie los llama**; `holdForOperation`/`settleHold` solo en KIE y MuleRouter. `agent_usage_counters` + RPC `increment_agent_counter` por (org, avatar, periodo).
- Módulos: `module_catalog(slug, unit in ('bot','avatar','org'), price_usd_month_per_unit, …)`, `org_modules(settings jsonb)`, `requireModule(ctx, slug)`, `ModuleSlug = 'telegram'` (ampliar la unión). Instalación desde `src/services/ModulesService.ts`.
- Upload-Post: `getAnalytics(username, platforms)` (sin llamadores), `previewSlots`/`getNextSlot`, `createSocialPost(input)` (`src/services/SocialService.ts`), comentarios en `social_post_targets` + `agent_chats platform 'social:*'`. **Cuenta agencia desde el 18-sep** (`20260917140000_social_profiles_agency.sql`): una key de plataforma y perfiles asignables; `resolveProfileKey` sigue siendo el punto de resolución.
- Librería de prompts del Studio en `src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_constants/` (`modelActionPresets.ts`, `nichePromptPresets.ts`, `nichePoses.ts`, `placePresets.ts`, `cinemaPresets.ts`); ensamblado final `buildAvatarPrompt` en `src/utils/avatarPromptBuilder.ts`; envío `submitKieImageTask` (`src/services/KieService.ts`, chokepoint de hold/settle).
- Meta: MCP oficial `https://mcp.facebook.com/ads` (29 tools; OAuth de Meta Business; sin app de desarrollador). ai-sdk: `@ai-sdk/mcp` `createMCPClient({ transport: { type: 'http', url, authProvider } })`; Vercel Connect `connectAuthProvider` (`@vercel/connect/ai-sdk`) con `subject: { type: 'app' }` por tenant y conectores OAuth custom por URL.
- Sin tabla de ajustes de organización; sin almacén OAuth por organización (`fanvue_connections` es por usuario).

## FASE 0 — Spike (una tarde; código desechable)

Objetivo: saber si el camino está abierto antes de diseñar tablas. Sin migraciones, sin UI, sin cobro.

- 0.1 Rama `spike/estratega-mcp`. Ruta `src/app/api/assistant/spike/route.ts` (solo owner de la org del usuario, `NODE_ENV !== 'production'` o flag de entorno) con `streamText` + `tools` + `stopWhen(stepCountIs(5))` usando `getChatModel({provider:'gemini', model: 'gemini-flash-latest'})` y una herramienta local de prueba (`getUploadPostAnalytics` sobre `getAnalytics`).
- 0.2 Conectar `https://mcp.facebook.com/ads` con `createMCPClient`. Probar primero **Vercel Connect** (conector OAuth custom por URL, `subject:{type:'app'}`); si Connect no está disponible en la cuenta o el conector no completa el flujo OAuth del MCP, implementar un `OAuthClientProvider` mínimo (MCP SDK) con tokens en memoria solo para el spike.
- 0.3 Medir: número de herramientas expuestas por Meta y su tamaño en tokens de contexto; una pregunta real de insights de la cuenta Meta Business del usuario respondida correctamente; coste real del turno (usage) frente a 0.004 USD.
- **Gate 0:** respuesta correcta a "¿qué campaña rindió peor esta semana y por qué?" (o equivalente con la cuenta real), con el vault decidido y el coste por turno anotado en la spec. Si Meta MCP no autoriza a un cliente servidor por organización, la Fase 4 cambia a Marketing API directa con app propia (App Review) y se replanifica.

## FASE 1 — Cimientos (módulo, cobro, motor, widget, lectura)

- 1.1 **Migración** `org_assistant_threads`, `org_assistant_messages`, `org_assistant_actions`, (`org_connections` si el spike lo decidió), fila `module_catalog('strategist', unit 'org', precio a fijar)`, RLS como el resto, `TENANT_TABLES` + `check-tenant-access`. Aplicar por MCP `apply_migration`; regenerar tipos.
- 1.2 **Módulo**: `ModuleSlug += 'strategist'`; instalación desde Módulos; `org_modules.settings` = `{ dailyTokenCap, perTurnTokenCap, mode:'approve' }` con defaults; pantalla de ajustes mínima en la card del módulo.
- 1.3 **Motor de herramientas** `src/lib/assistant/`: `tools/registry.ts` (cada tool: `name`, `description`, `inputSchema` zod, `permission`, `mutating`, `execute`), `budget.ts` (puro: caps por turno/día, tests), `approval.ts` (crea/ejecuta `org_assistant_actions`), `trace.ts` (qué tool se llamó, con qué, cuánto costó). Exposición por contexto: el widget manda `context: { screen, avatarId?, profileId? }` y el registro filtra.
- 1.4 **Cobro por turno**: `holdForOperation({kind:'agent_message'}, {ctx, idempotencyKey})` antes de `streamText`; `settleHold` en `onFinish` con `usage` real (nuevo `tokensForUsage(usage, model)` en el catálogo, puro, con tests); `increment_agent_counter` con `p_avatar = null` (verificar que la RPC lo admite; si no, contador por org nuevo). Medir-solo mientras `ENFORCE_LIMITS` esté apagado, como el resto.
- 1.5 **Ruta** `POST /api/assistant/chat` (streaming, `maxDuration 60`): `getOrgContext` → `requireModule('strategist')` → `requirePermission('content:read')` → presupuesto → `streamText({ model, system, tools, stopWhen: stepCountIs(6) })` → persistir mensajes. Sistema del Estratega: profesional, español por defecto, conoce los avatares de la org (nombres, nichos, canales conectados) y nunca inventa números: si no tiene la herramienta, lo dice.
- 1.6 **Herramientas de LECTURA** (v1): `listAvatars` (con canales conectados y estado de IA), `getSocialAnalytics` (Upload-Post `getAnalytics` por perfil), `getRecentPostsPerformance` (posts + targets + comentarios recibidos), `getInboxSummary` (hilos con atención, borradores pendientes, ventas Telegram/Fanvue recientes; reutilizar los servicios de dashboards de ingresos que entraron el 18-sep), `getAudienceInsights` (Upload-Post `/audience` cuando la red lo soporte), Meta MCP solo tools de reporting/insights (lista blanca).
- 1.7 **Widget flotante** (ECME, `src/components/shared/StrategistWidget/`): botón flotante visible en todas las páginas protegidas si el módulo está instalado; cajón con `useChat` contra la ruta; tarjetas de acción (`org_assistant_actions`) con Aprobar/Rechazar; historial por hilo; botón "Nuevo hilo". Botones contextuales v1: Social Accounts ("Analiza esta cuenta"), Social Posts ("¿Qué funcionó esta semana?"), Inbox ("Resume lo pendiente").
- **Gate 1:** en producción, con el módulo instalado en la org del usuario: pregunta sobre rendimiento de Emily contestada con números reales de Upload-Post y de Meta; turno cobrado y visible en `token_ledger` (measure-only); un rol `operator` ve el widget pero no las herramientas de escritura.

## FASE 2 — Proponer y generar

- 2.1 Herramienta `proposeContentPlan({ avatarId, horizonDays })`: usa lectura + persona/RAG del avatar y devuelve propuestas estructuradas (`generateObject` con zod): fecha/hora sugerida, red, formato, idea, preset(s) de la librería a usar, nivel de picante permitido por la persona. Sin efectos.
- 2.2 Herramienta `buildImagePrompt({ avatarId, presetIds, placeId?, cameraShot?, nsfwTier? })`: servidor arma el prompt con `buildAvatarPrompt` + referencias de identidad del avatar (misma ruta que el Studio: `AvatarStudioMain` → extraer la lógica de ensamblado a `src/lib/studio/composePrompt.ts` para no duplicar). Devuelve `finalPrompt` y el modelo recomendado. Puro donde se pueda; tests.
- 2.3 Herramienta mutante `generateImages({ avatarId, prompts[], model })` con `toolApproval`: la tarjeta muestra los prompts, el coste en tokens (`quote`) y el tope restante; al aprobar, `submitKieImageTask` por prompt (hold/settle existente) → galería (auto-save) → el hilo recibe las miniaturas cuando `pending_generations` las resuelve.
- 2.4 Presupuesto: `perTurnTokenCap`/`dailyTokenCap` del módulo se aplican ANTES de encolar; lo que no cabe se propone sin generar.
- **Gate 2:** "propón tres imágenes para Ana esta semana" → tres prompts de la librería con la identidad de Ana → aprobación → tres generaciones en la galería con cara consistente (evaluación del usuario) y coste cobrado.

## FASE 3 — Programar y publicar

- 3.1 Herramientas `getBestSlots({ profileId })` (`previewSlots`/`getNextSlot` + `/audience` si hay) y `schedulePost({ avatarId, generationIds, caption, hashtags, platforms, scheduledAt })` con `toolApproval` → `createSocialPost` (cuenta agencia; `publish:social`).
- 3.2 Tarjeta de programación con vista previa (imagen, caption, red, hora) y edición inline antes de aprobar.
- 3.3 Modo `auto` del módulo (`ai:autonomy`): publicar sin aprobación solo si el tenant lo activa; límite diario de publicaciones por red desde el catálogo de Upload-Post.
- **Gate 3:** un plan aprobado queda programado en Upload-Post y aparece en Social Posts; la publicación sale a la hora; el comentario recibido entra al Inbox por el sondeo existente.

## FASE 4 — Ads (Meta MCP escritura)

- 4.1 Lista blanca de tools de escritura del MCP (crear campaña, ad set, ad, creativos, editar presupuesto) envueltas con `toolApproval`; todo se crea con `status: 'paused'`; **activar** y **subir presupuesto** no existen como herramientas en v1 (se hacen en Ads Manager).
- 4.2 Tarjeta de campaña: objetivo, público, presupuesto, creativo (imagen de la galería), copy; tope de gasto por campaña en `org_modules.settings`.
- 4.3 Herramienta `adReport` (lectura) para cerrar el ciclo: rendimiento por campaña y recomendación.
- **Gate 4:** campaña creada en pausa desde el Estratega visible en Ads Manager del usuario; ninguna herramienta puede activarla.

## FASE 5 — Operar agentes de avatar y canales

- 5.1 Herramientas mutantes con las guardas de la acción equivalente: `setAvatarAutopilot` (`ai:autonomy`), `setTelegramAiSettings` (`connection:manage`), `setCommentReplies` (`connection:manage`), `setOfferSettings` (`pricing:manage`). Cada una reutiliza el server action existente (no duplicar lógica) y deja `org_assistant_actions` con `approved_by`.
- 5.2 Resúmenes: "¿cómo van mis agentes?" → borradores pendientes, ventas por IA, comisiones (dashboards de ingresos existentes).
- **Gate 5:** "pon a Ana en auto en Telegram" → tarjeta → aprobar → `avatar_telegram_settings` cambia y la pantalla del bot lo refleja.

## FASE 6 — Autonomía programada y métricas del módulo

- 6.1 Cron semanal opcional por org (`org_modules.settings.weeklyDigest`): el Estratega genera un hilo con el resumen y propuestas (sin ejecutar nada) y avisa (email/Telegram del dueño).
- 6.2 Métricas del módulo: turnos, tokens, acciones propuestas/aprobadas/ejecutadas, coste vs cuota, en la card del módulo.
- **Gate 6:** un digest semanal real recibido y útil según el usuario; coste mensual del módulo por debajo de la cuota.

## Riesgos y decisiones abiertas

- **Precio del módulo** (`price_usd_month_per_unit`): a fijar por el usuario antes de la Fase 1; el spike da el coste por turno para calcular margen.
- **Vault OAuth de Meta**: Vercel Connect vs propio, lo decide el Gate 0.
- **Meta MCP beta**: si cambia o restringe a terceros, la Fase 4 pasa a Marketing API con app propia (semanas de App Review).
- **Calidad de tool-calling en Flash**: si el spike muestra llamadas erráticas, subir a Pro solo en los turnos con herramientas mutantes.
- **`increment_agent_counter` exige `avatar_id`**: verificar en la Fase 1; si es NOT NULL, contador por org nuevo.
- **UX**: el widget flotante no debe tapar los controles del Studio en móvil; botón colapsable y recordado por dispositivo.

## Verificación por fase (gates)

Cada gate se demuestra en producción con la cuenta del usuario, con evidencia en BD (`token_ledger`, `org_assistant_actions`) y captura de pantalla; sin gate verde no se abre la fase siguiente. Tests: todo lo puro (`budget`, `tokensForUsage`, filtros de registro, `composePrompt`) con `node:test`; tsc + lint; nunca `npm run build` con el dev encendido; migraciones solo por MCP.
