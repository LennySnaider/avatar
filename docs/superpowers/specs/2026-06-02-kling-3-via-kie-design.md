# Diseño: Kling 3.0 (video + motion-control) vía KIE

> Fecha: 2026-06-02 · Estado: aprobado para plan de implementación
> Contexto de costo: ver [docs/cost-routing.md](../../cost-routing.md) — KIE cobra Kling
> 3.0 video −16% a −21% bajo el oficial, apples-to-apples. El ruteo se decide por
> features (voz/lip-sync/Omni se quedan directo); el video plano y el motion-control
> v2v son migrables a KIE.

## Objetivo

Permitir generar **Kling 3.0 video plano (i2v/t2v)** y **Kling 3.0 motion-control (v2v)**
a través del proveedor KIE, como un **provider seleccionable que CONVIVE** con el Kling
v3 directo (para A/B y para mantener el directo intacto en voz/Omni). Sin tocar
`KlingService` (el path directo no cambia).

## Hechos verificados (docs KIE, jun-2026) — no asumidos

- **Server-side:** `KieService.ts` es `'use server'`; `KIE_API_KEY` vive solo en el
  servidor (`process.env.KIE_API_KEY`). Nunca toca el browser.
- **Modelo video plano:** `kling-3.0/video` vía `POST /jobs/createTask`. Input:
  `prompt`, `image_urls[]` (opcional → con imagen = i2v, sin imagen = t2v),
  `sound` (boolean, audio nativo), `duration` (entero, 3–15), `aspect_ratio`
  (`16:9` / `9:16` / `1:1`), `mode` (`std`=720p / `pro`=1080p).
- **Modelo motion-control:** `kling-3.0/motion-control` vía `POST /jobs/createTask`.
  Input: `input_urls[]` (1 imagen del personaje, **requerido**), `video_urls[]`
  (1 video que maneja el movimiento, **requerido**), `prompt` (opcional, 0–2500),
  `mode` (`std`/`pro`), `character_orientation` (`video`|`image`),
  `background_source` (`input_video`|`input_image`). **No soporta preset motions**
  (a diferencia del directo) — requiere un video driver.
- **Poll/persist:** mismo patrón que Seedance/Wan — `submitTask` → `pollTask(600s)`
  → `persistToSupabase(url, 'mp4', 'kie-videos')`. Imágenes/videos van como URLs
  HTTP (subidos a Supabase con `uploadReferenceToSupabase`), no base64.

## Alcance

**Incluido:**
- Provider único `Kling 3.0 · KIE` (modelo base `kling-3.0/video`), seleccionable.
- Motion-control v2v reutilizando el **toggle existente** (`KlingMotionControlEditor`),
  no un segundo provider.
- Toggle de **audio nativo** (`sound`) nuevo, default OFF.
- Resoluciones 720p (`std`) / 1080p (`pro`); aspect ratios 16:9 / 9:16 / 1:1.

**Fuera de alcance (explícito):**
- **4K** — KIE lo tiene, pero `mode` solo expone std/pro. Diferido.
- **Preset motions en KIE** — KIE motion-control es solo video-driven. Los presets
  siguen siendo exclusivos del directo; se ocultan cuando el provider activo es KIE.
- **Auto-ruteo por features** — el usuario eligió selección explícita (A/B), no
  ruteo automático. El directo NO se elimina.
- Cambios en `KlingService` (path directo intacto).

## Arquitectura — archivos y cambios

| # | Archivo | Cambio |
|---|---|---|
| 1 | `src/@types/kie.ts` | Agregar `'kling-3.0/video'` y `'kling-3.0/motion-control'` a `KieVideoModel`. Definir `GenerateMotionControlKieParams`. |
| 2 | `src/services/KieService.ts` | `generateVideoKling3()` (privada, ruteada desde `generateVideoKie`) + `generateMotionControlKie()` (exportada). |
| 3 | `_store/avatarStudioStore.ts` | Campo `klingNativeAudioEnabled: boolean` (default `false`) + setter `setKlingNativeAudioEnabled`, y reset en el reset de estado. |
| 4 | `_components/ProviderManagerDrawer.tsx` | 1 entrada en `DEFAULT_PROVIDERS`: `kie-kling-3-0` (ver shape abajo). |
| 5 | `_components/KlingMotionControlEditor.tsx` (+ sus 2 render sites: `BottomControlBar.tsx:1356`, `GenerationControls.tsx:898`) | Extender el gate en ambos render sites para mostrar el editor cuando el provider activo es `kie-kling-3-0` (hoy se muestra para Kling directo). Dentro del editor, **ocultar la sección de presets** cuando el provider es KIE (KIE requiere video driver). |
| 6 | `_components/AvatarStudioMain.tsx` | En la rama `type === 'KIE'` (×2: ANIMATE y AVATAR): si `model === 'kling-3.0/video'` + motion-control on + video presente → `generateMotionControlKie`; si no → `generateVideoKie` (que rutea `kling-3.0/video` internamente). Pasar `sound: klingNativeAudioEnabled`. |
| 7 | `_components/BottomControlBar.tsx` (+ `GenerationControls.tsx`) | Switch de audio nativo (lee/escribe `klingNativeAudioEnabled`), visible solo para `kie-kling-3-0`, junto a los selectores de resolución/duración (BottomControlBar L266-267 ya consume `providerCapabilities`). Ambas superficies de controles deben tenerlo para consistencia. |
| 8 | `_utils/providerCapabilities.ts` | Para `kie-kling-3-0`: `getDurationOptionsForProvider` → `[5,10]`, `getResolutionOptionsForProvider` → `['720p','1080p']`. **Aspect ratio NO se gestiona aquí** (esta utilidad solo tiene duración+resolución); se hace **clamp server-side** en `generateVideoKling3` (16:9/9:16/1:1; 4:3→16:9, 3:4→9:16, resto→9:16). |

