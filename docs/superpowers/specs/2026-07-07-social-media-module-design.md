# Social Media Module (Upload-Post) — Design

**Date:** 2026-07-07
**Status:** Approved by user (brainstorming; scope + credentials decided)

## Problem

prime-avatar generates avatar images/videos but has no way to publish them.
AgentSoft already has a full multi-tenant Social Media Scheduling module built
on Upload-Post (BSP covering 10 platforms). Port its core to prime-avatar as a
**single-user** module: connect accounts, publish now, schedule, track status.

**Decisions made:**
- Scope v1: **publish + schedule** (composer, scheduled queue, post status via
  webhook + reconcile cron). NO analytics, NO queue-slots, NO agency views,
  NO Meta-direct engagement path.
- Credentials: **dedicated Upload-Post account** for prime-avatar (separate
  from AgentSoft). Key already in `.env` as `UPLOAD_POST_API_KEY`; validated
  live (`GET /api/uploadposts/users` → 200, 0 profiles, profile limit 2,
  plan "default"). `UPLOAD_POST_WEBHOOK_SECRET` generated and stored in `.env`.
  Both must also be added to Vercel env for production.

## Source of truth (AgentSoft files to port from)

Repo `/Users/lenny/Documents/agentsoft`:
- `src/lib/social/providers/SocialProvider.ts` — provider interface (verbatim)
- `src/lib/social/providers/UploadPostProvider.ts` — REST client (verbatim;
  auth header is literal `Authorization: Apikey <key>`; multipart strips
  Content-Type for /upload* endpoints)
- `src/lib/social/platformValidators.ts`, `hashtagHelpers.ts`,
  `captionInterpolate.ts` — helpers (verbatim)
- `src/types/social.ts` — types (strip org/agency/credits fields)
- `src/server/actions/social/{oauth,profiles,posts}.ts` — simplify (below)
- `src/app/api/webhooks/upload-post/route.ts` — webhook handler
- `src/app/api/cron/social-reconcile/route.ts` — reconcile cron
- `src/components/social/` — SocialComposer, PlatformSelector, CaptionEditor,
  HashtagInput, SchedulePicker, ConnectAccountButton, ConnectedAccountsList,
  PlatformIcons (adapt to ECME single-user; MediaPicker is replaced by
  gallery-driven media selection)

**Multi-tenant → single-user simplifications:**
- Delete `providerFactory`/`uploadPostConfig` DB chain → one factory:
  `new UploadPostProvider(process.env.UPLOAD_POST_API_KEY!, process.env.UPLOAD_POST_BASE_URL)`
- No `getAuthContext`/organization_id — server actions verify NextAuth
  `auth()` session and operate on the single profile row.
- Upload-Post sub-user username fixed: `prime-avatar`.
- Strip credits (deduct/refund), workflows triggers, agency, whitelabel logo.

## DB (new migration in prime-avatar's Supabase)

Two tables (no organization_id, RLS simple `auth.role() = 'service_role'`
usage — all access goes through server actions with the service client, same
pattern as the rest of prime-avatar):

```sql
social_profiles (
  id uuid pk default gen_random_uuid(),
  upload_post_username text unique not null,   -- 'prime-avatar'
  status text not null default 'active',
  connected_platforms jsonb not null default '[]',
  upload_post_metadata jsonb,
  last_synced_at timestamptz,
  created_at timestamptz default now()
)

social_posts (
  id uuid pk default gen_random_uuid(),
  social_profile_id uuid references social_profiles(id),
  generation_id uuid references generations(id),  -- link to gallery media
  user_id uuid,
  caption text not null default '',
  hashtags text[] not null default '{}',
  content_type text not null,                    -- 'photo' | 'video' | 'text'
  media_urls text[] not null default '{}',       -- public URLs sent to provider
  platforms jsonb not null default '[]',
  status text not null default 'draft',          -- scheduled|processing|published|failed|cancelled
  scheduled_at timestamptz,
  published_at timestamptz,
  upload_post_request_id text,
  upload_post_job_id text,
  upload_post_response jsonb,
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
)
```

