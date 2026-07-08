# Avatar Voice Mapping + Lipsync Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mapear la voz clonada (MiniMax) al avatar y generar videos con lipsync real: modo "Speak" en Avatar Studio (texto → TTS → InfiniteTalk) y panel "Lipsync Video" en Voice Studio (video de galería + audio → Volcengine lipsync), eliminando el mux ffmpeg roto.

**Architecture:** La voz vive en `cloned_voices` (ya existe, con `avatar_id` sin cablear); se añade `avatars.default_voice_id`. El audio TTS se persiste en el bucket `generations` (nuevo endpoint `/api/voice/tts-file`) porque los modelos Kie requieren URLs públicas. Dos funciones nuevas en `KieService.ts` siguen el patrón submit/poll existente contra `https://api.kie.ai/api/v1/jobs/createTask`.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Zustand, Supabase (DB + Storage), MiniMax TTS (`speech-2.8-hd`), Kie.ai (`infinitalk/from-audio`, `volcengine/video-to-video-lip-sync`), componentes ECME (`@/components/ui/*`).

**Spec:** `docs/superpowers/specs/2026-07-07-avatar-voice-lipsync-design.md`

## Global Constraints

- **No hay framework de tests** en este repo (sin jest/vitest/playwright en package.json). El ciclo de verificación por task es: `npx tsc --noEmit` sin errores nuevos + verificación manual E2E al final (Task 8). No inventar infra de tests.
- **UI components:** usar exclusivamente ECME (`@/components/ui/Button`, `Card`, `Input`, etc.). NUNCA Shadcn/Radix. Los selects nativos `<select>` ya se usan en voice-studio — seguir ese patrón ahí.
- **Textos UI:** voice-studio y avatar-studio tienen copy hardcodeado en inglés — mantener ese patrón (no introducir i18n aquí).
- **Server actions:** `KieService.ts` y `AvatarForgeService.ts` son `'use server'` — los componentes cliente los importan y llaman directamente. Los errores de server actions se enmascaran en prod: usar wrappers `*Safe` (error-as-data) para llamadas desde el cliente.
- **Commits:** mensajes convencionales (`feat:`, `refactor:`), SIN líneas de Claude/Anthropic co-author.
- **Modelos Kie confirmados en docs.kie.ai:**
  - `infinitalk/from-audio` — input: `image_url` (req, jpeg/png/webp ≤10MB), `audio_url` (req, mp3/wav/aac ≤10MB), `prompt` (req, ≤5000 chars), `resolution` ('480p'|'720p', default 480p), `seed` (opcional).
  - `volcengine/video-to-video-lip-sync` — input: `mode` ('lite'|'basic', req), `video_url` (req, 360p-1080p, ≤500MB), `audio_url` (req, ≤10MB), `align_audio` (opcional, default true).
- Dev server: `npm run dev` corre en puerto **3030** (package.json), no 3001.

---

### Task 1: Migración SQL + tipos Supabase (`default_voice_id`)

**Files:**
- Create: `supabase/migrations/20260707120000_avatar_default_voice.sql`
- Modify: `src/@types/supabase.ts:12-44` (tabla `avatars`)

**Interfaces:**
- Produces: columna `avatars.default_voice_id: string | null` en los tipos `Avatar`/`AvatarInsert`/`AvatarUpdate` (usada por Tasks 4, 5).

- [ ] **Step 1: Crear la migración**

```sql
-- supabase/migrations/20260707120000_avatar_default_voice.sql
-- Voz principal del avatar: referencia opcional a una voz clonada.
ALTER TABLE avatars
    ADD COLUMN IF NOT EXISTS default_voice_id UUID REFERENCES cloned_voices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_voices_avatar ON cloned_voices(avatar_id);
```

- [ ] **Step 2: Aplicar la migración en Supabase**

Intentar con el MCP de Supabase (`mcp__supabase` — puede requerir autorización del usuario). Si el MCP no está autorizado, **PAUSAR y pedir al usuario** que ejecute el SQL de arriba en el SQL Editor de Supabase, y esperar su confirmación. No continuar sin la columna creada (los Tasks 4-5 escriben en ella).

- [ ] **Step 3: Actualizar tipos en `src/@types/supabase.ts`**

En la tabla `avatars`, añadir el campo a los tres bloques:

```ts
// En Row (después de `measurements: PhysicalMeasurements | null`):
                    default_voice_id: string | null
// En Insert (después de `measurements?: PhysicalMeasurements | null`):
                    default_voice_id?: string | null
// En Update (después de `measurements?: PhysicalMeasurements | null`):
                    default_voice_id?: string | null
```

- [ ] **Step 4: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: mismos errores preexistentes que antes del cambio (si los hay), ninguno nuevo relacionado con `avatars`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260707120000_avatar_default_voice.sql src/@types/supabase.ts
git commit -m "feat(avatar-forge): add avatars.default_voice_id migration and types"
```

---

### Task 2: Endpoint `/api/voice/tts-file` + AudioPreview con URL persistida

**Files:**
- Create: `src/app/api/voice/tts-file/route.ts`
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/voice-studio/_components/AudioPreview.tsx:19-44`

**Interfaces:**
- Consumes: `textToSpeech` de `src/services/MiniMaxService.ts` (misma firma que usa `/api/voice/tts`), `uploadBufferToGenerations(buffer, fileName, contentType)` de `src/lib/mediaPersist.ts`.
- Produces: `POST /api/voice/tts-file` con body `{ text: string, voiceId: string, language?: string }` → `{ success: true, audioUrl: string, durationMs: number, characters: number }`. `audioUrl` es URL pública del bucket `generations` (usada por Tasks 6 y 7 como `previewAudioUrl`).

