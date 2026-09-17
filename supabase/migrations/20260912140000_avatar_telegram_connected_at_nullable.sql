-- Corrige el ancla de facturacion de avatar_telegram_settings.connected_at.
--
-- Antes: la columna era `not null default now()`, asi que se estampaba en la
-- PRIMERA escritura de connectTelegramBot (el upsert local con enabled=false,
-- ANTES de que setWebhook confirmara nada con Telegram). El CANDADO 1 de
-- AgentTelegramService.ts omite esta columna en TODAS las escrituras
-- posteriores a proposito -- para no reiniciar el reloj facturable en una
-- reconexion legitima -- y esa misma omision garantizaba que un error en la
-- PRIMERA conexion (red, Telegram caido, URL rechazada) dejara la fecha
-- anclada para siempre a un intento que nunca funciono: el reloj facturable
-- arrancaba antes de que el bot existiera, y ninguna reconexion posterior lo
-- corregia.
--
-- Ahora: sin NOT NULL ni DEFAULT, la fila nace con connected_at en NULL. La
-- PRIMERA escritura de connectTelegramBot sigue sin tocar la columna (igual
-- que antes), asi que permanece NULL hasta que exista una activacion real. La
-- SEGUNDA escritura (la que pone enabled=true tras confirmar setWebhook) la
-- estampa SOLO SI SEGUIA VACIA -- la primera activacion con exito la ancla, y
-- las reconexiones posteriores la dejan intacta: exactamente lo que el
-- CANDADO 1 ya garantizaba, ahora tambien para la primera conexion.
--
-- NULL SIGNIFICA "ESTE AVATAR NUNCA ACTIVO SU BOT CON EXITO" Y POR TANTO
-- "NUNCA FACTURABLE" -- no es lo mismo que "cero dias". Cualquier lectura que
-- agregue esta columna para facturar (el informe de unidades de la cuota
-- prorrateada, de otra tarea) DEBE saltarse las filas con connected_at nulo
-- en vez de tratarlas como coste cero.
alter table avatar_telegram_settings
    alter column connected_at drop not null,
    alter column connected_at drop default;

comment on column avatar_telegram_settings.connected_at is
    'Fecha de la PRIMERA activacion con exito del bot (Telegram confirmo setWebhook), no de la primera escritura de la fila. NULL = el bot nunca se activo -> NUNCA FACTURABLE (no "cero dias"): el informe de unidades de la cuota prorrateada debe excluir estas filas, no tratarlas como coste cero. Se estampa una sola vez en connectTelegramBot (AgentTelegramService.ts, CANDADO 1) y sobrevive a desconectar/reconectar.';
