# Agente del tenant ("Estratega") — Diseño

**Fecha:** 2026-09-18
**Estado:** aprobado en conversación (decisiones del usuario el 18-sep); pendiente de spike (Fase 0) antes de la Fase 1

## Problema

Los agentes que existen hoy son **por avatar y hablan con fans** (Fanvue, Telegram, comentarios sociales). No hay nadie que hable con el **dueño de la organización**: que mire los números de todas sus cuentas, proponga contenido, arme los prompts de imagen con la identidad de cada avatar, programe publicaciones y gestione ads. Hoy eso lo hace el humano saltando entre Studio, Social, Telegram e Inbox. Los siete competidores revisados el 11-sep tampoco cierran ese ciclo.

Hueco técnico verificado (18-sep): en `src/` no existe tool-calling (`tool()`, `stopWhen`, `generateObject` no aparecen); el agente de avatar llama a `generateText` sin herramientas. `agent_message` está tarifado en `src/lib/billing/catalog.ts` (0.004 USD, `estimated`) pero nadie lo cobra. No hay tabla de ajustes de organización ni almacén de tokens OAuth por organización (el de Fanvue es por usuario).

## Qué es y qué no es

| | Agente de avatar (existe) | Agente del tenant (este diseño) |
|---|---|---|
| Interlocutor | fans | dueño/equipo de la organización |
| Identidad | la persona del avatar | asistente profesional sin personaje: el "Estratega" |
| Alcance | un avatar | toda la organización y todos sus avatares |
| Conversación | `agent_chats` / `agent_messages` | tablas nuevas, nunca mezcladas con fans |
| Permisos | los del canal | rol de la organización (`src/lib/org/permissions.ts`) |
| Cobro | por mensaje al fan | módulo instalable (cuota/org) + tokens por turno |

## Decisiones

- **Cobro: módulo instalable + tokens.** Fila nueva en `module_catalog` (slug `strategist`, `unit = 'org'`, precio mensual a fijar por el usuario antes de la Fase 1) instalable desde Módulos como Telegram; cada turno con herramientas cobra tokens vía `holdForOperation({ kind: 'agent_message' })` → `settleHold` con el uso real del modelo. Sin módulo instalado, el widget no aparece.
- **UI: widget flotante + botones contextuales.** Un botón flotante (ECME) disponible en todas las páginas protegidas de la organización abre el chat del Estratega en un cajón; además, botones contextuales en las pantallas donde tiene sentido ("Pídele al Estratega un plan para esta semana" en Social, "Analiza esta cuenta" en Accounts, "Propón 3 imágenes" en Studio) que abren el cajón con un prompt precargado y el contexto de la pantalla. Las propuestas que requieren aprobación se muestran como tarjetas dentro del cajón. No hay página propia en v1.
- **Modelo: Gemini con la infraestructura actual.** `getChatModel({ provider: 'gemini' })` con la key del entorno; `gemini-flash-latest` para turnos con herramientas y lectura, un modelo Pro para propuestas largas (constante en `src/lib/assistant/models.ts`). Sin BYOK por organización en v1.
- **Meta vía MCP oficial**, `https://mcp.facebook.com/ads` (beta abierta desde 29-abr-2026, 29 herramientas), consumido con `@ai-sdk/mcp` (`createMCPClient`, transporte http). **Autorización por organización**: la Fase 0 decide entre Vercel Connect (conector OAuth custom, `subject: { type: 'app' }` por organización) y un `OAuthClientProvider` propio con tokens cifrados en una tabla `org_connections` (patrón `fanvue_connections`). Criterio: el que funcione de punta a punta en el spike con menos piezas nuestras.
- **Contenido vía Upload-Post**, envuelto como herramientas del agente: `getAnalytics` (hoy sin llamadores), `previewSlots`/`getNextSlot`, `createSocialPost`, comentarios (`social_post_targets`, `agent_chats social:*`). Nada de Graph API propia para contenido en v1.
- **Prompts de imagen desde la librería del Studio**, no inventados: el agente elige entre presets (`modelActionPresets.ts`, `nichePromptPresets.ts`, `placePresets.ts`, `nichePoses.ts`, `cinemaPresets.ts`) y el sistema arma el prompt final con `buildAvatarPrompt` (`src/utils/avatarPromptBuilder.ts`) y las referencias de identidad del avatar. El LLM decide el qué y el porqué; el sistema el cómo. Nivel NSFW acotado por `spicyTiers` y por el nivel de la persona.
- **Guardas (no negociables):**
  - Leer y proponer: libres.
  - Generar imágenes: solo lo aprobado en el cajón; tope de tokens por turno y por día configurable en `org_modules.settings` del módulo; cada generación pasa por `submitKieImageTask` (hold/settle existente).
  - Publicar/programar: `toolApproval` de ai-sdk; el humano aprueba en la tarjeta. Modo `auto` por organización solo cuando el tenant lo suelte (`ai:autonomy`).
  - Ads: crear siempre **en pausa**; activar y cambiar presupuesto **nunca** de forma autónoma en v1; tope de gasto por campaña en la tarjeta de aprobación.
  - Operar agentes de avatar (autopilot, ofertas, canales): mismas guardas de rol que los botones (`ai:autonomy`, `connection:manage`, `pricing:manage`), y cada cambio deja fila en el hilo con quién lo aprobó.
