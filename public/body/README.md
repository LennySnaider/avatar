# Plantilla fija de turnaround del Body Lab

Coloca aquí la imagen **`turnaround-template.jpg`** — un turnaround de cuerpo
completo, 4 vistas (frente / tres-cuartos / lado / espalda), en mujer con ropa
interior/bikini claro sobre fondo neutro, **SIN marca de agua**.

- Ruta esperada por el código: `public/body/turnaround-template.jpg`
  (se sirve como `/body/turnaround-template.jpg`).
- El Body Lab la usa como referencia de POSES/LAYOUT con **Seedream Pro i2i**:
  conserva las 4 vistas de la plantilla y renderiza el cuerpo del configurador
  (curvas/medidas) encima. Una sola generación.
- Si el archivo no existe, el Body Lab cae automáticamente a **Wan t2i**
  (`buildBodySheetPrompt`), sin romperse.

Ver `src/utils/bodySheetPrompt.ts` → `BODY_TURNAROUND_TEMPLATE_URL`.
