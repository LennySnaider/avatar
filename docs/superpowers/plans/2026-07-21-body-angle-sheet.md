# Body Angle Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir a "Physical Attributes" un generador de *body angle sheet* (3 vistas front/side/back en mini-bikini) desde los sliders, que se fija como `bodyRef` del avatar para dar consistencia de cuerpo — reutilizando la persistencia/hidratación/inyección que YA existen.

**Architecture:** El editor de atributos (`PhysicalAttributesEditor`, componente compartido `value+onChange`) recibe props opcionales de "Body Lab". El host (`AvatarEditDrawer` del Avatar Studio) las cablea: llama `generateImageKie` con un modelo permisivo + `faceRef` + `bodyEmphasis`, muestra el sheet en preview, y "Usar como cuerpo" hace `setBodyRef(sheet)`. La persistencia (guardado singleton `body`), la hidratación en carga y la inyección con rol `'body'` en cada generación ya funcionan y NO se tocan.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript strict, Zustand, componentes ECME UI, servicio KIE (`generateImageKie`).

## Global Constraints

- **Sin runner de tests** (decisión del usuario). Verificación por: `npx tsc --noEmit` (sin errores nuevos), `npm run lint` (sin errores nuevos), y prueba manual en `npm run dev` (puerto 3030).
- **NUNCA** usar Shadcn/ui ni Radix — solo componentes ECME de `@/components/ui/*`.
- Path alias `@/` = `src/`.
- **NO tocar** el hot path de generación (`AvatarStudioMain.handleGenerate`), ni el guardado de avatar (`AvatarStudioMain` ~L680-756), ni la carga (`AvatarStudioProvider.tsx:141-173`). Ya soportan `type: 'body'`.
- El body sheet se genera en **mini-bikini** (nunca desnudo en v1). Base universal.
- Commits en español, SIN firmas de Claude/Anthropic ni co-authored-by.
- Rama de trabajo: `feat/body-angle-sheet` (ya creada).

---

### Task 1: Util `buildBodySheetPrompt`

Función pura que arma el prompt del sheet de 3 vistas en bikini desde los measurements, reutilizando los descriptores existentes.

**Files:**
- Create: `src/utils/bodySheetPrompt.ts`

**Interfaces:**
- Consumes: `describeBody`, `getSkinToneDescription`, `getHairColorDescription` de `@/utils/bodyDescriptors`; tipo `PhysicalMeasurements` de `@/@types/supabase`.
- Produces: `buildBodySheetPrompt(m: PhysicalMeasurements): string`

- [ ] **Step 1: Crear el archivo con la función**

```typescript
// src/utils/bodySheetPrompt.ts
import type { PhysicalMeasurements } from '@/@types/supabase'
import {
    describeBody,
    getSkinToneDescription,
    getHairColorDescription,
} from '@/utils/bodyDescriptors'

/**
 * Prompt para el BODY ANGLE SHEET del avatar: una sola imagen con 3 vistas
 * (frente / perfil / espalda) de la MISMA mujer, de cuerpo completo, en
 * mini-bikini simple, fondo de estudio neutro y luz pareja. Reutiliza los
 * descriptores de cuerpo/piel/pelo ya existentes para que el sheet respete los
 * sliders de Physical Attributes.
 *
 * En mini-bikini a propósito (NO desnudo): el sheet se inyecta como body ref en
 * TODOS los motores, incl. no-permisivos — un ref desnudo los rompería.
 */
export function buildBodySheetPrompt(m: PhysicalMeasurements): string {
    const body = describeBody(m)
    const skin = getSkinToneDescription(m.skinTone)
    const hair = getHairColorDescription(m.hairColor)

    const person = [
        `${m.age ?? 22}-year-old woman`,
        body,
        skin,
        hair,
    ]
        .filter(Boolean)
        .join(', ')

    return [
        `Full-body character reference sheet of ONE ${person}.`,
        'Three full-body views of the SAME woman side by side in a single image, left to right: front view, side profile view, back view.',
        'Standing in a neutral relaxed A-pose, arms slightly away from the body, feet shoulder-width apart.',
        'Wearing a simple plain micro bikini (matte solid color), no accessories, no props.',
        'Plain seamless light-gray studio background, soft even frontal lighting, no harsh shadows.',
        'Consistent identical body shape, proportions and skin tone across all three views.',
        'Full body visible head-to-toe in every view, whole figure in frame, no cropping.',
        'Photorealistic, ultra high detail, sharp focus. No text, no labels, no borders, no grid lines, no watermark.',
    ].join(' ')
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos relacionados a `bodySheetPrompt.ts`.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: sin errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add src/utils/bodySheetPrompt.ts
git commit -m "feat(body-sheet): util buildBodySheetPrompt (3 vistas front/side/back en mini-bikini)"
```

