# Body Model Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el eje "Body Type" (que mezcla forma+tamaño y contradice las medidas) por un modelo donde las MEDIDAS son la fuente de verdad y la FORMA es un preset; emitir el prompt por ratios+forma (no cm crudos) para que el cuerpo generado haga match con el configurador.

**Architecture:** `PhysicalMeasurements` gana `shoulders/build/torsoLegRatio/shape`. Un util nuevo (`bodyShapes.ts`) define presets y derivación de forma. `bodyDescriptors` deja de liderar con un tamaño conflictivo y emite forma+build+comparativas (compartido: sheet Y generación normal). La UI reemplaza los chips de Body Type por chips de Forma (presets), agrega sliders (Hombros/Build/Torso) y mueve el Body Lab a un componente propio que el drawer renderiza debajo de la cara/ángulos.

**Tech Stack:** Next.js 15, React 19, TypeScript strict, Zustand, ECME UI.

## Global Constraints

- **Sin runner de tests.** Verificación por `npx tsc --noEmit` (exit 0) + `npm run lint` (sin errores nuevos) + prueba manual en `npm run dev` (:3030). Ojo: `tsc | head` traga el exit — checar exit real (`npx tsc --noEmit; echo $?`).
- Solo componentes ECME (`@/components/ui/*`) + el markup plano ya existente del Body Lab. NADA de Shadcn.
- Commits en español, SIN firmas de Claude/Anthropic ni Co-Authored-By.
- `measurements` es JSON → campos nuevos son ADITIVOS, sin migración de BD.
- **Blast radius:** `bodyDescriptors` lo usa TODA la generación. Cada tarea que lo toque debe verificar que la generación normal siga coherente (no romper avatares existentes).
- `bodyType` viejo se conserva en el tipo (back-compat) pero deja de ser descriptor de prompt.
- Rama: `feat/body-angle-sheet` (continúa aquí).

---

### Task 1: Tipos — `BodyShape` + campos nuevos

**Files:**
- Modify: `src/@types/supabase.ts` (interface `PhysicalMeasurements`, ~L502; agregar `BodyShape` cerca de los otros tipos de cuerpo)

**Interfaces:**
- Produces: `type BodyShape`; campos `shoulders?, build?, torsoLegRatio?, shape?` en `PhysicalMeasurements`.

- [ ] **Step 1: Agregar el tipo `BodyShape`** (junto a `BodyType`/`BustShape` en el archivo)

```typescript
export type BodyShape =
    | 'hourglass'
    | 'pear'
    | 'apple'
    | 'rectangle'
    | 'inverted-triangle'
    | 'spoon'
    | 'diamond'
```

- [ ] **Step 2: Agregar campos a `PhysicalMeasurements`** (tras `eyeColor?`, antes del cierre `}`)

```typescript
    // ── Modelo de cuerpo (rediseño): medidas = verdad, forma = preset ──
    /** Ancho de hombros (cm). Necesario para distinguir formas (inverted/pear/rect). */
    shoulders?: number
    /** Complexión general lean↔full (1-5). No contradice la forma; escala volumen. */
    build?: CurveLevel
    /** Proporción torso↔piernas (−2 piernas cortas … +2 piernas largas; 0 neutro). */
    torsoLegRatio?: number
    /** Forma elegida en la UI (recuerda el preset activo). El prompt usa esta o la deriva. */
    shape?: BodyShape
```

- [ ] **Step 3: Type-check + commit**

Run: `npx tsc --noEmit; echo "exit $?"` → exit 0.
```bash
git add src/@types/supabase.ts
git commit -m "feat(body-model): tipo BodyShape + campos shoulders/build/torsoLegRatio/shape en PhysicalMeasurements"
```

---

### Task 2: Presets de forma + derivación

**Files:**
- Create: `src/utils/bodyShapes.ts`

