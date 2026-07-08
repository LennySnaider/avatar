# Social Media Module (Upload-Post) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish and schedule prime-avatar's generated media to social networks via Upload-Post: connect accounts, compose (caption/hashtags/platforms/schedule), track post status, and publish straight from the gallery.

**Architecture:** The battle-tested Upload-Post REST client is ported VERBATIM from AgentSoft (`/Users/lenny/Documents/agentsoft`); a 3-line env factory replaces its multi-tenant config chain. Two new Supabase tables (`social_profiles` single row, `social_posts`) hold state. A `'use server'` SocialService exposes error-as-data actions. UI is rebuilt lean with ECME components under `/concepts/avatar-forge/social/*`. Webhook + reconcile cron keep post status truthful.

**Tech Stack:** Next.js 15 server actions, Supabase (service-role via `createServerSupabaseClient`), Upload-Post REST API (`Authorization: Apikey <key>`), ECME UI kit, NextAuth `auth()`.

**Spec:** `docs/superpowers/specs/2026-07-07-social-media-module-design.md`

## Global Constraints

- No test framework — the gate for every task is `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "\.next/"` → empty, plus `npx eslint <changed files>` clean.
- Error-as-data across every server-action boundary (`{ success, data?, error? }`) — never throw to the client (Next.js masks it as a 500).
- Upload-Post auth header is the literal scheme `Apikey` (NOT Bearer): `Authorization: Apikey ${key}`.
- Media URLs sent to Upload-Post must be DURABLE public URLs (`${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/generations/<storage_path>`), never 1-hour signed URLs.
- Env (already in `.env`, validated live): `UPLOAD_POST_API_KEY`, `UPLOAD_POST_WEBHOOK_SECRET`. Optional `UPLOAD_POST_BASE_URL` (default `https://api.upload-post.com`). Fixed sub-user username: `prime-avatar`.
- Single-user: NO organization_id, NO credits, NO agency, NO Meta-direct code. Server actions verify session via NextAuth `auth()` from `@/auth` (same import used in `src/app/(protected-pages)/concepts/avatar-forge/gallery/page.tsx`).
- No Claude/Anthropic/🤖 lines in commit messages.

---

### Task 1: Port the provider layer + env factory

**Files:**
- Create: `src/lib/social/providers/SocialProvider.ts` (copy VERBATIM from `/Users/lenny/Documents/agentsoft/src/lib/social/providers/SocialProvider.ts`)
- Create: `src/lib/social/providers/UploadPostProvider.ts` (copy VERBATIM from `/Users/lenny/Documents/agentsoft/src/lib/social/providers/UploadPostProvider.ts`)
- Create: `src/lib/social/platformValidators.ts`, `src/lib/social/hashtagHelpers.ts` (copy VERBATIM from same dir in agentsoft)
- Create: `src/@types/social.ts` (port of `/Users/lenny/Documents/agentsoft/src/types/social.ts` — see Step 2 strip list)
- Create: `src/lib/social/provider.ts` (new env factory, code below)

**Interfaces:**
- Produces (later tasks import): `getSocialProvider(): SocialProvider` from `@/lib/social/provider`; all DTO types from the copied `SocialProvider.ts` (`PublishPhotoInput`, `PublishVideoInput`, `ConnectUrlResult`, `ProviderProfile`, …); `SOCIAL_USERNAME = 'prime-avatar'` from `@/lib/social/provider`; `validatePostForPlatforms`, `PLATFORM_LIMITS` from `@/lib/social/platformValidators`; `appendHashtagsToCaption` from `@/lib/social/hashtagHelpers`.

- [x] **Step 1: Copy the four lib files verbatim**

```bash
mkdir -p src/lib/social/providers
cp /Users/lenny/Documents/agentsoft/src/lib/social/providers/SocialProvider.ts src/lib/social/providers/
cp /Users/lenny/Documents/agentsoft/src/lib/social/providers/UploadPostProvider.ts src/lib/social/providers/
cp /Users/lenny/Documents/agentsoft/src/lib/social/platformValidators.ts src/lib/social/
cp /Users/lenny/Documents/agentsoft/src/lib/social/hashtagHelpers.ts src/lib/social/
```
Then fix any imports inside them that point at agentsoft-only modules: if `platformValidators.ts` or the providers import from `@/types/social`, change to `@/@types/social`. If any file imports `creditsCalculator`, `captionInterpolate` or Meta helpers, remove that import and the code using it ONLY if it doesn't compile otherwise — prefer keeping files untouched.