> Nota de codebase: los controles de generación están **duplicados** en
> `BottomControlBar.tsx` y `GenerationControls.tsx` (ambos renderizan
> `KlingMotionControlEditor` y consumen `providerCapabilities`). Los cambios de UI
> (gate del editor + switch de audio) van en **ambos** para no dejar una superficie
> inconsistente. No es refactor del scope: solo replicar el mismo cambio en los dos.

## Entrada de provider (DEFAULT_PROVIDERS)

```ts
{
    id: 'kie-kling-3-0',
    name: 'Kling 3.0 · KIE',
    type: 'KIE',
    model: 'kling-3.0/video',
    endpoint: 'https://api.kie.ai/api/v1',
    supports_image: false,
    supports_video: true,
    // resto de campos según el shape de AIProvider existente
}
```

## Mapeo de request

### `generateVideoKling3(params)` → `kling-3.0/video`
```
upload firstFrameImage → supabaseUrl  (solo si hay imagen)
input = {
  prompt,
  image_urls: firstFrameImage ? [supabaseUrl] : undefined,   // i2v vs t2v
  sound: params.sound ?? false,
  duration: Number(duration),               // entero
  aspect_ratio: aspectRatio,                // 16:9 | 9:16 | 1:1
  mode: resolution === '1080p' ? 'pro' : 'std',
}
submitTask({ model: 'kling-3.0/video', input }) → pollTask(600s) → persistToSupabase('mp4','kie-videos')
```
Nota: NO se envía campo `resolution` (Kling 3.0 video usa `mode`, no `resolution`,
a diferencia de Seedance/Wan).

### `generateMotionControlKie(params)` → `kling-3.0/motion-control`
```
upload characterImage → input_urls:[url]
motionVideoUrl = params.motionVideoUrl ?? (upload motionVideoBase64)
input = {
  input_urls: [characterImageUrl],
  video_urls: [motionVideoUrl],
  prompt,                                   // opcional
  mode: resolution === '1080p' ? 'pro' : 'std',
  character_orientation: klingMotionOrientation,   // 'video' | 'image'
  background_source: 'input_video',
}
submitTask({ model: 'kling-3.0/motion-control', input }) → pollTask(600s) → persist
```
Si no hay `motionVideoUrl` ni `motionVideoBase64` → error claro (KIE motion-control
requiere video driver; no hay presets).

## Router (AvatarStudioMain, rama `type === 'KIE'`)

```ts
} else if (activeProvider?.type === 'KIE') {
    const isKieKling = activeProvider.model === 'kling-3.0/video'
    const hasMotionVideo = !!(klingMotionVideoUrl || klingMotionVideoBase64)
    if (isKieKling && klingMotionControlEnabled && hasMotionVideo) {
        resultUrl = await generateMotionControlKie({ /* characterImage, motionVideo*, prompt, resolution, orientation */ })
    } else {
        resultUrl = await generateVideoKie({
            model: activeProvider.model,   // 'kling-3.0/video' → ruteado internamente
            sound: klingNativeAudioEnabled,
            /* prompt, firstFrameImage, aspectRatio, duration, resolution */
        })
    }
}
```
`generateVideoKie` gana un branch al inicio: `if (model === 'kling-3.0/video') return generateVideoKling3(params)`.
`GenerateVideoKieParams` gana un campo opcional `sound?: boolean`.

## Restricciones / edge cases

- **Aspect ratio:** solo 16:9 / 9:16 / 1:1. **Clamp server-side** en
  `generateVideoKling3` (4:3→16:9, 3:4→9:16, resto→9:16) para que el request
  nunca falle (no hay función de aspect en `providerCapabilities`).
- **Audio default OFF** — tier sin audio es −19.6% vs −10.7% con audio. El toggle
  permite subirlo cuando se quiera.
- **Motion-control = solo video-driven** en KIE. Presets ocultos para el provider KIE.
- **4K diferido.**

## Manejo de errores

Se mantiene el contrato actual de `generateVideoKie` (lanza `Error` con
`failMsg`/`failCode` reales extraídos por `pollTask`). `AvatarStudioMain` ya captura y
muestra el error. Coherente con los commits recientes de "surface the real error".

## Testing / verificación

- **Prerequisito:** `KIE_API_KEY` hoy está solo en Production + Preview. Para probar
  local hay que agregarla a Development o `.env.local`; alternativamente, validar en
  Vercel Preview.
- **Verificación funcional:** generar con `Kling 3.0 · KIE` (a) video plano i2v con
  audio off/on, (b) t2v, (c) motion-control con un video driver; confirmar que el
  resultado se persiste en Supabase y se muestra.
- **A/B:** misma imagen + prompt por `Kling 3.0 · KIE` vs `Kling v3` directo;
  comparar identidad/costo (objetivo del modo selectable).
- **Type-check:** `tsc` limpio tras los cambios de tipos (`KieVideoModel`, params).

## Unidades y límites (claridad)

- `generateVideoKling3` / `generateMotionControlKie`: una responsabilidad cada una
  (un endpoint KIE), entrada tipada, sin estado compartido. Reutilizan
  `uploadReferenceToSupabase`, `submitTask`, `pollTask`, `persistToSupabase`.
- El router solo decide cuál llamar según provider + toggle; no construye bodies.
- El store solo agrega un boolean + setter; sin lógica nueva.
