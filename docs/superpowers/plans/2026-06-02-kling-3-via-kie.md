# Kling 3.0 vía KIE — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar Kling 3.0 (video plano i2v/t2v + motion-control v2v) como un provider KIE seleccionable que convive con el Kling v3 directo, sin tocar `KlingService`.

**Architecture:** Espeja el patrón Seedance/Wan en `KieService` (`'use server'`): subir imagen/video a Supabase → armar `input` → `submitTask` → `pollTask(600s)` → `persistToSupabase('mp4','kie-videos')`. El router en `AvatarStudioMain` ya tiene la rama `type === 'KIE'`; se le agrega lógica para distinguir video plano vs motion-control. La UI de motion-control (`KlingMotionControlEditor`) y un toggle de audio nuevo se exponen para el provider KIE extendiendo los gates de los paneles de control.

**Tech Stack:** Next.js 15 (App Router, server actions), TypeScript strict, Zustand store, KIE API (`/jobs/createTask` + `/jobs/recordInfo`), Supabase Storage.

**Spec:** [docs/superpowers/specs/2026-06-02-kling-3-via-kie-design.md](../specs/2026-06-02-kling-3-via-kie-design.md)

**Verificación (sin framework de tests):** el repo no tiene jest/vitest. Cada tarea se verifica con `npx tsc --noEmit` (type-check) y, donde toca JSX, `npm run lint`. La verificación funcional es manual (A/B con KIE key) en la Task 11. NO escribir archivos de test — no hay runner.

---

## File Structure

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `src/@types/kie.ts` | Tipos KIE | Modificar: agregar 2 model strings a `KieVideoModel` |
| `src/services/KieService.ts` | Adapters KIE server-side | Modificar: `sound?` en params, `clampKlingAspect`, `generateVideoKling3`, ruta; `GenerateMotionControlKieParams` + `generateMotionControlKie` |
| `src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_store/avatarStudioStore.ts` | Estado del studio | Modificar: `klingNativeAudioEnabled` + setter + initial + reset |
| `.../_utils/providerCapabilities.ts` | Opciones por provider | Modificar: duración/resolución para `kie-kling-3-0` |
| `.../_components/ProviderManagerDrawer.tsx` | Registro de providers | Modificar: entrada `kie-kling-3-0` + descripción |
| `.../_components/AvatarStudioMain.tsx` | Router de generación | Modificar: import, destructure, 2 ramas KIE |
| `.../_components/KlingMotionControlEditor.tsx` | UI motion-control | Modificar: prop `allowPresets` |
| `.../_components/KlingNativeAudioToggle.tsx` | UI toggle audio | **Crear** |
| `.../_components/GenerationControls.tsx` | Panel de controles (surface A) | Modificar: exponer controles para KIE Kling |
| `.../_components/BottomControlBar.tsx` | Panel de controles (surface B) | Modificar: exponer controles para KIE Kling |

> Nota: la ruta base de los componentes/store/utils es
> `src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/`. En las tareas se
> abrevia con `.../` salvo la primera mención.

---

### Task 1: Tipos + `generateVideoKling3` (video plano)

**Files:**
- Modify: `src/@types/kie.ts:13-17`
- Modify: `src/services/KieService.ts:493-509` (params) y `:776-784` (ruta) + función nueva

- [ ] **Step 1: Agregar los model strings a `KieVideoModel`**

En `src/@types/kie.ts`, reemplazar el bloque `export type KieVideoModel = …` (líneas 13-17) por:

```ts
export type KieVideoModel =
    | 'veo-3.1'                    // dedicated endpoint /api/v1/veo/generate (TBD wiring)
    | 'veo-3.1-fast'
    | 'bytedance/seedance-2'       // unified /jobs/createTask, first_frame_url HTTP, duration int
    | 'wan/2-7-image-to-video'     // unified /jobs/createTask, first_frame_url HTTP required
    | 'kling-3.0/video'            // unified /jobs/createTask; image_urls[], sound, mode std/pro
    | 'kling-3.0/motion-control'   // unified /jobs/createTask; input_urls[]+video_urls[] (v2v)
```

- [ ] **Step 2: Agregar `sound?` a `GenerateVideoKieParams`**

En `src/services/KieService.ts`, en la interface `GenerateVideoKieParams` (empieza en línea 493), agregar el campo `sound` justo después de `resolution?: string`:

```ts
    aspectRatio?: string
    duration?: number
    resolution?: string
    /** Kling 3.0 native audio (`sound`). Ignored by other KIE models. */
    sound?: boolean
}
```

- [ ] **Step 3: Agregar `clampKlingAspect` + `generateVideoKling3`**

En `src/services/KieService.ts`, inmediatamente ANTES de `export async function generateVideoKie(` (línea 776), insertar:

```ts
/**
 * KIE Kling 3.0 only accepts 16:9, 9:16, 1:1. Map other ratios to the nearest
 * supported one rather than letting the API 400.
 */
function clampKlingAspect(aspect: string): '16:9' | '9:16' | '1:1' {
    if (aspect === '16:9' || aspect === '9:16' || aspect === '1:1') return aspect
    if (aspect === '4:3') return '16:9'
    if (aspect === '3:4') return '9:16'
    return '9:16' // avatar default is vertical
}

/**
 * Kling 3.0 video (kling-3.0/video) via the unified /jobs/createTask flow.
 * Native audio via `sound`; quality via `mode` (std=720p, pro=1080p) — NO
 * separate `resolution` field (unlike Seedance/Wan). Image, if present, must
 * be a public HTTP URL (uploaded to Supabase first) → image-to-video; absent
 * → text-to-video.
 */
async function generateVideoKling3(params: GenerateVideoKieParams): Promise<string> {
    const {
        prompt,
        firstFrameImage,
        aspectRatio = '9:16',
        duration = 5,
        resolution,
        sound = false,
    } = params

    const input: Record<string, unknown> = {
        prompt,
        sound,
        duration: Number(duration),
        aspect_ratio: clampKlingAspect(aspectRatio),
        mode: resolution === '1080p' ? 'pro' : 'std',
    }

    if (firstFrameImage) {
        const url = await uploadReferenceToSupabase(
            firstFrameImage.base64,
            firstFrameImage.mimeType,
        )
        console.log(`[KIE/Kling3] Uploaded first frame to: ${url}`)
        input.image_urls = [url]
    }

    console.log(`[KIE/Kling3] Submitting: duration=${duration}s, mode=${input.mode}, aspect=${input.aspect_ratio}, sound=${sound}, i2v=${!!firstFrameImage}`)
    const taskId = await withTimeout(
        submitTask({ model: 'kling-3.0/video', input }),
        30_000,
        'KIE Kling 3.0 submit',
    )
    console.log(`[KIE/Kling3] Task submitted: ${taskId}`)

    const urls = await pollTask(taskId, { budgetMs: 600_000, intervalMs: 5000 })
    console.log(`[KIE/Kling3] Generation complete: ${urls[0]}`)

    return persistToSupabase(urls[0], 'mp4', 'kie-videos')
}
```

- [ ] **Step 4: Rutear `kling-3.0/video` dentro de `generateVideoKie`**

En `src/services/KieService.ts`, dentro de `generateVideoKie`, después del bloque `if (params.model === 'wan/2-7-image-to-video') { return generateVideoWan27(params) }` (línea ~782-784), agregar:

```ts
    if (params.model === 'kling-3.0/video') {
        return generateVideoKling3(params)
    }
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (sin errores nuevos en `kie.ts` ni `KieService.ts`). Si hay errores preexistentes no relacionados, confirmar que no involucran estos archivos.

- [ ] **Step 6: Commit**

```bash
git add src/@types/kie.ts src/services/KieService.ts
git commit -m "feat(kie): Kling 3.0 video (kling-3.0/video) adapter + aspect clamp"
```

---

### Task 2: `generateMotionControlKie` (motion-control v2v)

**Files:**
- Modify: `src/services/KieService.ts` (interface nueva + función exportada nueva, junto a `generateVideoKling3`)

- [ ] **Step 1: Verificar que `uploadReferenceToSupabase` acepta video**

Leer `uploadReferenceToSupabase` en `src/services/KieService.ts` (~línea 178-202). Confirmar que deriva la extensión del `mimeType` y no la hardcodea a imagen. Si hardcodea extensión de imagen (p.ej. siempre `.png`), ajustar para que `video/mp4` produzca `.mp4`. (Riesgo bajo; el bucket `generations` acepta cualquier blob.)

- [ ] **Step 2: Agregar `GenerateMotionControlKieParams` + `generateMotionControlKie`**

En `src/services/KieService.ts`, inmediatamente DESPUÉS de la función `generateVideoKling3` (creada en Task 1), insertar:

```ts
export interface GenerateMotionControlKieParams {
    characterImage: { base64: string; mimeType: string }
    /** Driving video as a public HTTP URL (preferred — already hosted). */
    motionVideoUrl?: string | null
    /** OR a base64 video to upload to Supabase first. */
    motionVideoBase64?: string | null
    prompt?: string
    /** Our VideoResolution string; '1080p' → pro, else → std (720p). */
    resolution?: string
    characterOrientation?: 'video' | 'image'
}

