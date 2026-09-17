-- Corrige el texto de "telegram" para reflejar que el canal YA funciona y cobra.
--
-- La migración 20260911130000 corrigió el catálogo a "Próximamente" porque en
-- ese momento no había ni una línea de código de Telegram en el repositorio.
-- La rama feat/telegram-comision-cobrable construyó el canal completo:
-- conectar bot, webhook, galería con precio en Stars, entrega de contenido de
-- pago y comisión por venta (`commission_ai_pct`/`commission_manual_pct` de
-- esta misma fila, vía `wallet_charge`). Quien instale el módulo y conecte un
-- bot entra en una cuota real de $9/mes prorrateada por días. Seguir
-- anunciando "Próximamente" en la tarjeta de un módulo que ya cobra sería la
-- única pantalla del catálogo que miente sobre dinero — el mismo defecto que
-- ya se desmanteló en seis pantallas (commit ba56d43), y una vez en este
-- propio catálogo (la migración citada arriba), ahora en la dirección
-- contraria.
--
-- No se borra ni se recrea la fila (se perdería `installed_at`/`installed_by`
-- de quien ya lo haya instalado): sólo se actualiza la descripción. El
-- `insert` de la migración original (20260911120000) queda editado con este
-- mismo texto, así que una reconstrucción desde cero inserta ya lo correcto
-- y este `update` queda como no-op idempotente — mismo patrón que
-- 20260912120000_module_catalog_precios_telegram.sql para los precios.
update module_catalog
set description = 'Conecta tu bot de Telegram y vende contenido con Telegram Stars. Las Stars se acreditan a tu bot; la plataforma cobra una comisión por venta.',
    updated_at = now()
where slug = 'telegram';