---

### Task 2: Helper `getPermissiveBodyModels`

Selecciona, de los providers configurados del usuario, los permisivos aptos para generar el cuerpo (prioriza los `face: true`). Vive junto a `PROVIDER_TRAITS`.

**Files:**
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/_shared/providerCatalog.ts` (añadir export al final)

**Interfaces:**
- Consumes: `PROVIDER_TRAITS` (mismo archivo); tipo `AIProvider` de `@/@types/supabase` (ya importado en el archivo — verificar el import existente arriba).
- Produces: `getPermissiveBodyModels(providers: AIProvider[]): AIProvider[]`

- [ ] **Step 1: Añadir la función al final de `providerCatalog.ts`**

```typescript
/**
 * De los providers configurados, los aptos para generar el BODY ANGLE SHEET:
 * permisivos (dejan pasar bikini + énfasis de curvas). Se priorizan los que
 * además reciben cara (`face: true`) porque el sheet inyecta el faceRef. El
 * caller pasa `provider.model` a generateImageKie.
 */
export function getPermissiveBodyModels(providers: AIProvider[]): AIProvider[] {
    const permissive = providers.filter(
        (p) => PROVIDER_TRAITS[p.id]?.permissive === true,
    )
    // Los `face: true` primero (mejor coherencia con el faceRef del sheet).
    return permissive.sort((a, b) => {
        const fa = PROVIDER_TRAITS[a.id]?.face === true ? 0 : 1
        const fb = PROVIDER_TRAITS[b.id]?.face === true ? 0 : 1
        return fa - fb
    })
}
```

- [ ] **Step 2: Verificar el import de `AIProvider` en el archivo**

Run: `grep -n "AIProvider" "src/app/(protected-pages)/concepts/avatar-forge/_shared/providerCatalog.ts" | head`
Expected: aparece un import de `AIProvider` (p.ej. `import type { AIProvider } from '@/@types/supabase'`). Si NO aparece, añadirlo arriba del archivo:

```typescript
import type { AIProvider } from '@/@types/supabase'
```

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(protected-pages)/concepts/avatar-forge/_shared/providerCatalog.ts"
git commit -m "feat(body-sheet): getPermissiveBodyModels — providers permisivos priorizando face"
```

---

### Task 3: Bloque "Body Lab" en `PhysicalAttributesEditor` (UI pura)

Añade props opcionales `bodyLab` y renderiza el bloque solo cuando se pasan. El componente sigue siendo store-agnóstico (`value + onChange`); no llama servicios.

**Files:**
- Modify: `src/components/shared/PhysicalAttributesEditor/PhysicalAttributesEditor.tsx`

**Interfaces:**
- Consumes: `PhysicalRegionRef` (ya exportada en el archivo) para el tipo del sheet.
- Produces: nueva prop opcional `bodyLab?: BodyLabProps` y el export de tipo `BodyLabProps`.

- [ ] **Step 1: Definir `BodyLabProps` y añadirla a las props del componente**

En `PhysicalAttributesEditor.tsx`, tras la definición de `PhysicalRegionRef` (≈L60), añadir:

```typescript
// Props del bloque "Body Lab" (opcional). El host inyecta la lógica de
// generación/persistencia; este componente solo pinta. Si `bodyLab` no se pasa,
// el bloque no se muestra (hosts sin generación: creator, shared drawer viejo).
export interface BodyLabProps {
    // Modelos permisivos a elegir. `model` es la cadena que va a generateImageKie.
    models: { id: string; name: string; model: string }[]
    selectedModel: string // cadena `model` seleccionada
    onSelectModel: (model: string) => void
    isGenerating: boolean
    sheet: PhysicalRegionRef | null // preview del sheet generado
    onGenerate: () => void
    onUseAsBody: () => void
    // Motivo por el que no se puede generar (sin faceRef / sin modelo permisivo).
    // Si está presente, el botón "Generar cuerpo" se deshabilita y se muestra.
    disabledReason?: string
}
```

Y en la interfaz `PhysicalAttributesEditorProps` (≈L62), añadir la línea:

```typescript
    bodyLab?: BodyLabProps
```

Y en el destructuring del componente (≈L73-80), añadir `bodyLab,`:

```typescript
const PhysicalAttributesEditor = ({
    measurements,
    onChange,
    bustRef,
    glutesRef,
    onBustRef,
    onGlutesRef,
    bodyLab,
}: PhysicalAttributesEditorProps) => {
```

- [ ] **Step 2: Renderizar el bloque al final del editor**

Localizar el cierre del `return (<div className="space-y-4"> ... </div>)` del componente (el último `</div>` antes del `)` de cierre del return). Justo ANTES de ese `</div>` de cierre, insertar el bloque:

```tsx
            {bodyLab && (
                <div className="space-y-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div>
                        <p className="text-sm font-semibold">
                            Body Lab — Cuerpo canónico
                        </p>
                        <p className="text-xs text-gray-500">
                            Genera un cuerpo de 3 vistas (mini-bikini) desde
                            estos atributos y fíjalo como el cuerpo del avatar.
                        </p>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs text-gray-500">
                            Modelo de generación (permisivo)
                        </label>
                        <select
                            className="w-full h-9 px-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent text-sm"
                            value={bodyLab.selectedModel}
                            onChange={(e) =>
                                bodyLab.onSelectModel(e.target.value)
                            }
                            disabled={
                                bodyLab.models.length === 0 ||
                                bodyLab.isGenerating
                            }
                        >
                            {bodyLab.models.length === 0 ? (
                                <option value="">
                                    Sin proveedor permisivo configurado
                                </option>
                            ) : (
                                bodyLab.models.map((m) => (
                                    <option key={m.id} value={m.model}>
                                        {m.name}
                                    </option>
                                ))
                            )}
                        </select>
                    </div>

                    {bodyLab.sheet && (
                        <img
                            src={
                                bodyLab.sheet.thumbnailUrl ||
                                bodyLab.sheet.url
                            }
                            alt="Body angle sheet"
                            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 object-cover"
                        />
                    )}

                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={bodyLab.onGenerate}
                            disabled={
                                !!bodyLab.disabledReason || bodyLab.isGenerating
                            }
                            className="flex-1 h-9 rounded-lg bg-primary text-white text-sm disabled:opacity-50"
                        >
                            {bodyLab.isGenerating
                                ? 'Generando…'
                                : bodyLab.sheet
                                  ? 'Regenerar cuerpo'
                                  : 'Generar cuerpo'}
                        </button>
                        {bodyLab.sheet && !bodyLab.isGenerating && (
                            <button
                                type="button"
                                onClick={bodyLab.onUseAsBody}
                                className="flex-1 h-9 rounded-lg border border-primary text-primary text-sm"
                            >
                                Usar como cuerpo
                            </button>
                        )}
                    </div>

                    {bodyLab.disabledReason && (
                        <p className="text-xs text-amber-500">
                            {bodyLab.disabledReason}
                        </p>
                    )}
                </div>
            )}
```

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores nuevos. (Los otros 2 hosts que usan el editor sin `bodyLab` siguen compilando: la prop es opcional.)

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/PhysicalAttributesEditor/PhysicalAttributesEditor.tsx
git commit -m "feat(body-sheet): bloque Body Lab opcional en PhysicalAttributesEditor"
```

---

### Task 4: Cablear el Body Lab en `AvatarEditDrawer` (estado + handlers)

El host provee la lógica: modelos permisivos, generación vía KIE, preview, y "Usar como cuerpo" → `setBodyRef`.

**Files:**
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_components/AvatarEditDrawer.tsx`

