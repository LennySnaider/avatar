-- accept_organization_invitation también para OAuth: cerrar la vía de escape
-- por Google.
--
-- EL AGUJERO: un invitado que, en vez de abrir el enlace, entraba con Google
-- usando el email invitado NO estaba bloqueado. provisionOAuthUser sólo
-- bloquea si el email ya tiene cuenta; el invitado todavía no la tiene, así
-- que se le creaba usuario, ORGANIZACIÓN PROPIA y rol `owner`. Acababa en una
-- organización vacía convencido de estar en la que le invitaron, la
-- invitación seguía ocupando asiento, y al día siguiente el enlace le decía
-- "ese email ya tiene cuenta".
--
-- LA SALIDA: que el camino de OAuth acepte la invitación por la MISMA función
-- que el de contraseña — misma transacción, mismo `for update` sobre la
-- organización, mismo tope de asientos. Para eso la función gana tres
-- parámetros opcionales (proveedor, id de cuenta en el proveedor, imagen) y
-- deja de exigir contraseña cuando el proveedor no es `credentials`.
--
-- POR QUÉ `drop` + `create` Y NO SÓLO `create or replace`: en Postgres, una
-- función con OTRA lista de parámetros es una función NUEVA (sobrecarga). Un
-- `create or replace` a secas dejaría las dos vivas, y la de cuatro argumentos
-- seguiría siendo llamable con su grant antiguo. Se borra la vieja, se crea la
-- nueva y se vuelven a dar los permisos sobre la firma nueva.
--
-- Los llamadores existentes no cambian: PostgREST resuelve por nombre de
-- argumento y los tres nuevos tienen DEFAULT.

drop function if exists accept_organization_invitation(text, text, text, text);

create or replace function accept_organization_invitation(
    p_token_hash text,
    p_user_id text,
    p_name text,
    p_password_hash text,
    p_provider text default 'credentials',
    p_provider_account_id text default null,
    p_image text default null
) returns jsonb language plpgsql as $$
declare
    v_inv organization_invitations;
    v_email text;
    v_max_seats int;
    v_plan_slug text;
    v_members int;
    v_other_live int;
begin
    if p_token_hash is null or p_user_id is null then
        raise exception 'accept_organization_invitation: faltan argumentos';
    end if;
    -- Con contraseña hace falta el hash; con OAuth hace falta el id de la
    -- cuenta en el proveedor (es la clave que provisionOAuthUser usa para
    -- reconocerla en el siguiente login). Nunca los dos vacíos.
    if p_provider = 'credentials' and p_password_hash is null then
        raise exception 'accept_organization_invitation: credentials exige password_hash';
    end if;
    if p_provider <> 'credentials' and p_provider_account_id is null then
        raise exception 'accept_organization_invitation: % exige provider_account_id', p_provider;
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
    --    organización. Es lo que hace real el tope de asientos.
    perform 1 from organizations where id = v_inv.organization_id for update;

    -- 3. ¿El email ya tiene cuenta?
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

    -- 5. La cuenta. Con OAuth, password_hash queda NULL (como en sign-up por
    --    Google) y viajan proveedor, id de cuenta e imagen.
    insert into users (id, email, name, image, password_hash, provider, provider_account_id, authority)
    values (
        p_user_id,
        v_email,
        coalesce(nullif(btrim(p_name), ''), split_part(v_email, '@', 1)),
        p_image,
        p_password_hash,
        p_provider,
        p_provider_account_id,
        '{user}'
    );

    -- 6. La membresía, en la organización que invita.
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
    when unique_violation then
        return jsonb_build_object('ok', false, 'reason', 'email_taken');
end;
$$;

revoke all on function accept_organization_invitation(text, text, text, text, text, text, text) from public;
revoke all on function accept_organization_invitation(text, text, text, text, text, text, text) from anon, authenticated;
grant execute on function accept_organization_invitation(text, text, text, text, text, text, text) to service_role;
