-- Migración a R2 (2026-07-28). Se ESCRIBE ahora y se APLICA al desbloqueo del
-- proyecto (el servicio está restringido por egress hasta el 12-ago o upgrade).
--
-- storage_provider: dónde vive el objeto de esta fila. Durante la transición
-- conviven 'supabase' (filas viejas) y 'r2' (nuevas + backfilleadas); el
-- lector único getGenerationMediaUrl() traduce provider+path a URL. El
-- backfill voltea este campo fila a fila una vez copiado el objeto.
--
-- thumbnail_path: miniatura webp (~30 KB) generada al guardar. Es la pieza
-- que corta ~50× el egress de navegar la galería: las cards bajaban el
-- original de 1-3 MB para pintar 200px.

ALTER TABLE generations
    ADD COLUMN IF NOT EXISTS storage_provider text NOT NULL DEFAULT 'supabase',
    ADD COLUMN IF NOT EXISTS thumbnail_path text;

COMMENT ON COLUMN generations.storage_provider IS
    'Dónde vive el objeto: supabase | r2. Lo voltea el backfill al migrar.';
COMMENT ON COLUMN generations.thumbnail_path IS
    'Path de la miniatura webp en el mismo proveedor que storage_path.';

-- El backfill filtra por provider para reanudarse; sin índice sería un scan
-- por pasada. Parcial: solo indexa lo pendiente, y desaparece solo al acabar.
CREATE INDEX IF NOT EXISTS idx_generations_pending_r2
    ON generations (created_at)
    WHERE storage_provider = 'supabase';
