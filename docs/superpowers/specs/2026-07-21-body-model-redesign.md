# Rediseño del Modelo de Cuerpo — Diseño

**Fecha:** 2026-07-21
**Estado:** Aprobado (diseño) — pendiente plan de implementación
**Feature:** Avatar Forge — Physical Attributes / Body Lab
**Relacionado:** [2026-07-21-body-angle-sheet-design.md](2026-07-21-body-angle-sheet-design.md)

## Problema

El cuerpo generado **no hace match** con el configurador. Raíz: el eje "Body Type"
mezcla **tamaño** (petite/slim/average/curvy/plus-size) con **una sola forma**
(hourglass), y su descriptor líder (`BODY_TYPE_PHRASE`) **contradice las medidas**.

Ejemplo real (config del usuario): Body Type=Slim, Waist=45, Hips=105, Glutes 5/5.
El prompt emitía a la vez *"slim slender figure"* **y** *"very large bubble butt,
wide hips, cinched waist"* → señales opuestas → el modelo promedia → cuerpo tibio
que no refleja los sliders. Además los modelos de imagen **ignoran los cm absolutos**,
así que "waist 45cm" casi no pesa.

Las **formas de cuerpo reales** (Hourglass, Pear, Apple, Rectangle, Inverted-Triangle,
Spoon, Diamond) son un **eje distinto** basado en RATIOS de hombros/busto/cintura/cadera —
no en un tamaño. Nuestro modelo confunde los dos ejes desde la base.

## Decisiones (aprobadas)

1. **Medidas = única fuente de verdad; Forma = preset.** Los sliders/medidas definen
   el cuerpo en el prompt. Se elimina "Body Type" como descriptor. Se agrega un selector
   de **Forma** (7 formas) que solo **pre-carga los sliders** a un ejemplo canónico de esa
   forma (punto de partida); luego el usuario ajusta. Cero descriptores en conflicto.
2. **Set de medidas completo:** se agregan **Hombros (cm)**, **Build/peso (lean↔full)** y
   **Torso/largo de piernas**, además de los existentes.
3. **Prompt por RATIOS + nombre de forma + comparativas** (no cm crudos). El build es un
   descriptor limpio que NO contradice la forma.
4. **El fix vive en `bodyDescriptors` (compartido)** → aplica al **body sheet Y a la
   generación normal**. Es lo que da consistencia multitenant (mayor blast radius —
   se valida primero con el sheet).

## Modelo de datos (`PhysicalMeasurements`, JSON — aditivo, sin migración de BD)

Campos nuevos:
- `shoulders?: number` (cm) — ancho de hombros.
- `build?: CurveLevel` (1-5) — complexión general lean↔full (volumen de grasa/suavidad).
- `torsoLegRatio?: number` — proporción torso vs piernas (p.ej. −2..+2; 0 = neutro).
- `shape?: BodyShape` — la forma elegida (solo para recordar el preset activo en la UI).

Existentes que se conservan: `age, height, bust, waist, hips, bustLevel, glutesLevel,
thighsLevel, bustShape, glutesShape, legType, skinTone, hairColor(s), hairStyle, eyeColor`.

`bodyType` (viejo): **se deja de usar como descriptor de prompt**. Al cargar un avatar sin
`shape`, la forma se **deriva de los ratios** de sus medidas actuales (más preciso que
mapear el `bodyType` viejo); `build` default = 3 (average) si no se puede inferir.

`BodyShape = 'hourglass' | 'pear' | 'apple' | 'rectangle' | 'inverted-triangle' | 'spoon' | 'diamond'`

## Presets de forma (pre-cargan sliders — valores canónicos, se afinan en impl)

