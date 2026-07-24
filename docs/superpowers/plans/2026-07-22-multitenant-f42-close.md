# Multitenant F4.2 — Cierre (scoping org completo) · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar la Fase 4.2 del SUPER-PLAN: TODO acceso a tablas tenant pasa por `getOrgContext()` + `orgTable`, los bytes nuevos de Storage van a `org/{orgId}/…`, y al final se retira el puente de BD (`DEFAULT '…0001'`) + las 16 políticas RLS legacy `auth.uid()` — dejando el aislamiento real entre organizaciones con smoke test que lo pruebe.

**Architecture:** Autorización = filtro manual `.eq('organization_id', ctx.organizationId)` con service-role vía el wrapper existente `orgTable/orgInsert/orgUpsert` (`src/lib/org/orgTable.ts`); RLS-on-SIN-políticas queda como backstop anti-anon. `user_id` se conserva en filas como "creado por" (auditoría), NUNCA como frontera. Webhooks/cron quedan exentos (correlacionan por `request_id`/ids externos, sin sesión).

**Tech Stack:** Next.js 15 App Router (server actions), Supabase JS v2 service-role, NextAuth v5, TypeScript strict. Sin framework de tests en el repo → verificación por tarea = `npx tsc --noEmit` + `npm run lint` + greps de ausencia + scripts de smoke ejecutables.

## Global Constraints

- **Branch:** se trabaja en `main` directo; **cada tarea termina con commit y deja main verde**.
- **Verificación por tarea:** `npx tsc --noEmit` con **exit code real** (NUNCA `tsc | head` — se traga el exit; usar `npx tsc --noEmit; echo "exit:$?"`), y `npm run lint` sin errores nuevos. `npm run build` completo solo en la Tarea 7 (es lento).
- **NO tocar:** el flujo `uploadToSignedStorageUrl` / `@/lib/storageUpload` (anti-413, único módulo cliente con anon client — correcto por diseño); `src/app/api/webhooks/**` y `src/app/api/cron/**` (exentos: resuelven por `upload_post_request_id`/ids externos); la correlación por `request_id`; `.npmrc` (`legacy-peer-deps=true` obligatorio para Vercel); pin `apexcharts@5.3.6`.
- **Storage:** archivos viejos **NO se mueven** (viven bajo `{userId}/…` o carpetas genéricas y sus `storage_path` guardados siguen sirviendo por URL pública). Solo los uploads **nuevos** van a `org/{orgId}/…`. `assertPathInOrg` (AvatarForgeService.ts:472) **ya acepta ambos prefijos** — no tocarlo.
- **`user_id` en inserts se CONSERVA** (auditoría "creado por"). La frontera de datos es `organization_id`.
- **Tablas tenant** (fuente de verdad `TENANT_TABLES` en `src/lib/org/orgTable.ts:26`, 18 tablas). `ai_providers` es especial: `org_id` **nullable** (NULL = plantilla global env; fila propia = BYOK) → se lee con `.or(organization_id.is.null,organization_id.eq.{org})`, nunca con `orgTable`.
- **Comentarios de código en español**, estilo del repo (ver AvatarForgeService.ts cabecera).
- **Commits SIN menciones de Claude/Anthropic** (regla global del usuario). Formato: `feat(f4.2): …` / `fix(f4.2): …` en español.
- **Tarea 7 toca la BD de PROD** (drop del puente + políticas): es un **CHECKPOINT — pedir OK explícito del usuario antes de ejecutar cualquier SQL**. Las migraciones se guardan como ARCHIVO en `supabase/migrations/` **y** se aplican vía MCP `apply_migration` (lección F4.1: aplicar sin archivo local pierde el historial).
- Hoy TODA la data resuelve a la org default `00000000-0000-0000-0000-000000000001` (1 usuario, 1 org) → org-scopear lecturas es equivalente en runtime y seguro de desplegar por partes.

---

### Task 1: Server actions de Studio/Avatares org-scoped (+ `select` con `count` y helper de providers en orgTable)

El hueco de LECTURA más grande: `getAvatarStudioData.ts` lee 5 tablas tenant sin filtro y alimenta `avatar-studio/page.tsx` y `avatar-studio/[slug]/page.tsx`.

**Files:**
- Modify: `src/lib/org/orgTable.ts` (select con options; nuevo `listOrgProviders`)
- Modify: `src/server/actions/getAvatarStudioData.ts` (reescritura completa)
- Modify: `src/server/actions/getAvatars.ts` (reescritura completa)

**Interfaces:**
- Consumes: `getOrgContext()` de `@/lib/tenant/getOrgContext`; `orgTable/orgSupabase` existentes.
- Produces: `orgTable(ctx, t).select(columns, opts?)` acepta `{ count, head }` (lo usa esta tarea y la 3); `listOrgProviders(ctx)` (lo reusa quien liste providers por org). Firmas públicas de los dos actions NO cambian (los callers no se tocan).

- [ ] **Step 1: `orgTable.select` con options + `listOrgProviders`**

En `src/lib/org/orgTable.ts` reemplazar el método `select` del objeto retornado por `orgTable` (línea 68-69):

```ts
        select: (
            columns = '*',
            opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean },
        ) => from().select(columns, opts).eq('organization_id', ctx.organizationId),
```

Y añadir al final del archivo:

```ts
/**
 * ai_providers NO va por orgTable: org_id NULL = plantilla global (env key),
 * fila con org = BYOK. La lectura correcta es "globales + las mías".
 */
export function listOrgProviders(ctx: OrgContext) {
    return orgSupabase()
        .from('ai_providers')
        .select('*')
        .eq('is_active', true)
        .or(`organization_id.is.null,organization_id.eq.${ctx.organizationId}`)
        .order('name')
}
```

- [ ] **Step 2: Reescribir `getAvatarStudioData.ts`**

Contenido completo nuevo del archivo:

