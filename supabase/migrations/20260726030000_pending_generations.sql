-- Tareas de generación EN VUELO, para poder recuperarlas.
--
-- El polling de KIE/MuleRouter lo conduce el NAVEGADOR (no hay webhook), y el
-- taskId solo vivía en una variable JS dentro del bucle. Al desmontarse el
-- componente —navegar, recargar, cerrar la pestaña, suspender el equipo— el
-- identificador desaparecía con él: la tarea terminaba bien en el proveedor,
-- la imagen quedaba en su CDN, y nadie la guardaba nunca. Generación pagada y
-- perdida, sin rastro para reclamarla.
--
-- Esta tabla es ese rastro. Se inserta al crear la tarea y se borra al
-- persistir el resultado, así que en estado sano está casi vacía: lo que
-- quede son huérfanas reclamables.

create table if not exists public.pending_generations (
    id uuid primary key default gen_random_uuid(),
    -- SIN FK a auth.users a proposito: `generations.user_id` tampoco la tiene
    -- (el entorno de desarrollo usa un id fijo que no existe ahi). Una tabla
    -- auxiliar no puede ser mas estricta que la tabla a la que sirve, o
    -- rechaza justo los inserts que debe registrar.
    user_id uuid not null,
    organization_id uuid,
    -- 'kie' | 'mulerouter' — decide a qué API se le pregunta al reconciliar.
    provider text not null,
    task_id text not null,
    avatar_id uuid references public.avatars(id) on delete set null,
    media_type text not null default 'IMAGE',
    prompt text,
    aspect_ratio text,
    -- Todo lo que hace falta para reconstruir la fila de `generations` sin el
    -- estado del cliente: modelo, tier de MuleRouter, nsfw, clone %, etc.
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

-- Reintentar el registro de la MISMA tarea no debe duplicar filas.
create unique index if not exists pending_generations_user_task_key
    on public.pending_generations (user_id, task_id);

-- El barrido al reconciliar es "mis pendientes, más recientes primero".
create index if not exists pending_generations_user_created_idx
    on public.pending_generations (user_id, created_at desc);

alter table public.pending_generations enable row level security;

-- Mismo criterio que el resto de tablas de usuario: cada quien ve lo suyo.
drop policy if exists "own pending generations" on public.pending_generations;
create policy "own pending generations"
    on public.pending_generations
    for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