- **Permisos:** usar el Estratega exige `content:read` (todo rol); las herramientas de escritura exigen el permiso de la acción equivalente (`publish:social`, `generation:create`, `ai:autonomy`, `pricing:manage`, `connection:manage`). No se crean permisos nuevos en v1.
- **Motor de herramientas compartido** en `src/lib/assistant/` (registro de tools, aprobación, presupuesto, trazas), construido una vez y reutilizable por el agente de avatar más adelante.
- **Sin autonomía programada en v1** (no cron que proponga solo); el Estratega actúa cuando el humano abre el cajón o pulsa un botón. La autonomía programada es fase posterior.

## Datos

- `org_assistant_threads(id, organization_id, title, created_by, created_at, updated_at)`; `org_assistant_messages(id, organization_id, thread_id, role 'user'|'assistant'|'tool', content jsonb (UIMessage parts), tokens_charged int, model, created_at)`; `org_assistant_actions(id, organization_id, thread_id, message_id, tool_name, args jsonb, status 'proposed'|'approved'|'rejected'|'executed'|'failed', result jsonb, approved_by, executed_at, error)` — la tarjeta de aprobación es una fila aquí.
- `org_connections(id, organization_id, provider 'meta', subject jsonb, access_token_enc, refresh_token_enc, expires_at, scopes text[], connected_by, created_at, updated_at)` — solo si la Fase 0 descarta Vercel Connect.
- `module_catalog` += `strategist`; `org_modules.settings` guarda `{ dailyTokenCap, perTurnTokenCap, mode: 'approve'|'auto' }`.
- Tablas nuevas entran en `TENANT_TABLES` y en `scripts/check-tenant-access.mjs`.

## Flujo de un turno

1. Widget → `POST /api/assistant/chat` (streaming, `maxDuration 60`): `getOrgContext` → `requireModule(ctx,'strategist')` → `requirePermission(ctx,'content:read')`.
2. Presupuesto: `holdForOperation({kind:'agent_message'}, {ctx, idempotencyKey: messageId})`; si el cap diario del módulo se agotó, responde sin herramientas explicando el tope.
3. `streamText` con `tools` = lectura siempre; escritura solo si el rol lo permite, y con `needsApproval` (ai-sdk `toolApproval`) salvo que el módulo esté en `auto`.
4. Cada tool de escritura crea `org_assistant_actions` en `proposed`; la tarjeta del cajón aprueba/rechaza; al aprobar se ejecuta (server action con las mismas guardas) y se registra `executed`.
5. `onFinish`: `settleHold` con tokens reales del uso (`usage.totalTokens` → coste por el catálogo), fila en `org_assistant_messages`, `increment_agent_counter` por org.

## Riesgos

- Meta MCP en beta: herramientas y términos pueden cambiar; términos de uso por terceros en nombre de clientes no verificados en la doc leída.
- Tool-calling greenfield: la calidad de Gemini Flash con 30+ herramientas es la incógnita del spike; mitigación: exponer solo las herramientas relevantes por contexto (Social → analytics/schedule; Studio → prompts/generación; Ads → MCP).
- Coste por turno: un turno con 3-5 llamadas puede pasar de 0.004 USD; medir en el spike y ajustar el SKU antes de vender.
- Identidad en imágenes: hereda los límites de Clone Ref; LoRA por avatar ([[motor-imagen-propio-analisis]]) es el multiplicador natural.

## Resultados de la Fase 0 (spike, 18-sep-2026, rama `spike/estratega-mcp`)

**Tool-calling con Gemini Flash: funciona.** Ruta desechable `src/app/api/assistant/spike/route.ts` (`generateText` + `tool()` + `stopWhen(stepCountIs(8))`, `getChatModel({provider:'gemini'})`). Pregunta "¿qué avatares tengo y cómo va Emily?": 3 llamadas correctas (`listAvatars`, `getSocialAnalytics`×2), 4 pasos, 2,843 tokens, ≈0.003 USD, 8 s. El modelo no inventó cifras cuando Upload-Post devolvió error.

**Pregunta real de insights de Meta: respondida con datos reales** por Graph API directo (`me/adaccounts`, `act_<id>/insights` con `date_preset=last_90d`, `level=campaign`) usando el token OAuth del usuario emitido por Vercel Connect: 3 cuentas publicitarias, campaña peor identificada con gasto/CTR/CPC y diagnóstico coherente. 2 llamadas, 3 pasos, 2,643 tokens, **≈0.0037 USD**, 8 s. → El SKU `agent_message` a 0.004 USD estimado queda validado para turnos de lectura con 2-3 herramientas; los turnos con más pasos o modelo Pro deben cobrarse por `usage` real.