- [x] **Step 2: Port the types**

Copy `/Users/lenny/Documents/agentsoft/src/types/social.ts` to `src/@types/social.ts`. Strip: any `organization_id`, `created_by`, `triggered_by_workflow_*`, `credits_consumed` fields and agency/instagram-engagement types (`InstagramAccount`, Meta types) if present. Keep platform enums, post/profile types, provider DTO re-exports.

- [x] **Step 3: Create the env factory** — `src/lib/social/provider.ts`:

```ts
import { UploadPostProvider } from '@/lib/social/providers/UploadPostProvider'
import type { SocialProvider } from '@/lib/social/providers/SocialProvider'

/** Fixed Upload-Post sub-user for this single-user app. */
export const SOCIAL_USERNAME = 'prime-avatar'

let cached: SocialProvider | null = null

/**
 * Single-user replacement for AgentSoft's providerFactory/uploadPostConfig
 * chain: one dedicated Upload-Post account, key from env.
 */
export function getSocialProvider(): SocialProvider {
    if (cached) return cached
    const apiKey = process.env.UPLOAD_POST_API_KEY
    if (!apiKey) throw new Error('UPLOAD_POST_API_KEY is not configured')
    cached = new UploadPostProvider(apiKey, process.env.UPLOAD_POST_BASE_URL)
    return cached
}
```
If `UploadPostProvider`'s constructor signature differs (check the copied file — it may take `(apiKey: string, baseUrl?: string)` or an options object), adapt this call to match it exactly.

