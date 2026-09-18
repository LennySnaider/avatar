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
