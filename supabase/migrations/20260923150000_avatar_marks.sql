-- Marcas permanentes del avatar: tatuajes, cicatrices, lunares.
--
-- POR QUÉ UNA TABLA NUEVA Y NO UN TIPO MÁS EN `avatar_references`:
-- una marca necesita decir DÓNDE va (zona + lado), QUÉ es y CON QUÉ TINTA, y
-- esa tabla sólo tiene `type` y `storage_path`: no hay columna donde escribir
-- "antebrazo interior derecho". Además arrastra un CHECK antiguo que rechaza
-- tipos nuevos (ver 20260725190000_body_nsfw_reference_type.sql, que lo tuvo
-- que recrear entero tras un 23514). Aquí la FOTO es un campo más de la
-- marca, no al revés.
--
-- POR QUÉ NO SE REUSAN `bust`/`glutes`: eran "refs de región" y están muertos
-- — `AvatarSelector` los descarta al cargar y nadie los crea. Sirvieron de
-- precedente para esta forma, no de sitio donde meter esto.
--
-- LA ZONA ES UNA LISTA CERRADA. Con texto libre cada generación describe el
-- sitio de otra forma y el modelo lo coloca en otro sitio. El CHECK de abajo
-- es el mismo vocabulario que src/lib/avatar/marks.ts (MARK_ZONES): si se
-- añade una zona, se tocan los dos.
--
-- EL LADO VA APARTE, y es nullable a propósito: las zonas centrales
-- (esternón, nuca, columna, lumbar, abdomen, espalda alta) no lo tienen, y
-- una zona lateral sin lado confirmado sale en el prompt SIN lado antes que
-- con uno inventado — un lado equivocado rompe la continuidad entre
-- generaciones más que omitirlo.

create table if not exists avatar_marks (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    avatar_id uuid not null references avatars(id) on delete cascade,

    zone text not null check (zone in (
        'cuello_lateral', 'nuca', 'detras_oreja',
        'hombro', 'brazo_exterior', 'brazo_interior',
        'antebrazo_interior', 'antebrazo_exterior', 'muneca', 'dorso_mano', 'dedos',
        'esternon', 'pecho', 'bajo_pecho', 'costillas', 'abdomen', 'cadera', 'ingle',
        'espalda_alta', 'omoplato', 'columna', 'lumbar', 'gluteo',
        'muslo_frontal', 'muslo_exterior', 'muslo_interior', 'pantorrilla', 'tobillo', 'pie'
    )),
    side text check (side in ('right', 'left')),

    -- Qué es. Es lo único obligatorio además de la zona: sin descripción no
    -- hay nada que pintar en los motores que sólo reciben texto.
    content text not null,
    -- Cómo está tatuada: "negro y gris, línea fina con sombreado suave".
    ink_style text,
    -- Cuánto ocupa DE LA ZONA ("dos tercios del antebrazo"). En proporción y
    -- no en centímetros: los modelos no entienden centímetros.
    coverage text,
    -- Hacia dónde va ("de la muñeca al codo"). Sin esto sale girada.
    orientation text,

    -- La foto de la marca. Sirve para dos cosas distintas: describirla al
    -- darla de alta y hornearla después en las hojas canónicas.
    storage_path text,
    storage_provider text,

    -- Cuándo entró en la hoja de ángulos y en las del Body Lab. Mientras sea
    -- null, la marca vive sólo en el texto del prompt.
    baked_at timestamptz,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists avatar_marks_avatar_idx
    on avatar_marks (avatar_id, created_at);
create index if not exists avatar_marks_org_idx
    on avatar_marks (organization_id);

-- RLS activado SIN políticas: backstop anti-anon, como el resto de tablas de
-- tenant. La autorización real es el filtro por organization_id de orgTable
-- con service-role, y por eso `avatar_marks` entra en TENANT_TABLES.
alter table avatar_marks enable row level security;

comment on table avatar_marks is
    'Marcas permanentes del avatar (tatuajes, cicatrices, lunares). Anatomía, no escena: se inyectan en toda generación via el tag [MARKS: ...] y se hornean en las hojas canónicas. Tabla TENANT: se lee siempre por orgTable.';
comment on column avatar_marks.zone is
    'Lista cerrada, misma que MARK_ZONES en src/lib/avatar/marks.ts. Añadir una zona toca este CHECK y ese fichero.';
comment on column avatar_marks.side is
    'right|left, nullable. Las zonas centrales no lo llevan; una lateral sin lado sale en el prompt sin lado, nunca con uno inventado.';
comment on column avatar_marks.baked_at is
    'Sellado cuando la marca ya está pintada en la angle sheet y en las hojas del Body Lab. Null = sólo viaja como texto.';