- [ ] **Step 1: Crear el route handler**

```ts
// src/app/api/voice/tts-file/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { textToSpeech } from '@/services/MiniMaxService'
import { uploadBufferToGenerations } from '@/lib/mediaPersist'

/**
 * TTS que PERSISTE el mp3 en el bucket `generations` y devuelve una URL
 * pública. Los modelos de lipsync de KIE (InfiniteTalk / Volcengine) solo
 * aceptan audio por URL HTTP, no base64 — este endpoint es el habilitador
 * de todo el pipeline audio → video.
 */
export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { text, voiceId, speed, pitch, emotion, language } = body

    if (!text || !voiceId) {
        return NextResponse.json({ error: 'text and voiceId are required' }, { status: 400 })
    }
    if (text.length > 10000) {
        return NextResponse.json({ error: 'Text exceeds 10,000 character limit' }, { status: 400 })
    }

    try {
        const { audioBuffer, durationMs, characters } = await textToSpeech({
            text,
            voiceId,
            speed,
            pitch,
            emotion,
            language,
        })

        const fileName = `${session.user.id}/audios/${Date.now()}.mp3`
        const audioUrl = await uploadBufferToGenerations(audioBuffer, fileName, 'audio/mpeg')

        return NextResponse.json({ success: true, audioUrl, durationMs, characters })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'TTS generation failed'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
```

- [ ] **Step 2: Actualizar `AudioPreview.tsx` para usar el nuevo endpoint**

Reemplazar el cuerpo de `handleGenerateAudio` (líneas 19-44). El `<audio>` ya reproduce cualquier URL, así que solo cambia la llamada:

```ts
    const handleGenerateAudio = async () => {
        if (!currentScript || !selectedVoice) return

        setIsGeneratingAudio(true)
        try {
            const res = await fetch('/api/voice/tts-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: currentScript,
                    voiceId: selectedVoice.provider_voice_id,
                    language: scriptLanguage === 'es' ? 'Spanish' : scriptLanguage === 'en' ? 'English' : scriptLanguage,
                }),
            })

            if (!res.ok) {
                const { error } = await res.json()
                throw new Error(error || 'TTS failed')
            }
            const { audioUrl } = await res.json()
            setPreviewAudioUrl(audioUrl)
        } catch (err) {
            console.error('TTS generation failed:', err)
        } finally {
            setIsGeneratingAudio(false)
        }
    }
```

- [ ] **Step 3: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/voice/tts-file/route.ts "src/app/(protected-pages)/concepts/avatar-forge/voice-studio/_components/AudioPreview.tsx"
git commit -m "feat(voice-studio): persist TTS audio to storage via /api/voice/tts-file"
```

---

### Task 3: KieService — `generateTalkingVideoKie` + `lipsyncVideoKie`

**Files:**
- Modify: `src/services/KieService.ts` (añadir al final del archivo)

**Interfaces:**
- Consumes: helpers privados ya existentes en el mismo archivo: `submitTask(body)` (línea ~59), `pollTask(taskId, opts)` (~76), `withTimeout(p, ms, label)` (~29), `uploadReferenceToSupabase(base64, mimeType)` (~178), `persistToSupabase(sourceUrl, ext, subfolder)` (~208), y el tipo exportado `KieVideoSafeResult` (~950).
- Produces (usadas por Tasks 6 y 7):
  - `generateTalkingVideoKieSafe(params: GenerateTalkingVideoKieParams): Promise<KieVideoSafeResult>` con `GenerateTalkingVideoKieParams = { image: { base64: string; mimeType: string }; audioUrl: string; prompt?: string; resolution?: '480p' | '720p' }`
  - `lipsyncVideoKieSafe(params: LipsyncVideoKieParams): Promise<KieVideoSafeResult>` con `LipsyncVideoKieParams = { videoUrl: string; audioUrl: string; mode?: 'lite' | 'basic' }`

- [ ] **Step 1: Añadir las funciones al final de `KieService.ts`**

```ts
// =============================================
// TALKING HEAD (InfiniteTalk) & LIPSYNC (Volcengine)
// =============================================

export interface GenerateTalkingVideoKieParams {
    /** Imagen de retrato del avatar (face ref o primera general ref). */
    image: { base64: string; mimeType: string }
    /** URL pública del audio TTS (bucket generations). Máx 10MB. */
    audioUrl: string
    /** Guía visual opcional (máx 5000 chars). */
    prompt?: string
    resolution?: '480p' | '720p'
}

const DEFAULT_TALKING_PROMPT =
    'A person speaking naturally to the camera, natural facial expressions and head movement, lips moving in perfect sync with the audio'

/**
 * InfiniteTalk (infinitalk/from-audio): imagen de retrato + audio → video
 * talking-head con lipsync real. La imagen se sube a Supabase primero porque
 * KIE solo acepta URLs HTTP.
 */
export async function generateTalkingVideoKie(
    params: GenerateTalkingVideoKieParams,
): Promise<string> {
    const imageUrl = await uploadReferenceToSupabase(params.image.base64, params.image.mimeType)

    const input: Record<string, unknown> = {
        image_url: imageUrl,
        audio_url: params.audioUrl,
        prompt: (params.prompt || DEFAULT_TALKING_PROMPT).slice(0, 5000),
        resolution: params.resolution ?? '720p',
    }

    console.log('[KIE] Submitting infinitalk task')
    const taskId = await withTimeout(
        submitTask({ model: 'infinitalk/from-audio', input }),
        30_000,
        'KIE infinitalk submit',
    )
    console.log(`[KIE] Infinitalk task submitted: ${taskId}`)

    const urls = await pollTask(taskId, { budgetMs: 600_000, intervalMs: 5000 })
    console.log(`[KIE] Infinitalk task complete: ${urls[0]}`)

    return persistToSupabase(urls[0], 'mp4', 'kie-videos')
}