## Server actions — `src/services/SocialService.ts` ('use server', error-as-data)

- `ensureSocialProfile()` — get-or-create the single profile (provider
  createProfile 'prime-avatar' if missing) → row.
- `generateSocialConnectUrl()` — provider JWT connect URL (48h) for the
  accounts page popup.
- `syncConnectedAccounts()` — refresh `connected_platforms` from provider.
- `createSocialPost(input)` — validate caption/platforms
  (platformValidators), resolve **public URL** for the generation's
  `storage_path` (`/storage/v1/object/public/generations/<path>` — signed URLs
  expire in 1h, Upload-Post needs durable), dispatch
  `publishPhoto`/`publishVideo` (with `scheduled_date` when scheduling),
  insert `social_posts` row, return it.
- `listSocialPosts(filter?)`, `cancelScheduledPost(postId)`.

## API routes

- `src/app/api/social/connect/route.ts` — redirect to provider connect URL.
- `src/app/api/social/callback/route.ts` — post-OAuth: syncConnectedAccounts
  → redirect to /concepts/avatar-forge/social/accounts.
- `src/app/api/webhooks/upload-post/route.ts` — HMAC-verified; on
  publish_success/publish_failed updates the matching `social_posts` row by
  `upload_post_request_id`. Always 200.
- `src/app/api/cron/social-reconcile/route.ts` — every 15 min (vercel.json),
  `Bearer CRON_SECRET`; polls `getRequestStatus` for posts stuck in
  processing >15 min.

## UI

New sidebar item **Social** under AVATAR FORGE
(`src/configs/navigation.config/concepts.navigation.config.ts` after the
gallery item; icon registered in navigation-icon.config).

Routes under `src/app/(protected-pages)/concepts/avatar-forge/social/`:
- `accounts/page.tsx` — ConnectAccountButton (popup + refresh button, no
  realtime) + ConnectedAccountsList.
- `composer/page.tsx` — SocialComposer: media preview (from `?generationId=`
  or none for text posts), CaptionEditor + HashtagInput, PlatformSelector
  (from connected platforms), SchedulePicker (now / date-time), submit →
  createSocialPost.
- `posts/page.tsx` — list of posts with status chips, scheduled time,
  platforms, cancel button for scheduled.

**Gallery integration:** "Publish" button in
`gallery/_components/GenerationGallery.tsx` preview actions and in the
studio's `ImagePreviewModal` action bar (only for SAVED media with a
generation id) → navigates to `/concepts/avatar-forge/social/composer?generationId=<id>`.

## Ops notes

- Env (local `.env` done; add to Vercel): `UPLOAD_POST_API_KEY`,
  `UPLOAD_POST_WEBHOOK_SECRET`, optional `UPLOAD_POST_BASE_URL`, existing
  `CRON_SECRET` (create if absent).
- Webhook registration: one-time `configureWebhook` call to Upload-Post
  pointing at `https://avatar-liart.vercel.app/api/webhooks/upload-post`
  (exposed as a small "Register webhook" button on the accounts page).
- Upload-Post account is plan "default" (limit 2 profiles) — platform posting
  quotas may require upgrading the plan; surface provider errors as data.

## Out of scope (YAGNI)

Analytics/snapshots, queue slots, agency views, Meta-direct engagement, AI
caption generation, MediaPicker over storage (gallery link covers it),
realtime listeners.

## Verification

1. tsc + eslint clean.
2. `ensureSocialProfile` creates the 'prime-avatar' sub-user (visible via
   `GET /api/uploadposts/users`).
3. Accounts page: connect at least one platform via the JWT popup; list shows
   it after refresh.
4. Publish an image from the gallery to one platform (publish now) → post row
   becomes published (webhook or reconcile).
5. Schedule a post +10 min → appears as scheduled; cancel works; a second
   scheduled post left to fire updates to published.
