-- Referencias de avatar a R2 (2026-08-20).
--
-- POR QUÉ FALTABA: la migración a R2 de 20260728010000 cubrió `generations` y
-- nada más. `avatar_references` —caras, hojas del Body Lab, angles, poses— se
-- quedó 100% en Supabase Storage porque su tabla no tenía dónde anotar el
-- proveedor, y `uploadReference` subía directo al bucket saltándose
-- `putMediaObject`. Medido el 2026-08-20: 66 filas vivas / 53 MB contra la
-- misma cuota de egress que ya restringió el proyecto entero con un 402.
--
-- Mismo contrato que en `generations`, a propósito: mismo path lógico en los
-- dos lados, solo cambia la base de la URL, y el backfill voltea esta columna
-- fila a fila DESPUÉS de copiar el objeto. Así una pasada a medias deja el
-- sistema coherente (cada fila apunta a donde de verdad están sus bytes).
--
-- El default 'supabase' es el que hace que aplicar esto solo no cambie nada:
-- todas las filas existentes siguen leyéndose de donde están hasta que el
-- backfill las mueva.

ALTER TABLE avatar_references
    ADD COLUMN IF NOT EXISTS storage_provider text NOT NULL DEFAULT 'supabase';

COMMENT ON COLUMN avatar_references.storage_provider IS
    'Dónde viven los bytes: supabase | r2. Lo voltea el backfill al migrar.';

-- El backfill filtra por provider para reanudarse. Parcial: solo indexa lo
-- pendiente y se vacía solo al acabar la migración.
CREATE INDEX IF NOT EXISTS idx_avatar_references_pending_r2
    ON avatar_references (created_at)
    WHERE storage_provider = 'supabase';
