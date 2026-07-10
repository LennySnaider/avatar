# Social Analytics Dashboard — Design

**Date:** 2026-07-09
**Status:** Approved by user (brainstorming)

## Problem

The social module publishes to Instagram/X but there's no way to measure
results. Upload-Post exposes account-level analytics (followers, views,
impressions, engagement) via `getAnalytics` — already ported verbatim in
`src/lib/social/providers/UploadPostProvider.ts`. AgentSoft's reference
implementation (analytics action + daily cron + chart, ~475 lines) was
deliberately excluded from the v1 port; this builds the single-user version.

## Design

### DB — `social_analytics_snapshots`
New migration `supabase/migrations/20260709_social_analytics.sql` (applied
live via Supabase MCP), single-user (no organization_id):

```sql
create table if not exists social_analytics_snapshots (
    id uuid primary key default gen_random_uuid(),
    social_profile_id uuid references social_profiles(id) on delete cascade,
    platform text not null,
    followers integer not null default 0,
    views integer not null default 0,
    impressions integer not null default 0,
    engagement_rate numeric not null default 0,
    posts_count integer not null default 0,
    raw_data jsonb,
    snapshot_date date not null default current_date,
    created_at timestamptz not null default now(),
    unique (platform, snapshot_date)
);
alter table social_analytics_snapshots enable row level security;
```
One snapshot per platform per day (upsert on conflict). Table types go
straight into the shared `Database` type in `src/@types/supabase.ts`
(NO local type wrappers — lesson from the social module reviews).

### Service — `src/services/SocialAnalyticsService.ts` ('use server', error-as-data)
Separate file (SocialService is already ~500 lines). Signatures consumed by
UI + cron:

```ts
export interface AnalyticsResult<T> { success: boolean; data?: T; error?: string }
export interface PlatformSnapshot {
    platform: string; followers: number; views: number; impressions: number
    engagement_rate: number; posts_count: number; snapshot_date: string
}
export interface AnalyticsSummary {
    platforms: {
        platform: string
        current: PlatformSnapshot
        delta: { followers: number; views: number; engagementRate: number } // vs oldest in range
        series: PlatformSnapshot[] // ascending by date, within range
    }[]
    lastSnapshotDate: string | null
}
export async function refreshAnalytics(): Promise<AnalyticsResult<{ platforms: number }>>
export async function getAnalyticsSummary(daysBack?: number): Promise<AnalyticsResult<AnalyticsSummary>>
```
- `refreshAnalytics`: session-gated (auth()); reads connected platforms from
  `social_profiles` (normalize string|object entries, same as AccountsClient);
  calls `provider.getAnalytics(SOCIAL_USERNAME, platforms)` — reconcile the
  REAL signature/DTO against `SocialProvider.ts` before writing; upserts one
  row per platform for today (`onConflict: 'platform,snapshot_date'`).
  Provider errors (e.g. plan-gated 403) surface as data.
- The cron reuses the same internal refresh logic WITHOUT the session gate —
  export a non-gated `runAnalyticsRefresh()` used by both (cron authenticates
  via CRON_SECRET instead).
- `getAnalyticsSummary(daysBack = 30)`: reads snapshots since cutoff, groups
  by platform, current = newest row, delta vs oldest row in range.

### Cron — `src/app/api/cron/social-analytics/route.ts`
Daily `0 4 * * *` (add to vercel.json crons array). Bearer CRON_SECRET gate
(same pattern as social-reconcile). Calls `runAnalyticsRefresh()`; returns
`{ platforms }` counts. Port shape from agentsoft's cron, minus org loop.

### UI — `src/app/(protected-pages)/concepts/avatar-forge/social/analytics/`
- `page.tsx` (server): auth() gate; `getAnalyticsSummary(30)`; renders client.
- `_components/AnalyticsClient.tsx`:
  - Range selector pills: 7 / 30 / 90 days (re-fetches via the server action).
  - KPI cards per platform: followers, engagement rate, views, each with
    delta vs range start (↑ green / ↓ red).
  - Line chart (followers + views over time per platform) using the ECME
    Chart shared component (ApexCharts wrapper in src/components/shared/ —
    read its real props first; AgentSoft's Recharts chart is NOT ported).
  - "Refresh now" button → `refreshAnalytics()` → re-fetch summary; loading
    + error states (red alert box pattern).
  - Empty state when no snapshots: explain history builds daily + Refresh CTA.

### Social section nav
New `_components/SocialNav.tsx` under `social/` — horizontal pill nav
(Accounts · Composer · Posts · Analytics) with active state by pathname;
rendered at the top of all four social pages.

## Out of scope (YAGNI)
- Fanvue analytics (different API).
- Per-post metrics (Upload-Post analytics are account-level).
- Template/avatar attribution (PRD/AgentSoft productization layer).

## Ops notes
- Upload-Post plan "default" may gate the analytics endpoint — a 403 shows
  as a readable dashboard error, not a crash.
- Cron only runs in prod (Vercel); local history builds via Refresh now.

## Verification
- tsc + eslint + `npm run build` clean.
- Live check: call the real `GET /api/analytics/{username}` via provider
  (script or Refresh button in dev) and confirm a snapshot row lands.
- Manual: analytics page renders KPIs + chart after 1 refresh; range pills
  re-query; SocialNav navigates across the 4 pages.