| Forma | Hombros | Busto | Cintura | Cadera | Nota |
|---|---|---|---|---|---|
| Hourglass | 95 | 95 | 63 | 96 | hombros≈cadera, cintura muy marcada |
| Pear | 88 | 88 | 68 | 106 | cadera > hombros/busto |
| Apple | 96 | 100 | 88 | 95 | torso lleno, cintura poco definida |
| Rectangle | 90 | 90 | 80 | 92 | hombros≈cintura≈cadera |
| Inverted-Triangle | 102 | 96 | 72 | 90 | hombros > cadera |
| Spoon | 88 | 90 | 70 | 112 | cadera mucho más ancha (shelf), cintura definida |
| Diamond | 84 | 90 | 86 | 90 | torso lleno, hombros y cadera más angostos |

Seleccionar una forma sobreescribe hombros/busto/cintura/cadera (y setea `shape`) **con
confirmación** si ya hay medidas personalizadas. Los niveles de glúteos/muslos/busto-forma
NO se tocan (son ajustes finos del usuario).

## Mapeo config → prompt (fidelidad)

Nueva función en `bodyDescriptors` (reemplaza el lead conflictivo de `describeBody`):

1. **Forma por ratios** (calculada de hombros/busto/cintura/cadera, no del preset guardado
   — así respeta ajustes manuales): emite el **nombre de la forma** + **lenguaje
   comparativo**. Ej.: *"dramatic hourglass — shoulders and hips balanced and wide, waist
   dramatically cinched, far narrower than both bust and hips."*
2. **Build/peso** → descriptor escalado no-conflictivo: 1 *"lean slim frame, minimal body
   fat, toned"* … 3 *"balanced healthy body"* … 5 *"full soft curvy figure with generous
   natural body fat"*. Nunca contradice la forma.
3. **Medidas como comparativas/ratios**, cm como secundario ("hips much wider than waist"
   pesa más que "hips 105cm").
4. Se mantienen: mapa **dedicado** de curvas del sheet (`buildBodySheetCurves`), coherencia
   glúteo→muslo (`effectiveThighsLevel`), y el `negative_prompt`.
5. **Torso/piernas** → "long legs / short torso" según el valor.

El `describeBody` compartido se reescribe para NO liderar con un tamaño; la generación
normal y el sheet consumen la misma lógica ratio/forma. Blast radius aceptado (mejora
consistencia en toda la app; se valida con el sheet primero).

## Reorganización de UI (`PhysicalAttributesEditor` + drawers)

- **Mover el bloque "Body Lab"** a **debajo de la cara y los ángulos** (Specific
  References) en ambos drawers — es un generador de *referencia*, va con las otras
  referencias, no al final de los sliders. (Requiere extraer el Body Lab del
  `PhysicalAttributesEditor` y renderizarlo en el drawer; el editor expone su bloque como
  export separado o el drawer lo compone.)
- **Reordenar Physical Attributes:** Forma (preset) → Medidas (Altura, Build, Hombros,
  Busto, Cintura, Cadera, Torso/piernas) → Curvas (Glúteos, Muslos + formas) → Piel/Pelo/Ojos.
- Selector de Forma = fila de chips (como Body Type hoy) con las 7 formas.

## Manejo de errores / coherencia

- Preset sobre medidas ya editadas → confirmar antes de sobreescribir.
- Coherencia glúteo→muslo se conserva (piso automático).
- Avatar viejo sin `shape` → derivar forma de ratios al cargar; build default 3.

## Testing

- **Manual/visual (principal):** con cada forma-preset + ajustes, el sheet (Qwen t2i) debe
  reflejar la silueta (cintura/cadera/hombros/glúteos). Es la prueba real de "match".
- **tsc + lint** verdes (sin runner, por decisión previa).
- Verificar que la **generación normal** del studio sigue coherente tras el cambio de
  `bodyDescriptors` (no romper avatares existentes).

## Alcance

- **Incluye:** nueva taxonomía (Forma presets), campos shoulders/build/torsoLegRatio,
  reescritura del mapeo ratio/forma en `bodyDescriptors` (sheet + normal), reorg UI (Body
  Lab bajo cara/ángulos + reorden de atributos), derivación de forma al cargar.
- **Fuera (después):** Plan B — builder estructurado tipo JSON para la generación de
  CONTENIDO (posts/escenas) en el `handleGenerate` del studio.
