-- Recuperación de contraseña por correo: almacén de tokens + freno de abuso.
--
-- CONTEXTO: `src/app/api/auth/forgot-password/route.ts` y su gemela de
-- reset-password venían de la plantilla ECME devolviendo `true` sin hacer
-- nada, y luego un 503 honesto. Esta migración es la mitad de datos de la
-- implementación real; la otra mitad son esas dos rutas.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÉ UNA TABLA Y NO UNA COLUMNA EN `users`
-- ─────────────────────────────────────────────────────────────────────────────
-- Un par de columnas (`reset_token_hash`, `reset_expires_at`) en `users`
-- guarda como mucho UN token vivo y no tiene dónde anotar que se usó: el
-- "solo un uso" habría que fingirlo poniendo la columna a NULL, que es lo
-- mismo que borrar la evidencia. Con una fila por token:
--   - se pueden emitir y caducar varios de forma independiente,
--   - `used_at` deja el consumo escrito (auditable: cuándo se gastó, y desde
--     dónde se pidió), y
--   - invalidar los pendientes de un usuario es un UPDATE acotado, no un
--     borrado que se lleva el historial por delante.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÉ NO LLEVA `organization_id`
-- ─────────────────────────────────────────────────────────────────────────────
-- `users` NO es una tabla tenant (ver 20260715090000_users.sql): la identidad
-- es de la PERSONA y existe antes de cualquier organización — una misma cuenta
-- puede ser miembro de varias. Un token de recuperación es un derecho sobre esa
-- identidad, no sobre un espacio de trabajo, así que ponerle `organization_id`
-- sería inventarse un dueño: habría que elegir una de sus orgs arbitrariamente
-- y el flujo de reset ocurre SIN SESIÓN, o sea sin ctx de organización que
-- consultar. Peor todavía, un token con scope de org invitaría a filtrar por
-- ella al validar, y ese filtro sólo puede fallar en la dirección mala
-- (rechazar resets legítimos, o —si se elige mal— aceptar uno emitido en otro
-- contexto). El filtro correcto aquí es el `token_hash`, que es más estrecho
-- que cualquier organización. Por eso tampoco entra en TENANT_TABLES.

-- ─────────────────────────────────────────────────────────────────────────────
-- Tokens
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists password_reset_tokens (
    id uuid primary key default gen_random_uuid(),

    -- ON DELETE CASCADE: si la cuenta desaparece, sus enlaces de recuperación
    -- no deben sobrevivirla apuntando a un id fantasma.
    user_id text not null references users(id) on delete cascade,

    -- SHA-256 hex del token, NUNCA el token. Si alguien lee esta tabla se
    -- lleva hashes irreversibles, no enlaces listos para usar: con el token en
    -- claro, una filtración de la base es una filtración de TODAS las cuentas
    -- (peor que `users.password_hash`, que al menos está tras scrypt).
    --
    -- SHA-256 y no el scrypt del proyecto porque el token ya tiene 256 bits de
    -- entropía: no hay diccionario que atacar, así que el coste deliberado de
    -- scrypt no compra nada y sí estorba — su sal aleatoria haría el hash NO
    -- determinista y validar exigiría recorrer todas las filas vivas en vez de
    -- ir al índice. El razonamiento largo está en src/lib/auth/resetToken.ts.
    --
    -- UNIQUE: dos filas con el mismo hash serían el mismo secreto abriendo dos
    -- puertas; además es el índice por el que se consulta.
    token_hash text not null unique,

    -- Caducidad corta (hoy 30 min, RESET_TOKEN_TTL_MINUTES en
    -- src/lib/auth/resetToken.ts). El valor lo fija la aplicación, no un
    -- DEFAULT aquí: si vivieran en dos sitios, subir uno dejaría el otro
    -- mintiendo en silencio.
    expires_at timestamptz not null,

    -- Un solo uso. NULL = sin gastar. No se borra la fila al gastarla: el
    -- rastro de cuándo se consumió es lo que permite investigar un secuestro.
    used_at timestamptz,

    -- Contexto de la PETICIÓN (no del consumo), para forense de abuso.
    -- Se guarda en claro a propósito y sólo aquí: son datos de un usuario que
    -- SÍ existe y que pidió el reset. En `auth_rate_limits` (abajo), donde
    -- entrarían también los correos tanteados por un atacante, van hasheados.
    requested_ip text,
    requested_user_agent text,

    created_at timestamptz not null default now()
);

-- Consulta principal del flujo de reset: buscar por hash. La cubre el UNIQUE
-- de `token_hash`, no hace falta otro índice.

-- Consulta secundaria: al emitir un token nuevo se invalidan los pendientes de
-- ese usuario (un reset re-pedido no debe dejar dos llaves vivas). Parcial —
-- sólo indexa lo que se consulta, que son los NO usados; las filas gastadas
-- son la mayoría con el tiempo y no participan nunca en esa búsqueda.
create index if not exists password_reset_tokens_pending_idx
    on password_reset_tokens (user_id)
    where used_at is null;

-- Barrido de caducados (ver la nota de limpieza al final).
create index if not exists password_reset_tokens_expires_at_idx
    on password_reset_tokens (expires_at);