export interface LipsyncVideoKieParams {
    /** URL pública del video existente (galería / bucket generations). */
    videoUrl: string
    /** URL pública del audio TTS. Máx 10MB. */
    audioUrl: string
    /** 'lite' re-sincroniza labios rápido; 'basic' soporta escenas múltiples. */
    mode?: 'lite' | 'basic'
}

/**
 * Volcengine video-to-video lipsync: re-anima la boca de un video existente
 * para seguir el audio dado. Sustituye al viejo mux ffmpeg (que no movía
 * los labios y no funcionaba en Vercel).
 */
export async function lipsyncVideoKie(params: LipsyncVideoKieParams): Promise<string> {
    const input: Record<string, unknown> = {
        mode: params.mode ?? 'lite',
        video_url: params.videoUrl,
        audio_url: params.audioUrl,
        align_audio: true,
    }

    console.log('[KIE] Submitting volcengine lipsync task')
    const taskId = await withTimeout(
        submitTask({ model: 'volcengine/video-to-video-lip-sync', input }),
        30_000,
        'KIE lipsync submit',
    )
    console.log(`[KIE] Lipsync task submitted: ${taskId}`)

    const urls = await pollTask(taskId, { budgetMs: 600_000, intervalMs: 5000 })
    console.log(`[KIE] Lipsync task complete: ${urls[0]}`)

    return persistToSupabase(urls[0], 'mp4', 'kie-videos')
}

