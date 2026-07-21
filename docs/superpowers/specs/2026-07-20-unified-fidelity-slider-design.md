# Diseño: Slider unificado de "Fidelidad a la foto"

- **Fecha:** 2026-07-20
- **Estado:** Aprobado (pendiente review del usuario del spec escrito)
- **Autor:** Lenny + Claude

## Problema

Avatar Studio tiene **3 tools separados** para usar una foto de referencia, y al
usuario final le cuesta entender cuál es cuál:

1. **Img → Prompt** — la foto NO viaja; Gemini la describe a texto y se genera desde
   el texto + la identidad del avatar (cara + cuerpo).
2. **Clone Ref** — la foto viaja como **imagen**; replica pose/outfit/escena de la
   foto, con la cara **y el cuerpo/medidas del avatar**.
3. **Deepfake** — la foto es el lienzo **intacto**; solo cambia la **cara** (el
   cuerpo es el de la foto, NO del avatar).

Además: la **imagen** del Clone Ref es una señal extra que "compite" con la cara/
cuerpo/pose que ya se piden por texto → en un fuser como Wan introduce **varianza**
(reporte del usuario, verificado auditando tasks vía la KIE API). Sin la imagen
(solo texto) la generación es más **confiable**.

**Insight clave (del usuario):** los 3 tools son puntos de **un mismo eje** —
"¿cuánto copio de la foto?" — que se puede expresar con **un solo slider**, salvo
Deepfake, que es el único que descarta el cuerpo del avatar.

## Objetivo

Unificar **Img → Prompt** y **Clone Ref** en **un solo control**: un dropzone de
foto + un **slider de "Fidelidad a la foto"**. El **cuerpo/medidas del avatar se
respetan SIEMPRE**. **Deepfake queda como toggle aparte** (es el único que usa el
cuerpo de la foto).

No-goals: crear motores nuevos, cambiar el comportamiento por-modelo del backend,
tocar Deepfake, ni cambiar el flujo de generación. Es **enrutamiento + UX** sobre
los dos flujos que YA existen (describe-a-texto y clon-imagen).

## Diseño

### Concepto

El slider representa **un eje**: "¿cuánto de la foto reproduzco, siempre con MI
avatar?" — de **0% (solo la idea, sin imagen)** a **100% (copia exacta de pose/
outfit/escena, con imagen)**. En todo el rango, la **cara y el cuerpo/medidas del
avatar** mandan. Deepfake NO está en este eje (usa el cuerpo de la foto).

### El control

- **Un dropzone** "Foto de referencia" que **fusiona** los dropzones actuales de
  *Img → Prompt* y *Clone Ref*.
- Debajo, el **slider de Fidelidad** (patrón del slider de Clone actual, que ya hace
  SNAP a tiers y se dibuja como overlay sobre la miniatura).
- **Deepfake** conserva su propio dropzone/toggle, visualmente separado (con nota:
  "usa el cuerpo de la foto").

### Stops del slider (5, SNAP)

Reusan los 4 tiers que el backend ya interpreta (planExtraRefs `cloneWeight`:
≥75 EXACT · 50–74 STRONG · 25–49 MODERATE · <25 LOOSE) + **Inspiración** en 0.

| Valor | Label | ¿Manda imagen? | Comportamiento |
|-------|-------|----------------|----------------|
| **0** | **Inspiración** | ❌ No | La foto → **texto** (`analyzeImageForClone`, el `[CLONE:]`); genera desde ese texto + cara/cuerpo del avatar. Sin ruido de imagen → confiable; re-imagina (no pixel-fiel). |
| **15** | Suelto | ✅ Sí | Imagen + tier LOOSE (inspiración libre, reinterpreta). |
| **40** | Moderado | ✅ Sí | Imagen + tier MODERATE (misma base, reinterpreta detalles). |
| **65** | Fuerte | ✅ Sí | Imagen + tier STRONG (fiel con variación natural). |
| **100** | Exacto | ✅ Sí | Imagen + tier EXACT (copia exacta de pose/outfit/escena). |

