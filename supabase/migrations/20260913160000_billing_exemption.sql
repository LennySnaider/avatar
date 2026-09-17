-- Exencion de cobro por organizacion: cuota de modulo y comision de venta.
--
-- El dueno de la plataforma (AvatarLab, la organizacion 'default') usa su
-- propia aplicacion: tiene avatares en su propia organizacion y vende por
-- Telegram como cualquier cliente. Sin esta columna el sistema le cobraria a
-- si mismo la cuota mensual del modulo y la comision por venta, ensuciando su
-- contabilidad con su propio uso.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DECISION DE DISENO (la que no es negociable): una organizacion exenta NO
-- genera NINGUN asiento en token_ledger. Ni uno de cero tokens.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- La invariante que sostiene toda la contabilidad, verificada varias veces:
--
--   sum(token_ledger.tokens) == org_wallets.included_balance + purchased_balance
--
-- Un asiento que registra un importe pero no mueve el saldo rompe esa
-- igualdad para siempre. Y un asiento de cero tokens mentiria sobre el
-- precio: el precio no era cero, era el que corresponda (p.ej. $9/mes o el
-- 7%/20% de una venta) y se decidio no cobrarlo. Lo correcto es no escribir
-- nada en el ledger y contarlo aparte: el contador `exempt` en
-- ModuleFeesResult, el campo `exempt` en StarsCommissionResult, y un aviso en
-- el log (ver src/lib/billing/moduleFees.ts y src/lib/billing/moduleCharges.ts).
alter table organizations
    add column if not exists billing_exempt boolean not null default false;

comment on column organizations.billing_exempt is
    'Organizacion exenta de cobro (cuota mensual de modulo + comision por venta). Una organizacion exenta NO produce NINGUN asiento en token_ledger -- ni uno de cero tokens -- porque un asiento que registra un importe sin mover saldo rompe la invariante sum(token_ledger.tokens) = org_wallets.included_balance + purchased_balance. Lo exento se cuenta aparte (contador exempt en ModuleFeesResult / campo exempt en StarsCommissionResult) y se deja rastro en el log, nunca en el libro mayor. Ver src/lib/billing/exemption.ts.';

-- telegram_stars_sales.commission_exempt distingue "exenta" de "fallo".
--
-- La reconciliacion que detecta ventas rotas es:
--
--   select * from telegram_stars_sales
--   where status = 'purchased' and commission_settled_at is null;
--
-- Hoy `commission_settled_at` queda NULL tanto si la comision nunca se pudo
-- asentar (fallo real) como si -- con esta migracion -- la organizacion esta
-- exenta. Sin esta columna, TODAS las ventas del dueno de la plataforma
-- apareceran como fallos en esa consulta. `commission_exempt` permite
-- distinguir un caso del otro sin dejar de marcar `commission_settled_at`
-- (que SI se estampa en una venta exenta: ver src/lib/telegram/sales.ts).
alter table telegram_stars_sales
    add column if not exists commission_exempt boolean not null default false;

-- La organizacion de la plataforma vende por su propio Telegram como
-- cualquier cliente: queda exenta de cobrarse a si misma.
update organizations
set billing_exempt = true,
    updated_at = now()
where id = '00000000-0000-0000-0000-000000000001';