// Error-as-data wrappers (mismo patrón que generateVideoKieSafe): los errores
// de 'use server' se enmascaran como 500 genérico en prod.
export async function generateTalkingVideoKieSafe(
    params: GenerateTalkingVideoKieParams,
): Promise<KieVideoSafeResult> {
    try {
        const url = await generateTalkingVideoKie(params)
        return { success: true, url }
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
}

export async function lipsyncVideoKieSafe(
    params: LipsyncVideoKieParams,
): Promise<KieVideoSafeResult> {
    try {
        const url = await lipsyncVideoKie(params)
        return { success: true, url }
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
}
```

- [ ] **Step 2: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos. Si `submitTask` tipa `input` estrictamente vía `KieCreateTaskRequest` (ver `src/@types/kie.ts`), ajustar el cast igual que hacen las funciones vecinas (p.ej. `input` como `Record<string, unknown>` ya es el patrón de `generateVideoKie`).

- [ ] **Step 3: Commit**

```bash
git add src/services/KieService.ts
git commit -m "feat(kie): add InfiniteTalk talking-head and Volcengine lipsync generators"
```

---

### Task 4: Mapeo voz↔avatar en Voice Studio (selector + voz principal)

**Files:**
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/voice-studio/page.tsx`
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/voice-studio/_components/VoiceStudioMain.tsx`
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/voice-studio/_components/VoiceClonePanel.tsx`
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/voice-studio/_components/VoiceLibrary.tsx`
- Modify: `src/app/api/voice/clone/route.ts:49-67`
- Create: `src/app/api/voice/set-default/route.ts`

**Interfaces:**
- Consumes: `apiGetAvatars(userId)` de `src/services/AvatarForgeService.ts:27` (server action, devuelve `Avatar[]`), tipo `Avatar` de `@/@types/supabase` (ya con `default_voice_id` del Task 1).
- Produces:
  - `VoiceStudioMain` acepta props `{ userId: string; avatars: Avatar[] }` (Task 7 reutiliza `userId`).
  - `POST /api/voice/set-default` body `{ voiceId: string }` → `{ success: true }`.
  - El clone route acepta `setAsDefault` en el FormData y devuelve `{ success, voice, defaultVoiceSet: boolean }`.

- [ ] **Step 1: Pasar avatares y userId desde el server component**

```tsx
// src/app/(protected-pages)/concepts/avatar-forge/voice-studio/page.tsx
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import VoiceStudioMain from './_components/VoiceStudioMain'
import { apiGetAvatars } from '@/services/AvatarForgeService'

export default async function VoiceStudioPage() {
    const session = await auth()
    if (!session?.user?.id) redirect('/sign-in')

    const avatars = await apiGetAvatars(session.user.id)

    return <VoiceStudioMain userId={session.user.id} avatars={avatars} />
}
```

- [ ] **Step 2: Propagar props en `VoiceStudioMain.tsx`**

```tsx
// Cambios en VoiceStudioMain.tsx: firma + pasar props a los paneles.
import type { Avatar } from '@/@types/supabase'

interface VoiceStudioMainProps {
    userId: string
    avatars: Avatar[]
}

export default function VoiceStudioMain({ userId, avatars }: VoiceStudioMainProps) {
    // ... useEffect de loadVoices igual ...
    // En el JSX:
    //   <VoiceClonePanel avatars={avatars} />
    //   <VoiceLibrary avatars={avatars} />
    // (AudioMergePanel se toca en Task 7; dejarlo como está aquí.)
```

- [ ] **Step 3: Selector de avatar + checkbox en `VoiceClonePanel.tsx`**

Añadir props, estado y campos al form (entre el select de idioma y el input de archivo):

```tsx
import type { Avatar } from '@/@types/supabase'

interface VoiceClonePanelProps {
    avatars: Avatar[]
}

export default function VoiceClonePanel({ avatars }: VoiceClonePanelProps) {
    // ... estado existente ...
    const [avatarId, setAvatarId] = useState('')
    const [setAsDefault, setSetAsDefault] = useState(true)
```

En `handleClone`, añadir al FormData antes del fetch:

```ts
            if (avatarId) {
                formData.append('avatarId', avatarId)
                formData.append('setAsDefault', String(setAsDefault))
            }
```

Y en el JSX (después del `<select>` de idioma):

```tsx
                <select
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    value={avatarId}
                    onChange={(e) => setAvatarId(e.target.value)}
                >
                    <option value="">No avatar (voice only)</option>
                    {avatars.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                </select>

                {avatarId && (
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={setAsDefault}
                            onChange={(e) => setSetAsDefault(e.target.checked)}
                        />
                        Use as the avatar&apos;s main voice
                    </label>
                )}
```

- [ ] **Step 4: Actualizar el clone route para fijar la voz principal**

En `src/app/api/voice/clone/route.ts`, después de leer `avatarId` (línea 16) añadir:

```ts
    const setAsDefault = formData.get('setAsDefault') === 'true'
```

Y después del insert exitoso (tras `if (dbError) throw new Error(dbError.message)`):

```ts
        // 5. Optionally set as the avatar's main voice
        let defaultVoiceSet = false
        if (avatarId && setAsDefault && voice) {
            const { error: avatarError } = await supabase
                .from('avatars')
                .update({ default_voice_id: voice.id })
                .eq('id', avatarId)
                .eq('user_id', userId)
            if (avatarError) {
                console.error('[voice/clone] Failed to set default voice:', avatarError.message)
            } else {
                defaultVoiceSet = true
            }
        }

        return NextResponse.json({ success: true, voice, defaultVoiceSet })
```

(reemplaza el `return NextResponse.json({ success: true, voice })` existente).

- [ ] **Step 5: Crear `POST /api/voice/set-default`**

```ts
// src/app/api/voice/set-default/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { createServerSupabaseClient } from '@/lib/supabase'

/** Marca una voz clonada como voz principal de su avatar vinculado. */
export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { voiceId } = await req.json()
    if (!voiceId) {
        return NextResponse.json({ error: 'voiceId is required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()
    const { data: voice, error: voiceError } = await supabase
        .from('cloned_voices')
        .select('id, avatar_id')
        .eq('id', voiceId)
        .eq('user_id', session.user.id)
        .single()

    if (voiceError || !voice) {
        return NextResponse.json({ error: 'Voice not found' }, { status: 404 })
    }
    if (!voice.avatar_id) {
        return NextResponse.json({ error: 'Voice is not linked to an avatar' }, { status: 400 })
    }

    const { error: updateError } = await supabase
        .from('avatars')
        .update({ default_voice_id: voice.id })
        .eq('id', voice.avatar_id)
        .eq('user_id', session.user.id)

    if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
}
```

- [ ] **Step 6: Mostrar avatar vinculado + acción "Main voice" en `VoiceLibrary.tsx`**

Reemplazar el componente para aceptar `avatars` y renderizar el vínculo:

```tsx
'use client'

import { useState } from 'react'
import { useVoiceStudioStore } from '../_store/voiceStudioStore'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import type { Avatar } from '@/@types/supabase'

interface VoiceLibraryProps {
    avatars: Avatar[]
}

export default function VoiceLibrary({ avatars }: VoiceLibraryProps) {
    const { voices, selectedVoiceId, setSelectedVoiceId, setVoices } = useVoiceStudioStore()
    // Overrides locales tras pulsar "Make main" (los props del server no se refrescan solos).
    const [defaultOverrides, setDefaultOverrides] = useState<Record<string, string>>({})

    const handleDelete = async (id: string) => {
        const res = await fetch('/api/voice/delete', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
        })
        if (res.ok) {
            setVoices(voices.filter((v) => v.id !== id))
            if (selectedVoiceId === id) setSelectedVoiceId(null)
        }
    }

    const handleSetDefault = async (voiceId: string, avatarId: string) => {
        const res = await fetch('/api/voice/set-default', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ voiceId }),
        })
        if (res.ok) {
            setDefaultOverrides((prev) => ({ ...prev, [avatarId]: voiceId }))
        }
    }

    const isMainVoice = (voice: { id: string; avatar_id: string | null }) => {
        if (!voice.avatar_id) return false
        const overridden = defaultOverrides[voice.avatar_id]
        if (overridden) return overridden === voice.id
        return avatars.find((a) => a.id === voice.avatar_id)?.default_voice_id === voice.id
    }

    if (voices.length === 0) {
        return (
            <Card>
                <div className="p-4 text-center text-sm text-gray-500">
                    No voices cloned yet. Upload an audio sample to get started.
                </div>
            </Card>
        )
    }

    return (
        <Card>
            <div className="p-4 flex flex-col gap-2">
                <h3 className="font-semibold text-lg">Your Voices</h3>
                {voices.map((voice) => {
                    const linkedAvatar = avatars.find((a) => a.id === voice.avatar_id)
                    const isMain = isMainVoice(voice)
                    return (
                        <div
                            key={voice.id}
                            className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                                selectedVoiceId === voice.id
                                    ? 'bg-primary/10 border border-primary'
                                    : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                            onClick={() => setSelectedVoiceId(voice.id)}
                        >
                            <div className="flex flex-col">
                                <span className="font-medium text-sm">
                                    {voice.name}
                                    {isMain && <span className="ml-1 text-primary" title="Main voice">★</span>}
                                </span>
                                <span className="text-xs text-gray-500">
                                    {voice.language.toUpperCase()}
                                    {linkedAvatar && ` · ${linkedAvatar.name}`}
                                    {' · '}{new Date(voice.created_at).toLocaleDateString()}
                                </span>
                            </div>
                            <div className="flex items-center gap-1">
                                {voice.avatar_id && !isMain && (
                                    <Button
                                        size="xs"
                                        variant="plain"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleSetDefault(voice.id, voice.avatar_id!)
                                        }}
                                    >
                                        Make main
                                    </Button>
                                )}
                                <Button
                                    size="xs"
                                    variant="plain"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        handleDelete(voice.id)
                                    }}
                                >
                                    Delete
                                </Button>
                            </div>
                        </div>
                    )
                })}
            </div>
        </Card>
    )
}
```

- [ ] **Step 7: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(protected-pages)/concepts/avatar-forge/voice-studio/" src/app/api/voice/clone/route.ts src/app/api/voice/set-default/route.ts
git commit -m "feat(voice-studio): link cloned voices to avatars with default voice mapping"
```

