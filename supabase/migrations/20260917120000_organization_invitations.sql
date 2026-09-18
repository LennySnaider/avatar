-- Miembros de una organización: invitaciones por enlace, un usuario por
-- organización y el plan "demo" con tope de asientos.
--
-- CONTEXTO: hasta hoy una organización tenía UN habitante posible. El alta
-- (sign-up y OAuth) siempre crea una organización nueva y mete al usuario como
-- `owner`; no existía ningún camino para que una segunda persona entrase en
-- una organización ya creada. Esta migración es la mitad de datos de ese
-- camino; la otra mitad son `src/services/OrgMembersService.ts` y la ruta
-- `src/app/api/auth/accept-invite/route.ts`.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÉ UNA TABLA DE INVITACIONES Y NO UNA MEMBRESÍA "PENDIENTE"
-- ─────────────────────────────────────────────────────────────────────────────
-- Una fila en `organization_members` con estado "pendiente" obligaría a
-- filtrar por ese estado en TODAS las consultas de autorización, empezando por
-- `getOrgContext()`. El día que alguien olvide el filtro, un invitado que
-- nunca aceptó tiene acceso. Con una tabla aparte, la membresía sólo existe
-- cuando la persona aceptó de verdad, y el rastro de cómo entró cada miembro
-- (quién invitó, a qué email, con qué rol, cuándo aceptó) queda escrito aquí.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÉ NO HAY COLUMNA DE BAJA EN `organization_members`
-- ─────────────────────────────────────────────────────────────────────────────
-- Expulsar es un DELETE. Un `removed_at` sería la misma trampa que la
-- membresía pendiente: un filtro que hay que recordar en la autorización y
-- cuyo olvido devuelve el acceso a un expulsado. Si algún día hace falta el
-- historial de salidas, va en una tabla append-only que NINGUNA ruta de
-- autorización lea.

-- ─────────────────────────────────────────────────────────────────────────────
-- Invitaciones
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists organization_invitations (
    id uuid primary key default gen_random_uuid(),

    -- Tenant. CASCADE: si la organización desaparece, sus invitaciones no
    -- sobreviven apuntando a un espacio que ya no existe.
    organization_id uuid not null references organizations(id) on delete cascade,

    -- A QUIÉN se invitó. Normalizado a minúsculas por la aplicación
    -- (normalizeInviteEmail). Sin FK a `users` a propósito: el invitado todavía
    -- NO tiene cuenta — de hecho, que la tenga es motivo de rechazo.
    email text not null,

    -- Rol con el que entrará. `operator` por defecto: el menos capaz.
    role org_member_role not null default 'operator',

    -- SHA-256 hex del token, NUNCA el token. Mismo razonamiento que
    -- password_reset_tokens: determinista para ir al índice, irreversible para
    -- que leer esta tabla no entregue enlaces listos para usar. UNIQUE = dos
    -- filas con el mismo secreto serían dos puertas con la misma llave, y es el
    -- índice por el que se consulta.
    --
    -- Consecuencia deliberada: el enlace sólo se puede mostrar UNA vez, al
    -- crearlo. "Reenviar" es rotar este hash (ver link_issued_count).
    token_hash text not null unique,

    -- Caducidad. El valor lo fija la aplicación (INVITATION_TTL_HOURS en
    -- src/lib/org/invitations.ts), no un DEFAULT aquí: dos fuentes de verdad y
    -- una miente en silencio.
    expires_at timestamptz not null,

    -- Auditoría de quién invitó. ON DELETE SET NULL: si la cuenta del que
    -- invitó se borra, la invitación NO se va con ella.
    invited_by text references users(id) on delete set null,

    -- Consumo. NULL = sin aceptar. No se borra la fila al aceptarla: es el
    -- rastro de cómo entró cada miembro, y `organization_members` no guarda
    -- historial.
    accepted_at timestamptz,
    accepted_user_id text references users(id) on delete set null,

    -- Revocación por el propietario. Separada de accepted_at porque son
    -- estados distintos y la pantalla los distingue.
    revoked_at timestamptz,
    revoked_by text references users(id) on delete set null,

    -- Cuántas veces se ha emitido un enlace para esta invitación y cuándo el
    -- último. Como sólo se guarda el hash, "generar enlace nuevo" rota
    -- token_hash + expires_at sobre ESTA misma fila; el enlace anterior muere
    -- solo porque su hash ya no está en ninguna parte.
    link_issued_count int not null default 1,
    last_issued_at timestamptz not null default now(),

    created_at timestamptz not null default now()
);