```ts
import { getOrgContext } from '@/lib/tenant/getOrgContext'
import { orgTable, listOrgProviders } from '@/lib/org/orgTable'
import type { AIProvider, Prompt, Avatar, AvatarReference } from '@/@types/supabase'
import type { ClonedVoice } from '@/@types/voice'

interface AvatarStudioData {
    avatar: Avatar | null
    references: AvatarReference[]
    providers: AIProvider[]
    prompts: Prompt[]
    defaultVoice: ClonedVoice | null
}

/**
 * F4.2 — Loader de las páginas de Avatar Studio, scopeado por ORG.
 * `userId` se mantiene en la firma por compat con los callers; solo se usa
 * para acotar la biblioteca de prompts DENTRO de la org ("creado por").
 */
const getAvatarStudioData = async (
    avatarId?: string,
    userId?: string
): Promise<AvatarStudioData> => {
    const ctx = await getOrgContext()

    // Providers: plantillas globales + BYOK de la org
    const { data: providers, error: providersError } = await listOrgProviders(ctx)
    if (providersError) {
        console.error('Error fetching providers:', providersError)
    }

    // Prompts de la org (opcionalmente acotados al creador)
    let prompts: Prompt[] = []
    {
        let q = orgTable(ctx, 'prompts')
            .select('*')
            .order('created_at', { ascending: false })
        if (userId) q = q.eq('user_id', userId)
        const { data: orgPrompts, error: promptsError } = await q
        if (promptsError) {
            console.error('Error fetching prompts:', promptsError)
        } else {
            prompts = (orgPrompts || []) as Prompt[]
        }
    }

    let avatar: Avatar | null = null
    let references: AvatarReference[] = []
    let defaultVoice: ClonedVoice | null = null

    if (avatarId) {
        const { data: avatarData, error: avatarError } = await orgTable(ctx, 'avatars')
            .select('*')
            .eq('id', avatarId)
            .maybeSingle()
        if (avatarError) {
            console.error('Error fetching avatar:', avatarError)
        } else {
            avatar = avatarData as Avatar | null
        }

        if (avatar) {
            const { data: refsData, error: refsError } = await orgTable(ctx, 'avatar_references')
                .select('*')
                .eq('avatar_id', avatarId)
            if (refsError) {
                console.error('Error fetching references:', refsError)
            } else {
                references = (refsData || []) as AvatarReference[]
            }

            if (avatar?.default_voice_id) {
                const { data: voiceData, error: voiceError } = await orgTable(ctx, 'cloned_voices')
                    .select('*')
                    .eq('id', avatar.default_voice_id)
                    .eq('status', 'ready')
                    .maybeSingle()
                if (voiceError) {
                    console.error('Error fetching default voice:', voiceError)
                } else {
                    defaultVoice = voiceData as unknown as ClonedVoice
                }
            }
        }
    }

    return {
        avatar,
        references,
        providers: (providers || []) as AIProvider[],
        prompts,
        defaultVoice,
    }
}

export default getAvatarStudioData
```

Nota: los `.single()` originales pasan a `.maybeSingle()` — con el filtro de org un id ajeno da 0 filas (antes daba fila; ahora "no encontrado" limpio, sin throw PGRST116).

- [ ] **Step 3: Reescribir `getAvatars.ts`**

Contenido completo nuevo:

```ts
import { getOrgContext } from '@/lib/tenant/getOrgContext'
import { orgTable, orgSupabase } from '@/lib/org/orgTable'
import type { AvatarWithReferences } from '@/app/(protected-pages)/concepts/avatar-forge/avatar-list/types'
import type { Avatar, AvatarReference } from '@/@types/supabase'

interface AvatarWithRefs extends Avatar {
    avatar_references: AvatarReference[]
}

/**
 * F4.2 — Lista de avatares de la ORG (modelo agencia: los miembros comparten
 * los avatares de su organización; visibilidad por rol llega en F4.3).
 * El query param `userId` legacy se IGNORA — la frontera es la org.
 */
const getAvatars = async (_queryParams: {
    [key: string]: string | string[] | undefined
}) => {
    const queryParams = _queryParams
    const { pageIndex = '1', pageSize = '12', query } = queryParams

    const ctx = await getOrgContext()
    const page = parseInt(pageIndex as string) || 1
    const limit = parseInt(pageSize as string) || 12
    const offset = (page - 1) * limit

    let avatarsQuery = orgTable(ctx, 'avatars')
        .select('*, avatar_references(*)', { count: 'exact' })
        .order('created_at', { ascending: false })

    if (query) {
        avatarsQuery = avatarsQuery.ilike('name', `%${query}%`)
    }

    avatarsQuery = avatarsQuery.range(offset, offset + limit - 1)

    const { data: avatars, count, error } = await avatarsQuery as {
        data: AvatarWithRefs[] | null
        count: number | null
        error: unknown
    }

    if (error) {
        console.error('Error fetching avatars:', error)
        return {
            list: [] as AvatarWithReferences[],
            total: 0,
        }
    }

    const supabase = orgSupabase()
    const avatarsWithUrls: AvatarWithReferences[] = await Promise.all(
        (avatars || []).map(async (avatar) => {
            const references = avatar.avatar_references || []
            const thumbnailRef = references.find(
                (ref: { type: string }) => ref.type === 'face'
            ) || references.find(
                (ref: { type: string }) => ref.type === 'general'
            )

            let thumbnailUrl: string | undefined
            if (thumbnailRef) {
                const { data: signedUrl } = await supabase.storage
                    .from('avatars')
                    .createSignedUrl(thumbnailRef.storage_path, 3600)
                thumbnailUrl = signedUrl?.signedUrl
            }

            return {
                ...avatar,
                avatar_references: references,
                thumbnailUrl,
            } as AvatarWithReferences
        })
    )

    return {
        list: avatarsWithUrls,
        total: count || 0,
    }
}

export default getAvatars
```

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit; echo "exit:$?"        # exit:0
npm run lint 2>&1 | tail -5             # sin errores nuevos
grep -n "createServerSupabaseClient\|@/lib/supabase" src/server/actions/getAvatarStudioData.ts src/server/actions/getAvatars.ts
# Esperado: 0 matches
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/org/orgTable.ts src/server/actions/getAvatarStudioData.ts src/server/actions/getAvatars.ts
git commit -m "feat(f4.2): server actions de Studio/Avatares scopeadas por org (cierra el hueco de lectura principal)"
```

---

### Task 2: Superficie del Agente org-scoped (page índice, loader y `/api/agent/chat`)

Estos leen `avatars`/`avatar_personas`/`avatar_knowledge` vía `agentSupabase()` — el loophole del candado ESLint.

**Files:**
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/agent/page.tsx:14-21`
- Modify: `src/server/actions/getAvatarAgentData.ts` (reescritura)
- Modify: `src/app/api/agent/chat/route.ts:43-74`

**Interfaces:**
- Consumes: `getOrgContext`/`getOrgContextForUser`, `orgTable`.
- Produces: nada nuevo — mismas firmas/respuestas HTTP.

- [ ] **Step 1: `agent/page.tsx` — reemplazar el bloque de datos (líneas 7, 15-21)**

Quitar `import { agentSupabase } from '@/lib/agent/db'` y poner:

```ts
import { getOrgContextForUser } from '@/lib/tenant/getOrgContext'
import { orgTable } from '@/lib/org/orgTable'
```

Reemplazar las líneas 15-21 (`const supabase = agentSupabase()` … `const personaByAvatar`) por:

```ts
    const ctx = await getOrgContextForUser(userId)
    if (!ctx) redirect('/sign-in')

    const [{ data: avatars }, { data: personas }] = await Promise.all([
        orgTable(ctx, 'avatars')
            .select('id, name, user_id')
            .order('created_at', { ascending: true }),
        orgTable(ctx, 'avatar_personas')
            .select('avatar_id, enabled, chat_provider, chat_model'),
    ])
    // Frontera = org (el filtro por user era pre-multitenant)
    const mine = (avatars ?? []) as { id: string; name: string; user_id: string | null }[]
    const personaByAvatar = new Map(
        ((personas ?? []) as { avatar_id: string; enabled: boolean; chat_provider: string; chat_model: string }[])
            .map((p) => [p.avatar_id, p]),
    )
```

- [ ] **Step 2: Reescribir `getAvatarAgentData.ts`**

```ts
import { getOrgContext } from '@/lib/tenant/getOrgContext'
import { orgTable } from '@/lib/org/orgTable'
import { toPersonaDTO } from '@/lib/agent/personaMapper'
import type { AvatarPersonaRow } from '@/lib/agent/db'
import type { PersonaDTO } from '@/lib/agent/types'
import type { Avatar } from '@/@types/supabase'

export interface AvatarAgentData {
    avatar: Avatar | null
    persona: PersonaDTO | null
    knowledgeCount: number
}

/** Loader de la página Agent por avatar — scopeado por ORG (F4.2). */
const getAvatarAgentData = async (avatarId: string): Promise<AvatarAgentData> => {
    const ctx = await getOrgContext()

    const { data: avatar, error: avatarError } = await orgTable(ctx, 'avatars')
        .select('*')
        .eq('id', avatarId)
        .maybeSingle()
    if (avatarError) console.error('Error fetching avatar:', avatarError)
    if (!avatar) return { avatar: null, persona: null, knowledgeCount: 0 }

    const [{ data: personaRow }, { count }] = await Promise.all([
        orgTable(ctx, 'avatar_personas').select('*').eq('avatar_id', avatarId).maybeSingle(),
        orgTable(ctx, 'avatar_knowledge')
            .select('id', { count: 'exact', head: true })
            .eq('avatar_id', avatarId),
    ])

    return {
        avatar: avatar as Avatar,
        persona: personaRow ? toPersonaDTO(personaRow as AvatarPersonaRow) : null,
        knowledgeCount: count ?? 0,
    }
}

export default getAvatarAgentData
```

- [ ] **Step 3: `/api/agent/chat/route.ts` — org en vez de user check**

Quitar `import { agentSupabase } from '@/lib/agent/db'`; añadir:

```ts
import { getOrgContextForUser } from '@/lib/tenant/getOrgContext'
import { orgTable } from '@/lib/org/orgTable'
```

Reemplazar líneas 59-74 (`const supabase = agentSupabase()` … persona fetch) por:

```ts
    const ctx = await getOrgContextForUser(userId)
    if (!ctx) return NextResponse.json({ error: 'No organization membership' }, { status: 403 })

    const { data: avatar } = await orgTable(ctx, 'avatars')
        .select('id, name, user_id')
        .eq('id', avatarId)
        .maybeSingle()
    if (!avatar) return NextResponse.json({ error: 'Avatar not found' }, { status: 404 })

    const { data: personaRow } = await orgTable(ctx, 'avatar_personas')
        .select('*')
        .eq('avatar_id', avatarId)
        .maybeSingle()
```

(El check `avatar.user_id !== userId → 403` se ELIMINA: la frontera es la org; un avatar de otra org ya da 404 por el filtro. Tipar `personaRow` con cast `as AvatarPersonaRow` donde `toPersonaDTO`/`personaRow.api_key` lo pidan — importar el tipo de `@/lib/agent/db`.)

- [ ] **Step 4: Verificar + commit**

```bash
npx tsc --noEmit; echo "exit:$?"   # exit:0
npm run lint 2>&1 | tail -5
grep -rn "agentSupabase" "src/app/(protected-pages)/concepts/avatar-forge/agent/page.tsx" src/server/actions/getAvatarAgentData.ts src/app/api/agent/chat/route.ts
# Esperado: 0 matches
git add -A && git commit -m "feat(f4.2): superficie del agente (index, loader, chat API) scopeada por org"
```

---

### Task 3 (= paso e): SocialService a orgTable — 19 sitios

`src/services/SocialService.ts` (859 líneas, en contexto de esta sesión). Patrón general: cada action abre con `const ctx = await getOrgContext()` (reemplaza `requireSession()` + `createServerSupabaseClient()`); `userId` para inserts/auditoría = `ctx.userId`.

**Files:**
- Modify: `src/services/SocialService.ts`

**Interfaces:**
- Consumes: `getOrgContext`, `orgTable/orgInsert`, `listOrgProviders` NO (no aplica aquí).
- Produces: firmas exportadas idénticas (los componentes no se tocan). El hook RAG ya no llama `getOrgContextForUser` (usa `ctx`).

- [ ] **Step 1: Imports y helpers**

Reemplazar imports (líneas 3-4, 7-8): quitar `requireUserId`, `createServerSupabaseClient` (conservar `getStoragePublicUrl` — moverlo a import desde `@/lib/storagePaths`), quitar `agentSupabase` y `getOrgContextForUser`; añadir:

```ts
import { getStoragePublicUrl } from '@/lib/storagePaths'
import { getOrgContext, type OrgContext } from '@/lib/tenant/getOrgContext'
import { orgTable, orgInsert } from '@/lib/org/orgTable'
```

Eliminar `const requireSession = requireUserId` (línea 79) y el tipo `SupabaseServerClient` (193). Reemplazar `getOwnedAvatar` (196-210) por:

```ts
/** Asserta que el avatar pertenece a la ORG de la sesión y devuelve id+name. */
async function getOrgAvatar(
    ctx: OrgContext,
    avatarId: string,
): Promise<{ id: string; name: string }> {
    const { data: avatar, error } = await orgTable(ctx, 'avatars')
        .select('id, name')
        .eq('id', avatarId)
        .maybeSingle()
    if (error) throw new Error(error.message)
    if (!avatar) throw new Error('Avatar not found')
    return { id: avatar.id, name: avatar.name }
}
```

Reemplazar `attachAvatarInfo(supabase, rows)` (213-256) por la misma función con firma `attachAvatarInfo(ctx: OrgContext, rows: SocialPostDbRow[])` y sus dos queries internas así:

```ts
        const { data: profiles } = await orgTable(ctx, 'social_profiles')
            .select('id, avatar_id')
            .in('id', profileIds)
```
```ts
            const { data: avatars } = await orgTable(ctx, 'avatars')
                .select('id, name')
                .in('id', avatarIds)
```

- [ ] **Step 2: Migrar función por función (los 19 sitios + generations/avatars)**

En CADA action exportada, reemplazar la apertura `const userId = await requireSession()` + `const supabase = createServerSupabaseClient()` por `const ctx = await getOrgContext()` (y donde se use `userId`, `ctx.userId`). Transformaciones exactas:

| Función | Cambios |
|---|---|
| `listAvatarSocialAccounts` | avatars → `orgTable(ctx,'avatars').select('id, name').order('created_at',{ascending:true})`; **eliminar** el filtro `mine` por user (la lista ES la org): `const mine = avatars ?? []`. profiles → `orgTable(ctx,'social_profiles').select('*').not('avatar_id','is',null)` |
| `connectUploadPostAccount` | `getOrgAvatar(ctx, input.avatarId)`; existing → `orgTable(ctx,'social_profiles').select('*').eq('avatar_id', input.avatarId).maybeSingle()`; update → `orgTable(ctx,'social_profiles').update({ api_key: apiKey, status: 'active' }).eq('id', existing.id).select('*').single()`; insert → `orgInsert(ctx,'social_profiles',{ avatar_id: input.avatarId, upload_post_username: username, api_key: apiKey, status: 'active' }).select('*').single()`; el update del sync best-effort → `orgTable(ctx,'social_profiles').update({...}).eq('id', row.id).select('*').single()` |
| `disconnectUploadPostAccount` | `getOrgAvatar(ctx, avatarId)`; update → `orgTable(ctx,'social_profiles').update({...}).eq('avatar_id', avatarId).select('*').single()` |
| `getSocialProfileAction` | select → `orgTable(ctx,'social_profiles').select('*').eq('avatar_id', avatarId).maybeSingle()` |
| `generateSocialConnectUrl` | `getOrgAvatar` + profile select via orgTable (igual que arriba) |
| `syncConnectedAccounts` | ambos (select + update) via orgTable |
| `registerUploadPostWebhook` | select via orgTable |
| `createSocialPost` | `getOrgAvatar(ctx, input.avatarId)`; profile → orgTable; generations → `orgTable(ctx,'generations').select('id, media_type, storage_path, avatar_id').in('id', requestedIds)` y **eliminar** el check por-user `gen.user_id !== userId` (el filtro de org YA garantiza pertenencia; media de otro miembro de la org es publicable por diseño agencia) — conservar el check `gen.avatar_id !== input.avatarId`; insert del post → `orgInsert(ctx,'social_posts',{ social_profile_id: profile.id, generation_id: generationId, user_id: ctx.userId, caption, hashtags: input.hashtags, content_type: contentType, media_urls: mediaUrls, platforms: toJson(platforms), status: …, scheduled_at: …, upload_post_request_id: …, upload_post_job_id: uploadPostJobId, upload_post_response: toJson(dispatch) }).select('*').single()`; hook RAG → usar `ctx` directo (sin `getOrgContextForUser`): `organizationId: ctx.organizationId`; `attachAvatarInfo(ctx, [row])` |
| `getPostedGenerationMap` | social_posts → `orgTable(ctx,'social_posts').select('generation_id, platforms, status').not('generation_id','is',null).in('status',[…]).limit(1000)` (**quitar** `.eq('user_id', userId)` — mapa de la org); fanvue_posts → `orgTable(ctx,'fanvue_posts').select('generation_id, status').in('status',['published','scheduled']).limit(1000)` (reemplaza `agentSupabase()`); generations muxedFrom → `orgTable(ctx,'generations').select('id, metadata').in('id', postedIds)` |
| `listSocialPosts` | select → `orgTable(ctx,'social_posts').select('*').order(…).limit(100)`; `attachAvatarInfo(ctx, …)` |
| `cancelScheduledPost` | post → `orgTable(ctx,'social_posts').select('*').eq('id', postId).maybeSingle()`; profile → orgTable eq id maybeSingle; update final → `orgTable(ctx,'social_posts').update({ status:'cancelled', updated_at: new Date().toISOString() }).eq('id', postId).select('*').single()`; `attachAvatarInfo(ctx, [row])` |

- [ ] **Step 3: Verificar + commit**

```bash
npx tsc --noEmit; echo "exit:$?"     # exit:0
npm run lint 2>&1 | tail -5
grep -cn "createServerSupabaseClient\|requireUserId\|agentSupabase" src/services/SocialService.ts
# Esperado: 0
grep -c "orgTable(ctx" src/services/SocialService.ts   # Esperado: ≥19
git add src/services/SocialService.ts && git commit -m "feat(f4.2/e): SocialService completo a orgTable — 19 sitios scopeados por org"
```

---

### Task 4 (= paso f): Fanvue org-scoped — tokenStore + FanvueService (repara el upsert ROTO)

**Bug real verificado:** la BD ya tiene `fanvue_connections_org_key` (UNIQUE en `organization_id`, F4.1) y NO existe unique en `user_id` → el `upsert(..., { onConflict: 'user_id' })` de tokenStore.ts:215 **falla hoy** en cualquier re-conexión OAuth (42P10). Esta tarea lo repara además de scopear.

**Files:**
- Modify: `src/lib/fanvue/tokenStore.ts`
- Modify: `src/services/FanvueService.ts`

**Interfaces:**
- Consumes: `getOrgContextForUser` (tokenStore interno), `getOrgContext` (service), `orgTable/orgInsert`.
- Produces: **firmas públicas de tokenStore INTACTAS** (`loadConnection(userId)`, `upsertConnection(userId, tokens, uuid?)`, `getValidAccessToken(userId, opts?)`) — resuelven la org INTERNAMENTE, así los callers existentes (FanvueService, inboxSync, webhook, cron) no cambian. `FanvueConnectionRecord` gana `organizationId: string`.

- [ ] **Step 1: tokenStore — org interno**

(a) Añadir `organization_id: string` al type local `FanvueConnectionsTable` (Row; en Insert/Update como opcional `organization_id?: string`).
(b) Añadir import: `import { getOrgContextForUser } from '@/lib/tenant/getOrgContext'`.
(c) Añadir helper tras los types:

```ts
/** La conexión es POR ORG (unique organization_id). Resuelve la org del user. */
async function requireOrgId(userId: string): Promise<string> {
    const ctx = await getOrgContextForUser(userId)
    if (!ctx) throw new Error('No organization membership for this user')
    return ctx.organizationId
}
```

(d) `FanvueConnectionRecord`: añadir `organizationId: string`.
(e) `loadConnection` — query por org:

```ts
export async function loadConnection(
    userId: string,
): Promise<FanvueConnectionRecord | null> {
    const organizationId = await requireOrgId(userId)
    const supabase = fanvueSupabase()
    const { data, error } = await supabase
        .from('fanvue_connections')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    return {
        id: data.id,
        userId: data.user_id,
        organizationId,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        tokenExpiresAt: data.token_expires_at,
        scopes: data.scopes,
        fanvueAccountUuid: data.fanvue_account_uuid,
    }
}
```

(f) `upsertConnection` — FIX del onConflict:

```ts
export async function upsertConnection(
    userId: string,
    tokens: FanvueTokens,
    fanvueAccountUuid?: string | null,
): Promise<void> {
    const organizationId = await requireOrgId(userId)
    const supabase = fanvueSupabase()
    const { error } = await supabase.from('fanvue_connections').upsert(
        {
            organization_id: organizationId,
            user_id: userId, // "creado por" — la frontera es la org
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            token_expires_at: tokens.expiresAt,
            scopes: tokens.scopes,
            ...(fanvueAccountUuid !== undefined
                ? { fanvue_account_uuid: fanvueAccountUuid }
                : {}),
            updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id' },
    )
    if (error) throw new Error(error.message)
}
```

(g) `persistTokens(organizationId, tokens)` — cambia el PRIMER parámetro a orgId y el `.eq`:

```ts
async function persistTokens(
    organizationId: string,
    tokens: FanvueTokens,
): Promise<void> {
    const supabase = fanvueSupabase()
    const { error } = await supabase
        .from('fanvue_connections')
        .update({
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            token_expires_at: tokens.expiresAt,
            scopes: tokens.scopes,
            updated_at: new Date().toISOString(),
        })
        .eq('organization_id', organizationId)
    if (error) throw new Error(error.message)
}
```

(h) `doRefresh(organizationId, refreshToken)` (renombrar el 1er param y pasar a `persistTokens(organizationId, tokens)`); en `getValidAccessToken`, el lock se claveapor org y usa la conexión ya cargada:

```ts
    let inflight = refreshLocks.get(connection.organizationId)
    if (!inflight) {
        inflight = doRefresh(connection.organizationId, connection.refreshToken).finally(() => {
            refreshLocks.delete(connection.organizationId)
        })
        refreshLocks.set(connection.organizationId, inflight)
    }
```

- [ ] **Step 2: FanvueService — ctx por action**

En cada action exportada: `const ctx = await getOrgContext()` (reemplaza `requireSession()`); `userId` = `ctx.userId` (para `makeClient`/`loadConnection`, cuyas firmas siguen por-user). Cambios de query:

| Función | Cambios |
|---|---|
| `getFanvueConnection` | reescribir sobre `loadConnection(ctx.userId)` (ya org): `const c = await loadConnection(ctx.userId)` → mapear `{ connected: !!c?.refreshToken, fanvue_account_uuid: c?.fanvueAccountUuid ?? null, scopes: c?.scopes ?? null, created_at: null, updated_at: null }` **O** (para conservar created/updated) `orgTable(ctx,'fanvue_connections').select('scopes, fanvue_account_uuid, refresh_token, created_at, updated_at').maybeSingle()` — usar la 2ª (misma respuesta que hoy) |
| `listFanvueCreators` | select → `orgTable(ctx,'fanvue_creators').select('id, creator_user_uuid, display_name, handle, avatar_url, updated_at').eq('connection_id', connection.id).order('display_name',{ascending:true})` |
| `syncCreators` | upsert de creators → `orgUpsert(ctx,'fanvue_creators', rows, { onConflict: 'connection_id,creator_user_uuid' })` (importar `orgUpsert`; quitar `connection_id` duplicado no — se conserva, orgUpsert solo inyecta organization_id) |
| `createFanvuePost` | creator check → `orgTable(ctx,'fanvue_creators').select('creator_user_uuid').eq('connection_id', connection.id).eq('creator_user_uuid', input.creatorUserUuid).maybeSingle()`; generations → `orgTable(ctx,'generations').select('id, media_type, storage_path, avatar_id').in('id', requestedIds)` y **eliminar** el loop de check por-user (org = frontera); insert éxito → `orgInsert(ctx,'fanvue_posts',{ user_id: ctx.userId, creator_user_uuid: …, generation_id: coverGen.id, caption: …, audience: …, price: …, media_uuids: mediaUuids, fanvue_post_uuid: post.uuid, status, scheduled_at: post.publishAt, published_at: post.publishedAt, updated_at: new Date().toISOString() }).select('…').single()`; insert de FALLO del catch → también `orgInsert(ctx,'fanvue_posts',{ …status:'failed'… })` (mover la captura de `ctx` fuera del try como hoy está `userId`); hook RAG → `organizationId: ctx.organizationId` directo |
| `listFanvuePosts` | select → `orgTable(ctx,'fanvue_posts').select('…').order('created_at',{ascending:false}).limit(100)` (**quitar** `.eq('user_id', userId)` — historial de la org) |

- [ ] **Step 3: Verificar + commit**

```bash
npx tsc --noEmit; echo "exit:$?"   # exit:0
npm run lint 2>&1 | tail -5
grep -n "onConflict: 'user_id'" src/lib/fanvue/tokenStore.ts        # 0 matches
grep -rn "loadConnection\|getValidAccessToken" src/lib src/app src/services --include='*.ts' -l
# Revisar la lista: los callers NO deben haber cambiado de firma (inboxSync, webhook, cron compilan sin tocar)
git add src/lib/fanvue/tokenStore.ts src/services/FanvueService.ts
git commit -m "fix(f4.2/f): Fanvue por org — repara upsert roto (onConflict org) y scopea service+tokenStore"
```

---

### Task 5 (= paso c): Storage a `org/{orgId}/…` (bytes nuevos; dual-read ya soportado)

`persistToSupabase` (Kie) y `persistImageBufferToSupabase` (Gateway) YA canalizan por `uploadBufferToGenerations` → org-prefijar ese chokepoint cubre ambos. MiniMax se refactoriza AL chokepoint (DRY). `assertPathInOrg` ya acepta `org/{orgId}/` — cero cambios de lectura. **Residual consciente (documentado, NO tocar):** `KlingService.uploadToTempStorage` (`kling-temp/`, refs temporales de INPUT) queda sin scope.

**Files:**
- Modify: `src/lib/mediaPersist.ts`
- Modify: `src/services/KieService.ts` (solo el bloque kie-refs, ~L239-240)
- Modify: `src/services/MiniMaxService.ts` (`persistVideoToSupabase`, ~L368-395)
- Modify: `src/services/AvatarForgeService.ts` (3 paths: L426, L447, L557)

**Interfaces:**
- Consumes: `getOrgContext`.
- Produces: `orgStoragePath(subpath: string): Promise<string>` exportado de `@/lib/mediaPersist` (lo usa KieService).

- [ ] **Step 1: `mediaPersist.ts` — helper + chokepoint**

Añadir import `import { getOrgContext } from '@/lib/tenant/getOrgContext'` y, encima de `uploadBufferToGenerations`:

```ts
/**
 * F4.2.c — Prefijo de org para uploads NUEVOS: `org/{orgId}/{subpath}`.
 * Sin sesión (cron/webhook) cae al subpath plano con warn — el archivo queda
 * legacy-style pero la operación nunca se bloquea. Los archivos viejos NO se
 * mueven; la lectura usa el storage_path guardado (dual-read implícito).
 */
export async function orgStoragePath(subpath: string): Promise<string> {
    try {
        const ctx = await getOrgContext()
        return `org/${ctx.organizationId}/${subpath}`
    } catch {
        console.warn('[mediaPersist] sin contexto de org — upload sin scope:', subpath)
        return subpath
    }
}
```

