# Plan: Dashboards de ingresos (Inicio + por avatar)

Spec: `docs/superpowers/specs/2026-09-17-earnings-dashboards-design.md`.

## Hecho en código (2026-09-17)

- [x] Migración `20260917150000_earnings_dashboards.sql` (tabla, índice, RPCs, grants)
- [x] `database.generated.ts` (tabla + `Functions`), `TENANT_TABLES`, exenciones en
      `eslint.config.mjs` (tercer candado) y `scripts/check-tenant-access.mjs`, `vercel.json`
- [x] `src/lib/earnings/period.ts` + tests (17) · `queries.ts` · `fanvueSync.ts`
- [x] `FanvueClient.listAgencyEarnings` / `listAllAgencyEarnings`, tipos, `AGENCY_EARNINGS_PATH`
- [x] Cron `src/app/api/cron/earnings-sync/route.ts`
- [x] `src/services/EarningsService.ts` (3 actions, `content:read`)
- [x] `src/lib/avatarThumbnail.ts` (miniaturas sólo R2, sin Storage)
- [x] Config: `authenticatedEntryPath` → `/dashboards/home`, nav "Inicio" primero, icono,
      rutas (`/dashboards/home`, `/concepts/avatar-forge/avatar-list/[slug]`), `nav.dashboard.home`
      en en/es/zh/ar
- [x] `src/components/view/earnings/*` + `format.ts` con tests (7)
- [x] Páginas Inicio y avatar (+ `loading.tsx`), `AvatarCard` con acción "Dashboard" y nombre enlazado
- [x] `tsc`, eslint, `npm test` (482), `check:tenant`, prettier: en verde

## Pendiente en vivo (por orden)

- [x] **Migración aplicada** el 2026-09-18 con el MCP de Supabase (`earnings_dashboards` +
      `earnings_functions_search_path`). Verificado: 2 funciones, tabla con RLS, índice, grants
      sólo a service_role, `search_path` fijo; advisors sin avisos nuevos salvo "índice sin uso"
      (recién creado).
- [x] **Deploy + spike** (2026-09-18, commit 4d0d2b0, dpl_7TH34CzcLyy6h8uCmpUxze6nN3kU): el cron
      horario corre sin fallos (`1 orgs sincronizadas · 12 filas`) → `/v1/agencies/earnings` responde;
      no hizo falta el `?path=`. Importes a cero para 16-18 sep.
- [ ] **Backfill** por org en rebanadas de ≤ 90 días. BLOQUEO: todas las URLs del proyecto son
      `*.vercel.app` con Deployment Protection (SSO), así que el cron no se puede llamar a mano con
      `curl` desde fuera; sólo lo invoca Vercel. Opciones: (a) "Protection Bypass for Automation" en
      Vercel y mandar `x-vercel-protection-bypass`; (b) exponer el backfill desde la UI ampliando
      `refreshEarnings(days)` (admin, ≤ 365 días) — propuesto, no hecho.
      `?org=<uuid>&from=2026-06-19&to=2026-09-17` (y anteriores). Verificar con
      `select creator_uuid, count(*), min(day), max(day), sum(gross_cents) from fanvue_daily_earnings where organization_id='…' group by 1;`
- [ ] Revisar ambos dashboards en el deploy: claro/oscuro, móvil 375px, cambio de
      período (URL, back/forward), "Actualizar", org sin conexiones (onboarding),
      sólo Telegram, sólo Fanvue, avatar de otra org (redirect), `?period=basura`.

## Fase C (requiere reconectar Fanvue)

- [ ] `'read:insights'` en `FANVUE_SCOPES` (src/lib/fanvue/oauth.ts) → el usuario reconecta.
- [ ] `FanvueClient.getCreatorEarningsSummary(creatorUuid|null, { startDate, endDate, granularity, timezone })`
      → `GET /v1/creators/{uuid}/insights/earnings/summary` (self: `/v1/insights/earnings/summary`).
- [ ] `AvatarEarningsDashboard.fanvueBreakdown` (breakdownBySource neto) + `fanvueHourOfDay`
      (averageByHourOfDay), sólo si `fanvue.hasInsightsScope`; 403 → tarjeta de reconexión.
- [ ] UI: `FanvueBreakdownSection` (RankedBarList azul, 7 filas) + `FanvueHourOfDayCard` (barras 24h).
- [ ] Avatares "self": cubrirlos con el summary sin prefijo de creator.

## Fase D (opcional)

- [ ] Webhook `creator.payment.succeeded` → RPC `increment_fanvue_daily_earnings`
      (Fanvue casi en tiempo real; el cron horario sobreescribe la cifra autoritativa).
- [ ] `GET /v1/creators/{uuid}/insights/top-fans` por avatar.
