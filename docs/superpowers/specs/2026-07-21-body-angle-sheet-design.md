# Body Angle Sheet (Cuerpo Canónico del Avatar) — Diseño

**Fecha:** 2026-07-21
**Estado:** Aprobado (diseño) — pendiente escribir plan de implementación
**Feature:** Avatar Forge / Avatar Studio

## Problema

La consistencia de la **cara** del avatar ya está resuelta (Clone Ref + face angle sheet).
El **cuerpo** sigue inconsistente: "de repente sale bien y de repente no", y varía por
motor. Causa raíz:

- Los sliders de *Physical Attributes* generan **texto** (`buildCurvesEmphasis`,
  `bodyDescriptors`). El texto es ambiguo: "busto 3/5" se interpreta distinto en cada
  generación y en cada motor.
- Las *General Identity Photos* (fotos sueltas de glúteos/busto) son pistas sin
  estructura; el motor las reinterpreta cada vez.

No existe un **ancla visual persistente** del cuerpo, como sí existe para la cara.

## Objetivo

Replicar para el cuerpo la técnica que funciona en la cara: fijar un **Body Angle Sheet**
(sheet de 3 vistas: front / side / back) generado desde los sliders, guardarlo como el
"cuerpo canónico" del avatar, e inyectarlo como referencia visual en cada generación
futura.

## Decisiones tomadas

1. **Mini-bikini como base, no desnudo.** El body sheet se inyecta como referencia en
   **todos** los motores. Un ref desnudo rompería los motores no-permisivos (Qwen bloquea
   upstream; el bleed vuelve NSFW hasta un post inocente) y es un pasivo legal/almacenamiento.
   El mini-bikini expone lo suficiente (cintura, muslos, curva de glúteo, volumen de busto)
   para anclar proporciones y es un "pasaporte corporal" universal. El desnudo es un
   entregable opcional del motor permisivo (fase 2), nunca la referencia base.

2. **Iteración = 3 ángulos por render.** Cada iteración (mover slider → generar) produce el
   sheet completo de 3 vistas. Más caro/lento por iteración, pero el usuario ve el cuerpo
   completo desde el inicio. (Decisión explícita del usuario: "lo vale".)

3. **Un solo cuerpo canónico por avatar.** Guardar reemplaza el anterior (con confirmación),
   no acumula.

4. **Uso auto-ruteado (destino: método C), entregado por fases:**
   - **Fase 1 (v1):** método **A universal** — el body sheet persistido se inyecta con rol
     `'body'` en todos los motores. Resuelve el problema central.
   - **Fase 2:** método **B lienzo** para Qwen/Wan (requiere derivar una vista frontal única,
     porque el sheet de 3 vistas no puede ser lienzo directo) + variante desnuda opcional.

## Contexto de código (lo que ya existe)

La generación de imágenes del avatar es **client-side** (no hay `/api/**` de generación).
Orquestador: `handleGenerate` en
`src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_components/AvatarStudioMain.tsx`.

Piezas reutilizables ya presentes:

- **Patrón de angle sheet (cara):** `handleGenerateAngle` en
  `src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_components/AvatarEditDrawer.tsx:345`
  — genera un grid de vistas de cara con prompt fijo. Es el patrón a clonar para el cuerpo.
- **Rol "body" en el prompt builder:** `src/utils/avatarPromptBuilder.ts:374` — etiqueta
  `BODY_SHAPE` = *"CRITICAL BODY REFERENCE — COPY THIS EXACT SILHOUETTE"*. Ya existe.
- **Traducción de sliders a texto:** `src/utils/bodyDescriptors.ts`
  (`getBodyDescriptors`, `buildCurvesEmphasis`, `*_LEVEL_PHRASE`, `*_SHAPE_PHRASE`,
  `effectiveThighsLevel`). `buildCurvesEmphasis` **solo viaja a motores permisivos**.
- **Gating permisivo:** `PROVIDER_TRAITS` + `isPermissiveProvider` en `AvatarStudioMain.tsx`
  (~`:1141`) y catálogo en `_shared/providerCatalog.ts`.
- **Esquema de datos:**
  - Tabla `avatar_references` con `type: ReferenceType` que **ya incluye `'body'`**
    (`src/@types/supabase.ts:396`). Sin migración.
  - Tabla `avatars.measurements` (JSON `PhysicalMeasurements`).
  - Servicio: `AvatarForgeService` (`uploadAvatarReference`, `apiAddAvatarReference`,
    `apiGetAvatarReferences`).
  - Store: `avatarStudioStore.ts` con `bodyRef` (hoy **solo de sesión**, no persistido).
- **Editor compartido de sliders:** `src/components/shared/PhysicalAttributesEditor/PhysicalAttributesEditor.tsx`
  (fuente única, consumida por 3 hosts).

## Diseño por componentes

