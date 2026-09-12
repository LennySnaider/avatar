-- Corrige el texto sembrado de "telegram" en 20260911120000_org_modules.sql.
--
-- El catálogo anunciaba una integración funcionando ("Conecta tu bot de
-- Telegram y vende contenido con Telegram Stars.") y no hay ni una línea de
-- código de Telegram en el repositorio: ningún ítem de navegación lleva
-- `requiredModule`, no existe ninguna ruta, no hay ninguna pantalla detrás.
-- Quien pulsaba Instalar recibía "Telegram instalado." sin que cambiara nada
-- en ninguna parte — el mismo defecto que ya se desmanteló en seis pantallas
-- (commit ba56d43), reintroducido aquí por la puerta de los datos.
--
-- No se borra ni se recrea la fila (se perdería `installed_at`/`installed_by`
-- de quien ya lo haya instalado en measure-only): sólo se actualiza la
-- descripción para que diga honestamente que está por llegar.
update module_catalog
set description = 'Próximamente: conecta tu bot de Telegram y vende contenido con Telegram Stars.',
    updated_at = now()
where slug = 'telegram';