**Interfaces:**
- Consumes: `BodyShape`, `PhysicalMeasurements` de `@/@types/supabase`.
- Produces: `BODY_SHAPES`, `SHAPE_LABEL`, `SHAPE_PRESETS`, `deriveShapeFromMeasurements(m)`.

- [ ] **Step 1: Crear el archivo**

```typescript
// src/utils/bodyShapes.ts
import type { BodyShape, PhysicalMeasurements } from '@/@types/supabase'

/** Orden de despliegue en la UI. */
export const BODY_SHAPES: BodyShape[] = [
    'hourglass',
    'pear',
    'apple',
    'rectangle',
    'inverted-triangle',
    'spoon',
    'diamond',
]

export const SHAPE_LABEL: Record<BodyShape, string> = {
    hourglass: 'Hourglass',
    pear: 'Pear',
    apple: 'Apple',
    rectangle: 'Rectangle',
    'inverted-triangle': 'Inverted △',
    spoon: 'Spoon',
    diamond: 'Diamond',
}

/**
 * Ejemplo CANÓNICO de cada forma (cm). Seleccionar una forma pre-carga estos
 * valores en los sliders (punto de partida); luego el usuario ajusta. Solo
 * setean el esqueleto (hombros/busto/cintura/cadera) — no los niveles de curva.
 */
export const SHAPE_PRESETS: Record<
    BodyShape,
    Pick<PhysicalMeasurements, 'shoulders' | 'bust' | 'waist' | 'hips'>
> = {
    hourglass: { shoulders: 95, bust: 95, waist: 63, hips: 96 },
    pear: { shoulders: 88, bust: 88, waist: 68, hips: 106 },
    apple: { shoulders: 96, bust: 100, waist: 88, hips: 95 },
    rectangle: { shoulders: 90, bust: 90, waist: 80, hips: 92 },
    'inverted-triangle': { shoulders: 102, bust: 96, waist: 72, hips: 90 },
    spoon: { shoulders: 88, bust: 90, waist: 70, hips: 112 },
    diamond: { shoulders: 84, bust: 90, waist: 86, hips: 90 },
}

/**
 * Deriva la forma de las medidas actuales (para avatares viejos sin `shape` y
 * para respetar ajustes manuales). Heurística por ratios; los hombros caen a
 * `bust` si no están seteados.
 */
export function deriveShapeFromMeasurements(m: PhysicalMeasurements): BodyShape {
    const sh = m.shoulders ?? m.bust
    const { bust: b, waist: w, hips: h } = m
    if (!b || !w || !h) return 'hourglass'
    const definedWaist = w <= Math.min(b, h) * 0.8 // cintura marcada

    if (sh > h * 1.05 && b >= h) return 'inverted-triangle'
    if (h > sh * 1.05 && h > b * 1.03) {
        if (h > sh * 1.18 && definedWaist) return 'spoon'
        return 'pear'
    }
    if (definedWaist && Math.abs(sh - h) <= Math.max(sh, h) * 0.06) {
        return 'hourglass'
    }
    if (w >= b * 0.92 && w >= h * 0.92) {
        return sh < h * 0.95 && b < h * 0.98 ? 'diamond' : 'apple'
    }
    return 'rectangle'
}
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit; echo "exit $?"` → exit 0.
```bash
git add src/utils/bodyShapes.ts
git commit -m "feat(body-model): presets de las 7 formas + derivación por ratios (bodyShapes.ts)"
```

---

### Task 3: Reescritura del descriptor en `bodyDescriptors` (fidelidad — el core)

**Files:**
- Modify: `src/utils/bodyDescriptors.ts`

**Interfaces:**
- Consumes: `deriveShapeFromMeasurements` de `@/utils/bodyShapes`; `BodyShape`.
- Produces: `describeShapeAndBuild(m)`; `describeBody` reescrito para NO liderar con `BODY_TYPE_PHRASE`.

