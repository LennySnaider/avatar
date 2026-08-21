# Plan — F4.2 e/f/g: cerrar el multitenant de Prime Avatar

Spec de referencia: `docs/SUPER-PLAN.md` §4.2 (es la autoridad; este plan es su
argumento ejecutable). Estado verificado contra código y BD el 2026-08-20.

## Contexto

La plataforma ya es multitenant POR ESTRUCTURA: `organization_id` NOT NULL + FK
+ índice en las 12 tablas tenant, `src/lib/org/orgTable.ts` como puerta de datos,
y los paths de Storage con scope de org desde el 31-jul.

No lo es POR GARANTÍA, y esa es la deuda que cierra este plan:

1. Un **puente** `DEFAULT '00000000-0000-0000-0000-000000000001'` en
   `organization_id` hace que un INSERT que olvide la org **no falle**: cae
   callado en la org por defecto.
2. Varias rutas de LECTURA no filtran por org.
3. El candado de ESLint está en `warn` y sólo prohíbe `@/lib/supabase`, así que
   `agentSupabase()` de `@/lib/agent/db` lo esquiva (43 usos).
4. Nunca ha corrido con dos orgs: BD real = 1 org, 1 miembro, 1 usuario.

## Global Constraints (vinculantes para TODAS las tareas)

- **NUNCA `supabase db push`** (el historial local está vacío: 17 archivos vs 1
  registrado). Migraciones sólo por el MCP de Supabase `apply_migration`.
- **NUNCA `npm run build`** con el dev encendido: comparten `.next` y la UI
  desaparece sin error. Validar con `npx tsc --noEmit` y `npx next lint --file <archivos>`.
- En archivos `'use server'`, **TODO export debe ser async** — ni tsc ni eslint
  lo detectan, sólo el build.
- **No cambiar firmas públicas** de funciones existentes salvo que la tarea lo
  pida. El scoping va por dentro.
- **Webhooks y crons quedan EXENTOS** del scoping por sesión: resuelven la org
  por `request_id` / por la fila que ya cargaron. No romperlos.
- Comentarios en **español**, explicando el PORQUÉ (no el qué), al estilo del
  repo. Nada de comentarios decorativos.
- Cada tarea deja `tsc` limpio, lint sin errores nuevos, y **commitea**.
- UI sólo con componentes ECME (`@/components/ui/*`). Prohibido `window.confirm`
  / `alert` nativos.
- **NO tocar la BD de producción** en ninguna tarea salvo la Tarea 7, que está
  explícitamente marcada como checkpoint humano.

## Tarea 1 — `SocialService.ts` a `orgTable` (F4.2.e)

`src/services/SocialService.ts` tiene **25** llamadas `.from()` crudas, 0 con
scope de org (medido 2026-08-20; el doc decía 19, creció).

- Migrar cada `.from('social_profiles')` / `.from('social_posts')` a
  `orgTable(ctx, …)` / `orgInsert` / `orgUpsert` de `@/lib/org/orgTable`.
- El `ctx` sale de `getOrgContext()` (sesión) o `getOrgContextForUser(userId)`
  donde ya se resuelva el usuario.
- **Excepción a respetar**: los call sites que sirven a webhook/cron y
  correlacionan por `request_id` NO llevan sesión — ahí se mantiene el acceso
  crudo pero **debe** quedar filtrado por la org de la fila que ya se cargó, y
  con un comentario que explique por qué no hay sesión.
- Mantener las firmas exportadas intactas.

Verificación: `grep -c "\.from(" src/services/SocialService.ts` baja a los
call sites exentos y cada uno tiene su comentario; `tsc` + lint limpios.

## Tarea 2 — Fanvue + tokenStore a org (F4.2.f)

- `src/lib/fanvue/tokenStore.ts:215` hace `upsert(..., { onConflict: 'user_id' })`.
  Eso **contradice** el `unique(organization_id)` que puso la migración 4.1 sobre
  `fanvue_connections`: el upsert apunta a una restricción que ya no es la que
  manda. Cambiar a la org.
- `src/services/FanvueService.ts`: llevar los `.from()` de tablas tenant
  (`fanvue_connections`, `fanvue_creators`, `fanvue_posts`) a `orgTable`.
- `FanvueService.ts:262` usa `onConflict: 'connection_id,creator_user_uuid'` —
  ese sí es correcto, **no tocarlo**.

Verificación: `tsc` + lint limpios; ningún `onConflict:'user_id'` sobre
`fanvue_connections`.

## Tarea 3 — Cerrar los huecos de LECTURA sin scope

Tres server actions leen tablas tenant sin filtro de org (medido 2026-08-20):

