# Dashboards de ingresos (Inicio + por avatar) — Diseño

**Fecha:** 2026-09-17
**Estado:** Implementado (fases A y B en código; migración aplicada 2026-09-18, fase C pendiente de re-consentimiento)

## Problema

No había ninguna pantalla que respondiera "¿cuánto gana cada avatar?". Telegram
Stars ya se registraba venta a venta (`telegram_stars_sales`) pero sólo se veía
como tabla en la pestaña Telegram; de Fanvue no se guardaba ni leía ningún
ingreso. El landing tras el login era el demo mock de ECME (`/dashboards/ecommerce`).
SUPER-PLAN Fase 6 pedía "rollup por cron con earnings Fanvue por avatar + KPIs
del agente; el dashboard lee rollups".

## Decisiones

- **Dos unidades, nunca una cifra.** Fanvue en centavos de USD (bruto y neto),
  Telegram en Stars. Sin conversión ni total combinado (regla de
  `TelegramSalesPanel.tsx`: el cambio Star→USD depende de la tienda del fan).
- **Fanvue se trae de `GET /v1/agencies/earnings`** (por creator y por día UTC,
  scopes `read:agency` + `read:creator`, ya concedidos → sin reconectar) a la
  tabla `fanvue_daily_earnings`, POR CREATOR: el cruce con
  `avatars.fanvue_creator_uuid` se hace al leer. Fanvue tiene dos ejes de
  versión: header `X-Fanvue-API-Version: 2025-06-26` (se mantiene) y prefijo de
  ruta `/v1` (este endpoint sólo existe en v1; el resto del cliente sigue en v0
  sin prefijo).
- **Telegram no se copia a ningún rollup**: se agrega en vivo en SQL.
- **Agregación en RPC** (`earnings_series`, `earnings_by_avatar`) para esquivar
  el techo silencioso de 1000 filas de PostgREST; ambas reciben `p_org` y lo
  filtran en todas sus consultas.
- **Período en la URL** (`?period=30d`), presets `7d/30d/90d/thisMonth/lastMonth/12m`,
  siempre contra un tramo anterior de la misma longitud; todo en UTC.
- **UI en español**, calcada del dashboard de Ecommerce de ECME: Overview (KPIs
  clicables + selector + gráfica) y tabla a la izquierda, tarjetas a la derecha,
  ventas recientes abajo. Ranking y desgloses en un solo tono (la paleta
  `COLORS` no pasa daltonismo para categorías adyacentes).
- **Permiso `content:read`** en las tres server actions (quinto candado).
- El desglose por tipo de Fanvue (subs/tips/PPV, mejores horas) requiere
  `read:insights` → **fase C**: añadir el scope y reconectar Fanvue una vez.

## Datos

- Migración `supabase/migrations/20260917150000_earnings_dashboards.sql`:
  `fanvue_daily_earnings` (unique org+creator+día), índice
  `telegram_stars_sales(organization_id, status, purchased_at desc)`, las dos
  funciones y sus grants (invoker, sólo service_role).
- `src/lib/earnings/period.ts` (puro, tests) · `queries.ts` (RPC) ·
  `fanvueSync.ts` (núcleo del cron; ventana autoritativa con ceros; candado de
  token: la conexión que resuelve `getValidAccessToken(userId)` tiene que ser la
  de la org de la fila, si no se salta con `connection_mismatch`).
- `src/app/api/cron/earnings-sync/route.ts` (cada hora, `41 * * * *`;
  `?days=`, `?from=&to=` para backfill, `?org=`, `?dryRun=1[&path=]`).
- `src/services/EarningsService.ts`: `getOrgEarningsDashboard`,
  `getAvatarEarningsDashboard` (devuelve `error: 'not_found'` estable),
  `refreshEarnings` (ayer+hoy, piso de 60 s por org).

## UI

- `/dashboards/home` ("Inicio", nuevo `authenticatedEntryPath`, primer ítem del
  menú). `/concepts/avatar-forge/avatar-list/[slug]` (hub del avatar, desde la
  tarjeta de "My Avatars" y el ranking).
- Compartido en `src/components/view/earnings/`: `EarningsOverviewCard`,
  `EarningsChart` (ApexCharts, una métrica por vez, período anterior punteado),
  `AvatarRankingTable`, `TopAvatarsCard`, `RankedBarList`, `Sparkline` (SVG),
  `ConnectionStatusCard`, `RecentSalesList`, `SyncNotices`, `PeriodSelect`,
  `RefreshButton`, `PendingFrame`, `EarningsSkeleton`, `OnboardingCards`,
  `format.ts` (tests).

## Fuera de alcance (v1)

- Avatares "self" (sin `fanvue_creator_uuid`): fuera del rollup hasta la fase C.
- Desglose por tipo y top fans de Fanvue (fase C), webhook
  `creator.payment.succeeded` (fase D).
- Donut multicolor / apilado por avatar (paleta no validada).

## Verificación

- `npx tsc --noEmit`, `npx eslint <rutas nuevas>`, `npm test` (period + format),
  `npm run check:tenant`, prettier sobre lo nuevo — todo en verde el 2026-09-17.
- Pendiente en vivo: aplicar la migración (MCP `apply_migration`), spike
  `?dryRun=1` del cron, backfill por rebanadas de 90 días, revisar ambos
  dashboards en claro/oscuro y móvil en el deploy.