-- UNA sola invitación VIVA por email y organización. Parcial: las aceptadas y
-- las revocadas no estorban, así que se puede volver a invitar a quien se
-- revocó. La aplicación reconduce "invitar otra vez" a "generar enlace nuevo"
-- sobre la fila viva, que es lo que el usuario quiere decir.
create unique index if not exists organization_invitations_live_email_uq
    on organization_invitations (organization_id, lower(email))
    where accepted_at is null and revoked_at is null;

-- Contador de asientos: cuenta las vivas de una organización.
create index if not exists organization_invitations_org_live_idx
    on organization_invitations (organization_id)
    where accepted_at is null and revoked_at is null;

-- Barrido de caducadas (ver la nota de limpieza al final).
create index if not exists organization_invitations_expires_idx
    on organization_invitations (expires_at);

-- Patrón del repo: RLS ON y CERO políticas. Aquí no es formalidad: con la
-- anon key leyendo, cualquiera sacaría a quién ha invitado cada empresa.
alter table organization_invitations enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- Un usuario, una organización
-- ─────────────────────────────────────────────────────────────────────────────
-- DECISIÓN DE PRODUCTO (2026-09-17): una persona pertenece a UNA sola
-- organización. Hasta hoy sólo lo garantizaba la costumbre, y getOrgContext()
-- disimulaba el incumplimiento con `order created_at asc limit 1` — un usuario
-- en dos organizaciones veía UNA, elegida por la fecha. Este índice convierte
-- la regla en imposible de romper. Verificado antes de aplicar: no había
-- ningún user_id con más de una membresía.
create unique index if not exists organization_members_one_org_per_user_uq
    on organization_members (user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Plan demo
-- ─────────────────────────────────────────────────────────────────────────────
-- Existe para poder probar el tope duro de asientos de verdad. `is_public =
-- false`: no sale en ninguna pantalla de precios. `tokens_included = 0`: no
-- regala saldo (y nada en src/ lee esta tabla para eso todavía). `max_seats =
-- 5` cuenta al propietario: tú + 4 operadores, y el 6º se bloquea.
insert into plan_configurations
    (slug, name, tokens_included, price_usd_month, max_avatars, max_seats, is_public, sort_order)
values
    ('demo', 'Demo', 0, 0.00, null, 5, false, 0)
on conflict (slug) do nothing;

-- Sólo la organización por defecto, y sólo si no tiene plan: sin el
-- `plan_slug is null` este update pisaría el plan de una organización que ya
-- lo tuviera el día que exista facturación.
update organizations
   set plan_slug = 'demo'
 where id = '00000000-0000-0000-0000-000000000001'
   and plan_slug is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- accept_organization_invitation — aceptar, en UNA transacción
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÉ UNA FUNCIÓN Y NO TRES PASOS DESDE LA APLICACIÓN: sin transacción no
-- existe un orden correcto. Crear el usuario y luego quemar la invitación deja
-- cuentas huérfanas sin organización (app inservible Y email ocupado, así que
-- no puede reintentar); quemar y luego crear pierde un asiento si el insert
-- falla. Y el tope de asientos es DURO: dos invitados aceptando a la vez en el
-- último asiento ganarían los dos si se comprobara desde JavaScript. El
-- `for update` sobre `organizations` serializa todas las aceptaciones de la
-- organización.
--
-- El email sale de la invitación, NUNCA del cuerpo de la petición: lo único que
-- autoriza es poseer el secreto. Misma regla que hace que reset-password no
-- sea un secuestro de cuenta.
--
-- Devuelve jsonb con `ok` y, si no, `reason`:
--   invalid     — inexistente, caducada, revocada o ya usada (UNA sola razón
--                 hacia fuera: distinguirlas confirmaría que el token existió)
--   email_taken — ese email ya tiene cuenta
--   no_seats    — la organización no tiene asientos; la invitación NO se quema,
--                 para que el mismo enlace sirva cuando amplíen el plan
create or replace function accept_organization_invitation(
    p_token_hash text,
    p_user_id text,
    p_name text,
    p_password_hash text
) returns jsonb language plpgsql as $$
declare
    v_inv organization_invitations;
    v_email text;
    v_max_seats int;
    v_plan_slug text;
    v_members int;
    v_other_live int;
begin
    if p_token_hash is null or p_user_id is null or p_password_hash is null then
        raise exception 'accept_organization_invitation: faltan argumentos';
    end if;

    -- 1. La invitación, bloqueada: serializa dos usos del MISMO token.
    select * into v_inv
      from organization_invitations
     where token_hash = p_token_hash
       for update;

    if not found
       or v_inv.accepted_at is not null
       or v_inv.revoked_at is not null
       or v_inv.expires_at <= now() then
        return jsonb_build_object('ok', false, 'reason', 'invalid');
    end if;

    v_email := lower(v_inv.email);

    -- 2. La organización, bloqueada: serializa TODAS las aceptaciones de la
    --    organización, no sólo las del mismo token. Es lo que hace real el
    --    tope de asientos.
    perform 1 from organizations where id = v_inv.organization_id for update;

    -- 3. ¿El email ya tiene cuenta? (Se vuelve a comprobar al final por el
    --    índice único, que es quien gana la carrera con un sign-up simultáneo.)
    if exists (select 1 from users u where lower(u.email) = v_email) then
        return jsonb_build_object('ok', false, 'reason', 'email_taken');
    end if;

    -- 4. Asientos: miembros + las OTRAS invitaciones vivas y no caducadas + esta.
    select p.max_seats, o.plan_slug
      into v_max_seats, v_plan_slug
      from organizations o
      left join plan_configurations p on p.slug = o.plan_slug
     where o.id = v_inv.organization_id;

    if v_max_seats is not null then
        select count(*) into v_members
          from organization_members m
         where m.organization_id = v_inv.organization_id;

        select count(*) into v_other_live
          from organization_invitations i
         where i.organization_id = v_inv.organization_id
           and i.id <> v_inv.id
           and i.accepted_at is null
           and i.revoked_at is null
           and i.expires_at > now();

        if v_members + v_other_live + 1 > v_max_seats then
            return jsonb_build_object('ok', false, 'reason', 'no_seats');
        end if;
    end if;

    -- 5. La cuenta. El nombre cae al local-part del email si viene vacío.
    insert into users (id, email, name, password_hash, provider, authority)
    values (
        p_user_id,
        v_email,
        coalesce(nullif(btrim(p_name), ''), split_part(v_email, '@', 1)),
        p_password_hash,
        'credentials',
        '{user}'
    );

    -- 6. La membresía, en la organización que invita. No se crea ninguna
    --    organización nueva: eso es lo que distingue este camino del sign-up.
    insert into organization_members (organization_id, user_id, role)
    values (v_inv.organization_id, p_user_id, v_inv.role);

    -- 7. Quemar la invitación, con el predicado como cinturón.
    update organization_invitations
       set accepted_at = now(),
           accepted_user_id = p_user_id
     where id = v_inv.id
       and accepted_at is null
       and revoked_at is null;
    if not found then
        raise exception 'accept_organization_invitation: la invitación cambió durante la transacción';
    end if;

    return jsonb_build_object(
        'ok', true,
        'organization_id', v_inv.organization_id,
        'email', v_email,
        'role', v_inv.role
    );
exception
    -- Red de seguridad de users_email_lower_uq y de
    -- organization_members_one_org_per_user_uq contra la carrera que el paso 3
    -- no puede cerrar sola: alguien se registró con ese email entre medias.
    when unique_violation then
        return jsonb_build_object('ok', false, 'reason', 'email_taken');
end;
$$;

-- PostgREST expone toda función del esquema `public` en /rpc. Sin esto,
-- cualquiera con la anon key podría llamarla con un hash cualquiera. Aunque
-- sin el token no consigue nada, sí podría tantear hashes y crear carga.
revoke all on function accept_organization_invitation(text, text, text, text) from public;
revoke all on function accept_organization_invitation(text, text, text, text) from anon, authenticated;
grant execute on function accept_organization_invitation(text, text, text, text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- LIMPIEZA (deuda anotada, a propósito fuera de esta migración)
-- ─────────────────────────────────────────────────────────────────────────────
-- Igual que password_reset_tokens: nada borra las invitaciones caducadas. No
-- va un `pg_cron` aquí porque el proyecto planifica en `src/app/api/cron/**`.
-- Cuando el volumen lo justifique, un cron diario con esta sentencia basta:
--
--   delete from organization_invitations
--    where accepted_at is null
--      and expires_at < now() - interval '90 days';
--
-- Las aceptadas NO se borran nunca: son el historial de cómo entró cada
-- miembro, y el único que hay.