| archivo | `.from()` | filtro org |
|---|---|---|
| `src/server/actions/getAvatarStudioData.ts` | 5 | 0 |
| `src/server/actions/getAvatars.ts` | 2 | 0 |
| `src/server/actions/getAvatarAgentData.ts` | 3 | 0 |

`getAvatarStudioData.ts` es el hueco más grande: alimenta
`avatar-studio/page.tsx` y `avatar-studio/[slug]/page.tsx`, o sea las páginas
principales del producto. Con una segunda org, devolverían las filas de todas.

- Migrar los 10 `.from()` a `orgTable(ctx, …)` con `getOrgContext()`.
- **Cuidado**: son server actions que alimentan páginas; si `getOrgContext()`
  lanza cuando no hay sesión, la página rompe. Revisar cómo se comportan hoy
  ante sesión ausente y preservar ese comportamiento (redirect/vacío), no
  introducir un throw nuevo.

Verificación: los 3 archivos con 0 `.from()` crudos; `tsc` + lint limpios.

## Tarea 4 — Cerrar el loophole `agentSupabase()`

`src/lib/agent/db.ts` exporta `agentSupabase()`, un cliente service-role que
esquiva el candado de ESLint (que sólo prohíbe `@/lib/supabase`). **43 usos.**

- Inventariar los 43 usos y separarlos: los que corren **con sesión** (server
  actions, páginas) van a `orgTable`; los que corren **sin sesión**
  (webhook Fanvue, cron de inbox, `api/agent/chat`) se quedan con el cliente
  crudo pero **filtrando por la org de la fila que ya resolvieron**.
- Añadir `@/lib/agent/db` a la lista `no-restricted-imports` de
  `eslint.config.mjs` con las mismas excepciones que `@/lib/supabase`.
- Documentar en `db.ts` por qué el cliente sigue existiendo y quién puede usarlo.

Verificación: `tsc` + lint; los usos restantes de `agentSupabase()` están todos
en rutas exentas y cada uno con comentario.

## Tarea 5 — `api/voice` y `api/script` a `orgTable`

La F4.2.d ya las dejó org-scoped, pero con `.from()` crudo guardado por un
`.eq(organization_id)` manual. Migrarlas a `orgTable` por estilo y para que el
grep de CI de la Tarea 6 no tenga que llevar excepciones.

- 9 rutas bajo `src/app/api/voice/` + 2 bajo `src/app/api/script/`.
- Es mecánico: el filtro ya está, sólo cambia la puerta.

Verificación: `tsc` + lint; 0 `.from()` de tablas tenant en esas rutas.

## Tarea 6 — Candados duros (lint a error + grep de CI)

- `eslint.config.mjs`: `no-restricted-imports` de `warn` a **`error`**, con las
  excepciones ya acordadas (lib, services, webhooks, crons, auth).
- Crear `scripts/check-tenant-access.mjs`: recorre `src/`, y si encuentra un
  `.from('<tabla tenant>')` fuera de `src/lib/org/`, de los servicios permitidos
  o de las rutas exentas, **sale con código 1** listando los infractores. La
  lista de tablas sale de `TENANT_TABLES` de `src/lib/org/orgTable.ts` — fuente
  de verdad única, no una copia.
- Añadir `"check:tenant": "node scripts/check-tenant-access.mjs"` a los scripts
  de `package.json`.

Verificación: `npm run check:tenant` sale 0 con el código ya migrado; sale 1 si
se introduce un `.from()` crudo de prueba (probarlo y revertirlo).

## Tarea 7 — CHECKPOINT HUMANO: BD de producción

**NO EJECUTAR SIN OK EXPLÍCITO DEL USUARIO.** Toca prod y es irreversible.

- Migración (por MCP `apply_migration`) que hace `DROP DEFAULT` de
  `organization_id` en las 12 tablas legacy: `audio_scripts`, `avatar_references`,
  `avatars`, `cloned_voices`, `fanvue_connections`, `fanvue_creators`,
  `fanvue_posts`, `generations`, `prompts`, `social_posts`, `social_profiles`,
  `video_flows`.
- Reemplazar las políticas RLS legacy basadas en `auth.uid()` por políticas por
  org (tablas con políticas hoy: `avatar_references` 3, `avatars` 4,
  `generations` 3, `prompts` 4, `video_flows` 1, `ai_providers` 1,
  `pending_generations` 1).
- **Smoke de 2 orgs**: crear una org B de prueba con un avatar y una generación,
  entrar con un usuario de B y verificar que ve 0 filas de A. Borrar la org B al
  terminar.

Este paso es el que convierte convención en garantía: mientras el default esté
puesto, olvidarse de la org filtra en silencio en vez de romper.