- [x] **Step 4: Type-check + lint**

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "\.next/"` → empty.
Run: `npx eslint src/lib/social src/@types/social.ts` → clean.
Expected friction: unresolved agentsoft-only imports — resolve per Step 1/2 notes (delete Meta/credits references; they are out of scope).

- [x] **Step 5: Commit**

```bash
git add src/lib/social src/@types/social.ts
git commit -m "feat(social): port Upload-Post provider layer from AgentSoft (single-user factory)"
```

---

### Task 2: DB migration (social_profiles + social_posts)

**Files:**
- Create: `supabase/migrations/20260707_social_media.sql`

**Interfaces:**
- Produces: tables `social_profiles`, `social_posts` exactly as in the SQL below; later tasks read/write them via `createServerSupabaseClient()` (service role — bypasses RLS).

- [x] **Step 1: Write the migration file** — `supabase/migrations/20260707_social_media.sql`:

```sql
-- Social Media module (single-user port of AgentSoft's Upload-Post module)
create table if not exists social_profiles (
    id uuid primary key default gen_random_uuid(),
    upload_post_username text unique not null,
    status text not null default 'active',
    connected_platforms jsonb not null default '[]',
    upload_post_metadata jsonb,
    last_synced_at timestamptz,
    created_at timestamptz not null default now()
);

create table if not exists social_posts (
    id uuid primary key default gen_random_uuid(),
    social_profile_id uuid references social_profiles(id) on delete set null,
    generation_id uuid references generations(id) on delete set null,
    user_id uuid,
    caption text not null default '',
    hashtags text[] not null default '{}',
    content_type text not null,
    media_urls text[] not null default '{}',
    platforms jsonb not null default '[]',
    status text not null default 'draft',
    scheduled_at timestamptz,
    published_at timestamptz,
    upload_post_request_id text,
    upload_post_job_id text,
    upload_post_response jsonb,
    error_message text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_social_posts_status on social_posts(status);
create index if not exists idx_social_posts_request on social_posts(upload_post_request_id);

-- All access goes through server actions using the service-role client;
-- enable RLS with no public policies so anon/authenticated direct access is blocked.
alter table social_profiles enable row level security;
alter table social_posts enable row level security;
```

- [x] **Step 2: Apply the migration to the live project**

Use the Supabase MCP tool (load via ToolSearch `select:mcp__supabase__apply_migration`) with `name: "social_media_module"` and the SQL above. If the MCP server is unavailable, STOP and report BLOCKED (do not paste the SQL into psql guesses).

- [x] **Step 3: Verify tables exist**

Load `mcp__supabase__list_tables` (ToolSearch) and confirm `social_profiles` and `social_posts` appear. Expected: both listed.

- [x] **Step 4: Commit**

```bash
git add supabase/migrations/20260707_social_media.sql
git commit -m "feat(social): social_profiles + social_posts tables (RLS locked, service-role access)"
```

---

### Task 3: SocialService server actions

**Files:**
- Create: `src/services/SocialService.ts`

**Interfaces:**
- Consumes: `getSocialProvider`, `SOCIAL_USERNAME` (Task 1); `createServerSupabaseClient` from `@/lib/supabase`; `auth` from `@/auth`; `validatePostForPlatforms` from `@/lib/social/platformValidators`; `appendHashtagsToCaption` from `@/lib/social/hashtagHelpers`; tables from Task 2.
- Produces (UI tasks call these exact signatures):
  ```ts
  export interface SocialResult<T> { success: boolean; data?: T; error?: string }
  export async function ensureSocialProfile(): Promise<SocialResult<SocialProfileRow>>
  export async function getSocialProfileAction(): Promise<SocialResult<SocialProfileRow | null>>
  export async function generateSocialConnectUrl(): Promise<SocialResult<{ accessUrl: string; expiresAt: string | null }>>
  export async function syncConnectedAccounts(): Promise<SocialResult<SocialProfileRow>>
  export async function createSocialPost(input: CreateSocialPostInput): Promise<SocialResult<SocialPostRow>>
  export async function listSocialPosts(): Promise<SocialResult<SocialPostRow[]>>
  export async function cancelScheduledPost(postId: string): Promise<SocialResult<SocialPostRow>>
  export async function registerUploadPostWebhook(): Promise<SocialResult<{ configured: boolean }>>
  ```
  with
  ```ts
  export interface CreateSocialPostInput {
      generationId?: string
      caption: string
      hashtags: string[]
      platforms: string[]
      scheduledAt?: string | null   // ISO; null/undefined = publish now
  }
  export interface SocialProfileRow { id: string; upload_post_username: string; status: string; connected_platforms: unknown[]; last_synced_at: string | null }
  export interface SocialPostRow { id: string; caption: string; hashtags: string[]; content_type: string; media_urls: string[]; platforms: unknown; status: string; scheduled_at: string | null; published_at: string | null; error_message: string | null; created_at: string; generation_id: string | null }
  ```

- [x] **Step 1: Create `src/services/SocialService.ts`**

```ts
'use server'

import { auth } from '@/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getSocialProvider, SOCIAL_USERNAME } from '@/lib/social/provider'
import { validatePostForPlatforms } from '@/lib/social/platformValidators'
import { appendHashtagsToCaption } from '@/lib/social/hashtagHelpers'

export interface SocialResult<T> { success: boolean; data?: T; error?: string }

export interface SocialProfileRow {
    id: string
    upload_post_username: string
    status: string
    connected_platforms: unknown[]
    last_synced_at: string | null
}

export interface SocialPostRow {
    id: string
    caption: string
    hashtags: string[]
    content_type: string
    media_urls: string[]
    platforms: unknown
    status: string
    scheduled_at: string | null
    published_at: string | null
    error_message: string | null
    created_at: string
    generation_id: string | null
}

export interface CreateSocialPostInput {
    generationId?: string
    caption: string
    hashtags: string[]
    platforms: string[]
    scheduledAt?: string | null
}

const fail = (e: unknown): { success: false; error: string } => ({
    success: false,
    error: e instanceof Error ? e.message : String(e),
})

async function requireSession() {
    const session = await auth()
    if (!session?.user?.id) throw new Error('Not authenticated')
    return session.user.id
}

export async function ensureSocialProfile(): Promise<SocialResult<SocialProfileRow>> {
    try {
        await requireSession()
        const supabase = createServerSupabaseClient()
        const { data: existing } = await supabase
            .from('social_profiles')
            .select('*')
            .eq('upload_post_username', SOCIAL_USERNAME)
            .maybeSingle()
        if (existing) return { success: true, data: existing as SocialProfileRow }

        const provider = getSocialProvider()
        // Idempotent-ish: Upload-Post 409/exists errors are tolerated
        try {
            await provider.createProfile(SOCIAL_USERNAME)
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            if (!/exist/i.test(msg)) throw e
        }
        const { data, error } = await supabase
            .from('social_profiles')
            .insert({ upload_post_username: SOCIAL_USERNAME })
            .select('*')
            .single()
        if (error) throw new Error(error.message)
        return { success: true, data: data as SocialProfileRow }
    } catch (e) {
        return fail(e)
    }
}

export async function getSocialProfileAction(): Promise<SocialResult<SocialProfileRow | null>> {
    try {
        await requireSession()
        const supabase = createServerSupabaseClient()
        const { data, error } = await supabase
            .from('social_profiles')
            .select('*')
            .eq('upload_post_username', SOCIAL_USERNAME)
            .maybeSingle()
        if (error) throw new Error(error.message)
        return { success: true, data: (data as SocialProfileRow) ?? null }
    } catch (e) {
        return fail(e)
    }
}

export async function generateSocialConnectUrl(): Promise<SocialResult<{ accessUrl: string; expiresAt: string | null }>> {
    try {
        await requireSession()
        const ensured = await ensureSocialProfile()
        if (!ensured.success) return { success: false, error: ensured.error }
        const provider = getSocialProvider()
        const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3030'}/api/social/callback`
        const res = await provider.generateConnectUrl({
            username: SOCIAL_USERNAME,
            redirectUrl,
        })
        return { success: true, data: { accessUrl: res.accessUrl, expiresAt: res.expiresAt ?? null } }
    } catch (e) {
        return fail(e)
    }
}

export async function syncConnectedAccounts(): Promise<SocialResult<SocialProfileRow>> {
    try {
        await requireSession()
        const provider = getSocialProvider()
        const profile = await provider.getProfile(SOCIAL_USERNAME)
        const supabase = createServerSupabaseClient()
        const { data, error } = await supabase
            .from('social_profiles')
            .update({
                connected_platforms: profile.connectedPlatforms ?? [],
                upload_post_metadata: profile.raw ?? null,
                last_synced_at: new Date().toISOString(),
            })
            .eq('upload_post_username', SOCIAL_USERNAME)
            .select('*')
            .single()
        if (error) throw new Error(error.message)
        return { success: true, data: data as SocialProfileRow }
    } catch (e) {
        return fail(e)
    }
}

export async function createSocialPost(input: CreateSocialPostInput): Promise<SocialResult<SocialPostRow>> {
    try {
        const userId = await requireSession()
        const supabase = createServerSupabaseClient()

        const { data: profile } = await supabase
            .from('social_profiles')
            .select('id')
            .eq('upload_post_username', SOCIAL_USERNAME)
            .maybeSingle()
        if (!profile) return { success: false, error: 'No social profile — connect accounts first' }
        if (input.platforms.length === 0) return { success: false, error: 'Pick at least one platform' }

        // Resolve media from the gallery generation (durable public URL)
        let mediaUrls: string[] = []
        let contentType: 'photo' | 'video' | 'text' = 'text'
        let generationId: string | null = null
        if (input.generationId) {
            const { data: gen, error: genErr } = await supabase
                .from('generations')
                .select('id, media_type, storage_path, user_id')
                .eq('id', input.generationId)
                .single()
            if (genErr || !gen) return { success: false, error: 'Generation not found' }
            if (gen.user_id && gen.user_id !== userId) return { success: false, error: 'Not your media' }
            const base = process.env.NEXT_PUBLIC_SUPABASE_URL
            mediaUrls = [`${base}/storage/v1/object/public/generations/${gen.storage_path}`]
            contentType = gen.media_type === 'VIDEO' ? 'video' : 'photo'
            generationId = gen.id
        }

        const caption = appendHashtagsToCaption(input.caption, input.hashtags)
        const validation = validatePostForPlatforms({ caption, platforms: input.platforms, contentType })
        if (!validation.valid) return { success: false, error: validation.errors.join('; ') }

        const provider = getSocialProvider()
        const publishInput = {
            username: SOCIAL_USERNAME,
            caption,
            platforms: input.platforms,
            mediaUrls,
            scheduledDate: input.scheduledAt ?? undefined,
        }
        const dispatch =
            contentType === 'video'
                ? await provider.publishVideo(publishInput)
                : contentType === 'photo'
                    ? await provider.publishPhoto(publishInput)
                    : await provider.publishText(publishInput)

        const { data: row, error: insErr } = await supabase
            .from('social_posts')
            .insert({
                social_profile_id: profile.id,
                generation_id: generationId,
                user_id: userId,
                caption,
                hashtags: input.hashtags,
                content_type: contentType,
                media_urls: mediaUrls,
                platforms: input.platforms,
                status: input.scheduledAt ? 'scheduled' : 'processing',
                scheduled_at: input.scheduledAt ?? null,
                upload_post_request_id: dispatch.requestId ?? null,
                upload_post_job_id: dispatch.jobId ?? null,
                upload_post_response: dispatch.raw ?? null,
            })
            .select('*')
            .single()
        if (insErr) throw new Error(insErr.message)
        return { success: true, data: row as SocialPostRow }
    } catch (e) {
        return fail(e)
    }
}

export async function listSocialPosts(): Promise<SocialResult<SocialPostRow[]>> {
    try {
        await requireSession()
        const supabase = createServerSupabaseClient()
        const { data, error } = await supabase
            .from('social_posts')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100)
        if (error) throw new Error(error.message)
        return { success: true, data: (data ?? []) as SocialPostRow[] }
    } catch (e) {
        return fail(e)
    }
}

export async function cancelScheduledPost(postId: string): Promise<SocialResult<SocialPostRow>> {
    try {
        await requireSession()
        const supabase = createServerSupabaseClient()
        const { data: post } = await supabase
            .from('social_posts').select('*').eq('id', postId).single()
        if (!post) return { success: false, error: 'Post not found' }
        if (post.status !== 'scheduled') return { success: false, error: `Cannot cancel a ${post.status} post` }
        if (post.upload_post_job_id) {
            try {
                await getSocialProvider().cancelScheduled(post.upload_post_job_id)
            } catch (e) {
                console.warn('[SocialService] provider cancel failed, marking cancelled anyway', e)
            }
        }
        const { data: row, error } = await supabase
            .from('social_posts')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('id', postId)
            .select('*')
            .single()
        if (error) throw new Error(error.message)
        return { success: true, data: row as SocialPostRow }
    } catch (e) {
        return fail(e)
    }
}

export async function registerUploadPostWebhook(): Promise<SocialResult<{ configured: boolean }>> {
    try {
        await requireSession()
        const provider = getSocialProvider()
        const url = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3030'}/api/webhooks/upload-post`
        await provider.configureWebhook({
            username: SOCIAL_USERNAME,
            url,
            secret: process.env.UPLOAD_POST_WEBHOOK_SECRET,
        })
        return { success: true, data: { configured: true } }
    } catch (e) {
        return fail(e)
    }
}
```

⚠️ The exact provider method names/signatures (`createProfile`, `generateConnectUrl`, `getProfile`, `publishPhoto/Video/Text`, `cancelScheduled`, `configureWebhook`) and DTO field names (`accessUrl`, `requestId`, `jobId`, `connectedPlatforms`, `raw`) MUST be reconciled against the copied `SocialProvider.ts` interface from Task 1 — read it first and adapt this file to ITS names (the interface is the source of truth, not this plan). Same for `validatePostForPlatforms`'s input shape and `appendHashtagsToCaption`'s signature. Also check how `@/auth` is exported in this repo: `grep -rn "export const { auth" src/auth.ts src/configs/auth.config.ts` — use the real import path (the gallery page `src/app/(protected-pages)/concepts/avatar-forge/gallery/page.tsx` shows the working pattern).

- [x] **Step 2: Type-check + lint** (same commands as Task 1 Step 4). Expected: empty.

- [x] **Step 3: Commit**

```bash
git add src/services/SocialService.ts
git commit -m "feat(social): SocialService server actions (profile, connect, publish, schedule, cancel)"
```

---

### Task 4: API routes (connect redirect, callback, webhook, cron) + vercel.json

**Files:**
- Create: `src/app/api/social/connect/route.ts`
- Create: `src/app/api/social/callback/route.ts`
- Create: `src/app/api/webhooks/upload-post/route.ts`
- Create: `src/app/api/cron/social-reconcile/route.ts`
- Modify: `vercel.json` (add cron entry; create the `crons` array if the file lacks one)

**Interfaces:**
- Consumes: `generateSocialConnectUrl`, `syncConnectedAccounts` (Task 3); `getSocialProvider`, `SOCIAL_USERNAME` (Task 1); `createServerSupabaseClient`.
- Produces: webhook endpoint used by `registerUploadPostWebhook` (Task 3); no code interfaces.

- [x] **Step 1: Connect redirect route** — `src/app/api/social/connect/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { generateSocialConnectUrl } from '@/services/SocialService'

export async function GET(request: Request) {
    const res = await generateSocialConnectUrl()
    if (!res.success || !res.data) {
        const back = new URL('/concepts/avatar-forge/social/accounts', request.url)
        back.searchParams.set('error', res.error || 'connect failed')
        return NextResponse.redirect(back)
    }
    return NextResponse.redirect(res.data.accessUrl)
}
```

- [x] **Step 2: Callback route** — `src/app/api/social/callback/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { syncConnectedAccounts } from '@/services/SocialService'

export async function GET(request: Request) {
    await syncConnectedAccounts() // best-effort; page shows a Refresh button too
    return NextResponse.redirect(new URL('/concepts/avatar-forge/social/accounts?connected=1', request.url))
}
```

- [x] **Step 3: Webhook route** — `src/app/api/webhooks/upload-post/route.ts`. Port the shape from `/Users/lenny/Documents/agentsoft/src/app/api/webhooks/upload-post/route.ts` (read it first), simplified: verify HMAC when `UPLOAD_POST_WEBHOOK_SECRET` + signature header are present (use the provider's `verifyWebhookSignature` if exported, else inline HMAC-SHA256 timing-safe compare); normalize the event name the same way agentsoft's `normalizeEventName` does (copy that function); on `publish_success` → update `social_posts` where `upload_post_request_id` matches: `status='published', published_at=now(), upload_post_response=payload`; on `publish_failed` → `status='failed', error_message`. Always return `NextResponse.json({ ok: true })` (200) whatever happens, logging unknown events with `console.log('[upload-post webhook]', event)`.

- [x] **Step 4: Reconcile cron** — `src/app/api/cron/social-reconcile/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getSocialProvider } from '@/lib/social/provider'