/**
 * Kling 3.0 motion-control (kling-3.0/motion-control), video-to-video. Needs
 * BOTH a character image (input_urls) and a driving video (video_urls), each
 * as a public HTTP URL. NO preset motions (KIE doesn't expose them). Quality
 * via `mode` (std=720p, pro=1080p).
 */
export async function generateMotionControlKie(
    params: GenerateMotionControlKieParams,
): Promise<string> {
    const {
        characterImage,
        motionVideoUrl,
        motionVideoBase64,
        prompt,
        resolution,
        characterOrientation = 'video',
    } = params

    const imageUrl = await uploadReferenceToSupabase(
        characterImage.base64,
        characterImage.mimeType,
    )

    let videoUrl = motionVideoUrl ?? null
    if (!videoUrl && motionVideoBase64) {
        videoUrl = await uploadReferenceToSupabase(motionVideoBase64, 'video/mp4')
    }
    if (!videoUrl) {
        throw new Error(
            'Kling 3.0 motion-control (KIE) requires a driving video (upload or URL). Presets are not supported on KIE.',
        )
    }

    const input: Record<string, unknown> = {
        input_urls: [imageUrl],
        video_urls: [videoUrl],
        mode: resolution === '1080p' ? 'pro' : 'std',
        character_orientation: characterOrientation,
        background_source: 'input_video',
    }
    if (prompt) input.prompt = prompt

    console.log(`[KIE/Kling3-MC] Submitting motion-control: mode=${input.mode}, orientation=${characterOrientation}`)
    const taskId = await withTimeout(
        submitTask({ model: 'kling-3.0/motion-control', input }),
        30_000,
        'KIE Kling 3.0 motion-control submit',
    )
    console.log(`[KIE/Kling3-MC] Task submitted: ${taskId}`)

    const urls = await pollTask(taskId, { budgetMs: 600_000, intervalMs: 5000 })
    console.log(`[KIE/Kling3-MC] Generation complete: ${urls[0]}`)

    return persistToSupabase(urls[0], 'mp4', 'kie-videos')
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/services/KieService.ts
git commit -m "feat(kie): Kling 3.0 motion-control (v2v) adapter"
```

---

### Task 3: Store — toggle de audio nativo

**Files:**
- Modify: `.../_store/avatarStudioStore.ts` (4 puntos)

- [ ] **Step 1: Campo en la interface de estado**

En `avatarStudioStore.ts`, después de `klingMotionDuration: '5' | '10' // Video duration in seconds` (línea 115), agregar:

```ts
    // Kling 3.0 (KIE) native audio — `sound` param. OFF by default (cheaper tier).
    klingNativeAudioEnabled: boolean
```

- [ ] **Step 2: Firma del setter**

Después de `setKlingMotionDuration: (duration: '5' | '10') => void` (línea 253), agregar:

```ts
    setKlingNativeAudioEnabled: (enabled: boolean) => void
```

- [ ] **Step 3: Estado inicial**

Después de `klingMotionDuration: '5' as '5' | '10',` (línea 396), agregar:

```ts
    klingNativeAudioEnabled: false,
```

- [ ] **Step 4: Reset en `resetKlingSettings`**

Dentro de `resetKlingSettings` (objeto que termina en línea 672 con `klingMotionDuration: '5',`), agregar después de esa línea:

```ts
            klingNativeAudioEnabled: false,
```

- [ ] **Step 5: Implementación del setter**

Después de `setKlingMotionDuration: (duration) => set({ klingMotionDuration: duration }),` (línea 682), agregar:

```ts
    setKlingNativeAudioEnabled: (enabled) => set({ klingNativeAudioEnabled: enabled }),
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_store/avatarStudioStore.ts"
git commit -m "feat(avatar-studio): klingNativeAudioEnabled store toggle"
```

---

### Task 4: providerCapabilities — duración/resolución para `kie-kling-3-0`

**Files:**
- Modify: `.../_utils/providerCapabilities.ts:23-27` y `:76-79`

- [ ] **Step 1: Duración**

En `providerCapabilities.ts`, dentro de `getDurationOptionsForProvider`, en el `case 'KIE':` (líneas 23-27), agregar la línea de Kling como PRIMERA condición del case:

```ts
        case 'KIE':
            if (provider.model === 'kling-3.0/video') return [5, 10]
            if (provider.model === 'bytedance/seedance-2') return [4, 5, 6, 8, 10, 12, 15]
            if (provider.model === 'wan/2-7-image-to-video') return [2, 5, 7, 10, 12, 15]
            // Older KIE models (Veo via aggregator, etc.) — sane default.
            return [5]
```

- [ ] **Step 2: Resolución**

Dentro de `getResolutionOptionsForProvider`, en el `case 'KIE':` (líneas 76-79), agregar la línea de Kling como PRIMERA condición:

```ts
        case 'KIE':
            if (provider.model === 'kling-3.0/video') return ['720p', '1080p']
            if (provider.model === 'bytedance/seedance-2') return ['480p', '720p', '1080p']
            if (provider.model === 'wan/2-7-image-to-video') return ['720p', '1080p']
            // Other KIE models (legacy Veo wiring, etc.) don't expose resolution.
            return null
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_utils/providerCapabilities.ts"
git commit -m "feat(avatar-studio): duration/resolution caps for kie-kling-3-0"
```

---

### Task 5: Entrada de provider + descripción

**Files:**
- Modify: `.../_components/ProviderManagerDrawer.tsx:275` (array) y `:399` (descripción)

- [ ] **Step 1: Agregar la entrada al `DEFAULT_PROVIDERS`**

En `ProviderManagerDrawer.tsx`, después del objeto `kie-wan-2-7` que termina en línea 275 (`},`) y ANTES del cierre `]` del array (línea 276), insertar:

```ts
    {
        id: 'kie-kling-3-0',
        name: 'Kling 3.0 · KIE',
        type: 'KIE' as ProviderType,
        model: 'kling-3.0/video',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: false,
        supports_video: true,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
```

- [ ] **Step 2: Agregar la descripción**

En la función `getProviderDescription` (switch por `provider.id`), después del `case 'kie-gpt-image-2':` y su return (línea ~398-399), agregar:

```ts
            case 'kie-kling-3-0':
                return 'Kling 3.0 vía KIE — video i2v/t2v + motion-control v2v, audio nativo opcional, ~20% más barato que el directo'
```

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_components/ProviderManagerDrawer.tsx"
git commit -m "feat(avatar-studio): register 'Kling 3.0 · KIE' provider"
```

---

### Task 6: Router — wiring en AvatarStudioMain

**Files:**
- Modify: `.../_components/AvatarStudioMain.tsx:43` (import), `:148` (destructure), `:886-895` (ANIMATE KIE), `:968-983` (AVATAR KIE)

- [ ] **Step 1: Import de `generateMotionControlKie`**

Reemplazar la línea 43:

```ts
import { generateImageKie, generateVideoKie, submitKieImageTask, checkKieImageTask } from '@/services/KieService'
```

por:

```ts
import { generateImageKie, generateVideoKie, generateMotionControlKie, submitKieImageTask, checkKieImageTask } from '@/services/KieService'
```

- [ ] **Step 2: Destructure de `klingNativeAudioEnabled`**

En el destructure del store, después de `klingMotionDuration,` (línea 148), agregar:

```ts
        klingNativeAudioEnabled,
```

- [ ] **Step 3: Rama KIE en modo ANIMATE**

Reemplazar el bloque (líneas 886-895):

```ts
                    } else if (activeProvider?.type === 'KIE') {
                        // KIE aggregator — image-to-video via aggregator
                        resultUrl = await generateVideoKie({
                            prompt: fullPrompt,
                            firstFrameImage: optimizedVideoInput,
                            model: activeProvider.model || 'veo-3.1/text-to-video',
                            aspectRatio,
                            duration: videoDuration,
                            resolution: videoResolution,
                        })
                    } else {
```

por:

```ts
                    } else if (activeProvider?.type === 'KIE') {
                        const isKieKling = activeProvider.model === 'kling-3.0/video'
                        const hasMotionVideo = !!(klingMotionVideoBase64 || klingMotionVideoUrl)
                        if (isKieKling && klingMotionControlEnabled && hasMotionVideo) {
                            // KIE Kling 3.0 motion-control (v2v)
                            resultUrl = await generateMotionControlKie({
                                characterImage: optimizedVideoInput,
                                motionVideoUrl: klingMotionVideoUrl || undefined,
                                motionVideoBase64: klingMotionVideoBase64 || undefined,
                                prompt: fullPrompt,
                                resolution: videoResolution,
                                characterOrientation: klingMotionOrientation,
                            })
                        } else {
                            // KIE aggregator — plain video (Kling 3.0 / Seedance / Wan / Veo)
                            resultUrl = await generateVideoKie({
                                prompt: fullPrompt,
                                firstFrameImage: optimizedVideoInput,
                                model: activeProvider.model || 'veo-3.1/text-to-video',
                                aspectRatio,
                                duration: videoDuration,
                                resolution: videoResolution,
                                sound: isKieKling ? klingNativeAudioEnabled : undefined,
                            })
                        }
                    } else {
```

- [ ] **Step 4: Rama KIE en modo AVATAR**

Reemplazar el bloque (líneas 968-983):

```ts
                    } else if (activeProvider?.type === 'KIE') {
                        // KIE aggregator — single reference image as first frame (no native subject_reference)
                        const firstRef =
                            optimizedPayload.faceRef ??
                            optimizedPayload.bodyRef ??
                            optimizedPayload.generalRefs[0] ??
                            null

                        resultUrl = await generateVideoKie({
                            prompt: fullPrompt,
                            firstFrameImage: firstRef,
                            model: activeProvider.model || 'veo-3.1/text-to-video',
                            aspectRatio,
                            duration: videoDuration,
                            resolution: videoResolution,
                        })
                    } else {
```

por:

```ts
                    } else if (activeProvider?.type === 'KIE') {
                        // KIE aggregator — single reference image as first frame (no native subject_reference)
                        const firstRef =
                            optimizedPayload.faceRef ??
                            optimizedPayload.bodyRef ??
                            optimizedPayload.generalRefs[0] ??
                            null
                        const isKieKling = activeProvider.model === 'kling-3.0/video'
                        const hasMotionVideo = !!(klingMotionVideoBase64 || klingMotionVideoUrl)

                        if (isKieKling && klingMotionControlEnabled && hasMotionVideo && firstRef) {
                            // KIE Kling 3.0 motion-control (v2v)
                            resultUrl = await generateMotionControlKie({
                                characterImage: firstRef,
                                motionVideoUrl: klingMotionVideoUrl || undefined,
                                motionVideoBase64: klingMotionVideoBase64 || undefined,
                                prompt: fullPrompt,
                                resolution: videoResolution,
                                characterOrientation: klingMotionOrientation,
                            })
                        } else {
                            resultUrl = await generateVideoKie({
                                prompt: fullPrompt,
                                firstFrameImage: firstRef,
                                model: activeProvider.model || 'veo-3.1/text-to-video',
                                aspectRatio,
                                duration: videoDuration,
                                resolution: videoResolution,
                                sound: isKieKling ? klingNativeAudioEnabled : undefined,
                            })
                        }
                    } else {
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS. (Confirma que `klingNativeAudioEnabled`, `klingMotionOrientation`, `klingMotionVideoBase64/Url`, `klingMotionControlEnabled` ya están destructurados — lo están, líneas 142-148 + Step 2.)

- [ ] **Step 6: Commit**

```bash
git add "src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_components/AvatarStudioMain.tsx"
git commit -m "feat(avatar-studio): route KIE Kling 3.0 video + motion-control"
```

---

### Task 7: `KlingMotionControlEditor` — prop `allowPresets`

**Files:**
- Modify: `.../_components/KlingMotionControlEditor.tsx:13-19`, `:41-45`, `:155-191`, `:194`

- [ ] **Step 1: Prop en la interface + firma**

Reemplazar (líneas 13-19):

```ts
interface KlingMotionControlEditorProps {
    disabled?: boolean
}

type MotionSourceTab = 'preset' | 'upload' | 'url'

const KlingMotionControlEditor = ({ disabled = false }: KlingMotionControlEditorProps) => {
```

por:

```ts
interface KlingMotionControlEditorProps {
    disabled?: boolean
    /** Presets are direct-Kling only; KIE motion-control needs a driving video. */
    allowPresets?: boolean
}

type MotionSourceTab = 'preset' | 'upload' | 'url'

const KlingMotionControlEditor = ({ disabled = false, allowPresets = true }: KlingMotionControlEditorProps) => {
```

- [ ] **Step 2: Tab por defecto cuando no hay presets**

Reemplazar `getActiveTab` (líneas 41-45):

```ts
    const getActiveTab = (): MotionSourceTab => {
        if (klingMotionVideoBase64) return 'upload'
        if (klingMotionVideoUrl) return 'url'
        return 'preset'
    }
```

por:

```ts
    const getActiveTab = (): MotionSourceTab => {
        if (klingMotionVideoBase64) return 'upload'
        if (klingMotionVideoUrl) return 'url'
        return allowPresets ? 'preset' : 'upload'
    }
```

- [ ] **Step 3: Ocultar el botón de tab "Presets"**

Reemplazar el botón de Presets (líneas 156-166):

```tsx
                            <button
                                onClick={() => handleTabChange('preset')}
                                className={`flex-1 py-2 px-2 rounded text-xs font-medium transition-colors ${
                                    activeTab === 'preset'
                                        ? 'bg-cyan-600 text-white'
                                        : 'text-gray-400 hover:text-white'
                                }`}
                                disabled={disabled}
                            >
                                Presets
                            </button>
```

por:

```tsx
                            {allowPresets && (
                                <button
                                    onClick={() => handleTabChange('preset')}
                                    className={`flex-1 py-2 px-2 rounded text-xs font-medium transition-colors ${
                                        activeTab === 'preset'
                                            ? 'bg-cyan-600 text-white'
                                            : 'text-gray-400 hover:text-white'
                                    }`}
                                    disabled={disabled}
                                >
                                    Presets
                                </button>
                            )}
```

- [ ] **Step 4: Guardar el grid de presets**

Reemplazar el inicio del bloque del grid (línea 194):

```tsx
                        {activeTab === 'preset' && (
```

por:

```tsx
                        {allowPresets && activeTab === 'preset' && (
```

- [ ] **Step 5: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_components/KlingMotionControlEditor.tsx"
git commit -m "feat(avatar-studio): allowPresets prop on KlingMotionControlEditor"
```

---

### Task 8: Crear `KlingNativeAudioToggle`

**Files:**
- Create: `.../_components/KlingNativeAudioToggle.tsx`

- [ ] **Step 1: Crear el componente**

Crear `src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_components/KlingNativeAudioToggle.tsx` con:

```tsx
'use client'

import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import Checkbox from '@/components/ui/Checkbox'
import { HiOutlineVolumeUp } from 'react-icons/hi'

interface KlingNativeAudioToggleProps {
    disabled?: boolean
}

/**
 * Native-audio (`sound`) toggle for Kling 3.0 via KIE. OFF by default — the
 * silent tier is ~19.6% cheaper. Render it gated to the `kling-3.0/video`
 * provider.
 */
const KlingNativeAudioToggle = ({ disabled = false }: KlingNativeAudioToggleProps) => {
    const { klingNativeAudioEnabled, setKlingNativeAudioEnabled } = useAvatarStudioStore()

    return (
        <div className="flex items-center gap-2">
            <HiOutlineVolumeUp className="w-4 h-4 text-cyan-400" />
            <Checkbox
                checked={klingNativeAudioEnabled}
                onChange={(checked) => setKlingNativeAudioEnabled(checked)}
                disabled={disabled}
            >
                <span className="text-sm text-gray-300">Audio nativo (sound)</span>
            </Checkbox>
        </div>
    )
}

export default KlingNativeAudioToggle
```

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_components/KlingNativeAudioToggle.tsx"
git commit -m "feat(avatar-studio): KlingNativeAudioToggle component"
```

---

### Task 9: Exponer controles KIE Kling en `GenerationControls`

**Files:**
- Modify: `.../_components/GenerationControls.tsx:37` (import), `:150` (flag), `:884-905` (panel)

- [ ] **Step 1: Import del toggle de audio**

Después de la línea 37 (`import KlingMotionControlEditor from './KlingMotionControlEditor'`), agregar:

```ts
import KlingNativeAudioToggle from './KlingNativeAudioToggle'
```

- [ ] **Step 2: Flag `isKieKling`**

Después de la línea 150 (`const isKlingProvider = activeProvider?.type === 'KLING'`), agregar:

```ts
    const isKieKling = activeProvider?.model === 'kling-3.0/video'
```

- [ ] **Step 3: Reescribir el panel de controles Kling**

Reemplazar el bloque completo (líneas 884-905):

```tsx
            {/* Kling AI Controls - Show only when Kling provider is selected in VIDEO mode */}
            {generationMode === 'VIDEO' && isKlingProvider && (
                <div className="space-y-3 pt-4 border-t border-orange-700/50">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-5 h-5 rounded-full bg-linear-to-br from-orange-500 to-red-500 flex items-center justify-center text-white font-bold text-[10px]">
                            K
                        </div>
                        <span className="text-sm font-medium text-orange-300">Kling Features</span>
                        <span className="text-xs text-gray-500">({activeProvider?.model})</span>
                    </div>
                    {/* Voice and Motion Control only for v2.6+ */}
                    {activeProvider?.model === 'kling-v2-6' && (
                        <>
                            <KlingVoiceControls disabled={isGenerating} />
                            <KlingMotionControlEditor disabled={isGenerating} />
                        </>
                    )}
                    {/* Camera and Motion Brush for all Kling models */}
                    <KlingCameraControls disabled={isGenerating} />
                    <KlingMotionBrushEditor disabled={isGenerating} />
                </div>
            )}
```

por:

```tsx
            {/* Kling AI Controls - Kling provider (direct) OR Kling 3.0 via KIE, in VIDEO mode */}
            {generationMode === 'VIDEO' && (isKlingProvider || isKieKling) && (
                <div className="space-y-3 pt-4 border-t border-orange-700/50">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-5 h-5 rounded-full bg-linear-to-br from-orange-500 to-red-500 flex items-center justify-center text-white font-bold text-[10px]">
                            K
                        </div>
                        <span className="text-sm font-medium text-orange-300">Kling Features</span>
                        <span className="text-xs text-gray-500">({activeProvider?.model})</span>
                    </div>
                    {/* Voice — direct Kling v2.6 only (KIE plain video has no voice synthesis) */}
                    {activeProvider?.model === 'kling-v2-6' && (
                        <KlingVoiceControls disabled={isGenerating} />
                    )}
                    {/* Motion Control — direct Kling v2.6+ or Kling 3.0 via KIE */}
                    {(activeProvider?.model === 'kling-v2-6' || isKieKling) && (
                        <KlingMotionControlEditor disabled={isGenerating} allowPresets={!isKieKling} />
                    )}
                    {/* Native audio — KIE Kling 3.0 only */}
                    {isKieKling && <KlingNativeAudioToggle disabled={isGenerating} />}
                    {/* Camera + Motion Brush — direct Kling only (not exposed by KIE Kling API) */}
                    {isKlingProvider && (
                        <>
                            <KlingCameraControls disabled={isGenerating} />
                            <KlingMotionBrushEditor disabled={isGenerating} />
                        </>
                    )}
                </div>
            )}
```

- [ ] **Step 4: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_components/GenerationControls.tsx"
git commit -m "feat(avatar-studio): expose Kling 3.0 KIE controls in GenerationControls"
```

---

### Task 10: Exponer controles KIE Kling en `BottomControlBar`

**Files:**
- Modify: `.../_components/BottomControlBar.tsx:48` (import), `:261` (flag), `:1339` y `:1354-1358` (gates)

- [ ] **Step 1: Import del toggle de audio**

Después de la línea 48 (`import KlingMotionControlEditor from './KlingMotionControlEditor'`), agregar:

```ts
import KlingNativeAudioToggle from './KlingNativeAudioToggle'
```

- [ ] **Step 2: Flag `isKieKling`**

Después de la línea 261 (`const isKlingV26 = isKlingProvider && activeProvider?.model === 'kling-v2-6'`), agregar:

```ts
    const isKieKling = activeProvider?.model === 'kling-3.0/video'
```

- [ ] **Step 3: Mostrar el trigger del popover para KIE Kling**

En la línea 1339, reemplazar:

```tsx
                                        {isKlingV26 && (
```

por:

```tsx
                                        {(isKlingV26 || isKieKling) && (
```

> Nota: si el `<span>v2.6</span>` dentro de ese trigger queda visible para KIE
> Kling, es cosmético; opcionalmente cambiarlo por `{isKlingV26 ? 'v2.6' : 'v3'}`.
> No es bloqueante.

- [ ] **Step 4: Mostrar Motion Control + audio para KIE Kling**

Reemplazar el bloque de Motion Control (líneas 1353-1358):

```tsx
                                    {/* Motion Control - Only for v2.6+ */}
                                    {isKlingV26 && (
                                        <div className="mb-3">
                                            <KlingMotionControlEditor disabled={isGenerating} />
                                        </div>
                                    )}
```

por:

```tsx
                                    {/* Motion Control - direct v2.6+ or Kling 3.0 via KIE */}
                                    {(isKlingV26 || isKieKling) && (
                                        <div className="mb-3">
                                            <KlingMotionControlEditor disabled={isGenerating} allowPresets={!isKieKling} />
                                        </div>
                                    )}
                                    {/* Native audio - KIE Kling 3.0 only */}
                                    {isKieKling && (
                                        <div className="mb-3">
                                            <KlingNativeAudioToggle disabled={isGenerating} />
                                        </div>
                                    )}
```

> Nota: el bloque de Voice (línea 1347, `{isKlingV26 && …KlingVoiceControls}`) y el de
> Camera (línea 1366) NO se tocan — siguen siendo solo del Kling directo.

- [ ] **Step 5: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_components/BottomControlBar.tsx"
git commit -m "feat(avatar-studio): expose Kling 3.0 KIE controls in BottomControlBar"
```

---

### Task 11: Build completo + verificación funcional (A/B)

**Files:** ninguno (verificación)

- [ ] **Step 1: Build + lint + prettier**

Run: `npx tsc --noEmit && npm run lint && npm run prettier`
Expected: PASS (sin errores nuevos introducidos por este trabajo).

- [ ] **Step 2: Prerequisito de entorno**

Confirmar que `KIE_API_KEY` está disponible en el entorno donde se va a probar. Hoy está en Production + Preview; para local agregarla a `.env.local` o probar en un deploy Preview de Vercel. (Sin la key, `generateVideoKling3`/`generateMotionControlKie` lanzan `KIE_API_KEY is not defined`.)

- [ ] **Step 3: Verificación funcional — video plano**

En Avatar Studio, modo VIDEO/ANIMATE: seleccionar provider **"Kling 3.0 · KIE"**, subir una imagen, generar con:
- (a) audio OFF, 9:16, 720p → debe completar y mostrar el video persistido en Supabase.
- (b) audio ON, 1080p → debe completar; verificar que el video trae audio.
- (c) sin imagen (t2v) si la UI lo permite → debe completar.

Confirmar en logs del servidor las líneas `[KIE/Kling3] Submitting…` y `[KIE/Kling3] Generation complete`.

- [ ] **Step 4: Verificación funcional — motion-control**

Con el provider **"Kling 3.0 · KIE"**, activar el toggle Motion Control, subir un video driver (tab Upload o URL — confirmar que NO aparece el tab Presets), generar. Debe rutear a `generateMotionControlKie` (log `[KIE/Kling3-MC] Submitting…`) y completar. Probar el caso de error: motion-control ON sin video → debe mostrar el mensaje "requires a driving video".

- [ ] **Step 5: Verificación A/B**

Misma imagen + prompt por **"Kling 3.0 · KIE"** vs **"Kling v3 (Latest)"** (directo). Confirmar que ambos generan y comparar identidad/calidad/costo. Confirmar que el Kling directo NO cambió su comportamiento (regresión cero).

- [ ] **Step 6: Commit final (si hubo ajustes de prettier)**

```bash
git add -A && git commit -m "chore(avatar-studio): format + verify Kling 3.0 KIE wiring"
```

---

## Self-Review (completado al escribir el plan)

- **Cobertura del spec:** ✅ video plano (Task 1), motion-control (Task 2), audio toggle (Task 3, 8, 9, 10), provider entry (Task 5), capabilities (Task 4), router (Task 6), UI motion-control reuse + presets ocultos en KIE (Task 7, 9, 10), aspect clamp server-side (Task 1), errores como throw con failMsg (heredado de pollTask), testing/KIE-key prereq (Task 11). Fuera de scope (4K, presets KIE, auto-routing) respetado.
- **Placeholders:** ninguno — todo el código está completo e inline.
- **Consistencia de tipos:** `generateMotionControlKie`/`GenerateMotionControlKieParams` (Task 2) usados igual en el router (Task 6); `sound?` agregado en Task 1 y consumido en Task 6; `klingNativeAudioEnabled` definido en Task 3, importado en router (Task 6) y en los toggles (Task 8-10); `allowPresets` definido en Task 7 y pasado en Task 9-10; `isKieKling` = `activeProvider?.model === 'kling-3.0/video'` idéntico en los 4 sitios.