---

### Task 5: Cargar la voz default en Avatar Studio (data + store)

**Files:**
- Modify: `src/server/actions/getAvatarStudioData.ts`
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/page.tsx`
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_components/AvatarStudioProvider.tsx`
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_store/avatarStudioStore.ts`

**Interfaces:**
- Consumes: tipo `ClonedVoice` de `@/@types/voice`, `avatars.default_voice_id` (Task 1).
- Produces (usadas por Task 6):
  - Store: `videoSubMode` acepta `'SPEAK'` (tipo `VideoSubMode = 'ANIMATE' | 'AVATAR' | 'SPEAK'`).
  - Store: `avatarDefaultVoice: ClonedVoice | null` + `setAvatarDefaultVoice(voice: ClonedVoice | null)`.
  - `getAvatarStudioData` devuelve además `defaultVoice: ClonedVoice | null`.

- [ ] **Step 1: Extender el store (`avatarStudioStore.ts`)**

Cuatro ediciones puntuales:

1. Línea 49: `export type VideoSubMode = 'ANIMATE' | 'AVATAR'` → `export type VideoSubMode = 'ANIMATE' | 'AVATAR' | 'SPEAK'`
2. Import arriba del archivo: `import type { ClonedVoice } from '@/@types/voice'`
3. En la interface del estado (junto a `videoSubMode: VideoSubMode`, línea ~81):

```ts
    avatarDefaultVoice: ClonedVoice | null
```

y en la sección de setters de la interface (junto a `setVideoSubMode`, línea ~219):

```ts
    setAvatarDefaultVoice: (voice: ClonedVoice | null) => void
```

4. En `initialState` (junto a `videoSubMode: 'ANIMATE' as VideoSubMode`, línea ~366):

```ts
    avatarDefaultVoice: null as ClonedVoice | null,
```

y en la implementación (junto a `setVideoSubMode`, línea ~623):

```ts
    setAvatarDefaultVoice: (voice) => set({ avatarDefaultVoice: voice }),
```

- [ ] **Step 2: Devolver la voz default en `getAvatarStudioData.ts`**

Añadir import y campo:

```ts
import type { ClonedVoice } from '@/@types/voice'

interface AvatarStudioData {
    avatar: Avatar | null
    references: AvatarReference[]
    providers: AIProvider[]
    prompts: Prompt[]
    defaultVoice: ClonedVoice | null
}
```

Dentro del `if (avatarId) { ... }`, después de obtener `avatar`:

```ts
    let defaultVoice: ClonedVoice | null = null
    // ... dentro del bloque if (avatarId), tras resolver `avatar`:
        if (avatar?.default_voice_id) {
            const { data: voiceData, error: voiceError } = await supabase
                .from('cloned_voices')
                .select('*')
                .eq('id', avatar.default_voice_id)
                .eq('status', 'ready')
                .single()
            if (voiceError) {
                console.error('Error fetching default voice:', voiceError)
            } else {
                defaultVoice = voiceData as unknown as ClonedVoice
            }
        }
```

Y en el return final: `return { avatar, references, providers: providers || [], prompts, defaultVoice }`.

- [ ] **Step 3: Pasarla por `page.tsx` y `AvatarStudioProvider.tsx`**

En `page.tsx`:

```tsx
    const { avatar, references, providers, prompts, defaultVoice } = await getAvatarStudioData(
        avatarId,
        session?.user?.id
    )
    // ...
        <AvatarStudioProvider
            avatar={avatar}
            defaultVoice={defaultVoice}
            references={transformedReferences}
            ...
```

En `AvatarStudioProvider.tsx`:

```tsx
import type { ClonedVoice } from '@/@types/voice'

interface AvatarStudioProviderProps {
    // ... props existentes ...
    defaultVoice?: ClonedVoice | null
}