export async function GET(request: Request) {
    const secret = process.env.CRON_SECRET
    const authHeader = request.headers.get('authorization')
    if (secret && authHeader !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const supabase = createServerSupabaseClient()
    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { data: stuck } = await supabase
        .from('social_posts')
        .select('id, upload_post_request_id')
        .eq('status', 'processing')
        .lt('created_at', cutoff)
        .not('upload_post_request_id', 'is', null)
        .limit(50)
    const provider = getSocialProvider()
    let updated = 0
    for (const post of stuck ?? []) {
        try {
            const status = await provider.getRequestStatus(post.upload_post_request_id as string)
            if (status.completed) {
                await supabase.from('social_posts').update({
                    status: status.failed ? 'failed' : 'published',
                    published_at: status.failed ? null : new Date().toISOString(),
                    error_message: status.failed ? status.error ?? 'failed' : null,
                    updated_at: new Date().toISOString(),
                }).eq('id', post.id)
                updated++
            }
        } catch (e) {
            console.warn('[social-reconcile] status poll failed', post.id, e)
        }
    }
    return NextResponse.json({ checked: (stuck ?? []).length, updated })
}
```
⚠️ Reconcile `getRequestStatus`'s real return shape against the copied provider (it may return `{ status: string }` instead of `{ completed, failed }` — adapt the mapping: treat provider status strings like 'completed'/'success' as published, 'failed'/'error' as failed, anything else as still processing).

- [x] **Step 5: vercel.json cron.** Read `vercel.json`; add to (or create) the `crons` array:

```json
{ "path": "/api/cron/social-reconcile", "schedule": "*/15 * * * *" }
```

- [x] **Step 6: Type-check + lint** (standard commands). Expected: empty.

- [x] **Step 7: Commit**

```bash
git add src/app/api/social src/app/api/webhooks/upload-post src/app/api/cron/social-reconcile vercel.json
git commit -m "feat(social): connect/callback/webhook routes + reconcile cron"
```

---

### Task 5: Social UI — accounts page + nav entry

**Files:**
- Create: `src/app/(protected-pages)/concepts/avatar-forge/social/accounts/page.tsx`
- Create: `src/app/(protected-pages)/concepts/avatar-forge/social/accounts/_components/AccountsClient.tsx`
- Modify: `src/configs/navigation.config/concepts.navigation.config.ts` (add Social item after the gallery item, ~line 171)
- Modify: `src/configs/navigation-icon.config.tsx` (register icon)

**Interfaces:**
- Consumes: `getSocialProfileAction`, `ensureSocialProfile`, `syncConnectedAccounts`, `registerUploadPostWebhook` (Task 3 exact signatures).
- Produces: route `/concepts/avatar-forge/social/accounts` that Tasks 6-7 link to.

- [x] **Step 1: Server page** — `accounts/page.tsx`:

```tsx
import Container from '@/components/shared/Container'
import AccountsClient from './_components/AccountsClient'
import { getSocialProfileAction } from '@/services/SocialService'

export default async function Page() {
    const profile = await getSocialProfileAction()
    return (
        <Container className="py-6">
            <h3 className="mb-1">Social Accounts</h3>
            <p className="text-sm text-gray-500 mb-6">
                Connect the networks where your avatar content gets published (via Upload-Post)
            </p>
            <AccountsClient
                initialProfile={profile.success ? profile.data ?? null : null}
                loadError={profile.success ? null : profile.error ?? null}
            />
        </Container>
    )
}
```
(Check that `@/components/shared/Container` exists — grep its usage in other protected pages; if the app uses a different wrapper, mirror the gallery page's layout.)

- [x] **Step 2: Client component** — `AccountsClient.tsx`: ECME `Card`/`Button`/`Notification`+`toast`. State: `profile`, `isBusy`. Renders:
  - If no profile: explainer + Button "Set up social profile" → `ensureSocialProfile()` → setProfile.
  - If profile: Button "Connect accounts" → `window.open('/api/social/connect', '_blank', 'width=600,height=760')`; Button "Refresh" → `syncConnectedAccounts()` → setProfile; Button "Register webhook" (variant plain, small) → `registerUploadPostWebhook()` → toast result.
  - Connected platforms list: map `profile.connected_platforms` (array of strings or objects — normalize with `typeof p === 'string' ? p : (p as { platform?: string }).platform ?? JSON.stringify(p)`) to Tag chips; empty state text otherwise.
  - Show `loadError` / action errors in a red alert box (same pattern as VideoToPromptDialog's error box).
  Write the full component; keep it under ~150 lines.

- [x] **Step 3: Sidebar nav.** In `concepts.navigation.config.ts`, after the gallery item block (ends ~line 171) add:

```ts
{
    key: 'concepts.avatarForge.social',
    path: `${CONCEPTS_PREFIX_PATH}/avatar-forge/social/accounts`,
    title: 'Social Media',
    translateKey: 'nav.conceptsAvatarForge.social',
    icon: 'avatarSocial',
    type: NAV_ITEM_TYPE_ITEM,
    authority: [ADMIN, USER],
    subMenu: [],
},
```
Mirror the exact shape of the gallery item above it (copy its structure; only key/path/title/translateKey/icon change). In `navigation-icon.config.tsx` register `avatarSocial` with a share icon from the icon set already imported there (e.g. `PiShareNetworkDuotone` if the file uses Pi icons — match whatever family the file imports).

- [x] **Step 4: Type-check + lint; manual smoke** — `npm run dev` → open `/concepts/avatar-forge/social/accounts`, click "Set up social profile", expect the profile row created (and sub-user visible via `curl -s https://api.upload-post.com/api/uploadposts/users -H "Authorization: Apikey $UPLOAD_POST_API_KEY"` showing `prime-avatar`).

- [x] **Step 5: Commit**

```bash
git add "src/app/(protected-pages)/concepts/avatar-forge/social" src/configs/navigation.config/concepts.navigation.config.ts src/configs/navigation-icon.config.tsx
git commit -m "feat(social): accounts page (connect via Upload-Post) + sidebar entry"
```

---

### Task 6: Social UI — composer + posts pages

**Files:**
- Create: `src/app/(protected-pages)/concepts/avatar-forge/social/composer/page.tsx` (server: reads `?generationId=`, fetches the generation row + public URL + connected platforms, renders client composer)
- Create: `.../social/composer/_components/SocialComposer.tsx`
- Create: `src/app/(protected-pages)/concepts/avatar-forge/social/posts/page.tsx`
- Create: `.../social/posts/_components/PostsClient.tsx`

**Interfaces:**
- Consumes: `createSocialPost`, `listSocialPosts`, `cancelScheduledPost`, `getSocialProfileAction` (Task 3).
- Produces: route `/concepts/avatar-forge/social/composer?generationId=<uuid>` that Task 7's Publish buttons target.

- [x] **Step 1: Composer server page.** Fetch session (`auth()`), the profile (connected platforms), and — when `generationId` is present — the generation row (`id, media_type, storage_path, prompt`) with ownership check, building `publicUrl` as `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/generations/${storage_path}`. Render `<SocialComposer media={...} platforms={...} />`; when profile missing → CTA linking to accounts page.

- [x] **Step 2: SocialComposer client.** Full component: media preview (img or `<video controls>`), caption `<textarea>` with char counter, hashtag input (Enter adds chip, x removes — reuse the pattern from `HashtagInput` in agentsoft but write it inline, ~30 lines), platform checkboxes from `platforms` prop (disabled + hint when none connected), schedule radio: "Publish now" / "Schedule" with `<input type="datetime-local">` (min = now; convert to ISO with timezone via `new Date(value).toISOString()`), submit Button → `createSocialPost({ generationId, caption, hashtags, platforms: selected, scheduledAt })` → success toast + router.push('/concepts/avatar-forge/social/posts'); error → red alert.

- [x] **Step 3: Posts page + client.** Server page calls `listSocialPosts()`, renders `PostsClient` with rows. PostsClient: table/cards showing thumbnail (first media_urls entry, `<img>`/`<video>` by content_type), caption (truncated), platform chips, status Tag (color: scheduled=amber, processing=blue, published=emerald, failed=red, cancelled=gray), scheduled/published time, and a Cancel button (only when status==='scheduled') → `cancelScheduledPost(id)` → refresh via `router.refresh()`. Include an empty state.

- [x] **Step 4: Type-check + lint.** Expected: empty.

- [x] **Step 5: Commit**

```bash
git add "src/app/(protected-pages)/concepts/avatar-forge/social/composer" "src/app/(protected-pages)/concepts/avatar-forge/social/posts"
git commit -m "feat(social): composer (publish/schedule) + posts status pages"
```

---

### Task 7: Publish buttons in gallery + ImagePreviewModal, E2E verification

**Files:**
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/gallery/_components/GenerationGallery.tsx` (preview Dialog action row, ~lines 242-288)
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_components/ImagePreviewModal.tsx` (action bar ~1274-1357 + props ~52-72)

**Interfaces:**
- Consumes: composer route from Task 6 (`/concepts/avatar-forge/social/composer?generationId=`).

- [x] **Step 1: GenerationGallery.** In the preview actions row add, next to Download:

```tsx
<Button
    size="sm"
    icon={<HiOutlineShare />}
    onClick={() => router.push(`/concepts/avatar-forge/social/composer?generationId=${selected.id}`)}
>
    Publish
</Button>
```
Import `HiOutlineShare` from `react-icons/hi` and `useRouter` from `next/navigation` if not present; follow the exact Button props style of the neighboring Download button (read the file first).

- [x] **Step 2: ImagePreviewModal.** The studio modal shows both unsaved (in-memory) and saved media. Add optional prop `generationId?: string | null` threaded from where the modal is opened for saved gallery items IF the caller has it; simplest correct scope: only render the Publish button when `previewMedia` carries a DB id (inspect the `previewMedia` type — if it has no DB id field, SKIP this file entirely and note it in the report; the persisted gallery button from Step 1 is the primary surface).

- [x] **Step 3: Type-check + lint.** Expected: empty.

- [x] **Step 4: Manual E2E (controller runs; document results)**
1. `npm run dev` → accounts page → Set up profile → Connect accounts popup (connect e.g. TikTok/Instagram test account) → Refresh shows platform chip.
2. Register webhook button → success toast (verify with `GET /api/uploadposts/users/notifications`? optional).
3. Gallery → pick an image → Publish → composer prefilled → caption "Test from prime-avatar" → Publish now → posts page shows processing → after webhook/reconcile it flips to published (check the actual network post).
4. Schedule variant: +10 min → shows scheduled → Cancel works on a second one.
5. `npx tsc --noEmit` + `npm run build` pass.

- [x] **Step 5: Commit**

```bash
git add "src/app/(protected-pages)/concepts/avatar-forge/gallery/_components/GenerationGallery.tsx" "src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_components/ImagePreviewModal.tsx"
git commit -m "feat(social): Publish action from gallery into the social composer"
```