**Interfaces:**
- Consumes: `buildBodySheetPrompt` (Task 1), `getPermissiveBodyModels` (Task 2), `bodyLab` prop de `PhysicalAttributesEditor` (Task 3); `generateImageKie` de `@/services/KieService`; `buildCurvesEmphasis` de `@/utils/bodyDescriptors`; del store `providers`, `bodyRef`, `setBodyRef`.
- Produces: —

- [ ] **Step 1: Añadir imports**

En la cabecera de `AvatarEditDrawer.tsx` (junto a los imports existentes ≈L25-29), añadir:

```typescript
import { generateImageKie } from '@/services/KieService'
import { buildBodySheetPrompt } from '@/utils/bodySheetPrompt'
import { buildCurvesEmphasis } from '@/utils/bodyDescriptors'
import { getPermissiveBodyModels } from '../../_shared/providerCatalog'
```

- [ ] **Step 2: Traer `providers`, `bodyRef`, `setBodyRef` del store**

En el `useAvatarStudioStore()` destructuring (≈L88-107) añadir `providers,`, `bodyRef,` y `setBodyRef,`.

- [ ] **Step 3: Añadir estado local del Body Lab**

Junto a los otros `useState` (≈L47-54) añadir:

```typescript
const [bodySheet, setBodySheet] = useState<ReferenceImage | null>(null)
const [isGeneratingBody, setIsGeneratingBody] = useState(false)
const [selectedBodyModel, setSelectedBodyModel] = useState('')
```

- [ ] **Step 4: Calcular modelos permisivos y default (deriva del store)**

Antes del `return`, añadir:

```typescript
const permissiveBodyModels = getPermissiveBodyModels(providers)

// Default: primer modelo permisivo (los face:true ya vienen primero).
useEffect(() => {
    if (!selectedBodyModel && permissiveBodyModels.length > 0) {
        setSelectedBodyModel(permissiveBodyModels[0].model)
    }
}, [permissiveBodyModels, selectedBodyModel])
```

- [ ] **Step 5: Añadir `handleGenerateBody`**

Junto a `handleGenerateAngle` (≈L345) añadir. Nota: `generateImageKie` puede devolver una URL http(s) o un data URL; el helper `toReferenceImage` normaliza ambos a base64 (necesario para el guardado y el thumbnail).

```typescript
const toReferenceImage = async (
    url: string,
    type: ReferenceImage['type'],
): Promise<ReferenceImage> => {
    // data URL directo
    let dataUrl = url
    if (!url.startsWith('data:')) {
        const blob = await fetch(url).then((r) => r.blob())
        dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(blob)
        })
    }
    const matches = dataUrl.match(/^data:(.+);base64,(.+)$/)
    if (!matches) throw new Error('Invalid image data returned')
    let thumbnailUrl = dataUrl
    try {
        thumbnailUrl = await createThumbnail(matches[2], 'THUMBNAIL')
    } catch {
        // fallback al full
    }
    return {
        id: crypto.randomUUID(),
        url: dataUrl,
        mimeType: matches[1],
        base64: matches[2],
        type,
        thumbnailUrl,
    }
}

const handleGenerateBody = async () => {
    if (!localFaceRef || !selectedBodyModel) return
    setIsGeneratingBody(true)
    try {
        const result = await generateImageKie({
            prompt: buildBodySheetPrompt(localMeasurements),
            model: selectedBodyModel,
            aspectRatio: '16:9',
            referenceImages: [
                {
                    base64: localFaceRef.base64,
                    mimeType: localFaceRef.mimeType,
                    role: 'face',
                },
            ],
            bodyEmphasis: buildCurvesEmphasis(localMeasurements),
        })
        if (!result.success) throw new Error(result.error)
        const sheet = await toReferenceImage(result.url, 'body')
        setBodySheet(sheet)
        toast.push(
            <Notification type="success" title="Cuerpo generado">
                Sheet de 3 vistas listo. Revísalo y pulsa "Usar como cuerpo".
            </Notification>,
        )
    } catch (error) {
        console.error('Error generating body sheet:', error)
        toast.push(
            <Notification type="danger" title="Falló la generación">
                No se pudo generar el cuerpo
            </Notification>,
        )
    } finally {
        setIsGeneratingBody(false)
    }
}

const handleUseAsBody = () => {
    if (!bodySheet) return
    setBodyRef(bodySheet)
    toast.push(
        <Notification type="success" title="Cuerpo fijado">
            Se guardará como el cuerpo del avatar al guardar los cambios.
        </Notification>,
    )
}
```