-- Patrón del repo: RLS ON y CERO políticas — sólo la service-role key llega a
-- esta tabla; la anon key del navegador queda fuera por completo. Aquí no es
-- una formalidad: con la anon key pudiendo leer, cualquiera sacaría los hashes
-- y, sobre todo, sabría QUÉ cuentas están pidiendo resets.
alter table password_reset_tokens enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- Freno de abuso (rate limit)
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÉ EN LA BASE: el proyecto no tiene Redis ni ninguna infraestructura de
-- rate limit, y un contador en memoria del proceso no sirve de nada en Vercel
-- —cada invocación puede caer en una lambda distinta, así que el límite sería
-- "N por instancia", es decir, ninguno.
--
-- POR QUÉ HACE FALTA: sin freno, este formulario es un cañón de correo
-- gratuito. Un script pidiendo resets contra una dirección ajena la inunda
-- (acoso), y contra miles de direcciones quema la reputación del dominio
-- remitente hasta que los correos legítimos —incluidos los resets de verdad—
-- empiezan a ir a spam. Además cuesta dinero: el proveedor cobra por envío.
create table if not exists auth_rate_limits (
    -- Clave del cubo: '<accion>:<tipo>:<sha256 del sujeto>'.
    -- El sujeto va HASHEADO: si no, esta tabla se convierte en un directorio
    -- de "qué correos han pedido recuperar la contraseña y desde qué IP", que
    -- es exactamente la información que el endpoint se esfuerza en no filtrar
    -- por otros medios. Hasheado sigue sirviendo para contar (que es todo lo
    -- que un rate limit necesita) y ya no es legible.
    bucket text primary key,

    -- Ventana FIJA, no deslizante: se reinicia entera al expirar. Limitación
    -- asumida y documentada — un atacante que cronometre el reinicio puede
    -- gastar el doble del límite a caballo de dos ventanas. Una ventana
    -- deslizante exigiría guardar cada intento; el coste no compensa para un
    -- freno anti-abuso cuyo objetivo es cortar el grifo, no ser exacto.
    window_started_at timestamptz not null default now(),
    attempts integer not null default 0,
    updated_at timestamptz not null default now()
);

-- Los cubos vencidos se pueden barrer sin mirar nada más.
create index if not exists auth_rate_limits_window_idx
    on auth_rate_limits (window_started_at);

alter table auth_rate_limits enable row level security;

-- consume_auth_rate_limit — cuenta un intento y dice si se permite.
--
-- POR QUÉ UNA FUNCIÓN Y NO UN SELECT + UPDATE DESDE LA APLICACIÓN: leer,
-- decidir y escribir en tres viajes es una carrera — N peticiones simultáneas
-- leen el mismo contador y pasan todas, que es justo el escenario de una
-- ráfaga automatizada, o sea el único que este freno tiene que parar. El
-- `insert ... on conflict do update` de abajo hace el incremento y la
-- comparación en UNA sentencia atómica.
--
-- Devuelve jsonb (no boolean) para que quien llame pueda decir cuánto falta
-- para reintentar sin hacer una segunda consulta.
create or replace function consume_auth_rate_limit(
    p_bucket text,
    p_limit integer,
    p_window_seconds integer
) returns jsonb language plpgsql as $$
declare
    v_row auth_rate_limits;
begin
    if p_limit <= 0 or p_window_seconds <= 0 then
        raise exception 'consume_auth_rate_limit: p_limit y p_window_seconds deben ser > 0';
    end if;

    insert into auth_rate_limits (bucket, window_started_at, attempts, updated_at)
    values (p_bucket, now(), 1, now())
    on conflict (bucket) do update set
        -- Si la ventana ya venció, el cubo se reinicia a 1 (este intento).
        -- Si sigue viva, se suma.
        window_started_at = case
            when auth_rate_limits.window_started_at
                 < now() - make_interval(secs => p_window_seconds)
            then now()
            else auth_rate_limits.window_started_at
        end,
        attempts = case
            when auth_rate_limits.window_started_at
                 < now() - make_interval(secs => p_window_seconds)
            then 1
            else auth_rate_limits.attempts + 1
        end,
        updated_at = now()
    returning * into v_row;

    return jsonb_build_object(
        'allowed', v_row.attempts <= p_limit,
        'attempts', v_row.attempts,
        'limit', p_limit,
        -- Segundos que faltan para que la ventana se reinicie.
        'retry_after_seconds', greatest(
            0,
            ceil(extract(epoch from (
                v_row.window_started_at
                + make_interval(secs => p_window_seconds)
                - now()
            )))::int
        )
    );
end;
$$;

-- PostgREST expone toda función del esquema `public` en /rpc. Sin esto,
-- cualquiera con la anon key podría llamarla y —lo grave— INFLAR los
-- contadores de correos ajenos hasta dejarlos sin poder pedir un reset (una
-- denegación de servicio dirigida contra una cuenta concreta).
revoke all on function consume_auth_rate_limit(text, integer, integer) from public;
revoke all on function consume_auth_rate_limit(text, integer, integer) from anon, authenticated;
grant execute on function consume_auth_rate_limit(text, integer, integer) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- LIMPIEZA (deuda anotada, a propósito fuera de esta migración)
-- ─────────────────────────────────────────────────────────────────────────────
-- Las dos tablas crecen sin techo: nada borra los tokens gastados/caducados ni
-- los cubos vencidos. No se resuelve aquí con un `pg_cron` porque el proyecto
-- gestiona sus tareas periódicas en `src/app/api/cron/**` (Vercel Cron) y
-- meter una segunda planificación escondida en la base sería un mecanismo
-- paralelo que nadie recordaría. Cuando el volumen lo justifique, un cron
-- diario con estas dos sentencias basta:
--
--   delete from password_reset_tokens
--    where expires_at < now() - interval '30 days';
--   delete from auth_rate_limits
--    where window_started_at < now() - interval '1 day';
--
-- Los 30 días no son capricho: borrar los tokens en cuanto caducan tira el
-- rastro justo cuando alguien viene a preguntar quién intentó entrar en su
-- cuenta la semana pasada.