const AvatarStudioProvider = ({ children, avatar, defaultVoice, references = [], ... }) => {
    // ... refs y setters existentes ...
    const setAvatarDefaultVoice = useAvatarStudioStore((state) => state.setAvatarDefaultVoice)

    // Dentro del useEffect que carga el avatar (el de [avatar?.id]), justo
    // después de `avatarIdRef.current = avatar.id`:
            setAvatarDefaultVoice(defaultVoice ?? null)
```

- [ ] **Step 4: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add src/server/actions/getAvatarStudioData.ts "src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/"
git commit -m "feat(avatar-studio): load avatar default voice into studio store"
```

---

### Task 6: Modo "Speak" — UI en BottomControlBar + dispatch en AvatarStudioMain

**Files:**
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_components/BottomControlBar.tsx` (segment de sub-modo ~líneas 1192-1214, placeholder línea 632)
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_components/AvatarStudioMain.tsx` (dispatch de video ~línea 786, imports línea 43, deps ~1105)

**Interfaces:**
- Consumes: `generateTalkingVideoKieSafe` (Task 3), store `avatarDefaultVoice` + `videoSubMode === 'SPEAK'` (Task 5), `POST /api/voice/tts-file` (Task 2), `optimizedPayload.faceRef` / `optimizedPayload.generalRefs` (ya existentes en `handleGenerate`).
- Produces: en modo Speak, el textarea principal del prompt ES el guion (lo que dice el avatar). El resultado entra a la galería in-memory (`addToGallery`) como cualquier video; el guardado a DB sigue siendo el botón Save existente.

- [ ] **Step 1: Botón Speak en el segment de sub-modo (`BottomControlBar.tsx`)**

En el bloque `{/* Video Sub-Mode */}` (~línea 1193), añadir un tercer botón tras "Avatar" (mismas clases):

```tsx
                            <button
                                onClick={() => setVideoSubMode('SPEAK')}
                                className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                                    videoSubMode === 'SPEAK'
                                        ? 'bg-purple-500 text-white'
                                        : 'text-gray-500'
                                }`}
                            >
                                Speak
                            </button>
```

Leer del store `avatarDefaultVoice` (añadirlo al mismo selector/destructuring donde ya se lee `videoSubMode`).

- [ ] **Step 2: Badge de voz + CTA en modo Speak (`BottomControlBar.tsx`)**

Inmediatamente después del `</div>` que cierra el segment de sub-modo, añadir:

```tsx
                        {videoSubMode === 'SPEAK' && (
                            avatarDefaultVoice ? (
                                <span className="px-2 py-1 text-[10px] rounded bg-purple-500/10 text-purple-400 flex items-center gap-1">
                                    🎤 {avatarDefaultVoice.name}
                                </span>
                            ) : (
                                <a
                                    href="/concepts/avatar-forge/voice-studio"
                                    className="px-2 py-1 text-[10px] rounded bg-amber-500/10 text-amber-500 underline"
                                >
                                    No voice — clone one in Voice Studio
                                </a>
                            )
                        )}