- [ ] **Step 6: Pasar `bodyLab` al `<PhysicalAttributesEditor>`**

Localizar el `<PhysicalAttributesEditor ... />` (≈L683-704) y añadir la prop `bodyLab`:

```tsx
bodyLab={{
    models: permissiveBodyModels.map((p) => ({
        id: p.id,
        name: p.name,
        model: p.model,
    })),
    selectedModel: selectedBodyModel,
    onSelectModel: setSelectedBodyModel,
    isGenerating: isGeneratingBody,
    sheet: bodySheet,
    onGenerate: handleGenerateBody,
    onUseAsBody: handleUseAsBody,
    disabledReason: !localFaceRef
        ? 'Sube o genera primero una cara (Face Close-up) para el cuerpo.'
        : permissiveBodyModels.length === 0
          ? 'Configura un proveedor permisivo (Seedream / Wan) en AI Providers.'
          : undefined,
}}
```

Nota: `p.name` y `p.model` provienen del tipo `AIProvider`. Si `p.model` fuese opcional en el tipo, usar `p.model ?? ''` y filtrar los vacíos en Task 2.

- [ ] **Step 7: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores nuevos.

- [ ] **Step 8: Verificación manual en la app**

Run: `npm run dev` y abrir `http://localhost:3030/concepts/avatar-forge/avatar-list`.
Pasos:
1. Editar un avatar que tenga Face Close-up (p.ej. MiaUltra).
2. Scroll a Physical Attributes → aparece "Body Lab" con selector de modelo permisivo.
3. Ajustar el slider de Busto/Glúteos, pulsar "Generar cuerpo".
4. Verificar: aparece el sheet de 3 vistas en mini-bikini en el preview.
5. Pulsar "Usar como cuerpo" → toast "Cuerpo fijado".
6. Guardar el avatar. Recargar la página, reabrir el avatar → el `bodyRef` sigue (verificar que una generación normal ahora respeta el cuerpo).
Expected: el sheet se genera, se fija, persiste tras recarga, y las generaciones posteriores usan ese cuerpo.

- [ ] **Step 9: Commit**

```bash
git add "src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_components/AvatarEditDrawer.tsx"
git commit -m "feat(body-sheet): cablear Body Lab en AvatarEditDrawer (genera + fija bodyRef)"
```

---

## Self-Review

**Cobertura del spec:**
- Sección "UI Body Lab" → Task 3 + Task 4 (Step 6). ✓
- `buildBodySheetPrompt` → Task 1. ✓
- `getPermissiveBodyModels` → Task 2. ✓
- Generación permisiva + faceRef + bodyEmphasis → Task 4 Step 5. ✓
- "Usar como cuerpo" → `setBodyRef` → Task 4 Step 5 (`handleUseAsBody`). ✓
- Persistencia/hidratación/inyección → YA existen, no requieren tarea (verificadas en Task 4 Step 8). ✓
- Manejo de errores (sin faceRef / sin modelo permisivo / fallo de generación) → Task 4 Steps 5-6. ✓
- Fuera de v1 (método B lienzo, variante desnuda) → no hay tareas, correcto. ✓

**Escaneo de placeholders:** sin TBD/TODO; todo el código está completo. ✓

**Consistencia de tipos:** `buildBodySheetPrompt(m)`, `getPermissiveBodyModels(providers)`, `BodyLabProps`, `toReferenceImage(url, type)` usados con las mismas firmas donde se consumen. `ReferenceImage['type']` incluye `'body'` (definido en `avatar-studio/types.ts`). `generateImageKie` params (`prompt/model/aspectRatio/referenceImages/bodyEmphasis`) coinciden con `GenerateImageKieParams` (`KieService.ts:335`). ✓