**Cuerpo/medidas del avatar: SIEMPRE**, en los 5 stops.

### Enrutamiento (la única lógica nueva)

El valor del slider decide **cómo viaja la foto**:

- **`cloneWeight === 0` (Inspiración):** NO se adjunta la imagen del clon. Se usa el
  `[CLONE:]` (de `analyzeImageForClone`) como **texto de escena**. Es el flujo
  "clon-como-texto" que el usuario validó ("sin imagen sale muy bien").
- **`cloneWeight > 0` (Suelto…Exacto):** se adjunta la imagen del clon como hoy
  (masking/route per-modelo intactos), y el tier escala la cláusula del clon.

Punto de implementación: hoy la imagen del clon se adjunta en `AvatarStudioMain`
(bloque `kieReferenceImages` / `optimizedCloneRef`). El cambio es un **guard**: si
`cloneWeight === 0`, no adjuntar `optimizedCloneRef` (el `[CLONE:]` de texto ya
viaja en el prompt). El resto del pipeline no cambia.

### Badge del card

- `0` → **"Inspiración"** (chip nuevo).
- `>0` → **"Clon NN% · TIER"** (como hoy).
- Deepfake → **"Deepfake"** (como hoy).

Se persiste en `metadata.generation_type` (`'inspiration'` | `'clone'` |
`'deepfake'`) + `clone_weight`.

### Cambios de UI

- **Fusionar** los dropzones de *Img → Prompt* y *Clone Ref* en uno solo. El tool
  *Img → Prompt* como entrada separada se **retira** (su caso de uso = el 0% del
  slider). Si existe un uso de "describir una imagen arbitraria a prompt" fuera del
  contexto de clon, se evalúa conservarlo aparte (fuera de alcance de este spec).
- **Deepfake** se mantiene tal cual, con etiqueta que aclare que usa el cuerpo de
  la foto.
- El slider de Fidelidad reusa el overlay actual del Clone slider (SNAP a
  0/15/40/65/100, label dinámico bajo el %).

## Componentes / archivos (estimado, a confirmar en el plan)

- `BottomControlBar.tsx` — el slider (extender el overlay actual del Clone: agregar
  el stop 0 = Inspiración + label; un solo dropzone).
- `AvatarStudioMain.tsx` — guard `cloneWeight === 0` → no adjuntar la imagen del
  clon; badge/metadata `generation_type: 'inspiration'`.
- `_store/avatarStudioStore.ts` — si hace falta, estado del dropzone unificado.
- `GalleryPanel.tsx` — chip "Inspiración".
- **NO tocar:** las rutas KIE por-modelo (`routes/*.ts`), `planExtraRefs`, el
  masking, ni el flujo de Deepfake.

## Riesgos / decisiones

- **Discontinuidad del cuerpo:** resuelta sacando Deepfake del slider (cuerpo del
  avatar SIEMPRE en el slider; Deepfake aparte).
- **Describer en 0%:** se usa `analyzeImageForClone` (`[CLONE:]`) como texto, NO
  `describeImageForPrompt`, para que TODO el slider hable el mismo idioma (clon).
- **Migración de datos:** las generaciones viejas con los tools separados no
  cambian; el badge nuevo aplica a lo nuevo.
- **Reversibilidad:** el guard de `cloneWeight===0` es aislado y reversible.

## Criterios de éxito

1. Un solo dropzone + slider reemplaza *Img → Prompt* + *Clone Ref* sin perder
   funcionalidad.
2. En **Inspiración (0)**, NO se envía la imagen del clon (verificable por repro del
   payload / auditoría KIE) y el resultado es confiable.
3. En **Suelto…Exacto**, el comportamiento es idéntico al Clone Ref actual por tier.
4. Deepfake sigue funcionando igual, separado.
5. El badge refleja Inspiración / Clon NN%·Tier / Deepfake.
