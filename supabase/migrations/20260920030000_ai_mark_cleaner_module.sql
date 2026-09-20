-- Módulo "Limpieza de marcas de IA" (`ai-mark-cleaner`) + estado de limpieza
-- por generación.
--
-- POR QUÉ UNA COLUMNA Y NO `generations.metadata`: `apiUpdateGenerationMetadata`
-- (src/services/AvatarForgeService.ts) reescribe el JSON ENTERO desde la copia
-- que tiene el cliente cada vez que alguien marca un favorito o archiva una
-- tarjeta. Un vídeo que termina de limpiarse 90 s después quedaría pisado por
-- el siguiente clic. Una columna propia además da un índice parcial barato para
-- el barrido y permite tomar la fila con un UPDATE condicional atómico.
--
-- Aplicada el 2026-09-20 con el MCP de Supabase (`apply_migration`), no con
-- `supabase db push` — ver la nota del proyecto sobre el historial de
-- migraciones.

alter table public.generations
    add column if not exists ai_marks_status text not null default 'none',
    add column if not exists ai_marks jsonb not null default '{}'::jsonb;

-- Los estados son un contrato con `src/lib/aiMarks/types.ts`. Si alguien añade
-- uno allí sin tocarlo aquí, el insert falla en vez de guardar un estado que
-- nadie sabe interpretar.
do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'generations_ai_marks_status_check'
    ) then
        alter table public.generations
            add constraint generations_ai_marks_status_check
            check (ai_marks_status in (
                'none',     -- generación anterior a la feature
                'skipped',  -- módulo o ajuste apagado, formato no soportado
                'pending',  -- encolada
                'running',  -- tomada por un trabajador
                'cleaned',  -- se quitó algo y el limpio es el que se sirve
                'partial',  -- se escribió el limpio pero algo sobrevivió
                'no_marks', -- no había nada que quitar; se queda el original
                'failed'    -- agotados los intentos; se sirve el original
            ));
    end if;
end $$;

-- Índice PARCIAL: el barrido sólo pregunta por lo que tiene trabajo pendiente.
-- Un índice completo sobre 4 293 filas (y creciendo) para leer las poquísimas
-- en vuelo sería desproporcionado.
create index if not exists generations_ai_marks_pendientes_idx
    on public.generations (created_at)
    where ai_marks_status in ('pending', 'running');

-- Catálogo del módulo. Cuota mensual 0 a propósito: se cobra POR USO, y
-- `chargeModuleFees` (src/lib/billing/moduleFees.ts) salta los precios <= 0
-- como "módulo gratis" sin avisar, que es justo lo que queremos aquí.
insert into public.module_catalog (
    slug, name, description,
    price_usd_month_per_unit, unit,
    commission_ai_pct, commission_manual_pct,
    is_public, sort_order
)
values (
    'ai-mark-cleaner',
    'Limpieza de marcas de IA',
    'Quita automáticamente los logos visibles de los proveedores (el destello de Gemini, KLING AI, Veo, Seedance, Hailuo) y las etiquetas invisibles de IA (C2PA, EXIF, XMP, IPTC y las etiquetas de los contenedores MP4) de cada imagen y vídeo generado, antes de guardarlo. Sin cuota mensual: sólo se cobran tokens por cada archivo en el que de verdad se quitó algo.',
    0, 'org',
    0, 0,
    true, 3
)
on conflict (slug) do nothing;