Contexto: hoy `describeBody` (L277) hace `BODY_TYPE_PHRASE[bodyType]` + `getBodyDescriptors`. El lead de tamaño ("slim slender figure") es lo que contradice las curvas. Se reemplaza por forma+build+comparativas. `getBodyDescriptors` (ratios) se conserva pero SIN el lead de bodyType.

- [ ] **Step 1: Agregar imports y mapas (cerca de los otros mapas del archivo)**

```typescript
import { deriveShapeFromMeasurements } from '@/utils/bodyShapes'
import type { BodyShape } from '@/@types/supabase'

// Cláusula por forma — nombre + lenguaje COMPARATIVO (los modelos siguen ratios,
// no cm). Ortogonal al tamaño (eso es BUILD_PHRASE).
const SHAPE_CLAUSE: Record<BodyShape, string> = {
    hourglass:
        'hourglass silhouette — shoulders and hips balanced in width, with a sharply cinched waist noticeably narrower than both the bust and the hips',
    pear: 'pear (triangle) shape — hips clearly wider than the shoulders and bust, with a defined waist and fuller lower body',
    apple: 'apple (round) shape — fuller midsection and broad bust, with a less defined waist and comparatively slimmer hips',
    rectangle:
        'straight rectangular shape — shoulders, waist and hips of similar width with little waist definition',
    'inverted-triangle':
        'inverted-triangle shape — shoulders and bust clearly wider than the hips, athletic upper body tapering to narrower hips',
    spoon: 'spoon shape — hips dramatically wider than the shoulders with a pronounced hip shelf, and a defined waist',
    diamond:
        'diamond shape — fuller midsection with narrower shoulders and narrower hips',
}

// Complexión general (1-5). NO contradice la forma: describe grasa/volumen.
const BUILD_PHRASE: Record<number, string> = {
    1: 'lean slim frame with minimal body fat, toned and slender',
    2: 'fit toned body with low body fat',
    3: 'balanced healthy body with soft natural curves',
    4: 'full curvy figure with soft natural body fat',
    5: 'plus-size full figure with generous soft body fat throughout',
}
```

- [ ] **Step 2: Agregar `describeShapeAndBuild`**

```typescript
/**
 * Descripción de cuerpo por FORMA + BUILD (rediseño). Reemplaza el lead de
 * tamaño de describeBody que contradecía las medidas. La forma sale de `m.shape`
 * (elección del usuario) o se deriva de ratios; el build de `m.build` (1-5).
 */
export function describeShapeAndBuild(m: PhysicalMeasurements): string {
    const shape: BodyShape = m.shape ?? deriveShapeFromMeasurements(m)
    const parts: string[] = [SHAPE_CLAUSE[shape]]
    const build = m.build ?? 3
    if (BUILD_PHRASE[build]) parts.push(BUILD_PHRASE[build])
    // Comparativa de intensidad de cintura (refuerza la forma con el ratio real).
    if (m.waist && m.hips) {
        const whr = m.waist / m.hips
        if (whr <= 0.68) parts.push('extremely small, dramatically cinched waist')
        else if (whr <= 0.78) parts.push('clearly defined narrow waist')
    }
    // Torso/piernas.
    if (typeof m.torsoLegRatio === 'number' && m.torsoLegRatio >= 1) {
        parts.push('long legs, elongated lower body')
    } else if (typeof m.torsoLegRatio === 'number' && m.torsoLegRatio <= -1) {
        parts.push('shorter legs, longer torso')
    }
    return parts.join(', ')
}
```

- [ ] **Step 3: Reescribir `describeBody` para usar forma+build (no el lead de bodyType)**

Reemplazar el cuerpo de `describeBody` (L277-285) por:
```typescript
export function describeBody(m: PhysicalMeasurements): string {
    const parts: string[] = [describeShapeAndBuild(m)]
    // Se conservan los descriptores derivados por ratio (torso/hombros/etc.),
    // PERO ya no el lead de bodyType (era la fuente del conflicto slim-vs-curvy).
    const derived = getBodyDescriptors(m)
    if (derived) parts.push(derived)
    return parts.join(', ')
}
```