Y en `uploadBufferToGenerations`, tras obtener `SUPABASE_URL`, resolver el path final:

```ts
    const path = await orgStoragePath(fileName)
    const supabase = createServerSupabaseClient()
    const { error } = await supabase.storage
        .from('generations')
        .upload(path, buffer, {
            contentType,
            cacheControl: '3600',
            upsert: false,
        })
    if (error) throw new Error(`Failed to persist media: ${error.message}`)

    return `${SUPABASE_URL}/storage/v1/object/public/generations/${path}`
```

- [ ] **Step 2: KieService kie-refs (dedupe por hash) — L239-240**

Reemplazar:

```ts
    const fileName = `kie-refs/${hash}.${ext}`
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/generations/${fileName}`
```

por:

```ts
    const fileName = await orgStoragePath(`kie-refs/${hash}.${ext}`)
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/generations/${fileName}`
```

(añadir `orgStoragePath` al import existente de `@/lib/mediaPersist`; el upload de ese bloque ya usa `fileName`, y el HEAD-dedupe sigue funcionando porque chequea la URL nueva). Localizar el análogo del segundo sitio de subida de refs (URL http para modelos i2i, mismo patrón `kie-refs/`) y aplicar EXACTAMENTE el mismo cambio.

- [ ] **Step 3: MiniMax → chokepoint (DRY)**

Reemplazar el cuerpo de `persistVideoToSupabase` (L368-395) por:

```ts
async function persistVideoToSupabase(sourceUrl: string): Promise<string> {
    const res = await fetch(sourceUrl)
    if (!res.ok) {
        throw new Error(`Failed to download MiniMax video (${res.status})`)
    }
    const buffer = Buffer.from(await res.arrayBuffer())
    const fileName = `minimax-videos/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.mp4`
    const publicUrl = await uploadBufferToGenerations(buffer, fileName, 'video/mp4')
    console.log('[MiniMaxService] Video persisted to:', publicUrl)
    return publicUrl
}
```

(import: `import { uploadBufferToGenerations } from '@/lib/mediaPersist'`; quitar `createServerSupabaseClient` si queda sin uso en el archivo.)

- [ ] **Step 4: AvatarForgeService — 3 paths a org/**

- L426 (`uploadAvatarReference`): `const filePath = \`org/${ctx.organizationId}/references/${avatarId}/${type}/${fileName}\``
- L447 (`uploadGeneration`): `const filePath = \`org/${ctx.organizationId}/${folder}/${fileName}\``
- L557 (`apiCreateGenerationUploadUrl`): `const path = \`org/${ctx.organizationId}/${folder}/${Date.now()}.${ext}\``

- [ ] **Step 5: Verificar + commit**

```bash
npx tsc --noEmit; echo "exit:$?"   # exit:0
npm run lint 2>&1 | tail -5
grep -n '`${ctx.userId}/' src/services/AvatarForgeService.ts   # 0 matches
grep -n "orgStoragePath" src/lib/mediaPersist.ts src/services/KieService.ts | head
git add -A && git commit -m "feat(f4.2/c): storage a org/{orgId}/ — orgStoragePath en el chokepoint + MiniMax DRY + paths de AvatarForge"
```

---

### Task 6 (= paso g código): candados — ESLint a error + loophole agent/db + rutas voice/script a orgTable + script CI

**Files:**
- Modify: `eslint.config.mjs:24-46`
- Modify: `src/app/api/voice/{list,set-default,clone,delete,update-settings,preview}/route.ts` + `src/app/api/script/{generate,library}/route.ts` (8 archivos; sitios: list 20,33 · set-default 25,39 · clone 36,72,93 · delete 23 · update-settings 44 · preview 40,71 · generate 43 · library 21,51,90)
- Create: `scripts/check-org-scoping.mjs`
- Modify: `package.json` (script `check:org`)

**Interfaces:**
- Produces: `npm run check:org` (lo corre la Tarea 7 y cualquier CI futura).

- [ ] **Step 1: Rutas voice/script a orgTable (mecánico)**

Estas 8 rutas YA hacen `getOrgContextForUser` + `.eq('organization_id', ctx.organizationId)` a mano. Transformación uniforme en cada sitio enumerado — ejemplo trabajado (patrón EXACTO a replicar):

```ts
// ANTES (patrón actual en las 8 rutas):
const { data, error } = await supabase
    .from('cloned_voices')
    .select('*')
    .eq('organization_id', ctx.organizationId)
    .order('created_at', { ascending: false })

// DESPUÉS:
import { orgTable, orgInsert } from '@/lib/org/orgTable'   // arriba del archivo
const { data, error } = await orgTable(ctx, 'cloned_voices')
    .select('*')
    .order('created_at', { ascending: false })
```

Reglas: `.select/.update/.delete` → `orgTable(ctx, tabla)` quitando el `.eq('organization_id',…)` manual; `.insert({...})` → `orgInsert(ctx, tabla, {...})` quitando `organization_id` del objeto. Las tablas aquí son `cloned_voices` y `audio_scripts`. NO cambiar lógica, auth ni respuestas.

- [ ] **Step 2: ESLint a ERROR + cubrir `src/server` + prohibir `@/lib/agent/db` en app**

Reemplazar el bloque F4.2.a de `eslint.config.mjs` (líneas 21-46) por:

```js
  // F4.2.g — candado multitenant en ERROR: componentes/páginas/server actions
  // NO acceden a Supabase directo — todo dato tenant pasa por
  // getOrgContext() + orgTable. (@/lib/agent/db cuenta como acceso directo.)
  {
    files: [
      "src/app/**/*.{ts,tsx}",
      "src/components/**/*.{ts,tsx}",
      "src/server/**/*.{ts,tsx}",
    ],
    ignores: [
      "src/app/api/webhooks/**",
      "src/app/api/cron/**",
      // Infra de auth (tabla users, no datos tenant)
      "src/app/api/auth/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/supabase",
              message:
                "Acceso a datos tenant solo vía server actions (getOrgContext + orgTable). Excepción permitida: uploadToSignedUrl con URL emitida por el server.",
            },
            {
              name: "@/lib/agent/db",
              message:
                "agentSupabase() sin scope de org está prohibido en app/components/server — usa getOrgContext + orgTable (los tipos sí pueden importarse con `import type`).",
            },
          ],
        },
      ],
    },
  },