**Vault OAuth: Vercel Connect, con matices.**
- Meta **no admite Dynamic Client Registration** (`Dynamic registration is not available for this client`): hizo falta crear una **app propia de Meta** (tipo Business, productos *Facebook Login for Business* + *Marketing API*, redirect `https://connect.vercel.com/callback`) y registrar el conector como OAuth **Custom** con App ID/Secret. Conector: `mcp.facebook.com/estratega` (`scl_qSjrMWiuxiIXgUEUUG9pg`), subject **User** únicamente (no hay grant de app): el consentimiento es por usuario → en producción, un owner por organización autoriza y el token se pide con `subject: { type: 'user', id: <userId> }`.
- El baile OAuth del SDK MCP con el proveedor de Connect falla (`OAuth authorization server metadata must be saveable before starting authorization`); la salida es `connectAuthProvider(connector, params, { consent: 'eager' })`, que lanza `ConsentRequiredError` con la URL de consentimiento antes de tocar el servidor.
- El diálogo de Facebook rechaza la petición si alguno de los `scopes` no está dado de alta en la app ("necesita al menos un supported permission"): los permisos deben añadirse en la app antes de pedirlos.
- **El MCP oficial exige `ads_mcp_management`**: con `ads_read, ads_management, business_management` el Graph API responde 200 pero `mcp.facebook.com/ads` devuelve 401 "restricted to certain users". Según la doc "Get started", el permiso se obtiene añadiendo a la app el caso de uso **"Create & manage ads with ads MCP server"**; para gestionar cuentas de terceros hace falta Advanced Access (App Review + verificación de negocio). Pendiente de comprobar en cuanto el caso de uso esté añadido.

**Hallazgo de paso (módulo Social, no del spike):** bajo la cuenta agencia de Upload-Post, `getAnalytics('emily-9121b8a5')` devuelve `400 Username not associated with any profile` y Emily aparece solo con Instagram (antes Instagram + X): la migración a agencia dejó perfiles a medio enlazar. Revisar aparte.

**Decisiones que se derivan para la Fase 1:** (1) el token de Meta se obtiene por Vercel Connect con subject usuario (owner de la org) y `scopes` explícitos; (2) el agente tendrá **dos vías a Meta**: Graph API directo para lectura (ya probado, sin dependencia del MCP) y el MCP para el catálogo completo de herramientas cuando `ads_mcp_management` esté concedido; (3) coste por turno de lectura ≈0.003-0.004 USD con Flash.

### MCP oficial de Meta, medido (18-sep, 21:10, tras conceder `ads_mcp_management` con Standard access)

- **Autenticación OK** con el token de Vercel Connect y los 7 scopes; el servidor responde y las herramientas ejecutan (`ads_get_ad_accounts`, `ads_get_ad_entities`, `ads_get_field_context`, `ads_insights_*`).
- **El catálogo real son 95 herramientas, no 29** (las 29 del marketing son "core"). Sus descripciones pesan **169,768 caracteres** (~40k tokens de contexto por turno).
- **Catálogo completo expuesto a Gemini Flash: inutilizable.** Pregunta "lista mis cuentas y cuál gastó más en 30 días": 8 pasos, 16 llamadas, **140,236 tokens de entrada, 0.043 USD, 30 s, sin respuesta final** (se agotó el tope de pasos encadenando herramientas). El modelo se pierde con 95 tools.
- **Lista blanca de 7 herramientas (`insights`)**: 4 pasos, 3 llamadas, 14,362 tokens, **0.0067 USD, 14 s**, respuesta coherente pero incompleta: sin `ads_get_ad_entities` no obtuvo métricas por campaña. La lista blanca correcta para "rendimiento por campaña" es `ads_get_ad_accounts` + `ads_get_ad_entities` + `ads_insights_performance_trend` + `ads_insights_advertiser_context` (≈ 6-10 tools).
- **Comparativa por turno de lectura**: Graph API directo 2,643 tokens / 0.0037 USD / 8 s con respuesta completa; MCP con lista blanca ≈ 14k tokens / 0.007 USD / 14 s; MCP completo 140k tokens / 0.043 USD / 30 s sin respuesta.

**Decisiones para la Fase 1 derivadas de la medición:**
1. **Nunca exponer el catálogo completo del MCP**: registro de herramientas por contexto de pantalla con listas blancas de 6-10 tools; el `schemaChars` del MCP se mide y se registra por turno.
2. **Lectura frecuente por Graph API directo** (barato y completo); el MCP se reserva para lo que Graph no cubre de forma sencilla (diagnóstico de subasta, anomalías, catálogos, creación de campañas en la Fase 4).
3. **Cobro por `usage` real**, no por el SKU plano de 0.004 USD: un turno MCP puede costar 2-10× más. `tokensForUsage(usage, model)` en el catálogo es obligatorio en la Fase 1.
4. `stopWhen(stepCountIs(6))` más un mensaje de sistema que exija responder en cuanto tenga los datos.

**Gate 0: CUMPLIDO.** Vault = Vercel Connect (subject user, app Meta propia con `ads_mcp_management` en Standard access, `consent: 'eager'`). Coste por turno anotado.
