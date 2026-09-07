-- Marca de invalidacion de sesiones: instante del ultimo cambio de contrasena.
--
-- POR QUE EXISTE: NextAuth v5 esta configurado SIN adapter (src/auth.ts), asi
-- que la sesion es un JWT firmado que vive en la cookie y NO se consulta contra
-- la base. Consecuencia hasta hoy: cambiar `users.password_hash` no expulsaba a
-- nadie. Quien cambia la contrasena PRECISAMENTE porque sospecha que alguien le
-- entro conseguia lo contrario de lo que creia — el intruso conservaba la sesion
-- hasta que su token caducara solo (30 dias por defecto).
--
-- Con esta columna, el callback `jwt` de src/auth.ts compara el instante en que
-- se inicio la sesion (claim `sessionStartedAt`, sellado en el token al hacer
-- login) contra esta marca, y devuelve `null` — que en Auth.js v5 destruye la
-- sesion y borra la cookie — cuando la sesion es anterior al cambio.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUE NO LLEVA DEFAULT (lo importante de este archivo)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `alter table ... add column` CON default rellena TODAS las filas existentes
-- con ese valor. Un `default now()` aqui pondria la marca a "ahora" a todo el
-- mundo en el instante de aplicar la migracion, y como las sesiones que hay
-- abiertas empezaron ANTES de ese instante, la migracion echaria de la app a
-- todos los usuarios conectados — incluido el usuario real de este proyecto
-- (a1b2c3d4-e5f6-7890-abcd-ef1234567890), que la esta usando ahora mismo.
-- Desplegar seguridad no puede significar cerrarle la puerta a quien la despliega.
--
-- Sin default, las filas existentes quedan a NULL. NULL se lee como "esta cuenta
-- no ha cambiado la contrasena desde que existe esta marca", y la regla de
-- invalidacion (src/lib/auth/sessionRevocation.ts) NUNCA revoca con NULL. Es
-- decir: aplicar esta migracion es un no-op para las sesiones vivas, y la
-- proteccion empieza a contar desde el primer cambio de contrasena de cada
-- cuenta, que es exactamente cuando tiene sentido que cuente.
--
-- Tampoco se pone default para las filas NUEVAS, por el mismo motivo en pequeno:
-- un alta que sellara la marca en el mismo instante que el login crea una
-- carrera entre dos escrituras de milisegundos (la marca y el inicio de sesion)
-- que puede expulsar al usuario recien registrado. Quien escribe esta columna
-- son los DOS caminos de cambio de contrasena, y solo ellos:
--   - src/server/actions/user/changePassword.ts  (cambio estando dentro)
--   - src/app/api/auth/reset-password/route.ts   (reset por token de correo)
--
-- Sin indice a proposito: la unica consulta que la lee filtra por `users.id`,
-- que es la clave primaria.

alter table users
    add column if not exists password_changed_at timestamptz;

comment on column users.password_changed_at is
    'Instante del ultimo cambio de contrasena. Las sesiones (JWT) iniciadas antes de esta marca se invalidan en el callback jwt de src/auth.ts. NULL = nunca cambiada desde que existe la columna: no invalida nada (asi la migracion no expulsa a las sesiones vivas al aplicarse). Lo escriben changePassword y la ruta de reset-password.';