- [ ] **Step 4: Quitar el lead de bodyType dentro de `getBodyDescriptors`**

En `getBodyDescriptors` (L62-67) el bloque `wantsFuller` usa `m.bodyType`. Cambiar la condición para que dependa de `build`/medidas, NO de bodyType:
```typescript
    const wantsFuller =
        m.bust >= 90 || m.hips >= 95 || (m.build ?? 3) >= 4
    if (wantsFuller) {
        descriptors.push('healthy natural body weight', 'soft feminine curves with natural body fat', 'NOT skinny or underweight')
    }
```
(El resto de `getBodyDescriptors` —ratios de cintura/cadera/busto— se mantiene igual.)

- [ ] **Step 5: Verificar + commit**

Run: `npx tsc --noEmit; echo "exit $?"` → exit 0. `npm run lint` sin errores nuevos.
Verificación manual de coherencia: en un REPL o build, `describeBody({age:22,height:162,bodyType:'slim',bust:90,waist:45,hips:105,glutesLevel:5,shape:'hourglass',build:2})` debe contener "hourglass" + "dramatically cinched waist" y NO "slim slender figure".
```bash
git add src/utils/bodyDescriptors.ts
git commit -m "feat(body-model): describeBody por forma+build+comparativas (no lead de bodyType) — fix del conflicto que impedía el match; compartido sheet+generación normal"
```

---

### Task 4: `bodySheetPrompt` usa el nuevo descriptor

**Files:**
- Modify: `src/utils/bodySheetPrompt.ts`

`buildBodySheetPrompt` ya llama `describeBody(m)` (ahora forma+build) y `buildBodySheetCurves(m)`. Falta asegurar que el prompt no dependa de `bodyType` y que refuerce hombros.

- [ ] **Step 1: Añadir hombros a la línea de medidas** (donde arma `measurements`)

```typescript
    const measurements =
        m.bust && m.waist && m.hips
            ? `Exact body proportions — reproduce them literally, NOT an idealised average: bust ${m.bust}cm, waist ${m.waist}cm, hips ${m.hips}cm${
                  m.shoulders ? `, shoulders ${m.shoulders}cm wide` : ''
              }. The waist is the reference for the silhouette; render the bust, hips and shoulders relative to it exactly as specified.`
            : ''
```

- [ ] **Step 2: Verificar + commit**

Run: `npx tsc --noEmit; echo "exit $?"` → exit 0.
```bash
git add src/utils/bodySheetPrompt.ts
git commit -m "feat(body-model): body sheet incluye hombros en la spec de medidas"
```

---

### Task 5: Extraer el Body Lab a su propio componente

Para poder moverlo debajo de la cara/ángulos, el bloque Body Lab sale del
`PhysicalAttributesEditor` a un componente reutilizable que el drawer renderiza donde quiera.

**Files:**
- Create: `src/components/shared/BodyLab/index.tsx`
- Modify: `src/components/shared/PhysicalAttributesEditor/PhysicalAttributesEditor.tsx` (quitar el bloque `bodyLab` y su prop; exportar `BodyLabProps` desde el nuevo módulo)

**Interfaces:**
- Produces: `BodyLab` (default export) + `BodyLabProps` (mismos campos que hoy: `models, selectedModel, onSelectModel, isGenerating, sheet, sheetModel?, onGenerate, onUseAsBody, onPreview?, disabledReason?`).

- [ ] **Step 1: Crear `BodyLab/index.tsx`** moviendo VERBATIM el JSX del bloque `{bodyLab && (...)}` actual de `PhysicalAttributesEditor` (el `<div className="space-y-3 pt-4 border-t ...">` con selector + preview + badge + botones). Envolverlo como componente que recibe `props: BodyLabProps` y usa `props.` en vez de `bodyLab.`. Mover también la interface `BodyLabProps` y el tipo `PhysicalRegionRef` (o importarlo). El componente rinde `null` si no hay `models` y `disabledReason`… (mantener el comportamiento actual).