```

Ocultar los dropdowns que no aplican en Speak (la duración la dicta el audio y la cámara no se usa): envolver el dropdown de **Duration** y el de **Camera Motion** en `{videoSubMode !== 'SPEAK' && ( ... )}`.

- [ ] **Step 3: Placeholder del prompt en modo Speak (`BottomControlBar.tsx:632`)**

```tsx
placeholder={
    generationMode === 'VIDEO'
        ? videoSubMode === 'SPEAK'
            ? 'Write what the avatar should say...'
            : 'Describe the scene and action...'
        : 'Describe the image you want to generate...'
}
```

- [ ] **Step 4: Branch SPEAK en `handleGenerate` (`AvatarStudioMain.tsx`)**

Añadir import (línea 43, junto a los demás de KieService):

```ts
import { generateImageKie, generateVideoKieSafe, generateMotionControlKieSafe, submitKieImageTask, checkKieImageTask, generateTalkingVideoKieSafe } from '@/services/KieService'
```

Leer `avatarDefaultVoice` del store (donde se lee `videoSubMode`, ~línea 152).

En el bloque VIDEO, ANTES de `if (videoSubMode === 'ANIMATE')` (línea 786), insertar:

```ts
                if (videoSubMode === 'SPEAK') {
                    // Talking-head: texto → TTS (voz clonada del avatar) → InfiniteTalk.
                    // Ignora el proveedor seleccionado arriba: siempre KIE InfiniteTalk.
                    if (!avatarDefaultVoice) {
                        throw new Error('This avatar has no main voice. Clone one in Voice Studio and set it as main.')
                    }
                    const script = prompt.trim()
                    if (!script) {
                        throw new Error('Write what the avatar should say in the prompt box')
                    }

                    const speakImage = optimizedPayload.faceRef || optimizedPayload.generalRefs[0]
                    if (!speakImage) {
                        throw new Error('Add avatar references (a face photo) before generating a talking video')
                    }

                    // 1. TTS con la voz principal del avatar → URL pública en Storage
                    const langMap: Record<string, string> = {
                        es: 'Spanish', en: 'English', pt: 'Portuguese', fr: 'French',
                    }
                    const ttsRes = await fetch('/api/voice/tts-file', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            text: script,
                            voiceId: avatarDefaultVoice.provider_voice_id,
                            language: langMap[avatarDefaultVoice.language] ?? avatarDefaultVoice.language,
                        }),
                    })
                    if (!ttsRes.ok) {
                        const { error: ttsError } = await ttsRes.json()
                        throw new Error(ttsError || 'Voice generation (TTS) failed')
                    }
                    const { audioUrl } = await ttsRes.json()

                    // 2. InfiniteTalk: imagen del avatar + audio → video con lipsync
                    const speakResult = await generateTalkingVideoKieSafe({
                        image: speakImage,
                        audioUrl,
                        resolution: '720p',
                    })
                    if (!speakResult.success || !speakResult.url) {
                        // El audio ya quedó generado y persistido; que el error lo diga
                        // para no perder ese contexto (sin fallbacks silenciosos).
                        throw new Error(
                            `Talking video failed: ${speakResult.error || 'unknown error'}. The audio was generated: ${audioUrl}`,
                        )
                    }
                    resultUrl = speakResult.url
                } else if (videoSubMode === 'ANIMATE') {
```

(el `if (videoSubMode === 'ANIMATE')` existente pasa a ser `else if`).

Añadir `avatarDefaultVoice` al array de dependencias de `handleGenerate` (~línea 1105, junto a `videoSubMode`).

- [ ] **Step 5: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_components/"
git commit -m "feat(avatar-studio): Speak mode — text to talking-head video with cloned voice"
```

---

### Task 7: Voice Studio — panel Lipsync con selector de galería (reemplaza el merge ffmpeg)

**Files:**
- Create: `src/app/(protected-pages)/concepts/avatar-forge/voice-studio/_components/LipsyncPanel.tsx`
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/voice-studio/_components/VoiceStudioMain.tsx` (swap del panel)
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/voice-studio/_store/voiceStudioStore.ts` + `src/@types/voice.ts` (renombrar campos de merge)
- Delete: `src/app/(protected-pages)/concepts/avatar-forge/voice-studio/_components/AudioMergePanel.tsx`
- Delete: `src/services/AudioMergeService.ts`
- Delete: `src/app/api/audio/merge/route.ts`

**Interfaces:**
- Consumes: `lipsyncVideoKieSafe` (Task 3), `previewAudioUrl` (URL http tras Task 2), `apiGetGenerations(userId, { mediaType: 'VIDEO' })` y `getStorageUrl('generations', path)` de `AvatarForgeService.ts`, `apiSaveGeneration` de `AvatarForgeService.ts:174`, prop `userId` (Task 4).
- Produces: store renombrado — `lipsyncedVideoUrl`/`setLipsyncedVideoUrl`, `isLipsyncing`/`setIsLipsyncing` (reemplazan `mergedVideoUrl`/`isMerging`).

- [ ] **Step 1: Renombrar campos de merge en `src/@types/voice.ts` (interface `VoiceStudioState`)**

```ts
    // Lipsync (antes "Merge")
    selectedVideoUrl: string | null
    lipsyncedVideoUrl: string | null
    isLipsyncing: boolean
    // ...
    setSelectedVideoUrl: (url: string | null) => void
    setLipsyncedVideoUrl: (url: string | null) => void
    setIsLipsyncing: (v: boolean) => void
```

(eliminar `mergedVideoUrl`, `isMerging`, `setMergedVideoUrl`, `setIsMerging`).

- [ ] **Step 2: Renombrar en `voiceStudioStore.ts`**

En `initialState`: `mergedVideoUrl` → `lipsyncedVideoUrl`, `isMerging` → `isLipsyncing`. En las actions: `setMergedVideoUrl` → `setLipsyncedVideoUrl: (url) => set({ lipsyncedVideoUrl: url })`, `setIsMerging` → `setIsLipsyncing: (v) => set({ isLipsyncing: v })`.

- [ ] **Step 3: Crear `LipsyncPanel.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useVoiceStudioStore } from '../_store/voiceStudioStore'
import { apiGetGenerations, getStorageUrl, apiSaveGeneration } from '@/services/AvatarForgeService'
import { lipsyncVideoKieSafe } from '@/services/KieService'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'

interface LipsyncPanelProps {
    userId: string
}

interface GalleryVideo {
    id: string
    url: string
    prompt: string
}

/**
 * Lipsync real (Volcengine via KIE): elige un video de tu galería + el audio
 * generado con tu voz clonada, y re-sincroniza los labios al audio.
 * Sustituye al viejo "Merge Audio + Video" (mux ffmpeg sin lipsync).
 */
export default function LipsyncPanel({ userId }: LipsyncPanelProps) {
    const {
        previewAudioUrl,
        selectedVideoUrl, setSelectedVideoUrl,
        lipsyncedVideoUrl, setLipsyncedVideoUrl,
        isLipsyncing, setIsLipsyncing,
        currentTitle,
    } = useVoiceStudioStore()

    const [videos, setVideos] = useState<GalleryVideo[]>([])
    const [loadingVideos, setLoadingVideos] = useState(true)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    useEffect(() => {
        async function loadVideos() {
            try {
                const generations = await apiGetGenerations(userId, {
                    mediaType: 'VIDEO',
                    limit: 24,
                })
                const resolved = await Promise.all(
                    generations.map(async (g) => ({
                        id: g.id,
                        prompt: g.prompt,
                        url: g.storage_path.startsWith('http')
                            ? g.storage_path
                            : await getStorageUrl('generations', g.storage_path),
                    })),
                )
                setVideos(resolved)
            } catch (err) {
                console.error('Failed to load gallery videos:', err)
                setErrorMsg('Could not load your gallery videos')
            } finally {
                setLoadingVideos(false)
            }
        }
        loadVideos()
    }, [userId])

    const handleLipsync = async () => {
        if (!selectedVideoUrl || !previewAudioUrl) return
        setIsLipsyncing(true)
        setErrorMsg(null)
        try {
            const result = await lipsyncVideoKieSafe({
                videoUrl: selectedVideoUrl,
                audioUrl: previewAudioUrl,
            })
            if (!result.success || !result.url) {
                throw new Error(result.error || 'Lipsync failed')
            }
            setLipsyncedVideoUrl(result.url)

            // Registrar el resultado en la galería (el mp4 ya quedó en el
            // bucket generations vía persistToSupabase — guardamos el path).
            const storagePath = result.url.split('/object/public/generations/')[1] ?? result.url
            await apiSaveGeneration({
                user_id: userId,
                avatar_id: null,
                media_type: 'VIDEO',
                storage_path: storagePath,
                prompt: `Lipsync: ${currentTitle || 'voice over'}`,
                metadata: { model: 'volcengine/video-to-video-lip-sync' },
            })
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Lipsync failed'
            console.error('Lipsync failed:', err)
            setErrorMsg(message)
        } finally {
            setIsLipsyncing(false)
        }
    }

    return (
        <Card>
            <div className="p-4 flex flex-col gap-3">
                <h3 className="font-semibold text-lg">Lipsync Video</h3>
                <p className="text-sm text-gray-500">
                    Pick a video from your gallery — the lips will be re-animated to
                    match your generated audio.
                </p>

                {!previewAudioUrl && (
                    <p className="text-sm text-amber-500">Generate audio first (Audio Preview).</p>
                )}

                {loadingVideos && <p className="text-sm text-gray-500">Loading your videos…</p>}
                {!loadingVideos && videos.length === 0 && (
                    <p className="text-sm text-gray-500">
                        No videos in your gallery yet. Generate one in Avatar Studio.
                    </p>
                )}

                {videos.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                        {videos.map((video) => (
                            <button
                                key={video.id}
                                type="button"
                                title={video.prompt}
                                onClick={() => setSelectedVideoUrl(video.url)}
                                className={`relative rounded-lg overflow-hidden border-2 transition-colors ${
                                    selectedVideoUrl === video.url
                                        ? 'border-primary'
                                        : 'border-transparent hover:border-gray-300'
                                }`}
                            >
                                <video src={video.url} muted playsInline preload="metadata" className="w-full h-20 object-cover" />
                            </button>
                        ))}
                    </div>
                )}

                <Button
                    onClick={handleLipsync}
                    loading={isLipsyncing}
                    disabled={!selectedVideoUrl || !previewAudioUrl || isLipsyncing}
                    variant="solid"
                    block
                >
                    {isLipsyncing ? 'Syncing lips… (this can take a few minutes)' : 'Lipsync Video'}
                </Button>

                {errorMsg && <p className="text-sm text-red-500">{errorMsg}</p>}

                {lipsyncedVideoUrl && (
                    <div className="flex flex-col gap-2">
                        <video controls src={lipsyncedVideoUrl} className="w-full rounded-lg" />
                        <a
                            href={lipsyncedVideoUrl}
                            download
                            className="text-sm text-primary underline text-center"
                        >
                            Download lipsynced video
                        </a>
                    </div>
                )}
            </div>
        </Card>
    )
}
```

- [ ] **Step 4: Swap en `VoiceStudioMain.tsx` y borrar lo viejo**

En `VoiceStudioMain.tsx`: reemplazar `import AudioMergePanel from './AudioMergePanel'` por `import LipsyncPanel from './LipsyncPanel'` y `<AudioMergePanel />` por `<LipsyncPanel userId={userId} />`.

Borrar los tres archivos muertos:

```bash
git rm "src/app/(protected-pages)/concepts/avatar-forge/voice-studio/_components/AudioMergePanel.tsx" src/services/AudioMergeService.ts src/app/api/audio/merge/route.ts
```

Verificar que nada más los importa:

```bash
grep -rn "AudioMergePanel\|AudioMergeService\|audio/merge\|mergedVideoUrl\|setIsMerging\|setMergedVideoUrl" src/ || echo "clean"
```

Expected: `clean` (si aparece algo, actualizar esa referencia).

- [ ] **Step 5: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 6: Commit**

```bash
git add -A "src/app/(protected-pages)/concepts/avatar-forge/voice-studio/" src/@types/voice.ts
git commit -m "feat(voice-studio): gallery video picker + real lipsync, remove ffmpeg merge"
```

---

### Task 8: Verificación final (tsc, lint, E2E manual)

**Files:** ninguno nuevo — solo verificación y fixes menores.

- [ ] **Step 1: TypeScript y lint**

```bash
npx tsc --noEmit
npm run lint
```

Expected: sin errores nuevos (comparar contra `main` si hay preexistentes). Corregir cualquier error introducido (solo tipos/imports, sin cambiar lógica — criterio del skill ts-check).

- [ ] **Step 2: E2E manual con el dev server**

`npm run dev` (puerto 3030) y con Playwright/Chrome DevTools MCP (o el usuario en su navegador):

1. **Clonado mapeado**: Voice Studio → clonar voz eligiendo un avatar + "Use as the avatar's main voice" → verificar en Supabase que `cloned_voices.avatar_id` y `avatars.default_voice_id` quedaron poblados.
2. **TTS persistido**: generar guion → Generate Audio → el player reproduce una URL `https://…/generations/<userId>/audios/….mp3` (no `data:`).
3. **Speak mode**: Avatar Studio con ese avatar → Video → Speak → badge muestra la voz → escribir diálogo → Generate → aparece video en galería con labios sincronizados.
4. **Speak sin voz**: avatar sin voz default → CTA "No voice — clone one in Voice Studio" visible y Generate lanza el error claro.
5. **Lipsync Video**: Voice Studio → seleccionar video de la galería + audio generado → Lipsync Video → resultado reproducible y registrado en la galería.

Nota de costos: cada prueba de Speak/Lipsync consume créditos Kie (~$0.30/clip) y MiniMax TTS — hacer una sola pasada de cada flujo.

- [ ] **Step 3: Commit final si hubo fixes**

```bash
git add -A && git commit -m "fix(avatar-forge): post-verification fixes for voice lipsync pipeline"
```

(solo si hubo cambios).
