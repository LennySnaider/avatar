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

No existe **una forma de GENERAR y fijar** un ancla visual del cuerpo desde los
sliders. La infraestructura de almacenar/hidratar/inyectar un `bodyRef` (type
`'body'`) **ya existe y funciona** (ver "Contexto de código"); lo que falta es la
herramienta que produzca ese ancla a partir de los atributos físicos.

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
     `'body'` en todos los motores. **Esta inyección YA existe** (el `bodyRef` ya viaja con
     rol `'body'`); v1 solo agrega la forma de *generar* y *fijar* ese `bodyRef`.
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
  - Servicio: `AvatarForgeService` (`apiUploadReference(avatarId, file, type)` sube + crea
    fila; `apiGetAvatarReferences`, `apiDeleteAvatarReference`).
- **Persistencia + hidratación del `bodyRef` YA FUNCIONAN (hallazgo clave):**
  - **Guardar:** al guardar el avatar, `body` está en `SINGLETON_REF_TYPES`
    (`AvatarStudioMain.tsx:710`) → borra la fila `'body'` previa y sube la nueva vía
    `apiUploadReference`. Un solo cuerpo canónico, sin acumular.
  - **Cargar:** `AvatarStudioProvider.tsx:161` hace
    `bodyRef = loadedRefs.find(r => r.type === 'body')` → `loadAvatarData(... bodyRef ...)` →
    store `set({ bodyRef })`. Se rehidrata solo.
  - **Store:** `avatarStudioStore.ts` ya tiene `bodyRef` + `setBodyRef` + `loadAvatarData`.
  - El comentario *"Body ref is now a session tool"* en `AvatarEditDrawer.tsx:362` es
    engañoso: se refiere a que el *drawer* no tiene slot de subida persistente, **no** a
    que el `bodyRef` no se persista. Se persiste.
- **Editor compartido de sliders:** `src/components/shared/PhysicalAttributesEditor/PhysicalAttributesEditor.tsx`
  (fuente única, consumida por 3 hosts). Es `value + onChange` puro (store-agnóstico).
- **Generación KIE:** `generateImageKie(params)` en `src/services/KieService.ts:381`
  (`params: { prompt, model, aspectRatio?, referenceImages?: {base64,mimeType,role?}[],
  bodyEmphasis?, ... }`). Rutea por familia de modelo. `bodyEmphasis` es donde se inyecta
  `buildCurvesEmphasis(measurements)`.
- **Traits permisivos:** `PROVIDER_TRAITS` en `_shared/providerCatalog.ts:430`. Permisivos con
  `face: true` (ideales para el body sheet): `minimax-image-01`, `kie-seedream-4-5`,
  `kie-seedream-5-lite`, `kie-seedream-5-pro`, `kie-wan-2-2-uncensored`, `kie-wan-image`.

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
- **Botón "Usar como cuerpo"** — visible cuando hay un sheet generado en preview; hace
  `setBodyRef(sheet)`. La persistencia real ocurre en el guardado del avatar ya existente.

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

### 3. Persistencia — "Usar como cuerpo" (mayormente YA existe)

**Descubrimiento:** persistencia + hidratación del `bodyRef` (type `'body'`) ya funcionan
(ver "Contexto de código"). v1 **no reimplementa** guardado/carga.

- El botón **"Usar como cuerpo"** hace `setBodyRef(sheet)` con `sheet.type = 'body'`.
- El **guardado del avatar** existente (`AvatarStudioMain.tsx:~700`) ya sube `bodyRef` a
  Storage y reemplaza la fila `'body'` previa (singleton). **No se toca.**
- La **carga del avatar** existente (`AvatarStudioProvider.tsx:161`) ya rehidrata `bodyRef`.
  **No se toca.**
- Único requisito: el `ReferenceImage` del sheet debe llevar `type: 'body'` para caer en la
  rama singleton correcta.

### 4. Uso en generación (Fase 1 — método A universal) — YA existe

- El `bodyRef` ya se empuja en `kieReferenceImages` con `role: 'body'` en cada generación,
  en todos los motores (permisivos y no-permisivos).
- Etiqueta `BODY_SHAPE` ("COPY THIS EXACT SILHOUETTE") ya presente en el prompt builder.
- **v1 no toca el hot path de generación.** Al fijar `bodyRef` con el sheet, la inyección
  existente hace el resto.

### 5. Fase 2 (fuera de v1, documentado para no perderlo)

- **Método B lienzo (Qwen/Wan):** derivar una **vista frontal única** de cuerpo (recorte del
  sheet o generación aparte) para usarla como lienzo + face-swap + relight, reusando el
  método `clone = lienzo` ya existente. Ruteo por `PROVIDER_TRAITS`.
- **Variante desnuda:** botón habilitado solo con motor permisivo; ref aparte marcado en
  metadata; **nunca** se inyecta a motores no-permisivos.

## Manejo de errores

- Sin `faceRef` → botón "Generar cuerpo" deshabilitado con hint.
- Sin modelo permisivo disponible → selector vacío; botón deshabilitado con hint
  ("configura un proveedor permisivo — Seedream / Wan").
- Fallo de generación → toast; el preview no cambia y el `bodyRef` fijado previo se conserva.

## Testing

- **Unitario:** `buildBodySheetPrompt` con fixtures de `PhysicalMeasurements` — verifica que
  el prompt pide 3 vistas (front/side/back), mini-bikini y fondo neutro, e incluye las frases
  de curvas solo cuando los niveles están seteados (no en Auto).
- **Unitario:** `getPermissiveBodyModels(providers)` — devuelve solo providers permisivos y
  prioriza los `face: true`.
- **Manual/visual:** consistencia real del cuerpo entre generaciones y entre motores tras
  fijar el sheet (generación externa y costosa; no automatizable de forma barata).

## Alcance de v1 (aprobado)

- **v1 = solo el generador.** Persistencia (guardado singleton), hidratación en carga e
  inyección con rol `'body'` **ya existen** — v1 no las toca.
- Trabajo real de v1: (a) `buildBodySheetPrompt`, (b) `getPermissiveBodyModels`,
  (c) un handler `handleGenerateBody` que llama `generateImageKie` con modelo permisivo +
  `faceRef` + `bodyEmphasis`, (d) UI en `PhysicalAttributesEditor` (selector + botón +
  preview + "Usar como cuerpo" → `setBodyRef`).
- **Fuera de v1:** método B lienzo (Qwen/Wan) y variante desnuda → Fase 2.