- [ ] **Step 2: En `PhysicalAttributesEditor`**, eliminar la prop `bodyLab` de `PhysicalAttributesEditorProps`, su destructuring, y el bloque `{bodyLab && (...)}` del return. (El editor deja de saber del Body Lab.)

- [ ] **Step 3: Verificar + commit**

Run: `npx tsc --noEmit; echo "exit $?"` → exit 0 (habrá errores en los drawers porque aún pasan `bodyLab` — se arreglan en Task 7; si el orden lo requiere, hacer Task 5+7 juntos antes de commitear). Alternativa: commitear 5+6+7 como una unidad si tsc no cierra aislado.
```bash
git add src/components/shared/BodyLab/index.tsx src/components/shared/PhysicalAttributesEditor/PhysicalAttributesEditor.tsx
git commit -m "refactor(body-lab): extraer Body Lab a componente propio (para moverlo fuera de Physical Attributes)"
```

---

### Task 6: Selector de Forma + sliders nuevos + reorden en `PhysicalAttributesEditor`

**Files:**
- Modify: `src/components/shared/PhysicalAttributesEditor/PhysicalAttributesEditor.tsx`

- [ ] **Step 1: Reemplazar los chips de "Body Type"** (L174-205) por chips de **Forma** que pre-cargan el preset:

```tsx
{/* Body Shape (preset) */}
<div>
    <label className="text-xs text-gray-500 block mb-1">Body Shape</label>
    <div className="flex flex-wrap gap-1">
        {BODY_SHAPES.map((shape) => (
            <button
                key={shape}
                onClick={() => {
                    const hasCustom =
                        measurements.shoulders ||
                        measurements.waist ||
                        measurements.hips
                    if (
                        hasCustom &&
                        !window.confirm(
                            'Aplicar esta forma sobreescribe hombros/busto/cintura/cadera con un ejemplo canónico. ¿Continuar?',
                        )
                    )
                        return
                    onChange({
                        ...measurements,
                        ...SHAPE_PRESETS[shape],
                        shape,
                    })
                }}
                className={`px-2 py-1 text-xs rounded border transition-colors ${
                    measurements.shape === shape
                        ? 'bg-primary text-white border-primary'
                        : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-primary'
                }`}
            >
                {SHAPE_LABEL[shape]}
            </button>
        ))}
    </div>
</div>
```
Imports nuevos: `import { BODY_SHAPES, SHAPE_LABEL, SHAPE_PRESETS } from '@/utils/bodyShapes'`.

- [ ] **Step 2: Agregar sliders Hombros / Build / Torso** en el bloque de Measurements (tras Hips):

```tsx
<MeasurementSlider label="Shoulders" unit="cm" min={70} max={130}
    value={measurements.shoulders ?? measurements.bust}
    onChange={(v) => set({ shoulders: v })} />
```
Build (1-5) y Torso (−2..+2) como Sliders con etiqueta (mismo patrón visual que Thighs). Build escribe `build`; Torso escribe `torsoLegRatio`. Mostrar la frase de `BUILD_PHRASE` bajo el slider de Build (importar el mapa o replicar labels cortos).

- [ ] **Step 3: Reorden** — asegurar el orden: Shape → (Age, Height, Build, Shoulders, Bust*, Waist, Hips, Torso) → Curves (Glutes, Thighs) → Skin/Hair/Eye. (Bust sigue en Curves con su cm; mover su lectura si aplica — mínimo: dejar Bust donde está.)

- [ ] **Step 4: Verificar + commit** (junto con Task 7 si tsc lo requiere)

