# Voz clonada ↔ Avatar + Video Lipsync — Design Spec

**Fecha:** 2026-07-07
**Módulos:** Avatar Forge → Voice Studio, Avatar Studio
**Estado:** Aprobado por Lenny (brainstorming 2026-07-07)

## Problema

El Voice Studio genera audio TTS con la voz clonada (MiniMax) pero queda desacoplado del pipeline de video:

1. **El audio TTS no se persiste.** `POST /api/voice/tts` devuelve base64 que vive como data URL en memoria (`AudioPreview.tsx`). Al recargar se pierde y ningún otro módulo puede usarlo.
2. **La relación voz↔avatar existe en el schema pero no se usa.** `cloned_voices.avatar_id` nunca se envía desde `VoiceClonePanel.tsx` — siempre queda `null`.
3. **El "Merge Audio + Video" no es lipsync.** Pide pegar una URL de video a mano y hace mux de pistas con ffmpeg local (`AudioMergeService.ts` vía `execSync`): los labios no se mueven con el audio, y además ffmpeg no existe en el PATH de Vercel Functions, por lo que falla en producción.

## Objetivo

Que la voz clonada quede **mapeada al avatar** y que desde la UI de generación se pueda escribir un texto → generar el audio con esa voz → generar el video sincronizado (lipsync real), sin pegar URLs a mano.

## Decisiones de diseño (validadas)

| Decisión | Elección |
|---|---|
| Entry points | Avatar Studio (barra de generación) + Voice Studio mejorado. Sin botón en el modal de galería. |
| Mapeo voz↔avatar | **Voz principal por avatar**: nueva columna `avatars.default_voice_id → cloned_voices(id)` + wiring del `avatar_id` existente al clonar. |
| Motor talking-head | **InfiniteTalk (Kie.ai)**: imagen ref del avatar + audio → video hablando (~$0.30/clip, soporta clips largos). OmniHuman descartado para MVP (degrada >15s). Kling 3.0 `element_input_audio_urls` descartado (5-30s, no es lipsync documentado). |
| Re-lipsync video existente | Modelo video→video de Kie (Volcengine / Kling LipSync; identificador exacto se confirma en docs.kie.ai al implementar). |
| Merge ffmpeg actual | **Se elimina** (`AudioMergeService.ts` + `/api/audio/merge`), reemplazado por lipsync. |

## Arquitectura

### 1. Datos

- Migración `supabase/migrations/20260707_avatar_default_voice.sql`:
  ```sql
  ALTER TABLE avatars ADD COLUMN default_voice_id UUID REFERENCES cloned_voices(id) ON DELETE SET NULL;
  CREATE INDEX IF NOT EXISTS idx_voices_avatar ON cloned_voices(avatar_id);
  ```
- Actualizar `src/@types/supabase.ts` (Row/Insert/Update de `avatars`).

### 2. Persistencia del audio TTS

- Nuevo `POST /api/voice/tts-file`: reutiliza `textToSpeech` (MiniMaxService) y sube el mp3 al bucket `generations` (`${userId}/audios/…`) con `uploadBufferToGenerations` (`src/lib/mediaPersist.ts`). Devuelve `{ audioUrl }` (URL pública — los modelos Kie requieren URL accesible).
- `AudioPreview.tsx` usa este endpoint; `previewAudioUrl` del store pasa a ser URL real.

### 3. Proveedor Kie (KieService.ts)

Siguiendo el patrón submit/poll existente (`/jobs/createTask`):
- `generateTalkingVideo({ imageUrl, audioUrl, prompt?, resolution })` → InfiniteTalk.
- `lipsyncVideo({ videoUrl, audioUrl })` → lipsync video→video.

### 4. Mapeo de voz (Voice Studio)

- `VoiceClonePanel.tsx`: selector de avatar + checkbox "Usar como voz principal". El route `/api/voice/clone` ya lee `avatarId`; se añade el update de `avatars.default_voice_id` cuando aplica.
- `VoiceLibrary.tsx`: muestra el avatar vinculado + acción "hacer principal" (★ marca la voz principal).
- La voz asignada se muestra en Avatar Studio como badge del modo Speak (no se toca el módulo Mis Avatares).

### 5. Avatar Studio — modo "Speak"

- Nuevo modo junto a Animate/Avatar (solo Video) en `BottomControlBar.tsx`: textarea de diálogo (reusa `videoDialogue`) + badge con la voz default del avatar. Sin voz → CTA a Voice Studio y Generate deshabilitado.
- Dispatch en `AvatarStudioMain.tsx`: TTS (`/api/voice/tts-file`, voz default) → `generateTalkingVideo` (imagen ref del avatar + audioUrl) → poll → guardar en galería (`media_type='VIDEO'`, metadata `{ model: 'infinitalk', voice_id, script }`).
- La voz default se resuelve en la carga inicial (`AvatarStudioProvider.tsx`).

### 6. Voice Studio — panel "Lipsync Video"

- `AudioMergePanel.tsx` se reescribe: selector visual de videos de la galería (query `generations` con `media_type='VIDEO'`) en lugar del input de URL manual. Audio del preview + video seleccionado → `lipsyncVideo` → resultado a galería y preview.
- Se eliminan `AudioMergeService.ts` y `/api/audio/merge`.

### 7. Manejo de errores

- Sin voz default / voz no `ready` → mensaje claro con CTA.
- Guion excede el límite del modelo → validación previa con el estimador de duración existente en `ScriptEditor.tsx`.
- Job Kie failed/timeout → toast + estado visible; si el TTS fue exitoso pero el lipsync falla, se conserva y muestra el audio generado (sin fallbacks silenciosos).

## Fuera de alcance (YAGNI)

- Botón lipsync en el modal de galería de Avatar Studio.
- Múltiples voces "principales" por avatar, OmniHuman, traducción automática de guiones.
- UI de costos por clip.

## Verificación E2E

1. Clonar voz con avatar + "voz principal" → verificar `cloned_voices.avatar_id` y `avatars.default_voice_id` en Supabase.
2. Generate Audio → mp3 en bucket `generations`, player con URL pública.
3. Modo Speak → video InfiniteTalk en galería con labios sincronizados a la voz clonada.
4. Voice Studio Lipsync → video de galería + audio → resultado lipsynced en galería.
5. Avatar sin voz → CTA correcto, Generate deshabilitado.
6. `npx tsc --noEmit` + `npm run lint`.
