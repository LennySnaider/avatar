-- Alinea el repositorio con los precios que YA están en la base de datos.
--
-- El 12-sep a las 05:51 UTC los precios de `telegram` se cambiaron en caliente,
-- con SQL directo, sin migración y sin commit: la cuota pasó de $29.90 a $9.00,
-- la comisión de la IA del 15% al 20% y la manual del 5% al 7%. El código lee
-- siempre de la base, así que nada se rompió — pero el repositorio seguía
-- diciendo los números viejos, y un esquema reconstruido desde las migraciones
-- habría nacido con precios equivocados sin que nadie supiera por qué.
--
-- Esta migración NO cambia nada en la base actual: la alcanza. Su valor es que
-- el historial explique de dónde salen los números. El `insert` de la migración
-- original lleva ya los mismos valores, así que una reconstrucción desde cero
-- inserta lo correcto y este `update` queda como un no-op idempotente.

update module_catalog
set price_usd_month_per_unit = 9.00,
    commission_ai_pct = 20.00,
    commission_manual_pct = 7.00,
    updated_at = now()
where slug = 'telegram';