### 1. UI — bloque "Body Lab" en `PhysicalAttributesEditor`

Nuevo bloque al final del editor compartido, activado por props opcionales (para que los
hosts que no generan no lo muestren):

- Prop `onGenerateBody?: (measurements, modelId) => Promise<ReferenceImage>` y
  `onSaveBody?: (sheet: ReferenceImage) => Promise<void>`.
- **Selector de modelo** (default permisivo). Lista limitada/priorizada a motores
  permisivos; si el usuario elige uno no-permisivo, aviso de que las curvas no aplicarán.
- **Botón "Generar cuerpo"** — deshabilitado sin `faceRef` (hint explicativo).
- **Preview** del sheet de 3 vistas.
- **Botón "Guardar como cuerpo"** — visible cuando hay un sheet generado en preview.

El editor sigue siendo "tonto": no llama servicios directamente, solo dispara callbacks que
el host (AvatarEditDrawer / AvatarStudioMain) cablea.

### 2. Generación — `handleGenerateBody` + `buildBodySheetPrompt`

- **`buildBodySheetPrompt(measurements)`** (nueva util, junto a `bodyDescriptors.ts`):
  arma el prompt del sheet reutilizando `getBodyDescriptors` + `buildCurvesEmphasis` +
  frases de nivel/forma. Plantilla: mujer de cuerpo completo, **3 vistas lado a lado
  (front / side profile / back)**, pose A neutral, **mini-bikini simple**, fondo de estudio
  neutro, luz suave y pareja.
- **`handleGenerateBody`** (en el host, clonando `handleGenerateAngle`): inyecta `faceRef`
  para coherencia de identidad, llama al provider seleccionado vía los servicios existentes
  (`generateImageKie` / provider services), devuelve **una sola imagen** con las 3 vistas.

### 3. Persistencia — "Guardar como cuerpo"

- Sube el sheet al bucket `avatars` (Storage) vía `uploadAvatarReference`.
- Upsert en `avatar_references` con `type: 'body'` — **reemplaza** el ref `'body'` previo
  del avatar (un solo cuerpo canónico).
- Guarda en `metadata` el **snapshot de `measurements`** que produjo el sheet (reproducible).
- Al **cargar el avatar**, hidrata `bodyRef` en el store desde el ref `'body'`
  (hoy `bodyRef` nace vacío por ser solo de sesión — este es el cambio clave de persistencia).

### 4. Uso en generación (Fase 1 — método A universal)

- El `bodyRef` persistido ya se empuja en `kieReferenceImages` con `role: 'body'`.
  Con la hidratación de la Sección 3, esto ahora ocurre en **cada** generación, en todos los
  motores (permisivos y no-permisivos), sin que el usuario re-suba nada.
- Etiqueta `BODY_SHAPE` ("COPY THIS EXACT SILHOUETTE") ya presente en el prompt builder.
- **No** se toca el hot path de ruteo por motor en v1 más allá de garantizar que el body ref
  hidratado viaje como rol `'body'`.

### 5. Fase 2 (fuera de v1, documentado para no perderlo)

- **Método B lienzo (Qwen/Wan):** derivar una **vista frontal única** de cuerpo (recorte del
  sheet o generación aparte) para usarla como lienzo + face-swap + relight, reusando el
  método `clone = lienzo` ya existente. Ruteo por `PROVIDER_TRAITS`.
- **Variante desnuda:** botón habilitado solo con motor permisivo; ref aparte marcado en
  metadata; **nunca** se inyecta a motores no-permisivos.

## Manejo de errores

- Sin `faceRef` → botón "Generar cuerpo" deshabilitado con hint.
- Motor no-permisivo seleccionado para generar cuerpo → aviso de que `buildCurvesEmphasis`
  (busto/glúteos/muslos) no aplicará.
- Fallo de generación → toast; se conserva el cuerpo guardado previo (no se borra en fallo).
- "Guardar como cuerpo" con cuerpo existente → confirmación antes de reemplazar.

## Testing

- **Unitario:** `buildBodySheetPrompt` con fixtures de `PhysicalMeasurements` (verificar que
  incluye descriptores de curvas solo cuando corresponde, mini-bikini, 3 vistas).
- **Unitario/integración:** persistencia — el guardado **reemplaza** el ref `'body'` previo y
  el snapshot de measurements queda en metadata; la hidratación en carga puebla `bodyRef`.
- **Manual/visual:** consistencia real del cuerpo entre generaciones y entre motores
  (generación externa y costosa; no automatizable de forma barata).

## Alcance de v1 (aprobado)

- Fase 1: método A universal — generar sheet de cuerpo (3 vistas, bikini) desde sliders,
  iterar, guardar como cuerpo canónico persistido, e inyectarlo en cada generación.
- **Fuera de v1:** método B lienzo (Qwen/Wan) y variante desnuda → Fase 2.