Run: `npx tsc --noEmit; echo "exit $?"`; `npm run lint`.
```bash
git add src/components/shared/PhysicalAttributesEditor/PhysicalAttributesEditor.tsx
git commit -m "feat(body-model): selector de Forma (presets) + sliders Hombros/Build/Torso + reorden en Physical Attributes"
```

---

### Task 7: Drawers — renderizar Body Lab bajo cara/ángulos + derivar forma al cargar

**Files:**
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_components/AvatarEditDrawer.tsx`
- Modify: `src/components/shared/AvatarEditDrawer/AvatarEditDrawer.tsx`

- [ ] **Step 1: En ambos drawers**, importar `BodyLab` de `@/components/shared/BodyLab` y **renderizarlo justo después del bloque "Specific References" (Face Close-up / Angle Sheet)**, pasándole las mismas props que antes iban en `bodyLab={{...}}`. Quitar la prop `bodyLab` del `<PhysicalAttributesEditor>`.

- [ ] **Step 2: Derivar forma al cargar** — al sincronizar `localMeasurements` desde el avatar (useEffect de open), si `measurements.shape` es undefined, setear `shape: deriveShapeFromMeasurements(measurements)` (import de `@/utils/bodyShapes`). Así los avatares viejos muestran su forma.

- [ ] **Step 3: Verificar + commit**

Run: `npx tsc --noEmit; echo "exit $?"` → exit 0. `npm run lint` sin errores nuevos.
Manual: abrir un avatar → el Body Lab aparece bajo cara/ángulos; elegir una Forma pre-carga medidas; generar y confirmar que el cuerpo hace match con la forma/medidas.
```bash
git add "src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_components/AvatarEditDrawer.tsx" "src/components/shared/AvatarEditDrawer/AvatarEditDrawer.tsx"
git commit -m "feat(body-model): Body Lab bajo cara/ángulos en ambos drawers + derivar forma al cargar"
```

---

### Task 8: Validación de la generación normal (blast radius)

**Files:** ninguno (verificación).

- [ ] **Step 1:** Generar una imagen NORMAL (no sheet) de un avatar existente en el studio y confirmar que el cuerpo sigue coherente con `bodyDescriptors` reescrito (no regresión). Si el cuerpo se rompe, revisar `describeBody`/`getBodyDescriptors` y ajustar antes de cerrar.
- [ ] **Step 2:** Regenerar un body sheet (Qwen t2i) con una forma-preset + ajustes y confirmar match visual (cintura/cadera/hombros/glúteos).

---

## Self-Review

**Cobertura del spec:**
- Taxonomía (Forma preset, medidas=verdad) → Tasks 1,2,6. ✓
- Campos shoulders/build/torsoLegRatio/shape → Task 1. ✓
- Prompt por ratios+forma (no lead de tamaño) → Task 3. ✓ (compartido sheet+normal)
- Hombros en el sheet → Task 4. ✓
- Body Lab bajo cara/ángulos → Tasks 5,7. ✓
- Reorden Physical Attributes → Task 6. ✓
- Derivar forma al cargar → Task 7. ✓
- Blast radius (validar generación normal) → Task 8. ✓

**Nota de dependencias:** Tasks 5-6-7 se acoplan (extraer BodyLab rompe temporalmente los drawers). Si `tsc` no cierra por tarea aislada, ejecutar 5→6→7 en secuencia y commitear al cerrar 7 (o commits parciales aceptando tsc rojo intermedio SOLO dentro de esa secuencia). El resto de tareas (1-4, 8) sí cierran aisladas.

**Placeholders:** valores canónicos de presets marcados como afinables — es intencional (calibración visual), no un placeholder de lógica.

**Consistencia de tipos:** `BodyShape`, `describeShapeAndBuild(m)`, `deriveShapeFromMeasurements(m)`, `SHAPE_PRESETS`, `BODY_SHAPES`, `SHAPE_LABEL`, `BodyLabProps` usados con las mismas firmas donde se consumen.
