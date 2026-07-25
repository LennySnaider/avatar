-- Hoja NUDE del Body Lab: nuevo tipo de referencia `body_nsfw`.
--
-- POR QUÉ (2026-07-25): la hoja canónica del Body Lab (`body`) se genera en
-- sujetador+braguita a propósito — se inyecta como body ref en TODOS los
-- motores, incluidos los NO permisivos, y un turnaround desnudo los bloquea
-- (comentario en src/utils/bodySheetPrompt.ts). Pero en runs NSFW esa ropa se
-- FILTRA al resultado (bug verificado live en Seedream+Wan+Qwen: devolvían el
-- sujetador y la braguita de la plantilla), y con MuleRouter Edit Max la panti
-- sobrevivía a toda prohibición de texto.
--
-- Solución: DOS hojas por avatar, cada una gateada donde es segura —
--   `body`      → runs SFW y cualquier motor no permisivo (nunca ve un desnudo)
--   `body_nsfw` → SOLO runs NSFW en motores permisivos (Seedream/Wan/Qwen/MuleRouter)
--
-- La tabla tenía un CHECK que rechazaba cualquier tipo nuevo (verificado con un
-- insert de prueba: 23514 avatar_references_type_check). Se recrea incluyendo
-- los valores existentes en producción (general, face, angle, body, glutes) más
-- `bust` (en la unión ReferenceType de TS) y el nuevo `body_nsfw`.

alter table avatar_references
    drop constraint if exists avatar_references_type_check;

alter table avatar_references
    add constraint avatar_references_type_check
    check (
        type in (
            'general',
            'face',
            'angle',
            'body',
            'bust',
            'glutes',
            'body_nsfw'
        )
    );