```

Nota: `import type { AvatarPersonaRow } from '@/lib/agent/db'` (Task 2) NO dispara `no-restricted-imports` en ESLint moderno con `allowTypeImports`… que este rule-set NO soporta por path. Si el lint marca los `import type`, mover esos tipos a un módulo nuevo `src/lib/agent/types-db.ts` (solo types, re-exportados desde db.ts) y actualizar los imports de Task 2 — decisión ya tomada: hacerlo SOLO si el lint lo exige.

- [ ] **Step 3: `scripts/check-org-scoping.mjs` (ratchet con allowlist)**

```js
#!/usr/bin/env node
/**
 * F4.2.g — Candado CI: ningún `.from('<tabla tenant>')` crudo fuera de la
 * allowlist. Las tablas salen de TENANT_TABLES (orgTable.ts). Deuda conocida
 * (módulo agente, nacido org-aware con filtros propios) va listada explícita:
 * sacar entradas de la allowlist conforme se migren, nunca añadir nuevas.
 * Uso: node scripts/check-org-scoping.mjs   (exit 1 si hay violaciones)
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const orgTableSrc = readFileSync('src/lib/org/orgTable.ts', 'utf8')
const m = orgTableSrc.match(/TENANT_TABLES = \[([^\]]+)\]/s)
if (!m) { console.error('No pude leer TENANT_TABLES de orgTable.ts'); process.exit(2) }
const tables = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])

const ALLOWLIST = [
  'src/lib/org/orgTable.ts',
  // Exentos por diseño (sin sesión; correlación por ids externos):
  'src/app/api/webhooks/',
  'src/app/api/cron/',
  // DEUDA CONOCIDA — módulo agente (org-aware por construcción, filtros propios):
  'src/lib/agent/',
  'src/services/AgentService.ts',
  'src/services/AgentInboxService.ts',
  // Tenant-context resolvers (leen organization_members, y el propio getOrgContext):
  'src/lib/tenant/',
  // tokenStore: org-scoped internamente (requireOrgId) con su propio cliente tipado:
  'src/lib/fanvue/tokenStore.ts',
]

const pattern = `\\.from\\((['"\`])(${tables.join('|')})\\1`
let out = ''
try {
  out = execSync(
    `grep -rnE "${pattern}" src --include='*.ts' --include='*.tsx' || true`,
    { encoding: 'utf8' },
  )
} catch (e) {
  console.error('grep falló:', e.message)
  process.exit(2)
}

const violations = out
  .split('\n')
  .filter(Boolean)
  .filter((line) => !ALLOWLIST.some((p) => line.startsWith(p)))

if (violations.length > 0) {
  console.error('❌ Acceso crudo a tablas tenant fuera de orgTable/allowlist:\n')
  for (const v of violations) console.error('  ' + v)
  console.error(`\n${violations.length} violación(es). Usa orgTable/orgInsert/orgUpsert (src/lib/org).`)
  process.exit(1)
}
console.log(`✅ check-org-scoping: 0 violaciones (${tables.length} tablas tenant vigiladas)`)
```

En `package.json`, añadir a `"scripts"`: `"check:org": "node scripts/check-org-scoping.mjs"`.

- [ ] **Step 4: Verificar + commit**

```bash
npx tsc --noEmit; echo "exit:$?"       # exit:0
npm run lint 2>&1 | tail -5            # SIN errores (si truena por import type de agent/db → aplicar la decisión del Step 2)
npm run check:org                       # ✅ 0 violaciones (si lista algo: o se migra o se justifica en allowlist con comentario — NO silenciar)
git add -A && git commit -m "feat(f4.2/g): candados — eslint a error (+src/server, +agent/db), rutas voice/script a orgTable, check:org CI"
```

---

### Task 7 (= paso g BD): ⛔ CHECKPOINT PROD — quitar el puente + políticas legacy + smoke de aislamiento

**⛔ DETENERSE AQUÍ: pedir OK explícito del usuario antes de ejecutar CUALQUIER SQL. Esta tarea altera la BD de producción.** Prerequisito duro: Tareas 1-6 commiteadas y desplegadas/verificadas (el puente es lo único que salva a un INSERT sin org que se nos haya escapado).

**Files:**
- Create: `supabase/migrations/20260722090000_multitenant_drop_default_bridge.sql`
- Create: `supabase/migrations/20260722090100_multitenant_drop_legacy_auth_uid_policies.sql`
- Create: `scripts/smoke-org-isolation.mjs`
- Modify: `docs/SUPER-PLAN.md` (marcar 4.2 ✅), ledger SDD, memoria

- [ ] **Step 1: Escribir la migración del puente (12 tablas legacy)**

`supabase/migrations/20260722090000_multitenant_drop_default_bridge.sql`:

```sql
-- F4.2.g — Retira el puente de migración: organization_id deja de tener
-- DEFAULT org-default. Desde aquí, TODO insert debe traer org explícita
-- (orgInsert/orgUpsert). Las tablas del agente nunca tuvieron default.
alter table public.avatars            alter column organization_id drop default;
alter table public.avatar_references  alter column organization_id drop default;
alter table public.generations        alter column organization_id drop default;
alter table public.prompts            alter column organization_id drop default;
alter table public.cloned_voices      alter column organization_id drop default;
alter table public.audio_scripts      alter column organization_id drop default;
alter table public.video_flows        alter column organization_id drop default;
alter table public.social_profiles    alter column organization_id drop default;
alter table public.social_posts       alter column organization_id drop default;
alter table public.fanvue_connections alter column organization_id drop default;
alter table public.fanvue_creators    alter column organization_id drop default;
alter table public.fanvue_posts       alter column organization_id drop default;
```

- [ ] **Step 2: Escribir la migración de políticas legacy (16 DROP, nombres verificados en prod 2026-07-22)**

`supabase/migrations/20260722090100_multitenant_drop_legacy_auth_uid_policies.sql`:

```sql
-- F4.2.g — Elimina las políticas RLS pre-multitenant (auth.uid() es
-- inevaluable bajo NextAuth; con service-role no aplican y con anon son
-- superficie de lectura indebida — "Anyone can read providers" era pública).
-- Decisión 4.5 del SUPER-PLAN: RLS ON sin políticas = backstop anti-anon.
drop policy if exists "Users can delete own avatars"      on public.avatars;
drop policy if exists "Users can insert own avatars"      on public.avatars;
drop policy if exists "Users can update own avatars"      on public.avatars;
drop policy if exists "Users can view own avatars"        on public.avatars;
drop policy if exists "Users can delete own prompts"      on public.prompts;
drop policy if exists "Users can insert own prompts"      on public.prompts;
drop policy if exists "Users can update own prompts"      on public.prompts;
drop policy if exists "Users can view own prompts"        on public.prompts;
drop policy if exists "Users can delete own references"   on public.avatar_references;
drop policy if exists "Users can insert own references"   on public.avatar_references;
drop policy if exists "Users can view own references"     on public.avatar_references;
drop policy if exists "Users can delete own generations"  on public.generations;
drop policy if exists "Users can insert own generations"  on public.generations;
drop policy if exists "Users can view own generations"    on public.generations;
drop policy if exists "Users can CRUD own flows"          on public.video_flows;
drop policy if exists "Anyone can read providers"         on public.ai_providers;
```

⚠️ Al dropear "Anyone can read providers", el cliente ANON pierde lectura de `ai_providers` — verificar ANTES (grep) que ningún componente cliente la lee (Task 1 la movió a server): `grep -rn "from('ai_providers')" src/app src/components --include='*.tsx'` → debe dar 0.

- [ ] **Step 3: `scripts/smoke-org-isolation.mjs` (la prueba del entregable)**

```js
#!/usr/bin/env node
/**
 * F4.2.g — Smoke de aislamiento multitenant contra la BD real.
 * 1) org B efímera no ve datos de la org A (default)
 * 2) insert SIN organization_id FALLA (puente retirado)
 * 3) el cliente ANON no lee tablas tenant (RLS-on-sin-políticas)
 * Limpia todo al final. Uso: node scripts/smoke-org-isolation.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'

for (const f of ['.env.local', '.env']) {
  if (!existsSync(f)) continue
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=["']?([^"'\n]*)["']?$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!URL_ || !SERVICE || !ANON) { console.error('Faltan env vars de Supabase'); process.exit(2) }

const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } })
const anon = createClient(URL_, ANON, { auth: { persistSession: false } })
const ORG_A = '00000000-0000-0000-0000-000000000001'
let orgB = null
let failures = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`)
  if (!ok) failures++
}

try {
  // Seed org B efímera
  const { data: org, error: orgErr } = await svc
    .from('organizations')
    .insert({ name: 'SMOKE Org B', slug: `smoke-org-b-${Date.now()}` })
    .select('id')
    .single()
  if (orgErr) throw new Error('seed org B: ' + orgErr.message)
  orgB = org.id

  // 1) org B no ve avatares/generaciones de A
  const { count: bAvatars } = await svc
    .from('avatars').select('id', { count: 'exact', head: true })
    .eq('organization_id', orgB)
  check('org B ve 0 avatares', (bAvatars ?? 0) === 0, `count=${bAvatars}`)
  const { count: bGens } = await svc
    .from('generations').select('id', { count: 'exact', head: true })
    .eq('organization_id', orgB)
  check('org B ve 0 generations', (bGens ?? 0) === 0, `count=${bGens}`)

  // Insert scoped a B funciona y NO aparece en A
  const { count: aBefore } = await svc
    .from('avatars').select('id', { count: 'exact', head: true })
    .eq('organization_id', ORG_A)
  const { data: bAvatar, error: insErr } = await svc
    .from('avatars')
    .insert({ organization_id: orgB, name: 'SMOKE Avatar B' })
    .select('id')
    .single()
  check('insert avatar en org B', !insErr, insErr?.message)
  const { count: aAfter } = await svc
    .from('avatars').select('id', { count: 'exact', head: true })
    .eq('organization_id', ORG_A)
  check('org A no cambió', aBefore === aAfter, `${aBefore} → ${aAfter}`)
  if (bAvatar) await svc.from('avatars').delete().eq('id', bAvatar.id)

  // 2) insert SIN organization_id debe FALLAR (puente muerto)
  const { error: bridgeErr } = await svc
    .from('avatars')
    .insert({ name: 'SMOKE sin org' })
    .select('id')
    .single()
  check('insert sin org_id FALLA (puente retirado)', !!bridgeErr,
    bridgeErr ? bridgeErr.message.slice(0, 60) : 'insertó — ¡PUENTE VIVO!')

  // 3) anon no lee tablas tenant
  for (const t of ['avatars', 'generations', 'social_posts', 'fanvue_connections', 'ai_providers']) {
    const { data, error } = await anon.from(t).select('*').limit(1)
    check(`anon bloqueado en ${t}`, !!error || (data ?? []).length === 0,
      error ? 'denegado' : `filas=${(data ?? []).length}`)
  }
} catch (e) {
  console.error('💥 smoke abortó:', e.message)
  failures++
} finally {
  if (orgB) {
    await svc.from('avatars').delete().eq('organization_id', orgB)
    await svc.from('organizations').delete().eq('id', orgB)
  }
}
console.log(failures === 0 ? '\n🎉 AISLAMIENTO OK' : `\n💔 ${failures} fallo(s)`)
process.exit(failures === 0 ? 0 : 1)
```

- [ ] **Step 4: ⛔ Pedir OK explícito → aplicar migraciones vía MCP**

Con OK del usuario: `apply_migration` con name `multitenant_drop_default_bridge` (contenido del Step 1) y luego `multitenant_drop_legacy_auth_uid_policies` (Step 2). Verificar con SQL: `select table_name, column_default from information_schema.columns where column_name='organization_id' and table_schema='public' and column_default is not null` → **0 filas**; `select count(*) from pg_policies where schemaname='public' and tablename in ('avatars','prompts','avatar_references','generations','video_flows','ai_providers')` → **0**.

- [ ] **Step 5: Correr el smoke + build completo**

```bash
node scripts/smoke-org-isolation.mjs    # 🎉 AISLAMIENTO OK (exit 0)
npm run check:org                        # ✅ 0 violaciones
npm run build 2>&1 | tail -8             # build OK
```

- [ ] **Step 6: Actualizar rastreadores + commit final**

- `docs/SUPER-PLAN.md`: §4.2 → ✅ HECHA (fecha); tabla de fases → Fase 4: 4.0-4.2 ✅, siguiente 4.3.
- Ledger `.superpowers/sdd/progress.md`: tareas 1-7 con commits.
- Memoria `agent-module-state.md`: F4.2 CERRADA + gotchas nuevos.
- `mcp__supabase__get_advisors` (security) → confirmar sin regresiones nuevas.

```bash
git add -A && git commit -m "feat(f4.2/g): cierre multitenant — puente retirado, políticas legacy fuera, smoke de aislamiento verde"
```

---

## Self-Review (hecho al escribir)

1. **Cobertura vs spec §4.2:** c → Task 5 · e → Task 3 · f → Task 4 · g → Tasks 6+7 · huecos nuevos → Tasks 1+2. Los 8 sub-pasos del orden original quedan: 1-2-4 ya hechos antes; 3=T5, 5=T3, 6=T4, 7 (providers page) ya existía org-aware vía catálogo estático + env-check (sin `.from` tenant: verificado por el grep global del explorador), 8=T6+T7. ✓
2. **Placeholders:** ninguno — cada edit lleva código o transformación exacta con sitios enumerados; los dos únicos "localizar el análogo" (2º sitio kie-refs) están acotados por patrón `kie-refs/` + verificación grep. ✓
3. **Consistencia de tipos/firmas:** `orgTable.select(columns, opts)` se define en T1 y se usa en T1/T2/T3; `orgStoragePath` se define en T5-S1 y se usa en T5-S2; firmas públicas de tokenStore intactas (T4) — callers no tocados. `getStoragePublicUrl` re-import desde `@/lib/storagePaths` (ya re-exportado por `@/lib/supabase`, así que el import directo es el limpio). ✓
